/**
 * CLIENTES - modulo de referencia.
 *
 * El resto de los modulos sigue este mismo patron: el service concentra la
 * logica y el acceso a datos, no sabe nada de HTTP (no recibe res, no arma
 * codigos de estado) y devuelve objetos ya listos para serializar.
 *
 * Mejora clave sobre la planilla: el nombre del cliente es un DATO, no la
 * llave. Renombrar "Perez, Juan Carlos" no desengancha sus expedientes,
 * honorarios ni cuenta corriente, porque todo cuelga del id.
 */
import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../utils/ApiError.js';
import { aDateUTC, aISO } from '../../utils/fechas.js';
import { crearConCodigo } from '../../services/codigos.service.js';
import {
  registrarAlta,
  registrarBaja,
  registrarCambios,
} from '../../services/auditoria.service.js';
import {
  soloVivos,
  paginar,
  ordenar,
  buscarEn,
  verificarVersion,
  exigirExistencia,
} from '../../lib/consultas.js';
import { ORDENABLES } from './clientes.schema.js';

/** Relaciones que se traen siempre, para que la grilla no dispare N+1 consultas. */
const INCLUDE_BASE = {
  provincia: { select: { id: true, valor: true } },
  origen: { select: { id: true, valor: true } },
  abogado: { select: { id: true, nombre: true } },
};

/** Normaliza un DNI/CUIT a solo digitos: evita duplicados por formato. */
function normalizarDocumento(doc) {
  if (!doc) return null;
  const limpio = String(doc).replace(/[^\dkK]/g, '');
  return limpio.length > 0 ? limpio : null;
}

/** Da forma a lo que sale por la API: fechas como ISO, relaciones aplanadas. */
function serializar(cliente) {
  if (!cliente) return null;
  return {
    id: cliente.id,
    codigo: cliente.codigo,
    tipoPersona: cliente.tipoPersona,
    nombre: cliente.nombre,
    documento: cliente.documento,
    fechaNacConstit: aISO(cliente.fechaNacConstit),
    domicilio: cliente.domicilio,
    provinciaId: cliente.provinciaId,
    provincia: cliente.provincia ? cliente.provincia.valor : null,
    telefono: cliente.telefono,
    email: cliente.email,
    origenId: cliente.origenId,
    origen: cliente.origen ? cliente.origen.valor : null,
    estado: cliente.estado,
    fechaAlta: aISO(cliente.fechaAlta),
    abogadoId: cliente.abogadoId,
    abogado: cliente.abogado ? cliente.abogado.nombre : null,
    observaciones: cliente.observaciones,
    version: cliente.version,
    eliminadoEn: cliente.eliminadoEn ? cliente.eliminadoEn.toISOString() : null,
    // Contadores utiles para la grilla; solo vienen si se pidieron.
    cantidadExpedientes: cliente._count ? cliente._count.expedientes : undefined,
  };
}

/** Convierte el body validado a datos de Prisma. */
function aDatosPrisma(body) {
  return {
    tipoPersona: body.tipoPersona,
    nombre: body.nombre,
    documento: normalizarDocumento(body.documento),
    fechaNacConstit: aDateUTC(body.fechaNacConstit),
    domicilio: body.domicilio,
    provinciaId: body.provinciaId,
    telefono: body.telefono,
    email: body.email,
    origenId: body.origenId,
    estado: body.estado,
    fechaAlta: aDateUTC(body.fechaAlta),
    abogadoId: body.abogadoId,
    observaciones: body.observaciones,
  };
}

export async function listar(consulta, filtroPropio) {
  const { skip, take, page, limit } = paginar(consulta);

  const where = Object.assign(
    consulta.incluirEliminados ? {} : soloVivos(),
    buscarEn(['nombre', 'codigo', 'documento', 'email'], consulta.q),
    consulta.estado ? { estado: consulta.estado } : {},
    consulta.tipoPersona ? { tipoPersona: consulta.tipoPersona } : {},
    consulta.abogadoId ? { abogadoId: consulta.abogadoId } : {},
    consulta.provinciaId ? { provinciaId: consulta.provinciaId } : {},
    filtroPropio || {}
  );

  const [items, total] = await Promise.all([
    prisma.cliente.findMany({
      where,
      include: Object.assign({}, INCLUDE_BASE, {
        _count: { select: { expedientes: true } },
      }),
      orderBy: ordenar(consulta, ORDENABLES, 'nombre'),
      skip,
      take,
    }),
    prisma.cliente.count({ where }),
  ]);

  return { items: items.map(serializar), page, limit, total };
}

export async function obtener(id) {
  const cliente = await prisma.cliente.findUnique({
    where: { id },
    include: Object.assign({}, INCLUDE_BASE, {
      _count: { select: { expedientes: true, honorarios: true } },
    }),
  });
  exigirExistencia(cliente, 'El cliente no existe o fue eliminado');
  return serializar(cliente);
}

/**
 * Lista minima para los desplegables de otras pantallas.
 * Va sin paginar pero con tope: un estudio no llega a 2000 clientes, y si
 * llegara, conviene que el selector pase a busqueda incremental antes de que
 * el navegador tenga que pintar una lista gigante.
 */
