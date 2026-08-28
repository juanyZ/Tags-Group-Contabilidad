/**
 * Autenticacion: login, rotacion de refresh y cierre de sesion.
 *
 * Modelo elegido (ver README, seccion de seguridad):
 *  - Access token JWT de vida corta (15 min por defecto), que el frontend
 *    guarda EN MEMORIA. No va a localStorage: un XSS no puede robarlo de forma
 *    persistente ni sobrevive a un refresh de la pagina.
 *  - Refresh token OPACO (no un JWT: no lleva informacion adentro), en cookie
 *    HttpOnly. El JavaScript de la pagina ni lo ve.
 *  - Del refresh se guarda solo el SHA-256. Si alguien se lleva un dump de la
 *    base, los tokens que hay ahi no le sirven para entrar.
 *  - Rotacion con DETECCION DE REUSO: cada refresh se usa una sola vez. Si
 *    llega uno ya usado, se asume que fue robado y se revoca la familia
 *    entera, echando al atacante y al usuario legitimo (que vuelve a loguearse).
 */
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { permisosDeRol } from '../../config/permisos.js';
import { registrarAccion } from '../../services/auditoria.service.js';

const MS_DIA = 86400000;

function hashearToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function nuevoTokenPlano() {
  // 48 bytes = 384 bits de entropia. Adivinarlo por fuerza bruta no es viable.
  return crypto.randomBytes(48).toString('hex');
}

function firmarAccessToken(usuario) {
  return jwt.sign(
    {
      sub: String(usuario.id),
      rol: usuario.rol,
      // El nombre viaja solo para poder mostrarlo sin otra consulta. Los
      // permisos NO viajan en el token: se resuelven en el servidor en cada
      // request contra la matriz de permisos.
      nombre: usuario.nombre,
    },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_ACCESS_TTL, algorithm: 'HS256' }
  );
}

/** Datos publicos del usuario. Nunca incluye el hash de la password. */
function usuarioPublico(usuario) {
  return {
    id: usuario.id,
    email: usuario.email,
    nombre: usuario.nombre,
    rol: usuario.rol,
    abogadoId: usuario.abogadoId,
    permisos: permisosDeRol(usuario.rol),
  };
}

async function emitirRefresh(usuarioId, familia, req) {
  const plano = nuevoTokenPlano();
  await prisma.refreshToken.create({
    data: {
      tokenHash: hashearToken(plano),
      familia: familia || crypto.randomUUID(),
      usuarioId,
      expiraEn: new Date(Date.now() + env.REFRESH_TTL_DAYS * MS_DIA),
      ip: req ? (req.ip || '').slice(0, 64) : null,
      userAgent: req ? (req.headers['user-agent'] || '').slice(0, 255) : null,
    },
  });
  return plano;
}

/**
 * Login.
 *
 * Se responde SIEMPRE lo mismo ante email inexistente y password incorrecta:
 * si se distinguiera, la pantalla de login se convierte en un enumerador de
 * cuentas validas del estudio.
 */
export async function login(email, password, req) {
  const generico = ApiError.noAutenticado('Email o contrasena incorrectos');

  const usuario = await prisma.usuario.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!usuario || !usuario.activo || usuario.eliminadoEn) {
    // Se hace igual una comparacion contra un hash ficticio para que el tiempo
    // de respuesta no delate si el email existe (ataque por temporizacion).
    await bcrypt.compare(password, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin');
    throw generico;
  }

  // Bloqueo por usuario, complementario al rate limit por IP.
  if (usuario.bloqueadoHasta && usuario.bloqueadoHasta > new Date()) {
    const minutos = Math.ceil((usuario.bloqueadoHasta.getTime() - Date.now()) / 60000);
    throw ApiError.demasiadasPeticiones(
      'Cuenta bloqueada temporalmente por intentos fallidos. Volve a intentar en ' + minutos + ' minutos.',
      { codigo: 'CUENTA_BLOQUEADA' }
    );
  }

  const valida = await bcrypt.compare(password, usuario.passwordHash);

  if (!valida) {
    const intentos = usuario.intentosFallidos + 1;
    const debeBloquear = intentos >= env.LOGIN_MAX_INTENTOS;

    await prisma.usuario.update({
      where: { id: usuario.id },
      data: {
        intentosFallidos: intentos,
        bloqueadoHasta: debeBloquear
          ? new Date(Date.now() + env.LOGIN_BLOQUEO_MINUTOS * 60000)
          : null,
      },
    });

    await registrarAccion({
      req,
      usuarioId: usuario.id,
      entidad: 'Usuario',
      entidadId: usuario.id,
      accion: 'LOGIN_FALLIDO',
      valorNuevo: 'intento ' + intentos + (debeBloquear ? ' (cuenta bloqueada)' : ''),
    });

    throw generico;
  }

  // Login correcto: se limpia el contador de intentos.
  await prisma.usuario.update({
    where: { id: usuario.id },
    data: { intentosFallidos: 0, bloqueadoHasta: null, ultimoLoginEn: new Date() },
  });

  await registrarAccion({
    req,
    usuarioId: usuario.id,
    entidad: 'Usuario',
    entidadId: usuario.id,
    accion: 'LOGIN',
  });

  const refreshToken = await emitirRefresh(usuario.id, null, req);

  return {
    accessToken: firmarAccessToken(usuario),
    refreshToken,
    usuario: usuarioPublico(usuario),
  };
}

