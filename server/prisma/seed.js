/**
 * SEEDS - datos de ejemplo.
 *
 * ATENCION: TODOS los datos de este archivo son de PRUEBA. Los nombres, DNI,
 * CUIT, domicilios, telefonos y emails son inventados y no corresponden a
 * ninguna persona real. Antes de usar el sistema en produccion hay que
 * borrarlos (`npm run db:reset` deja la base limpia y vuelve a sembrar solo
 * la configuracion y los catalogos si se corre con SEED_SOLO_BASE=true).
 *
 * La contrasena del administrador NO esta hardcodeada: se toma de
 * SEED_ADMIN_PASSWORD o, si no esta, se genera una al azar y se imprime una
 * sola vez por consola.
 *
 * Los vencimientos se generan RELATIVOS al dia de hoy, para que el tablero
 * muestre siempre una mezcla realista de vencidos, vence hoy y por vencer.
 */
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// --- helpers de fecha (los mismos criterios que src/utils/fechas.js) --------
const MS_DIA = 86400000;
const FORMATO = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const hoy = FORMATO.format(new Date());

function d(iso) {
  return new Date(iso + 'T00:00:00.000Z');
}

/** Fecha relativa a hoy, en dias. dias(-3) = hace tres dias. */
function dias(n) {
  return new Date(new Date(hoy + 'T00:00:00.000Z').getTime() + n * MS_DIA);
}

const SOLO_BASE = process.env.SEED_SOLO_BASE === 'true';

// ===========================================================================
//  1. CONFIGURACION
// ===========================================================================
async function sembrarConfig() {
  const anio = Number(hoy.slice(0, 4));

  await prisma.configEstudio.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      // Datos del estudio. Estos SI son los reales: se completan desde la
      // pantalla de Configuracion cuando haga falta corregirlos.
      nombreEstudio: 'TAGS Group',
      titular: 'Dr. Luis Tagliapietra',
      matricula: 'T 45 F 128',
      cuit: '20-00000000-0',
      domicilio: 'Mar del Plata',
      localidad: 'Mar del Plata, Buenos Aires',
      telefono: '223 555 6636',
      email: 'contacto@tagsgroup.com.ar',
      anioTrabajo: anio,
      diasPorVencer: 7,
      ventanaProximos: 30,
      valorJus: 18500,
      jurisdiccionDefault: 'NACION',
      mesesCaducidadDefault: 6,
    },
  });
  console.log('  Configuracion del estudio lista.');
}

// ===========================================================================
//  2. CATALOGOS (las listas de desplegables)
// ===========================================================================
const CATALOGOS = {
  PROVINCIA: [
    'CABA', 'Buenos Aires', 'Catamarca', 'Chaco', 'Chubut', 'Cordoba', 'Corrientes',
    'Entre Rios', 'Formosa', 'Jujuy', 'La Pampa', 'La Rioja', 'Mendoza', 'Misiones',
    'Neuquen', 'Rio Negro', 'Salta', 'San Juan', 'San Luis', 'Santa Cruz', 'Santa Fe',
    'Santiago del Estero', 'Tierra del Fuego', 'Tucuman',
  ],
  FUERO: [
    'Laboral', 'Familia', 'Civil y Comercial', 'Sucesorio', 'Contencioso Administrativo',
    'Amparo de Salud', 'Previsional', 'Penal', 'Ejecutivo', 'Danos y Perjuicios',
    'Extrajudicial / Consultoria',
  ],
  ETAPA_PROCESAL: [
    'Consulta inicial', 'Extrajudicial', 'Mediacion', 'Demanda', 'Traslado / Contestacion',
    'Apertura a prueba', 'Alegatos', 'Sentencia de 1 instancia', 'Apelacion',
    'Ejecucion de sentencia', 'Archivo',
  ],
  ESTADO_EXPEDIENTE: [
    'En tramite', 'En analisis', 'En espera', 'Con sentencia', 'En ejecucion',
    'Concluido', 'Archivado',
  ],
  JUZGADO: [
    'Juzgado Laboral N 2', 'Juzgado Laboral N 5', 'Juzgado de Familia N 1',
    'Juzgado de Familia N 4', 'Juzgado Civil y Comercial N 1', 'Juzgado Civil y Comercial N 2',
    'Juzgado Civil y Comercial N 3', 'Camara de Apelaciones Sala I', 'SECLO', 'ANSES',
    'AFIP / ARCA', 'Mediacion privada',
  ],
  ORIGEN_CONTACTO: [
    'Recomendacion de cliente', 'Recomendacion de colega', 'Sitio web', 'Google',
    'Redes sociales', 'Contacto directo', 'Guardia / Turno', 'Colegio de abogados',
  ],
  TIPO_EVENTO: [
    'Audiencia', 'Vencimiento de plazo', 'Presentacion de escrito', 'Pericia', 'Mediacion',
    'Notificacion / Cedula', 'Reunion con cliente', 'Reunion interna', 'Apelacion',
    'Tarea administrativa', 'Ofrecimiento de prueba',
  ],
  TIPO_EVENTO_RECURRENTE: [
    'Reunion interna', 'Vencimiento fiscal', 'Tarea administrativa', 'Pago / Cobro',
    'Control de plazos',
  ],
  MEDIO_PAGO: ['Efectivo', 'Transferencia', 'Debito / Credito', 'Cheque', 'Mercado Pago'],
};

/** Rubros de gasto: llevan scope, que es lo que hace dependiente el desplegable. */
const RUBROS = {
  EXPEDIENTE: [
    'Tasa de justicia', 'Bono / Derecho fijo', 'Cedula / Notificacion', 'Mandamiento',
    'Honorarios de perito', 'Honorarios del mediador', 'Oficio', 'Movilidad y viaticos',
    'Certificaciones y partidas', 'Informe de dominio / Registro',
    'Fotocopias / Impresiones', 'Deposito judicial',
  ],
  ESTUDIO: [
    'Alquiler de la oficina', 'Sueldos y cargas sociales', 'Honorarios del contador',
    'Bibliografia y suscripciones', 'Internet y telefono', 'Luz / Gas / Agua',
    'Libreria e insumos', 'Marketing y publicidad', 'Software y licencias',
    'Matricula profesional', 'Seguros', 'Capacitacion',
  ],
};