export async function opciones() {
  const items = await prisma.cliente.findMany({
    where: soloVivos(),
    select: { id: true, codigo: true, nombre: true, tipoPersona: true, estado: true },
    orderBy: { nombre: 'asc' },
    take: 2000,
  });
  return items;
}

export async function crear(body, req) {
  await validarReferencias(body);

  const cliente = await prisma.$transaction(async (tx) => {
    const creado = await crearConCodigo(tx, 'cliente', aDatosPrisma(body), {
      include: INCLUDE_BASE,
    });

    // La auditoria va DENTRO de la transaccion: si falla, no queda el alta sin
    // registrar. Ver services/auditoria.service.js.
    await registrarAlta({
      tx,
      req,
      entidad: 'Cliente',
      entidadId: creado.id,
      resumen: creado.codigo + ' - ' + creado.nombre,
    });

    return creado;
  });

  return serializar(cliente);
}

export async function actualizar(id, body, req) {
  await validarReferencias(body);

  const actual = await prisma.cliente.findUnique({ where: { id } });
  exigirExistencia(actual, 'El cliente no existe o fue eliminado');
  verificarVersion(actual, body.version, 'Cliente');

  const datos = aDatosPrisma(body);

  const cliente = await prisma.$transaction(async (tx) => {
    const actualizado = await tx.cliente.update({
      where: { id },
      data: Object.assign({}, datos, { version: { increment: 1 } }),
      include: INCLUDE_BASE,
    });

    await registrarCambios({
      tx,
      req,
      entidad: 'Cliente',
      entidadId: id,
      anterior: actual,
      nuevo: datos,
    });

    return actualizado;
  });

  return serializar(cliente);
}

/**
 * Baja logica. Nunca se borra fisicamente un cliente: tiene expedientes,
 * honorarios y movimientos de cuenta corriente colgando, y ese historial no se
 * puede perder (ademas de que puede hacer falta para una rendicion o un
 * reclamo anos despues).
 */
export async function eliminar(id, req) {
  const actual = await prisma.cliente.findUnique({
    where: { id },
    include: { _count: { select: { expedientes: true, honorarios: true } } },
  });
  exigirExistencia(actual, 'El cliente no existe o ya fue eliminado');

  // Se avisa si tiene causas vivas, pero no se prohibe: puede ser justamente
  // el motivo de la baja. Lo que si se hace es dejarlo en la auditoria.
  const expedientesVivos = await prisma.expediente.count({
    where: { clienteId: id, eliminadoEn: null },
  });

  await prisma.$transaction(async (tx) => {
    await tx.cliente.update({
      where: { id },
      data: { eliminadoEn: new Date(), version: { increment: 1 } },
    });
    await registrarBaja({
      tx,
      req,
      entidad: 'Cliente',
      entidadId: id,
      resumen:
        actual.codigo +
        ' - ' +
        actual.nombre +
        (expedientesVivos > 0 ? ' (tenia ' + expedientesVivos + ' expediente/s activo/s)' : ''),
    });
  });

  return { id, expedientesActivos: expedientesVivos };
}

/** Reactiva un cliente dado de baja. */
export async function restaurar(id, req) {
  const actual = await prisma.cliente.findUnique({ where: { id } });
  if (!actual) throw ApiError.noEncontrado('El cliente no existe');
  if (!actual.eliminadoEn) throw ApiError.badRequest('El cliente no esta eliminado');

  const cliente = await prisma.$transaction(async (tx) => {
    const restaurado = await tx.cliente.update({
      where: { id },
      data: { eliminadoEn: null, version: { increment: 1 } },
      include: INCLUDE_BASE,
    });
    await registrarBaja({
      tx,
      req,
      entidad: 'Cliente',
      entidadId: id,
      resumen: 'restaurado: ' + actual.codigo,
    });
    return restaurado;
  });

  return serializar(cliente);
}

/**
 * Verifica que las claves foraneas apunten a registros que existen y estan
 * activos. Prisma tiraria un error de FK igual, pero el mensaje seria
 * incomprensible para el usuario; aca se explica cual es el campo mal.
 */
async function validarReferencias(body) {
  const chequeos = [];

  if (body.provinciaId) {
    chequeos.push(
      prisma.catalogoItem
        .findFirst({ where: { id: body.provinciaId, tipo: 'PROVINCIA' } })
        .then((r) => {
          if (!r) throw ApiError.badRequest('La provincia elegida no existe');
        })
    );
  }
  if (body.origenId) {
    chequeos.push(
      prisma.catalogoItem
        .findFirst({ where: { id: body.origenId, tipo: 'ORIGEN_CONTACTO' } })
        .then((r) => {
          if (!r) throw ApiError.badRequest('El origen de contacto elegido no existe');
        })
    );
  }
  if (body.abogadoId) {
    chequeos.push(
      prisma.abogado.findUnique({ where: { id: body.abogadoId } }).then((r) => {
        if (!r) throw ApiError.badRequest('El abogado responsable elegido no existe');
      })
    );
  }

  await Promise.all(chequeos);
}

export { serializar as serializarCliente };
