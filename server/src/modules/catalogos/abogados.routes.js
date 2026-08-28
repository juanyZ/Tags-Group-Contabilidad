/**
 * ABOGADOS / responsables del estudio.
 *
 * Es una tabla propia y no un item de catalogo porque tiene semantica: el
 * tablero agrupa carga de trabajo por abogado y un usuario puede estar
 * vinculado a una ficha de abogado para el filtro "solo mis causas".
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../utils/ApiError.js';
import { validar, idParam, texto, textoOpcional } from '../../middlewares/validar.js';
import { autorizar } from '../../middlewares/autorizar.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok, creado } from '../../utils/respuesta.js';
import { registrarAccion, registrarCambios } from '../../services/auditoria.service.js';

const router = Router();

const esquemaAbogado = z
  .object({
    nombre: texto(160),
    matricula: textoOpcional(60),
    email: z
      .union([z.string().trim().email('Email invalido').max(180), z.literal(''), z.null()])
      .optional()
      .transform((v) => (v === '' || v == null ? null : v.toLowerCase())),
    telefono: textoOpcional(60),
    activo: z.coerce.boolean().default(true),
  })
  .strict();

router.get(
  '/',
  autorizar('abogados:leer'),
  validar({ query: z.object({ incluirInactivos: z.coerce.boolean().optional() }) }),
  asyncHandler(async (req, res) => {
    const where = req.datosQuery.incluirInactivos ? {} : { activo: true };
    const items = await prisma.abogado.findMany({
      where,
      orderBy: { nombre: 'asc' },
      include: {
        _count: { select: { expedientes: true, clientes: true, eventosPuntuales: true } },
      },
    });
    return ok(
      res,
      items.map((a) => ({
        id: a.id,
        nombre: a.nombre,
        matricula: a.matricula,
        email: a.email,
        telefono: a.telefono,
        activo: a.activo,
        cantidadExpedientes: a._count.expedientes,
        cantidadClientes: a._count.clientes,
      }))
    );
  })
);

router.post(
  '/',
  autorizar('abogados:escribir'),
  validar({ body: esquemaAbogado }),
  asyncHandler(async (req, res) => {
    const abogado = await prisma.$transaction(async (tx) => {
      const nuevo = await tx.abogado.create({ data: req.body });
      await registrarAccion({
        tx,
        req,
        entidad: 'Abogado',
        entidadId: nuevo.id,
        accion: 'CREAR',
        valorNuevo: nuevo.nombre,
      });
      return nuevo;
    });
    return creado(res, abogado);
  })
);

router.put(
  '/:id',
  autorizar('abogados:escribir'),
  validar({ params: idParam, body: esquemaAbogado }),
  asyncHandler(async (req, res) => {
    const actual = await prisma.abogado.findUnique({ where: { id: req.params.id } });
    if (!actual) throw ApiError.noEncontrado('El abogado no existe');

    const abogado = await prisma.$transaction(async (tx) => {
      const guardado = await tx.abogado.update({ where: { id: req.params.id }, data: req.body });
      await registrarCambios({
        tx,
        req,
        entidad: 'Abogado',
        entidadId: req.params.id,
        anterior: actual,
        nuevo: req.body,
      });
      return guardado;
    });

    return ok(res, abogado);
  })
);

/**
 * No se borra: se desactiva. Un abogado que dejo el estudio sigue siendo el
 * responsable historico de sus causas y su nombre tiene que seguir apareciendo.
 */
router.delete(
  '/:id',
  autorizar('abogados:escribir'),
  validar({ params: idParam }),
  asyncHandler(async (req, res) => {
    const actual = await prisma.abogado.findUnique({ where: { id: req.params.id } });
    if (!actual) throw ApiError.noEncontrado('El abogado no existe');

    await prisma.$transaction(async (tx) => {
      await tx.abogado.update({ where: { id: req.params.id }, data: { activo: false } });
      await registrarAccion({
        tx,
        req,
        entidad: 'Abogado',
        entidadId: req.params.id,
        accion: 'ELIMINAR',
        valorAnterior: actual.nombre,
      });
    });

    return ok(res, { id: req.params.id, desactivado: true });
  })
);

export default router;