/** Estados que NO cuentan como causa activa en el tablero. */
const ESTADOS_NO_ACTIVOS = new Set(['Concluido', 'Archivado']);

async function sembrarCatalogos() {
  const items = [];

  for (const [tipo, valores] of Object.entries(CATALOGOS)) {
    valores.forEach((valor, i) => {
      items.push({
        tipo,
        valor,
        orden: i,
        computaComoActivo:
          tipo === 'ESTADO_EXPEDIENTE' ? !ESTADOS_NO_ACTIVOS.has(valor) : true,
      });
    });
  }

  for (const [scope, valores] of Object.entries(RUBROS)) {
    valores.forEach((valor, i) => {
      items.push({ tipo: 'RUBRO_GASTO', valor, orden: i, scope });
    });
  }

  await prisma.catalogoItem.createMany({ data: items, skipDuplicates: true });
  console.log('  Catalogos: ' + items.length + ' opciones.');
}

/** Busca el id de un item de catalogo por tipo y valor. */
async function cat(tipo, valor) {
  const item = await prisma.catalogoItem.findUnique({
    where: { tipo_valor: { tipo, valor } },
  });
  if (!item) throw new Error('Falta el catalogo ' + tipo + ' / ' + valor);
  return item.id;
}

// ===========================================================================
//  3. CALENDARIO PROCESAL
// ===========================================================================
async function sembrarCalendarioProcesal() {
  const anio = Number(hoy.slice(0, 4));

  // Feriados nacionales de fecha fija. Los trasladables y los puentes hay que
  // cargarlos a mano cada ano: no se pueden calcular sin el decreto.
  const fijos = [
    ['01-01', 'Ano nuevo'],
    ['03-24', 'Dia de la Memoria'],
    ['04-02', 'Dia del Veterano y de los Caidos en Malvinas'],
    ['05-01', 'Dia del Trabajador'],
    ['05-25', 'Dia de la Revolucion de Mayo'],
    ['06-20', 'Paso a la Inmortalidad del Gral. Belgrano'],
    ['07-09', 'Dia de la Independencia'],
    ['08-17', 'Paso a la Inmortalidad del Gral. San Martin'],
    ['12-08', 'Inmaculada Concepcion de Maria'],
    ['12-25', 'Navidad'],
  ];

  const feriados = [];
  for (const anioObjetivo of [anio, anio + 1]) {
    for (const [md, descripcion] of fijos) {
      feriados.push({
        fecha: d(anioObjetivo + '-' + md),
        descripcion,
        jurisdiccion: 'NACION',
      });
    }
  }

  await prisma.feriado.createMany({ data: feriados, skipDuplicates: true });

  // Ferias judiciales. Se cargan como DATO porque cambian por jurisdiccion.
  const feriasExistentes = await prisma.feriaJudicial.count();
  if (feriasExistentes === 0) {
    await prisma.feriaJudicial.createMany({
      data: [
        {
          desde: d(anio + '-01-01'),
          hasta: d(anio + '-01-31'),
          descripcion: 'Feria judicial de enero',
          jurisdiccion: 'NACION',
        },
        {
          desde: d(anio + '-07-13'),
          hasta: d(anio + '-07-24'),
          descripcion: 'Feria judicial de julio',
          jurisdiccion: 'NACION',
        },
        {
          desde: d(anio + 1 + '-01-01'),
          hasta: d(anio + 1 + '-01-31'),
          descripcion: 'Feria judicial de enero',
          jurisdiccion: 'NACION',
        },
      ],
    });
  }

  // Tipos de plazo de ejemplo. OJO: son ORIENTATIVOS. Cada estudio tiene que
  // revisarlos contra su jurisdiccion y su fuero antes de confiar en ellos.
  const tipos = await prisma.plazoTipo.count();
  if (tipos === 0) {
    const laboral = await cat('FUERO', 'Laboral');
    const civil = await cat('FUERO', 'Civil y Comercial');

    await prisma.plazoTipo.createMany({
      data: [
        { nombre: 'Contestar demanda', dias: 15, computo: 'HABILES', fueroId: civil, descripcion: 'REVISAR contra el codigo procesal aplicable' },
        { nombre: 'Contestar traslado', dias: 5, computo: 'HABILES', fueroId: civil, descripcion: 'REVISAR contra el codigo procesal aplicable' },
        { nombre: 'Apelar sentencia', dias: 5, computo: 'HABILES', fueroId: civil, descripcion: 'REVISAR contra el codigo procesal aplicable' },
        { nombre: 'Ofrecer prueba', dias: 10, computo: 'HABILES', fueroId: civil, descripcion: 'REVISAR contra el codigo procesal aplicable' },
        { nombre: 'Contestar demanda laboral', dias: 10, computo: 'HABILES', fueroId: laboral, descripcion: 'REVISAR contra el codigo procesal aplicable' },
        { nombre: 'Intimacion (art. 57 LCT)', dias: 2, computo: 'HABILES', fueroId: laboral, descripcion: 'REVISAR contra la norma aplicable' },
      ],
    });
  }

  console.log('  Calendario procesal: feriados, ferias y tipos de plazo.');
}

// ===========================================================================
//  4. ABOGADOS Y USUARIOS
// ===========================================================================
const ABOGADOS = [
  { nombre: 'Dr. Luis Tagliapietra', matricula: 'T 45 F 128', email: 'ltagliapietra@tagsgroup.com.ar' },
  { nombre: 'Dra. Maria Gomez', matricula: 'T 62 F 044', email: 'mgomez@tagsgroup.com.ar' },
  { nombre: 'Dr. Carlos Ruiz', matricula: 'T 51 F 310', email: 'cruiz@tagsgroup.com.ar' },
  { nombre: 'Dra. Laura Fernandez', matricula: 'T 70 F 015', email: 'lfernandez@tagsgroup.com.ar' },
  { nombre: 'Dr. Matias Lopez', matricula: 'T 68 F 202', email: 'mlopez@tagsgroup.com.ar' },
  { nombre: 'Secretaria', matricula: null, email: 'secretaria@tagsgroup.com.ar' },
];

