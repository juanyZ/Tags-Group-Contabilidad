/**
 * LIMPIEZA DE DATOS DE PRUEBA
 *
 * Deja la base lista para empezar a cargar en serio. Borra todo lo operativo y
 * conserva lo que hace falta para que el sistema funcione:
 *
 *   SE BORRA                          SE CONSERVA
 *   ────────────────────────────      ──────────────────────────────────────
 *   Clientes                          Datos del estudio (Configuración)
 *   Expedientes                       Catálogos / listas de desplegables
 *   Vencimientos puntuales            Feriados, ferias y tipos de plazo
 *   Eventos recurrentes               El usuario administrador
 *   Honorarios y sus cobros           La ficha de abogado del titular
 *   Gastos
 *   Adjuntos y notificaciones
 *   Registro de auditoría
 *   El resto de usuarios y abogados
 *
 * Es DESTRUCTIVO e irreversible. Por eso exige confirmación explícita:
 *
 *   node prisma/limpiar.js --confirmar
 *
 * Antes de correrlo conviene tener un volcado:
 *   mysqldump -u root --databases estudio_juridico > respaldo.sql
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** Email del usuario que se conserva. Se puede pisar por variable de entorno. */
const USUARIO_A_CONSERVAR = process.env.CONSERVAR_USUARIO || 'admin@tagsgroup.com.ar';

/** Nombre de la ficha de abogado que se conserva. */
const ABOGADO_A_CONSERVAR = process.env.CONSERVAR_ABOGADO || 'Dr. Luis Tagliapietra';

if (!process.argv.includes('--confirmar')) {
  console.error('');
  console.error('  Esto BORRA todos los clientes, expedientes, vencimientos, honorarios');
  console.error('  y gastos de la base. No se puede deshacer.');
  console.error('');
  console.error('  Si es lo que querés, volvé a correrlo con:');
  console.error('    node prisma/limpiar.js --confirmar');
  console.error('');
  process.exit(1);
}

async function main() {
  console.log('\nLimpiando la base...\n');

  const usuario = await prisma.usuario.findUnique({ where: { email: USUARIO_A_CONSERVAR } });
  if (!usuario) {
    throw new Error(
      'No existe el usuario "' + USUARIO_A_CONSERVAR + '". Se aborta para no dejar la base sin acceso.'
    );
  }

  const abogado = await prisma.abogado.findUnique({ where: { nombre: ABOGADO_A_CONSERVAR } });
  if (!abogado) {
    throw new Error('No existe la ficha de abogado "' + ABOGADO_A_CONSERVAR + '". Se aborta.');
  }

  // El orden importa: primero los hijos, después los padres. Varias relaciones
  // tienen onDelete: Cascade, pero se borran explícitamente igual para que el
  // script sea legible y no dependa de configuración del esquema.
  const pasos = [
    ['Cumplimientos de recurrentes', () => prisma.recurrenteCumplimiento.deleteMany({})],
    ['Cobros de honorarios', () => prisma.honorarioPago.deleteMany({})],
    ['Adjuntos', () => prisma.adjunto.deleteMany({})],
    ['Notificaciones', () => prisma.notificacion.deleteMany({})],
    ['Vencimientos puntuales', () => prisma.eventoPuntual.deleteMany({})],
    ['Eventos recurrentes', () => prisma.eventoRecurrente.deleteMany({})],
    ['Gastos', () => prisma.gasto.deleteMany({})],
    ['Honorarios', () => prisma.honorario.deleteMany({})],
    ['Expedientes', () => prisma.expediente.deleteMany({})],
    ['Clientes', () => prisma.cliente.deleteMany({})],
    ['Registro de auditoría', () => prisma.auditLog.deleteMany({})],
    ['Sesiones abiertas', () => prisma.refreshToken.deleteMany({})],
    [
      'Otros usuarios',
      () => prisma.usuario.deleteMany({ where: { id: { not: usuario.id } } }),
    ],
    [
      'Otros abogados',
      () => prisma.abogado.deleteMany({ where: { id: { not: abogado.id } } }),
    ],
  ];

  for (const [nombre, ejecutar] of pasos) {
    const r = await ejecutar();
    console.log('  ' + nombre.padEnd(28, '.') + ' ' + String(r.count).padStart(4) + ' registro(s)');
  }

  // El usuario que queda tiene que seguir vinculado a la ficha del titular, y
  // sin bloqueos ni intentos fallidos heredados de las pruebas.
  await prisma.usuario.update({
    where: { id: usuario.id },
    data: { abogadoId: abogado.id, intentosFallidos: 0, bloqueadoHasta: null },
  });

  console.log('');
  console.log('  Se conserva:');
  console.log('    Usuario  ' + usuario.email + '  (' + usuario.rol + ')');
  console.log('    Abogado  ' + abogado.nombre);

  const [catalogos, feriados, ferias, plazos, config] = await Promise.all([
    prisma.catalogoItem.count(),
    prisma.feriado.count(),
    prisma.feriaJudicial.count(),
    prisma.plazoTipo.count(),
    prisma.configEstudio.findUnique({ where: { id: 1 } }),
  ]);

  console.log('    Estudio  ' + (config ? config.nombreEstudio : '(sin configurar)'));
  console.log(
    '    Listas   ' + catalogos + ' opciones · ' + feriados + ' feriados · ' + ferias +
      ' ferias · ' + plazos + ' tipos de plazo'
  );
  console.log('');
  console.log('  Todas las sesiones quedaron cerradas: hay que volver a entrar.');
  console.log('');
}

main()
  .catch((e) => {
    console.error('\nError limpiando la base:', e.message, '\n');
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
