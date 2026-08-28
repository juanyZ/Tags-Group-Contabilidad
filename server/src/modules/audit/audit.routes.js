/**
 * Consulta del registro de auditoria. Solo ADMIN.
 *
 * Es de solo lectura por diseno: no hay endpoint para editar ni borrar
 * entradas. Un log que se puede modificar no sirve como log.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma.js';
import { validar, paginacion, fechaISO } from '../../middlewares/validar.js';
import { autorizar } from '../../middlewares/autorizar.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { paginado, ok } from '../../utils/respuesta.js';
import { paginar } from '../../lib/consultas.js';

const router = Router();

const ACCIONES = [
  'CREAR',
  'ACTUALIZAR',
  'ELIMINAR',
  'RESTAURAR',
  'LOGIN',
  'LOGIN_FALLIDO',
  'LOGOUT',
  'DESCARGA',
];

const esquemaListar = paginacion.extend({
  entidad: z.string().max(60).optional(),
  entidadId: z.coerce.number().int().positive().optional(),
  usuarioId: z.coerce.number().int().positive().optional(),
  accion: z.enum(ACCIONES).optional(),
  desde: fechaISO.optional(),
  hasta: fechaISO.optional(),
});

router.get(
  '/',
  autorizar('audit:leer'),
  validar({ query: esquemaListar }),
  asyncHandler(async (req, res) => {
    const consulta = req.datosQuery;
    const { skip, take, page, limit } = paginar(consulta);

    const where = {};
    if (consulta.entidad) where.entidad = consulta.entidad;
    if (consulta.entidadId) where.entidadId = consulta.entidadId;
    if (consulta.usuarioId) where.usuarioId = consulta.usuarioId;
    if (consulta.accion) where.accion = consulta.accion;
    if (consulta.desde || consulta.hasta) {
      where.creadoEn = {};
      if (consulta.desde) where.creadoEn.gte = new Date(consulta.desde + 'T00:00:00.000Z');
      // El 'hasta' es inclusive: se suma un dia entero.
      if (consulta.hasta) where.creadoEn.lte = new Date(consulta.hasta + 'T23:59:59.999Z');
    }

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: { usuario: { select: { id: true, nombre: true, email: true } } },
        orderBy: { creadoEn: 'desc' },
        skip,
        take,
      }),
      prisma.auditLog.count({ where }),
    ]);

    const serializados = items.map((a) => ({
      id: a.id,
      fecha: a.creadoEn.toISOString(),
      usuarioId: a.usuarioId,
      usuario: a.usuario ? a.usuario.nombre : 'Sistema',
      entidad: a.entidad,
      entidadId: a.entidadId,
      accion: a.accion,
      campo: a.campo,
      valorAnterior: a.valorAnterior,
      valorNuevo: a.valorNuevo,
      ip: a.ip,
    }));

    return paginado(res, serializados, { page, limit, total });
  })
);

/** Historial de un registro puntual: "que le paso a este expediente". */
router.get(
  '/:entidad/:entidadId',
  autorizar('audit:leer'),
  validar({
    params: z.object({
      entidad: z.string().max(60),
      entidadId: z.coerce.number().int().positive(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const items = await prisma.auditLog.findMany({
      where: { entidad: req.params.entidad, entidadId: req.params.entidadId },
      include: { usuario: { select: { nombre: true } } },
      orderBy: { creadoEn: 'desc' },
      take: 200,
    });

    return ok(
      res,
      items.map((a) => ({
        id: a.id,
        fecha: a.creadoEn.toISOString(),
        usuario: a.usuario ? a.usuario.nombre : 'Sistema',
        accion: a.accion,
        campo: a.campo,
        valorAnterior: a.valorAnterior,
        valorNuevo: a.valorNuevo,
      }))
    );
  })
);

export default router;