async function sembrarAbogados() {
  for (const a of ABOGADOS) {
    await prisma.abogado.upsert({ where: { nombre: a.nombre }, update: {}, create: a });
  }
  console.log('  Abogados: ' + ABOGADOS.length + '.');
}

async function sembrarUsuarios() {
  const yaHay = await prisma.usuario.count();
  if (yaHay > 0) {
    console.log('  Usuarios: ya existian, no se tocan.');
    return;
  }

  // Nunca una contrasena por defecto en el codigo.
  const passwordAdmin =
    process.env.SEED_ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url') + 'Aa1';

  const rounds = Number(process.env.BCRYPT_ROUNDS || 12);
  const hashAdmin = await bcrypt.hash(passwordAdmin, rounds);

  const perez = await prisma.abogado.findUnique({ where: { nombre: 'Dr. Luis Tagliapietra' } });
  const gomez = await prisma.abogado.findUnique({ where: { nombre: 'Dra. Maria Gomez' } });
  const secre = await prisma.abogado.findUnique({ where: { nombre: 'Secretaria' } });

  await prisma.usuario.create({
    data: {
      email: 'admin@tagsgroup.com.ar',
      nombre: 'Dr. Luis Tagliapietra',
      passwordHash: hashAdmin,
      rol: 'ADMIN',
      abogadoId: perez ? perez.id : null,
    },
  });

  // Usuarios de demostracion: se crean SOLO si se sembraron datos de ejemplo,
  // y cada uno con su propia contrasena aleatoria.
  const demos = [];
  if (!SOLO_BASE) {
    const passAbogada = crypto.randomBytes(9).toString('base64url') + 'Aa1';
    const passSecre = crypto.randomBytes(9).toString('base64url') + 'Aa1';

    await prisma.usuario.create({
      data: {
        email: 'mgomez@tagsgroup.com.ar',
        nombre: 'Dra. Maria Gomez',
        passwordHash: await bcrypt.hash(passAbogada, rounds),
        rol: 'ABOGADO',
        abogadoId: gomez ? gomez.id : null,
      },
    });
    await prisma.usuario.create({
      data: {
        email: 'secretaria@tagsgroup.com.ar',
        nombre: 'Secretaria del estudio',
        passwordHash: await bcrypt.hash(passSecre, rounds),
        rol: 'SECRETARIA',
        abogadoId: secre ? secre.id : null,
      },
    });
    demos.push(['mgomez@tagsgroup.com.ar (ABOGADO)', passAbogada]);
    demos.push(['secretaria@tagsgroup.com.ar (SECRETARIA)', passSecre]);
  }

  console.log('');
  console.log('  ==========================================================');
  console.log('   CREDENCIALES GENERADAS - anotalas, no se vuelven a mostrar');
  console.log('  ==========================================================');
  console.log('   admin@tagsgroup.com.ar (ADMIN)');
  console.log('   ' + passwordAdmin);
  for (const [usuario, pass] of demos) {
    console.log('   ' + usuario);
    console.log('   ' + pass);
  }
  console.log('  ==========================================================');
  console.log('   Cambiala al primer ingreso desde el menu de usuario.');
  console.log('  ==========================================================');
  console.log('');
}

// ===========================================================================
//  5. DATOS DE EJEMPLO (clientes, causas, vencimientos, plata)
// ===========================================================================

const CLIENTES = [
  ['FISICA', 'Gomez, Maria Alejandra', '27345678', '1979-04-14', 'Av. Rivadavia 4520, 3 A', 'CABA', '11 5432-1098', 'magomez@example.com', 'Recomendacion de cliente', 'ACTIVO', '2024-04-10', 'Dra. Maria Gomez', 'Cliente de familia y sucesion.'],
  ['FISICA', 'Perez, Juan Carlos', '20987654', '1972-11-02', 'Calle San Martin 128', 'Buenos Aires', '11 6789-0123', 'jcperez@example.com', 'Sitio web', 'ACTIVO', '2025-02-03', 'Dr. Luis Tagliapietra', 'Despido sin causa. Cobro indemnizacion parcial.'],
  ['JURIDICA', 'Empresa Constructora del Sur S.A.', '30701234564', '2011-06-20', 'Av. Belgrano 2100, Piso 8', 'CABA', '11 4300-5500', 'legales@constructorasur.example.com', 'Recomendacion de colega', 'ACTIVO', '2023-08-15', 'Dr. Carlos Ruiz', 'Cliente corporativo. Retainer mensual.'],
  ['JURIDICA', 'Inmobiliaria del Norte S.R.L.', '30719876544', '2016-02-01', 'Av. Cabildo 3300, Local 4', 'CABA', '11 4788-1200', 'administracion@inmodelnorte.example.com', 'Google', 'ACTIVO', '2025-05-22', 'Dra. Laura Fernandez', 'Desalojos y contratos de locacion.'],
  ['FISICA', 'Ruiz, Carlos Alberto', '16234567', '1983-09-30', 'Belgrano 875', 'Buenos Aires', '11 3344-5566', 'caruiz63@example.com', 'Recomendacion de cliente', 'ACTIVO', '2024-11-04', 'Dr. Matias Lopez', 'Amparo de salud contra obra social.'],
  ['FISICA', 'Martinez, Silvia Beatriz', '14556778', '1971-01-18', 'Sarmiento 340', 'Buenos Aires', '11 2233-4455', 'silvimartinez@example.com', 'Contacto directo', 'ACTIVO', '2026-01-19', 'Dra. Maria Gomez', 'Sucesion de su conyuge.'],
  ['JURIDICA', 'Estudio Contable Lorenzetti & Asoc.', '30714567892', '2009-04-12', 'Lavalle 1200, Piso 3', 'CABA', '11 4372-9900', 'marcos@lorenzettiasoc.example.com', 'Recomendacion de colega', 'ACTIVO', '2025-09-08', 'Dr. Carlos Ruiz', 'Deriva causas laborales.'],
  ['FISICA', 'Lopez, Matias Ezequiel', '35678901', '1991-07-07', 'Av. Santa Fe 2800, 6 C', 'CABA', '11 5566-7788', 'matilopez91@example.com', 'Redes sociales', 'POTENCIAL', '2026-06-30', 'Dr. Luis Tagliapietra', 'Consulta por accidente de transito. Sin causa aun.'],
  ['JURIDICA', 'Transporte Bobadilla S.A.', '30698745217', '2010-10-05', 'Ruta 8 Km 42, Parque Industrial', 'Buenos Aires', '230 442-1188', 'hugo@transportebobadilla.example.com', 'Recomendacion de cliente', 'ACTIVO', '2026-12-02', 'Dr. Luis Tagliapietra', 'Causas laborales de choferes.'],
  ['FISICA', 'Fernandez, Laura Noemi', '30123456', '1983-05-25', 'Mitre 1450', 'Buenos Aires', '11 7788-9900', 'laurafernandez@example.com', 'Guardia / Turno', 'ACTIVO', '2026-03-12', 'Dra. Laura Fernandez', 'Alimentos y regimen de comunicacion.'],
  ['JURIDICA', 'Alimentos Curupi S.A.', '30712333448', '2018-03-09', 'Colectora Este 5500', 'Buenos Aires', '348 466-3300', 'sduarte@curupi.example.com', 'Sitio web', 'POTENCIAL', '2026-07-21', 'Dr. Carlos Ruiz', 'Consulta por conflicto con proveedor.'],
  ['FISICA', 'Sosa, Ramon Antonio', '12345098', '1956-12-03', 'Los Alamos 220', 'Buenos Aires', '220 415-7788', 'ramonsosa56@example.com', 'Recomendacion de cliente', 'INACTIVO', '2026-06-14', 'Dr. Matias Lopez', 'Causa previsional concluida en 2025.'],
];

