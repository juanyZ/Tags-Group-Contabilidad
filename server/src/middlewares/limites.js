/**
 * Rate limiting.
 *
 * Dos niveles:
 *  - Uno general y holgado sobre toda la API, para frenar scraping o un script
 *    descontrolado.
 *  - Uno agresivo sobre el login, que es el endpoint que un atacante ataca por
 *    fuerza bruta. Se combina con el bloqueo POR USUARIO que vive en la tabla
 *    usuarios: el limite por IP solo no alcanza (una botnet rota IPs), y el
 *    bloqueo por usuario solo tampoco (permite probar una password contra
 *    muchas cuentas). Los dos juntos cubren los dos vectores.
 */
import rateLimit from 'express-rate-limit';

const respuestaLimite = (req, res) => {
  res.status(429).json({
    data: null,
    error: {
      mensaje: 'Demasiadas peticiones. Espera unos minutos y volve a intentar.',
      codigo: 'RATE_LIMIT',
    },
    meta: null,
  });
};

export const limiteGeneral = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  handler: respuestaLimite,
});

export const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  // Los intentos exitosos no consumen cupo: quien sabe su password no deberia
  // quedar bloqueado por entrar varias veces en el dia.
  skipSuccessfulRequests: true,
  handler: respuestaLimite,
});

/** Subida de archivos: costosa en disco y ancho de banda. */
export const limiteSubida = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: respuestaLimite,
});
