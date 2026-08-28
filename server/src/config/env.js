/**
 * Carga y VALIDA la configuracion de entorno al arrancar.
 *
 * Se valida con Zod y se corta el arranque si algo falta o es debil. Es
 * deliberado: es preferible que el servidor no levante a que levante con un
 * secreto de JWT vacio y firme tokens que cualquiera puede falsificar.
 */
import 'dotenv/config';
import { z } from 'zod';

const esquema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),

  // Minimo 32 caracteres: un secreto corto es fuerza bruta offline garantizada.
  JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'JWT_ACCESS_SECRET debe tener al menos 32 caracteres'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  REFRESH_TTL_DAYS: z.coerce.number().int().positive().max(90).default(7),

  // Lista blanca de origenes. Nunca "*": la API usa credenciales.
  CORS_ORIGINS: z.string().default('http://localhost:5173'),

  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_UPLOAD_MB: z.coerce.number().int().positive().max(50).default(10),

  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),

  LOGIN_MAX_INTENTOS: z.coerce.number().int().positive().default(5),
  LOGIN_BLOQUEO_MINUTOS: z.coerce.number().int().positive().default(15),

  NOTIFY_CRON_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  NOTIFY_CRON_HOUR: z.coerce.number().int().min(0).max(23).default(8),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
});

const parsed = esquema.safeParse(process.env);

if (!parsed.success) {
  const detalle = parsed.error.issues
    .map((i) => '  - ' + i.path.join('.') + ': ' + i.message)
    .join('\n');
  // Se escribe a stderr y se corta: no hay forma segura de seguir sin config.
  console.error('Configuracion de entorno invalida:\n' + detalle);
  process.exit(1);
}

export const env = parsed.data;

export const esProduccion = env.NODE_ENV === 'production';

// Guarda extra: el valor de ejemplo del .env.example jamas debe llegar a produccion.
if (esProduccion && env.JWT_ACCESS_SECRET.includes('cambiar')) {
  console.error('JWT_ACCESS_SECRET sigue teniendo el valor de ejemplo. Abortando.');
  process.exit(1);
}

/** Origenes permitidos por CORS, ya parseados. */
export const origenesPermitidos = env.CORS_ORIGINS.split(',')
  .map((o) => o.trim())
  .filter(Boolean);