async function sembrarClientes() {
  const abogados = await prisma.abogado.findMany();
  const idAbogado = (nombre) => {
    const a = abogados.find((x) => x.nombre === nombre);
    return a ? a.id : null;
  };

  let i = 0;
  for (const c of CLIENTES) {
    i += 1;
    const codigo = 'CLI-' + String(i).padStart(3, '0');
    const yaExiste = await prisma.cliente.findUnique({ where: { codigo } });
    if (yaExiste) continue;

    await prisma.cliente.create({
      data: {
        codigo,
        tipoPersona: c[0],
        nombre: c[1],
        documento: c[2],
        fechaNacConstit: d(c[3]),
        domicilio: c[4],
        provinciaId: await cat('PROVINCIA', c[5]),
        telefono: c[6],
        email: c[7],
        origenId: await cat('ORIGEN_CONTACTO', c[8]),
        estado: c[9],
        fechaAlta: d(c[10]),
        abogadoId: idAbogado(c[11]),
        observaciones: c[12],
      },
    });
  }
  console.log('  Clientes de ejemplo: ' + CLIENTES.length + '.');
}

const EXPEDIENTES = [
  ['2025-03-10', 'Perez, Juan c/ Logistica Andina S.A. s/ Despido', 'Perez, Juan Carlos', 'ACTOR', 'Logistica Andina S.A.', 'Laboral', 'Juzgado Laboral N 2', 'LAB-4520/2025', 'Apertura a prueba', 'En tramite', 'Dr. Luis Tagliapietra', 8500000, 'Audiencia de vista de causa pendiente.'],
  ['2024-09-02', 'Gomez, Maria c/ Bianchi, Roberto s/ Divorcio', 'Gomez, Maria Alejandra', 'ACTOR', 'Bianchi, Roberto', 'Familia', 'Juzgado de Familia N 1', 'FAM-2210/2024', 'Sentencia de 1 instancia', 'Con sentencia', 'Dra. Maria Gomez', 900000, 'Falta liquidar la sociedad conyugal.'],
  ['2026-01-20', 'Martinez, Silvia s/ Sucesion ab intestato', 'Martinez, Silvia Beatriz', 'ACTOR', null, 'Sucesorio', 'Juzgado Civil y Comercial N 3', 'CIV-0188/2026', 'Etapa prejudicial', 'En tramite', 'Dra. Maria Gomez', 3200000, 'Falta acompanar partida de defuncion actualizada.'],
  ['2025-11-08', 'Ruiz, Carlos c/ Obra Social OSDEPYM s/ Amparo', 'Ruiz, Carlos Alberto', 'ACTOR', 'OSDEPYM', 'Amparo de Salud', 'Juzgado Civil y Comercial N 2', 'CIV-9611/2025', 'Apelacion', 'En tramite', 'Dr. Matias Lopez', 1100000, 'Medida cautelar otorgada. Apelada por la demandada.'],
  ['2024-12-12', 'Constructora del Sur S.A. c/ Municipalidad s/ Contencioso', 'Empresa Constructora del Sur S.A.', 'ACTOR', 'Municipalidad de Vicente Lopez', 'Contencioso Administrativo', 'Camara de Apelaciones Sala I', 'CA-3312/2025', 'Alegatos', 'En tramite', 'Dr. Carlos Ruiz', 18000000, 'Certificados de obra impagos.'],
  ['2026-03-04', 'Inmobiliaria del Norte S.R.L. c/ Ferrari, Ana s/ Desalojo', 'Inmobiliaria del Norte S.R.L.', 'ACTOR', 'Ferrari, Ana Maria', 'Sucesorio', 'Juzgado Civil y Comercial N 1', 'CIV-0459/2026', 'Traslado / Contestacion', 'En tramite', 'Dra. Laura Fernandez', 1200000, 'Falta de pago de 5 meses de alquiler.'],
  ['2026-06-19', 'Godoy, Ariel c/ Transporte Bobadilla S.A. s/ Accidente', 'Transporte Bobadilla S.A.', 'DEMANDADO', 'Godoy, Ariel Fabian', 'Laboral', 'Juzgado Laboral N 5', 'LAB-7788/2025', 'Apertura a prueba', 'En tramite', 'Dr. Luis Tagliapietra', 16200000, 'Pericia medica pendiente de designacion.'],
  ['2025-09-03', 'Fernandez, Laura c/ Quiroga, Pablo s/ Alimentos', 'Fernandez, Laura Noemi', 'ACTOR', 'Quiroga, Pablo Andres', 'Familia', 'Juzgado de Familia N 4', 'FAM-0912/2026', 'Apertura a prueba', 'En tramite', 'Dra. Laura Fernandez', 890000, 'Cuota provisoria fijada en el 25% de los haberes.'],
  ['2025-06-06', 'Sosa, Ramon c/ ANSES s/ Reajuste de haberes', 'Sosa, Ramon Antonio', 'ACTOR', 'ANSES', 'Previsional', 'ANSES', 'PREV-1140/2024', 'Ejecucion de sentencia', 'Concluido', 'Dr. Matias Lopez', 1470000, 'Cobrado. Expediente archivado.'],
  ['2026-05-28', 'Constructora del Sur S.A. c/ Contrato de obra - Consultoria', 'Empresa Constructora del Sur S.A.', 'CONSULTANTE', null, 'Extrajudicial / Consultoria', 'Mediacion privada', 'INT-0021/2026', 'Consulta inicial', 'En analisis', 'Dr. Carlos Ruiz', 2400000, 'Revision de pliegos y contratos de obra privada.'],
  ['2026-04-17', 'Villalba, Nora c/ Transporte Bobadilla S.A. s/ Despido', 'Transporte Bobadilla S.A.', 'DEMANDADO', 'Villalba, Nora Beatriz', 'Laboral', 'SECLO', 'SECLO-2388/2026', 'Mediacion', 'En espera', 'Dr. Luis Tagliapietra', 4300000, 'Audiencia de conciliacion en el SECLO.'],
  ['2026-06-05', 'Lorenzetti & Asoc. c/ AFIP s/ Repeticion', 'Estudio Contable Lorenzetti & Asoc.', 'ACTOR', 'AFIP / ARCA', 'Contencioso Administrativo', 'AFIP / ARCA', 'ADM-0874/2026', 'Demanda', 'En tramite', 'Dr. Carlos Ruiz', 3600000, 'Repeticion de retenciones improcedentes.'],
  ['2026-07-08', 'Inmobiliaria del Norte S.R.L. c/ Peralta, Hugo s/ Cobro ejecutivo', 'Inmobiliaria del Norte S.R.L.', 'ACTOR', 'Peralta, Hugo Damian', 'Ejecutivo', 'Juzgado Civil y Comercial N 3', 'CIV-2201/2026', 'Demanda', 'En tramite', 'Dra. Laura Fernandez', 2060000, 'Se inicio ejecucion por pagares.'],
  ['2026-07-24', 'Lopez, Matias c/ Consulta por accidente de transito', 'Lopez, Matias Ezequiel', 'CONSULTANTE', null, 'Danos y Perjuicios', 'Mediacion privada', null, 'Consulta inicial', 'En analisis', 'Dr. Luis Tagliapietra', null, 'Pendiente de que traiga la denuncia policial.'],
];

