/**
 * USUARIOS del sistema. Solo ADMIN.
 *
 * Nunca se devuelve el hash de la contrasena, ni siquiera al administrador:
 * no le sirve para nada y su unica utilidad posible es que se filtre.
 */
import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { validar, idParam, texto, idOpcional } from '../../middlewares/validar.js';
import { autorizar } from '../../middlewares/autorizar.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok, creado } from '../../utils/respuesta.js';
import { registrarAccion, registrarCambios } from '../../services/auditoria.service.js';
import { ROLES, permisosDeRol } from '../../config/permisos.js';

const router = Router();

const password = z
  .string()
  .min(10, 'La contrasena debe tener al menos 10 caracteres')
  .max(200)
  .regex(/[a-z]/, 'Debe incluir una minuscula')
  .regex(/[A-Z]/, 'Debe incluir una mayuscula')
  .regex(/[0-9]/, 'Debe incluir un numero');

const esquemaCrear = z
  .object({
    email: z.string().trim().toLowerCase().email('Email invalido').max(180),
    nombre: texto(160),
    password,
    rol: z.enum(ROLES),
    abogadoId: idOpcional,
    activo: z.coerce.boolean().default(true),
  })
  .strict();

const esquemaActualizar = z
  .object({
    nombre: texto(160),
    rol: z.enum(ROLES),
    abogadoId: idOpcional,
    activo: z.coerce.boolean(),
  })
  .strict();

const esquemaReset = z.object({ password }).strict();

function serializar(u) {
  return {
    id: u.id,
    email: u.email,
    nombre: u.nombre,
    rol: u.rol,
    abogadoId: u.abogadoId,
    abogado: u.abogado ? u.abogado.nombre : null,
    activo: u.activo,
    bloqueado: !!(u.bloqueadoHasta && u.bloqueadoHasta > new Date()),
    ultimoLoginEn: u.ultimoLoginEn ? u.ultimoLoginEn.toISOString() : null,
    creadoEn: u.creadoEn.toISOString(),
  };
}

router.get(
  '/',
  autorizar('usuarios:leer'),
  asyncHandler(async (req, res) => {
    const items = await prisma.usuario.findMany({
      where: { eliminadoEn: null },
      include: { abogado: { select: { nombre: true } } },
      orderBy: { nombre: 'asc' },
    });
    return ok(res, items.map(serializar));
  })
);

/** La matriz de permisos, para que la pantalla de roles pueda mostrarla. */
router.get(
  '/permisos',
  autorizar('usuarios:leer'),
  asyncHandler(async (req, res) => {
    const mapa = {};
    for (const rol of ROLES) mapa[rol] = permisosDeRol(rol);
    return ok(res, mapa);
  })
);

router.post(
  '/',
  autorizar('usuarios:escribir'),
  validar({ body: esquemaCrear }),
  asyncHandler(async (req, res) => {
    const existente = await prisma.usuario.findUnique({ where: { email: req.body.email } });
    if (existente) throw ApiError.conflicto('Ya existe un usuario con ese email');

    const passwordHash = await bcrypt.hash(req.body.password, env.BCRYPT_ROUNDS);

    const usuario = await prisma.$transaction(async (tx) => {
      const nuevo = await tx.usuario.create({
        data: {
          email: req.body.email,
          nombre: req.body.nombre,
          passwordHash,
          rol: req.body.rol,
          abogadoId: req.body.abogadoId,
          activo: req.body.activo,
        },
        include: { abogado: { select: { nombre: true } } },
      });
      await registrarAccion({
        tx,
        req,
        entidad: 'Usuario',
        entidadId: nuevo.id,
        accion: 'CREAR',
        valorNuevo: nuevo.email + ' (' + nuevo.rol + ')',
      });
      return nuevo;
    });

    return creado(res, serializar(usuario));
  })
);

