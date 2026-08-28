/**
 * CALENDARIO PROCESAL: feriados, ferias judiciales, tipos de plazo y la
 * calculadora de vencimientos en dias habiles.
 *
 * Recordatorio (esta tambien en services/plazos.service.js): el sistema hace
 * la aritmetica del calendario, no interpreta derecho procesal. Cuantos dias
 * tiene cada plazo y como se cuenta lo carga el estudio segun su jurisdiccion
 * y su fuero.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../utils/ApiError.js';
import { validar, idParam, texto, textoOpcional, fechaISO, idOpcional } from '../../middlewares/validar.js';
import { autorizar } from '../../middlewares/autorizar.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok, creado } from '../../utils/respuesta.js';
import { registrarAccion } from '../../services/auditoria.service.js';
import { aDateUTC, aISO, hoyISO } from '../../utils/fechas.js';
import {
  construirCalendario,
  calcularVencimiento,
  esHabil,
  contarDiasHabiles,
  proximoHabil,
} from '../../services/plazos.service.js';

const router = Router();

/** Carga feriados y ferias de una jurisdiccion y arma el calendario. */
async function calendarioDe(jurisdiccion) {
  const [feriados, ferias] = await Promise.all([
    prisma.feriado.findMany({
      where: jurisdiccion ? { jurisdiccion } : {},
      select: { fecha: true },
    }),
    prisma.feriaJudicial.findMany({
      where: jurisdiccion ? { jurisdiccion } : {},
      select: { desde: true, hasta: true },
    }),
  ]);
  return construirCalendario(feriados, ferias);
}

// --- Calculadora de plazos -------------------------------------------------

const esquemaCalculo = z
  .object({
    desde: fechaISO,
    dias: z.coerce.number().int().min(0).max(3650),
    computo: z.enum(['HABILES', 'CORRIDOS']).default('HABILES'),
    jurisdiccion: z.string().max(60).optional(),
  })
  .strict();

router.post(
  '/calcular',
  autorizar('plazos:leer'),
  validar({ body: esquemaCalculo }),
  asyncHandler(async (req, res) => {
    const calendario = await calendarioDe(req.body.jurisdiccion);
    const resultado = calcularVencimiento({
      desde: req.body.desde,
      dias: req.body.dias,
      computo: req.body.computo,
      calendario,
    });

    if (!resultado.vencimiento) {
      throw ApiError.badRequest('No se pudo calcular el vencimiento con los datos indicados');
    }

    return ok(res, {
      desde: req.body.desde,
      dias: req.body.dias,
      computo: req.body.computo,
      vencimiento: resultado.vencimiento,
      trasladado: resultado.trasladado,
      diasCorridosTotales: null,
      diasHabilesEnElTramo: contarDiasHabiles(req.body.desde, resultado.vencimiento, calendario),
      // Aclaracion visible para el usuario, no solo en el codigo.
      nota:
        'El plazo se cuenta a partir del dia habil siguiente al acto. Los feriados y ferias aplicados son los cargados para la jurisdiccion elegida.',
    });
  })
);

/** Consulta puntual: este dia, es habil? */
router.get(
  '/habil',
  autorizar('plazos:leer'),
  validar({
    query: z.object({ fecha: fechaISO.optional(), jurisdiccion: z.string().max(60).optional() }),
  }),
  asyncHandler(async (req, res) => {
    const fecha = req.datosQuery.fecha || hoyISO();
    const calendario = await calendarioDe(req.datosQuery.jurisdiccion);
    return ok(res, {
      fecha,
      habil: esHabil(fecha, calendario),
      proximoHabil: proximoHabil(fecha, calendario),
    });
  })
);

// --- Feriados --------------------------------------------------------------

const esquemaFeriado = z
  .object({
    fecha: fechaISO,
    descripcion: texto(160),
    jurisdiccion: texto(60).default('NACION'),
  })
  .strict();

router.get(
  '/feriados',
  autorizar('plazos:leer'),
  validar({ query: z.object({ anio: z.coerce.number().int().min(2000).max(2100).optional() }) }),
  asyncHandler(async (req, res) => {
    const where = {};
    if (req.datosQuery.anio) {
      where.fecha = {
        gte: new Date(req.datosQuery.anio + '-01-01T00:00:00.000Z'),
        lte: new Date(req.datosQuery.anio + '-12-31T00:00:00.000Z'),
      };
    }
    const items = await prisma.feriado.findMany({ where, orderBy: { fecha: 'asc' } });
    return ok(
      res,
      items.map((f) => ({
        id: f.id,
        fecha: aISO(f.fecha),
        descripcion: f.descripcion,
        jurisdiccion: f.jurisdiccion,
      }))
    );
  })
);

router.post(
  '/feriados',
  autorizar('plazos:escribir'),
  validar({ body: esquemaFeriado }),
  asyncHandler(async (req, res) => {
    const feriado = await prisma.feriado.create({
      data: {
        fecha: aDateUTC(req.body.fecha),
        descripcion: req.body.descripcion,
        jurisdiccion: req.body.jurisdiccion,
      },
    });
    await registrarAccion({
      req,
      entidad: 'Feriado',
      entidadId: feriado.id,
      accion: 'CREAR',
      valorNuevo: req.body.fecha + ' - ' + req.body.descripcion,
    });
    return creado(res, Object.assign({}, feriado, { fecha: aISO(feriado.fecha) }));
  })
);