async function sembrarExpedientes() {
  const clientes = await prisma.cliente.findMany();
  const abogados = await prisma.abogado.findMany();
  const idCliente = (n) => {
    const c = clientes.find((x) => x.nombre === n);
    if (!c) throw new Error('Cliente de ejemplo no encontrado: ' + n);
    return c.id;
  };
  const idAbogado = (n) => {
    const a = abogados.find((x) => x.nombre === n);
    return a ? a.id : null;
  };

  let i = 0;
  for (const e of EXPEDIENTES) {
    i += 1;
    const codigo = 'EXP-' + String(i).padStart(3, '0');
    if (await prisma.expediente.findUnique({ where: { codigo } })) continue;

    await prisma.expediente.create({
      data: {
        codigo,
        fechaInicio: d(e[0]),
        caratula: e[1],
        clienteId: idCliente(e[2]),
        caracter: e[3],
        contraparte: e[4],
        fueroId: await cat('FUERO', e[5]),
        juzgadoId: await cat('JUZGADO', e[6]),
        numeroExpediente: e[7],
        etapaId: e[8] === 'Etapa prejudicial' ? await cat('ETAPA_PROCESAL', 'Extrajudicial') : await cat('ETAPA_PROCESAL', e[8]),
        estadoId: await cat('ESTADO_EXPEDIENTE', e[9]),
        abogadoId: idAbogado(e[10]),
        // Ultima actuacion escalonada hacia atras, para que las alertas de
        // caducidad muestren distintos niveles.
        ultimaActuacion: dias(-(i * 11)),
        montoReclamado: e[11],
        observaciones: e[12],
      },
    });
  }
  console.log('  Expedientes de ejemplo: ' + EXPEDIENTES.length + '.');
}

/**
 * Vencimientos relativos a hoy: la clave para que el tablero se vea vivo.
 * offset negativo = vencido, 0 = vence hoy, positivo = por vencer / en fecha.
 */