router.put(
  '/:id',
  autorizar('usuarios:escribir'),
  validar({ params: idParam, body: esquemaActualizar }),
  asyncHandler(async (req, res) => {
    const actual = await prisma.usuario.findUnique({ where: { id: req.params.id } });
    if (!actual || actual.eliminadoEn) throw ApiError.noEncontrado('El usuario no existe');

    // Un admin no puede quitarse a si mismo el rol ni desactivarse: si es el
    // unico admin, el sistema quedaria sin nadie que pueda administrarlo.
    if (actual.id === req.usuario.id) {
      if (req.body.rol !== 'ADMIN') {
        throw ApiError.badRequest('No podes quitarte a vos mismo el rol de administrador');
      }
      if (!req.body.activo) {
        throw ApiError.badRequest('No podes desactivar tu propio usuario');
      }
    }

    const usuario = await prisma.$transaction(async (tx) => {
      const guardado = await tx.usuario.update({
        where: { id: req.params.id },
        data: req.body,
        include: { abogado: { select: { nombre: true } } },
      });
      await registrarCambios({
        tx,
        req,
        entidad: 'Usuario',
        entidadId: req.params.id,
        anterior: actual,
        nuevo: req.body,
      });
      // Bajar el rol o desactivar tiene que cortar las sesiones abiertas.
      if (actual.rol !== req.body.rol || (actual.activo && !req.body.activo)) {
        await tx.refreshToken.updateMany({
          where: { usuarioId: req.params.id, revocadoEn: null },
          data: { revocadoEn: new Date() },
        });
      }
      return guardado;
    });

    return ok(res, serializar(usuario));
  })
);

/** Reseteo de contrasena por el administrador. Cierra todas las sesiones. */
router.post(
  '/:id/password',
  autorizar('usuarios:escribir'),
  validar({ params: idParam, body: esquemaReset }),
  asyncHandler(async (req, res) => {
    const actual = await prisma.usuario.findUnique({ where: { id: req.params.id } });
    if (!actual || actual.eliminadoEn) throw ApiError.noEncontrado('El usuario no existe');

    const passwordHash = await bcrypt.hash(req.body.password, env.BCRYPT_ROUNDS);

    await prisma.$transaction(async (tx) => {
      await tx.usuario.update({
        where: { id: req.params.id },
        data: { passwordHash, intentosFallidos: 0, bloqueadoHasta: null },
      });
      await tx.refreshToken.updateMany({
        where: { usuarioId: req.params.id, revocadoEn: null },
        data: { revocadoEn: new Date() },
      });
      await registrarAccion({
        tx,
        req,
        entidad: 'Usuario',
        entidadId: req.params.id,
        accion: 'ACTUALIZAR',
        campo: 'passwordHash',
        valorNuevo: '(reseteo por administrador)',
      });
    });

    return ok(res, { mensaje: 'Contrasena actualizada y sesiones cerradas' });
  })
);

/** Desbloqueo manual tras intentos fallidos. */
router.post(
  '/:id/desbloquear',
  autorizar('usuarios:escribir'),
  validar({ params: idParam }),
  asyncHandler(async (req, res) => {
    await prisma.usuario.update({
      where: { id: req.params.id },
      data: { intentosFallidos: 0, bloqueadoHasta: null },
    });
    await registrarAccion({
      req,
      entidad: 'Usuario',
      entidadId: req.params.id,
      accion: 'ACTUALIZAR',
      campo: 'bloqueadoHasta',
      valorNuevo: '(desbloqueado por administrador)',
    });
    return ok(res, { mensaje: 'Usuario desbloqueado' });
  })
);

router.delete(
  '/:id',
  autorizar('usuarios:escribir'),
  validar({ params: idParam }),
  asyncHandler(async (req, res) => {
    if (req.params.id === req.usuario.id) {
      throw ApiError.badRequest('No podes eliminar tu propio usuario');
    }

    const actual = await prisma.usuario.findUnique({ where: { id: req.params.id } });
    if (!actual || actual.eliminadoEn) throw ApiError.noEncontrado('El usuario no existe');

    await prisma.$transaction(async (tx) => {
      await tx.usuario.update({
        where: { id: req.params.id },
        data: { eliminadoEn: new Date(), activo: false },
      });
      await tx.refreshToken.updateMany({
        where: { usuarioId: req.params.id, revocadoEn: null },
        data: { revocadoEn: new Date() },
      });
      await registrarAccion({
        tx,
        req,
        entidad: 'Usuario',
        entidadId: req.params.id,
        accion: 'ELIMINAR',
        valorAnterior: actual.email,
      });
    });

    return ok(res, { id: req.params.id });
  })
);

export default router;