router.delete(
  '/feriados/:id',
  autorizar('plazos:escribir'),
  validar({ params: idParam }),
  asyncHandler(async (req, res) => {
    await prisma.feriado.delete({ where: { id: req.params.id } });
    await registrarAccion({
      req,
      entidad: 'Feriado',
      entidadId: req.params.id,
      accion: 'ELIMINAR',
    });
    return ok(res, { id: req.params.id });
  })
);

// --- Ferias judiciales -----------------------------------------------------

const esquemaFeria = z
  .object({
    desde: fechaISO,
    hasta: fechaISO,
    descripcion: texto(160),
    jurisdiccion: texto(60).default('NACION'),
  })
  .strict()
  .refine((d) => d.desde <= d.hasta, {
    message: 'La fecha de inicio tiene que ser anterior o igual a la de fin',
    path: ['hasta'],
  });

router.get(
  '/ferias',
  autorizar('plazos:leer'),
  asyncHandler(async (req, res) => {
    const items = await prisma.feriaJudicial.findMany({ orderBy: { desde: 'asc' } });
    return ok(
      res,
      items.map((f) => ({
        id: f.id,
        desde: aISO(f.desde),
        hasta: aISO(f.hasta),
        descripcion: f.descripcion,
        jurisdiccion: f.jurisdiccion,
      }))
    );
  })
);

router.post(
  '/ferias',
  autorizar('plazos:escribir'),
  validar({ body: esquemaFeria }),
  asyncHandler(async (req, res) => {
    const feria = await prisma.feriaJudicial.create({
      data: {
        desde: aDateUTC(req.body.desde),
        hasta: aDateUTC(req.body.hasta),
        descripcion: req.body.descripcion,
        jurisdiccion: req.body.jurisdiccion,
      },
    });
    await registrarAccion({
      req,
      entidad: 'FeriaJudicial',
      entidadId: feria.id,
      accion: 'CREAR',
      valorNuevo: req.body.desde + ' a ' + req.body.hasta,
    });
    return creado(res, Object.assign({}, feria, { desde: aISO(feria.desde), hasta: aISO(feria.hasta) }));
  })
);

router.delete(
  '/ferias/:id',
  autorizar('plazos:escribir'),
  validar({ params: idParam }),
  asyncHandler(async (req, res) => {
    await prisma.feriaJudicial.delete({ where: { id: req.params.id } });
    await registrarAccion({
      req,
      entidad: 'FeriaJudicial',
      entidadId: req.params.id,
      accion: 'ELIMINAR',
    });
    return ok(res, { id: req.params.id });
  })
);

// --- Tipos de plazo --------------------------------------------------------

const esquemaTipo = z
  .object({
    nombre: texto(160),
    dias: z.coerce.number().int().min(1).max(3650),
    computo: z.enum(['HABILES', 'CORRIDOS']).default('HABILES'),
    fueroId: idOpcional,
    descripcion: textoOpcional(300),
    activo: z.coerce.boolean().default(true),
  })
  .strict();

router.get(
  '/tipos',
  autorizar('plazos:leer'),
  asyncHandler(async (req, res) => {
    const items = await prisma.plazoTipo.findMany({
      where: { activo: true },
      include: { fuero: { select: { id: true, valor: true } } },
      orderBy: { nombre: 'asc' },
    });
    return ok(
      res,
      items.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        dias: p.dias,
        computo: p.computo,
        fueroId: p.fueroId,
        fuero: p.fuero ? p.fuero.valor : null,
        descripcion: p.descripcion,
      }))
    );
  })
);

router.post(
  '/tipos',
  autorizar('plazos:escribir'),
  validar({ body: esquemaTipo }),
  asyncHandler(async (req, res) => {
    const tipo = await prisma.plazoTipo.create({ data: req.body });
    await registrarAccion({
      req,
      entidad: 'PlazoTipo',
      entidadId: tipo.id,
      accion: 'CREAR',
      valorNuevo: tipo.nombre + ': ' + tipo.dias + ' dias ' + tipo.computo,
    });
    return creado(res, tipo);
  })
);

router.put(
  '/tipos/:id',
  autorizar('plazos:escribir'),
  validar({ params: idParam, body: esquemaTipo }),
  asyncHandler(async (req, res) => {
    const tipo = await prisma.plazoTipo.update({ where: { id: req.params.id }, data: req.body });
    return ok(res, tipo);
  })
);

router.delete(
  '/tipos/:id',
  autorizar('plazos:escribir'),
  validar({ params: idParam }),
  asyncHandler(async (req, res) => {
    await prisma.plazoTipo.update({ where: { id: req.params.id }, data: { activo: false } });
    return ok(res, { id: req.params.id, desactivado: true });
  })
);

export default router;