const EVENTOS = [
  [-18, '10:00', 'Audiencia', 'Audiencia de vista de causa', 'EXP-001', 'Dr. Luis Tagliapietra', 'ALTA', 'CUMPLIDO'],
  [-9, null, 'Presentacion de escrito', 'Acompanar partida de defuncion actualizada', 'EXP-003', 'Dra. Maria Gomez', 'ALTA', 'PENDIENTE'],
  [-6, null, 'Apelacion', 'Contestar traslado del memorial de agravios', 'EXP-004', 'Dr. Matias Lopez', 'ALTA', 'PENDIENTE'],
  [-4, null, 'Vencimiento de plazo', 'Vence plazo para intimar el pago de los pagares', 'EXP-013', 'Dra. Laura Fernandez', 'MEDIA', 'PENDIENTE'],
  [-3, '09:30', 'Reunion con cliente', 'Reunion por cuota alimentaria provisoria', 'EXP-008', 'Dra. Laura Fernandez', 'MEDIA', 'CUMPLIDO'],
  [-1, null, 'Ofrecimiento de prueba', 'Ofrecer prueba pericial contable', 'EXP-012', 'Dr. Carlos Ruiz', 'ALTA', 'PENDIENTE'],
  [0, '11:00', 'Audiencia', 'Audiencia de conciliacion SECLO', 'EXP-011', 'Dr. Luis Tagliapietra', 'ALTA', 'PENDIENTE'],
  [0, '15:00', 'Reunion con cliente', 'Firma de convenio de honorarios', 'EXP-010', 'Dr. Carlos Ruiz', 'MEDIA', 'PENDIENTE'],
  [0, null, 'Tarea administrativa', 'Cargar la denuncia policial que trae el cliente', 'EXP-014', 'Dr. Luis Tagliapietra', 'BAJA', 'PENDIENTE'],
  [3, '12:30', 'Presentacion de escrito', 'Contestar demanda de desalojo', 'EXP-006', 'Dra. Laura Fernandez', 'ALTA', 'PENDIENTE'],
  [4, '10:30', 'Audiencia', 'Audiencia preliminar art. 360 CPCC', 'EXP-005', 'Dr. Carlos Ruiz', 'ALTA', 'PENDIENTE'],
  [4, '16:00', 'Pericia', 'Designacion de perito medico', 'EXP-007', 'Dr. Luis Tagliapietra', 'MEDIA', 'PENDIENTE'],
  [5, null, 'Vencimiento de plazo', 'Vence plazo de prueba informativa', 'EXP-001', 'Dr. Luis Tagliapietra', 'ALTA', 'PENDIENTE'],
  [5, '14:00', 'Reunion con cliente', 'Estado de la sucesion y bienes a denunciar', 'EXP-003', 'Dra. Maria Gomez', 'MEDIA', 'PENDIENTE'],
  [6, '09:30', 'Mediacion', 'Segunda audiencia de mediacion', 'EXP-011', 'Dr. Luis Tagliapietra', 'ALTA', 'PENDIENTE'],
  [6, null, 'Notificacion / Cedula', 'Diligenciar cedula al domicilio real', 'EXP-006', 'Secretaria', 'MEDIA', 'PENDIENTE'],
  [7, null, 'Audiencia', 'Audiencia de regimen de comunicacion', 'EXP-008', 'Dra. Laura Fernandez', 'ALTA', 'PENDIENTE'],
  [12, null, 'Presentacion de escrito', 'Alegato sobre el merito de la prueba', 'EXP-005', 'Dr. Carlos Ruiz', 'ALTA', 'PENDIENTE'],
  [18, null, 'Vencimiento de plazo', 'Vence plazo para apelar la liquidacion', 'EXP-002', 'Dra. Maria Gomez', 'MEDIA', 'PENDIENTE'],
  [24, null, 'Tarea administrativa', 'Presentar puntos de pericia contable', 'EXP-012', 'Dr. Carlos Ruiz', 'MEDIA', 'PENDIENTE'],
  [31, null, 'Vencimiento de plazo', 'Vence intimacion de la contraparte', 'EXP-001', 'Dr. Luis Tagliapietra', 'ALTA', 'PENDIENTE'],
  [9, null, 'Reunion interna', 'Revision de agenda semanal del estudio', null, 'Dr. Luis Tagliapietra', 'BAJA', 'PENDIENTE'],
];

async function sembrarEventos() {
  const expedientes = await prisma.expediente.findMany();
  const abogados = await prisma.abogado.findMany();

  const idExp = (codigo) => {
    if (!codigo) return null;
    const e = expedientes.find((x) => x.codigo === codigo);
    return e ? e.id : null;
  };
  const idAbogado = (n) => {
    const a = abogados.find((x) => x.nombre === n);
    return a ? a.id : null;
  };

  let i = 0;
  for (const ev of EVENTOS) {
    i += 1;
    const codigo = 'EVT-' + String(i).padStart(3, '0');
    if (await prisma.eventoPuntual.findUnique({ where: { codigo } })) continue;

    await prisma.eventoPuntual.create({
      data: {
        codigo,
        fechaVto: dias(ev[0]),
        hora: ev[1],
        tipoId: await cat('TIPO_EVENTO', ev[2]),
        descripcion: ev[3],
        expedienteId: idExp(ev[4]),
        responsableId: idAbogado(ev[5]),
        prioridad: ev[6],
        estado: ev[7],
      },
    });
  }
  console.log('  Vencimientos de ejemplo: ' + EVENTOS.length + ' (relativos a hoy).');
}

const RECURRENTES = [
  ['Pago de la matricula profesional', 'Pago / Cobro', 'ANUAL', -220, 'Secretaria', true],
  ['Presentacion DDJJ IVA del estudio', 'Vencimiento fiscal', 'MENSUAL', -201, 'Secretaria', true],
  ['Pago de Ingresos Brutos', 'Vencimiento fiscal', 'MENSUAL', -204, 'Secretaria', true],
  ['Reunion semanal de equipo', 'Reunion interna', 'SEMANAL', -214, 'Dr. Luis Tagliapietra', true],
  ['Revision de causas sin movimiento', 'Control de plazos', 'QUINCENAL', -208, 'Dra. Maria Gomez', true],
  ['Cierre y facturacion de honorarios', 'Pago / Cobro', 'MENSUAL', -191, 'Secretaria', true],
  ['Control de plazos y feria judicial', 'Tarea administrativa', 'TRIMESTRAL', -199, 'Dr. Carlos Ruiz', true],
  ['Backup del sistema y digitalizacion', 'Tarea administrativa', 'MENSUAL', -189, 'Secretaria', true],
  ['Pago de alquiler de la oficina', 'Pago / Cobro', 'MENSUAL', -209, 'Secretaria', true],
  ['Recategorizacion de Monotributo', 'Vencimiento fiscal', 'SEMESTRAL', -199, 'Secretaria', false],
];

