/**
 * Autenticacion: valida el access token y deja el usuario en req.usuario.
 *
 * El access token va en la cabecera Authorization, NO en una cookie. El
 * refresh, en cambio, si viaja en cookie HttpOnly. La razon de la mezcla:
 *  - El access token nunca se guarda en localStorage (el frontend lo tiene en
 *    memoria), asi que un XSS no puede robarlo de forma persistente.
 *  - El refresh es HttpOnly, asi que el JavaScript de la pagina ni lo ve.
 *  - Como el resto de la API no se autentica por cookie, no hay superficie
 *    CSRF: un formulario de otro sitio no puede adjuntar el header.
 */
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';

function extraerToken(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

export async function autenticar(req, res, next) {
  try {
    const token = extraerToken(req);
    if (!token) throw ApiError.noAutenticado('Falta el token de acceso');

    let payload;
    try {
      payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
    } catch (e) {
      // Se distingue expirado de invalido: el frontend usa el 'TOKEN_EXPIRADO'
      // para disparar el refresh automatico sin desloguear al usuario.
      if (e.name === 'TokenExpiredError') {
        throw ApiError.noAutenticado('El token expiro', { codigo: 'TOKEN_EXPIRADO' });
      }
      throw ApiError.noAutenticado('Token invalido');
    }

    // Se relee el usuario en cada request. Cuesta una consulta por indice
    // unico, despreciable para un estudio, y a cambio dar de baja a alguien o
    // cambiarle el rol tiene efecto inmediato en vez de esperar a que venza
    // el token.
    const usuario = await prisma.usuario.findUnique({
      where: { id: Number(payload.sub) },
      select: {
        id: true,
        email: true,
        nombre: true,
        rol: true,
        activo: true,
        abogadoId: true,
        eliminadoEn: true,
      },
    });

    if (!usuario || !usuario.activo || usuario.eliminadoEn) {
      throw ApiError.noAutenticado('La sesion ya no es valida');
    }

    req.usuario = {
      id: usuario.id,
      email: usuario.email,
      nombre: usuario.nombre,
      rol: usuario.rol,
      abogadoId: usuario.abogadoId,
    };

    next();
  } catch (err) {
    next(err);
  }
}
