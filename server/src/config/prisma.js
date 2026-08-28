/**
 * Cliente Prisma unico para todo el proceso.
 *
 * Un solo PrismaClient: cada instancia abre su propio pool de conexiones, y
 * crear uno por request agota MySQL en minutos.
 */
import { PrismaClient } from '@prisma/client';
import { env, esProduccion } from './env.js';

export const prisma = new PrismaClient({
  // En produccion solo se loguean errores. Las queries llevan datos personales
  // (DNI, domicilios) y no tienen por que quedar en los logs.
  log: esProduccion ? ['error'] : ['warn', 'error'],
});

/** Cierre ordenado: devuelve las conexiones antes de que muera el proceso. */
export async function desconectarPrisma() {
  await prisma.$disconnect();
}

/** Chequeo de vida de la base, para el endpoint /health. */
export async function pingDb() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

export const CONFIG_ID = 1;
export const NODE_ENV = env.NODE_ENV;