async function sembrarRecurrentes() {
  const abogados = await prisma.abogado.findMany();
  const idAbogado = (n) => {
    const a = abogados.find((x) => x.nombre === n);
    return a ? a.id : null;
  };

  let i = 0;
  for (const r of RECURRENTES) {
    i += 1;
    const codigo = 'REC-' + String(i).padStart(3, '0');
    if (await prisma.eventoRecurrente.findUnique({ where: { codigo } })) continue;

    await prisma.eventoRecurrente.create({
      data: {
        codigo,
        descripcion: r[0],
        tipoId: await cat('TIPO_EVENTO_RECURRENTE', r[1]),
        periodicidad: r[2],
        fechaBase: dias(r[3]),
        responsableId: idAbogado(r[4]),
        activo: r[5],
      },
    });
  }
  console.log('  Eventos recurrentes de ejemplo: ' + RECURRENTES.length + '.');
}

const HONORARIOS = [
  ['Perez, Juan Carlos', 'EXP-001', -520, 'CUOTA_LITIS', 1700000, 21, [[-21, 750000]], '20% del monto de condena, estimado sobre $8.500.000.'],
  ['Gomez, Maria Alejandra', 'EXP-002', -700, 'MONTO_FIJO', 900000, 21, [[-60, 900000]], 'Divorcio. Pactado al inicio, en 3 cuotas.'],
  ['Martinez, Silvia Beatriz', 'EXP-003', -215, 'MONTO_FIJO', 3200000, 21, [[-100, 800000], [-40, 600000]], 'Sucesion. Se cobra contra inscripcion de la declaratoria.'],
  ['Ruiz, Carlos Alberto', 'EXP-004', -290, 'POR_ETAPAS', 1080000, 21, [[-130, 500000], [-45, 400000]], 'Amparo de salud. 12 JUS por instancia.'],
  ['Empresa Constructora del Sur S.A.', null, -430, 'ABONO_MENSUAL', 21150000, 21, [[-200, 6000000], [-120, 4400000], [-50, 3050000]], 'Abono mensual del retainer corporativo.'],
  ['Inmobiliaria del Norte S.R.L.', 'EXP-006', -175, 'MONTO_FIJO', 1780000, 21, [[-30, 726000]], 'Desalojo Ferrari + ejecucion Peralta.'],
  ['Transporte Bobadilla S.A.', null, -365, 'ABONO_MENSUAL', 2950000, 21, [[-150, 1200000], [-70, 986100]], 'Defensa en causas laborales de choferes.'],
  ['Fernandez, Laura Noemi', 'EXP-008', -160, 'MONTO_FIJO', 855000, 0, [[-90, 400000]], 'Alimentos y regimen de comunicacion. Sin IVA (consumidor final).'],
  ['Sosa, Ramon Antonio', 'EXP-009', -390, 'CUOTA_LITIS', 1470000, 21, [[-310, 1778700]], '15% del reajuste. Cobrado integramente, causa archivada.'],
  ['Estudio Contable Lorenzetti & Asoc.', 'EXP-012', -80, 'MONTO_FIJO', 720000, 21, [[-60, 400000]], 'Repeticion ante AFIP.'],
  ['Lopez, Matias Ezequiel', null, -35, 'POR_HORA', 180000, 21, [], 'Consulta inicial por accidente. Todavia sin cobrar.'],
];

async function sembrarHonorarios() {
  const clientes = await prisma.cliente.findMany();
  const expedientes = await prisma.expediente.findMany();
  const transferencia = await cat('MEDIO_PAGO', 'Transferencia');

  const idCliente = (n) => {
    const c = clientes.find((x) => x.nombre === n);
    if (!c) throw new Error('Cliente no encontrado: ' + n);
    return c.id;
  };
  const idExp = (codigo) => {
    if (!codigo) return null;
    const e = expedientes.find((x) => x.codigo === codigo);
    return e ? e.id : null;
  };

  let i = 0;
  for (const h of HONORARIOS) {
    i += 1;
    const codigo = 'HON-' + String(i).padStart(3, '0');
    if (await prisma.honorario.findUnique({ where: { codigo } })) continue;

    await prisma.honorario.create({
      data: {
        codigo,
        clienteId: idCliente(h[0]),
        expedienteId: idExp(h[1]),
        fechaPacto: dias(h[2]),
        tipoPacto: h[3],
        montoPactado: h[4],
        ivaPorcentaje: h[5],
        observaciones: h[7],
        // Los pagos como filas propias: es lo que hace imposible el bug de
        // "cobrado duplicado" que tenia la planilla.
        pagos: {
          create: h[6].map((p) => ({
            fecha: dias(p[0]),
            monto: p[1],
            medioPagoId: transferencia,
          })),
        },
      },
    });
  }
  console.log('  Honorarios de ejemplo: ' + HONORARIOS.length + ' pactos con sus pagos.');
}

