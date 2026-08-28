/**
 * Rutas de autenticacion. La logica vive en auth.service.js; aca solo se
 * traduce HTTP a llamadas de negocio y se maneja la cookie del refresh.
 */
import { Router } from 'express';
import { z } from 'zod';
import * as authService from './auth.service.js';
import { validar } from '../../middlewares/validar.js';
import { autenticar } from '../../middlewares/autenticar.js';
import { limiteLogin } from '../../middlewares/limites.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok } from '../../utils/respuesta.js';
import { esProduccion, env } from '../../config/env.js';

const router = Router();

const NOMBRE_COOKIE = 'refresh_token';

/**
 * Configuracion de la cookie del refresh token.
 *  - httpOnly: el JS de la pagina no puede leerla (defensa contra XSS).
 *  - secure: solo por HTTPS (se desactiva en desarrollo para poder trabajar).
 *  - sameSite strict: el navegador no la manda en peticiones cross-site, que
 *    es lo que elimina la superficie CSRF sin necesidad de un token anti-CSRF.
 *  - path acotado: la cookie solo viaja a los endpoints que la necesitan.
 */
const opcionesCookie = {
  httpOnly: true,
  secure: esProduccion,
  sameSite: 'strict',
  path: '/api/v1/auth',
  maxAge: env.REFRESH_TTL_DAYS * 86400000,
};

const esquemaLogin = z.object({
  email: z.string().trim().toLowerCase().email('Email invalido').max(180),
  password: z.string().min(1, 'La contrasena es obligatoria').max(200),
});

const esquemaCambioPassword = z
  .object({
    actual: z.string().min(1).max(200),
    nueva: z
      .string()
      .min(10, 'La contrasena nueva debe tener al menos 10 caracteres')
      .max(200)
      .regex(/[a-z]/, 'Debe incluir una minuscula')
      .regex(/[A-Z]/, 'Debe incluir una mayuscula')
      .regex(/[0-9]/, 'Debe incluir un numero'),
  })
  .refine((d) => d.actual !== d.nueva, {
    message: 'La contrasena nueva tiene que ser distinta de la actual',
    path: ['nueva'],
  });

router.post(
  '/login',
  limiteLogin,
  validar({ body: esquemaLogin }),
  asyncHandler(async (req, res) => {
    const resultado = await authService.login(req.body.email, req.body.password, req);
    res.cookie(NOMBRE_COOKIE, resultado.refreshToken, opcionesCookie);
    // El refresh NO se devuelve en el cuerpo: solo viaja por la cookie HttpOnly.
    return ok(res, {
      accessToken: resultado.accessToken,
      usuario: resultado.usuario,
    });
  })
);

router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const token = req.cookies ? req.cookies[NOMBRE_COOKIE] : null;
    const resultado = await authService.refrescar(token, req);
    res.cookie(NOMBRE_COOKIE, resultado.refreshToken, opcionesCookie);
    return ok(res, {
      accessToken: resultado.accessToken,
      usuario: resultado.usuario,
    });
  })
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const token = req.cookies ? req.cookies[NOMBRE_COOKIE] : null;
    await authService.logout(token, req);
    res.clearCookie(NOMBRE_COOKIE, { path: opcionesCookie.path });
    return ok(res, { mensaje: 'Sesion cerrada' });
  })
);

/** Quien soy: lo usa el frontend al levantar para rehidratar la sesion. */
router.get(
  '/me',
  autenticar,
  asyncHandler(async (req, res) => {
    const { permisosDeRol } = await import('../../config/permisos.js');
    return ok(res, Object.assign({}, req.usuario, { permisos: permisosDeRol(req.usuario.rol) }));
  })
);

router.post(
  '/cambiar-password',
  autenticar,
  validar({ body: esquemaCambioPassword }),
  asyncHandler(async (req, res) => {
    await authService.cambiarPassword(req.usuario.id, req.body.actual, req.body.nueva, req);
    res.clearCookie(NOMBRE_COOKIE, { path: opcionesCookie.path });
    return ok(res, { mensaje: 'Contrasena actualizada. Volve a iniciar sesion.' });
  })
);

export default router;