/**
 * Rotacion del refresh token.
 * Devuelve un access nuevo y un refresh nuevo; el anterior queda inutilizable.
 */
export async function refrescar(tokenPlano, req) {
  if (!tokenPlano) throw ApiError.noAutenticado('Falta el refresh token');

  const registro = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashearToken(tokenPlano) },
    include: { usuario: true },
  });

  if (!registro) throw ApiError.noAutenticado('Sesion invalida');

  // DETECCION DE REUSO: el token ya se habia usado o estaba revocado. La unica
  // explicacion razonable es que una copia esta circulando. Se corta toda la
  // familia, no solo este token.
  if (registro.usadoEn || registro.revocadoEn) {
    await prisma.refreshToken.updateMany({
      where: { familia: registro.familia, revocadoEn: null },
      data: { revocadoEn: new Date() },
    });
    await registrarAccion({
      req,
      usuarioId: registro.usuarioId,
      entidad: 'Usuario',
      entidadId: registro.usuarioId,
      accion: 'LOGOUT',
      valorNuevo: 'refresh token reutilizado: se revoco la familia completa',
    });
    throw ApiError.noAutenticado('Sesion invalidada por seguridad. Volve a iniciar sesion.');
  }

  if (registro.expiraEn < new Date()) {
    throw ApiError.noAutenticado('La sesion expiro. Volve a iniciar sesion.');
  }

  const usuario = registro.usuario;
  if (!usuario || !usuario.activo || usuario.eliminadoEn) {
    throw ApiError.noAutenticado('La sesion ya no es valida');
  }

  await prisma.refreshToken.update({
    where: { id: registro.id },
    data: { usadoEn: new Date() },
  });

  const nuevoRefresh = await emitirRefresh(usuario.id, registro.familia, req);

  return {
    accessToken: firmarAccessToken(usuario),
    refreshToken: nuevoRefresh,
    usuario: usuarioPublico(usuario),
  };
}

/** Logout: revoca la familia entera, o sea todas las sesiones de ese origen. */
export async function logout(tokenPlano, req) {
  if (!tokenPlano) return;

  const registro = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashearToken(tokenPlano) },
  });
  if (!registro) return;

  await prisma.refreshToken.updateMany({
    where: { familia: registro.familia, revocadoEn: null },
    data: { revocadoEn: new Date() },
  });

  await registrarAccion({
    req,
    usuarioId: registro.usuarioId,
    entidad: 'Usuario',
    entidadId: registro.usuarioId,
    accion: 'LOGOUT',
  });
}

/** Cambio de password propio. Exige la actual: no alcanza con tener la sesion. */
export async function cambiarPassword(usuarioId, actual, nueva, req) {
  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });
  if (!usuario) throw ApiError.noEncontrado('Usuario no encontrado');

  const valida = await bcrypt.compare(actual, usuario.passwordHash);
  if (!valida) throw ApiError.badRequest('La contrasena actual no es correcta');

  const hash = await bcrypt.hash(nueva, env.BCRYPT_ROUNDS);

  await prisma.$transaction(async (tx) => {
    await tx.usuario.update({ where: { id: usuarioId }, data: { passwordHash: hash } });
    // Cambiar la password cierra el resto de las sesiones: es lo que uno espera
    // cuando la cambia justamente porque sospecha que se la robaron.
    await tx.refreshToken.updateMany({
      where: { usuarioId, revocadoEn: null },
      data: { revocadoEn: new Date() },
    });
    await registrarAccion({
      tx,
      req,
      usuarioId,
      entidad: 'Usuario',
      entidadId: usuarioId,
      accion: 'ACTUALIZAR',
      campo: 'passwordHash',
      valorNuevo: '(cambio de contrasena)',
    });
  });
}

export { usuarioPublico, hashearToken };