const GASTOS = [
  [-160, 'EXPEDIENTE', 'EXP-001', 'Tasa de justicia', 'Tasa de justicia 3% sobre el monto de demanda', 'Transferencia', 255000, true, 'PENDIENTE'],
  [-160, 'EXPEDIENTE', 'EXP-001', 'Bono / Derecho fijo', 'Bono de derecho fijo al iniciar', 'Debito / Credito', 32000, true, 'PENDIENTE'],
  [-24, 'EXPEDIENTE', 'EXP-001', 'Movilidad y viaticos', 'Viaje a la audiencia de vista de causa', 'Efectivo', 18000, false, 'NO_CORRESPONDE'],
  [-210, 'EXPEDIENTE', 'EXP-003', 'Certificaciones y partidas', 'Partida de defuncion y certificado de dominio', 'Efectivo', 46000, true, 'PENDIENTE'],
  [-205, 'EXPEDIENTE', 'EXP-003', 'Informe de dominio / Registro', 'Informe de dominio de 2 inmuebles', 'Transferencia', 88000, true, 'REINTEGRADO'],
  [-290, 'EXPEDIENTE', 'EXP-004', 'Tasa de justicia', 'Amparo: tasa reducida', 'Transferencia', 64000, true, 'REINTEGRADO'],
  [-280, 'EXPEDIENTE', 'EXP-004', 'Cedula / Notificacion', 'Cedula al domicilio de la demandada', 'Efectivo', 12000, true, 'REINTEGRADO'],
  [-410, 'EXPEDIENTE', 'EXP-005', 'Tasa de justicia', 'Tasa de justicia sobre $125.000.000', 'Transferencia', 3750000, true, 'REINTEGRADO'],
  [-70, 'EXPEDIENTE', 'EXP-005', 'Honorarios de perito', 'Anticipo de gastos del perito ingeniero', 'Transferencia', 850000, true, 'PENDIENTE'],
  [-175, 'EXPEDIENTE', 'EXP-006', 'Tasa de justicia', 'Desalojo: tasa de justicia', 'Transferencia', 145000, true, 'REINTEGRADO'],
  [-40, 'EXPEDIENTE', 'EXP-013', 'Tasa de justicia', 'Ejecucion de pagares', 'Transferencia', 62000, true, 'PENDIENTE'],
  [-38, 'EXPEDIENTE', 'EXP-013', 'Mandamiento', 'Mandamiento de intimacion de pago', 'Efectivo', 36000, true, 'PENDIENTE'],
  [-100, 'EXPEDIENTE', 'EXP-011', 'Honorarios del mediador', 'Honorarios del mediador - 1 audiencia', 'Transferencia', 95000, true, 'PENDIENTE'],
  [-95, 'EXPEDIENTE', 'EXP-012', 'Oficio', 'Oficio a la ARCA y a la obra social', 'Efectivo', 22000, true, 'PENDIENTE'],
  [-140, 'EXPEDIENTE', 'EXP-008', 'Cedula / Notificacion', 'Cedulas de traslado de la demanda', 'Efectivo', 14000, true, 'PENDIENTE'],
  [-60, 'EXPEDIENTE', 'EXP-007', 'Fotocopias / Impresiones', 'Copias de la historia clinica', 'Efectivo', 9500, false, 'NO_CORRESPONDE'],
  [-28, 'ESTUDIO', null, 'Alquiler de la oficina', 'Alquiler del mes', 'Transferencia', 1350000, false, 'NO_CORRESPONDE'],
  [-28, 'ESTUDIO', null, 'Sueldos y cargas sociales', 'Sueldos del personal administrativo', 'Transferencia', 980000, false, 'NO_CORRESPONDE'],
  [-27, 'ESTUDIO', null, 'Honorarios del contador', 'Honorarios contables del mes', 'Transferencia', 250000, false, 'NO_CORRESPONDE'],
  [-26, 'ESTUDIO', null, 'Internet y telefono', 'Internet, telefonia e IP fija', 'Debito / Credito', 96000, false, 'NO_CORRESPONDE'],
  [-25, 'ESTUDIO', null, 'Luz / Gas / Agua', 'Servicios de la oficina', 'Debito / Credito', 132000, false, 'NO_CORRESPONDE'],
  [-20, 'ESTUDIO', null, 'Bibliografia y suscripciones', 'Suscripcion a base de jurisprudencia', 'Debito / Credito', 118000, false, 'NO_CORRESPONDE'],
  [-15, 'ESTUDIO', null, 'Software y licencias', 'Licencias de ofimatica y firma digital', 'Debito / Credito', 74000, false, 'NO_CORRESPONDE'],
  [-8, 'ESTUDIO', null, 'Libreria e insumos', 'Resmas, toner y carpetas', 'Efectivo', 43000, false, 'NO_CORRESPONDE'],
];

async function sembrarGastos() {
  const expedientes = await prisma.expediente.findMany();
  const idExp = (codigo) => {
    if (!codigo) return null;
    const e = expedientes.find((x) => x.codigo === codigo);
    return e ? e.id : null;
  };

  let i = 0;
  for (const g of GASTOS) {
    i += 1;
    const codigo = 'GTO-' + String(i).padStart(3, '0');
    if (await prisma.gasto.findUnique({ where: { codigo } })) continue;

    await prisma.gasto.create({
      data: {
        codigo,
        fecha: dias(g[0]),
        tipo: g[1],
        expedienteId: idExp(g[2]),
        rubroId: await cat('RUBRO_GASTO', g[3]),
        detalle: g[4],
        medioPagoId: await cat('MEDIO_PAGO', g[5]),
        importe: g[6],
        reembolsable: g[7],
        estadoReintegro: g[8],
      },
    });
  }
  console.log('  Gastos de ejemplo: ' + GASTOS.length + '.');
}

// ===========================================================================
//  Orquestacion
// ===========================================================================
async function main() {
  console.log('\nSembrando la base (hoy = ' + hoy + ')...\n');

  // Base: siempre. Sin esto el sistema no arranca.
  await sembrarConfig();
  await sembrarCatalogos();
  await sembrarCalendarioProcesal();
  await sembrarAbogados();
  await sembrarUsuarios();

  if (SOLO_BASE) {
    console.log('\nSEED_SOLO_BASE=true: no se cargaron datos de ejemplo.\n');
    return;
  }

  // Datos de ejemplo: se pueden omitir con SEED_SOLO_BASE=true.
  await sembrarClientes();
  await sembrarExpedientes();
  await sembrarEventos();
  await sembrarRecurrentes();
  await sembrarHonorarios();
  await sembrarGastos();

  console.log('\n  ------------------------------------------------------');
  console.log('   TODOS los datos de ejemplo son de PRUEBA e inventados.');
  console.log('   Borralos antes de usar el sistema en produccion.');
  console.log('  ------------------------------------------------------\n');
}

main()
  .catch((e) => {
    console.error('\nError sembrando la base:', e.message);
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
