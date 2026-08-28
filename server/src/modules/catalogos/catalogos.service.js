/**
 * CATALOGOS: todas las listas de desplegables de la app (provincias, fueros,
 * etapas, juzgados, origenes, tipos de evento, medios de pago, rubros).
 *
 * Regla central: los items NO se borran, se desactivan. La planilla advertia
 * que borrar un valor de una lista dejaba los registros viejos con un texto
 * huerfano. Aca eso no puede pasar: el registro apunta al id del item, que
 * sigue existiendo aunque ya no se ofrezca para cargas nuevas.
 */
import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../utils/ApiError.js';
import { registrarAccion, registrarCambios } from '../../services/auditoria.service.js';

export const TIPOS = [
  'PROVINCIA',
  'FUERO',
  'ETAPA_PROCESAL',
  'ESTADO_EXPEDIENTE',
  'JUZGADO',
  'ORIGEN_CONTACTO',
  'TIPO_EVENTO',
  'TIPO_EVENTO_RECURRENTE',
  'MEDIO_PAGO',
  'RUBRO_GASTO',
];

export const SCOPES_RUBRO = ['EXPEDIENTE', 'ESTUDIO'];

function serializar(item) {
  return {
    id: item.id,
    tipo: item.tipo,
    valor: item.valor,
    orden: item.orden,
    activo: item.activo,
    scope: item.scope,
    computaComoActivo: item.computaComoActivo,
  };
}

/**
 * Lista items de un tipo. `scope` filtra los rubros de gasto segun sean de
 * causa o de estructura: es lo que hace que el desplegable de rubro dependa
 * del tipo de gasto elegido, igual que en la planilla.
 */
export async function listar(filtros) {
  const where = {};
  if (filtros.tipo) where.tipo = filtros.tipo;
  if (filtros.scope) where.scope = filtros.scope;
  // Por defecto solo los activos: es lo que quiere un desplegable. Con
  // ?incluirInactivos=true la pantalla de configuracion los ve todos.
  if (!filtros.incluirInactivos) where.activo = true;

  const items = await prisma.catalogoItem.findMany({
    where,
    orderBy: [{ tipo: 'asc' }, { orden: 'asc' }, { valor: 'asc' }],
  });
  return items.map(serializar);
}

/**
 * Todos los catalogos de una, agrupados por tipo.
 * El frontend lo pide una vez al entrar y los desplegables de todas las
 * pantallas salen de ahi, en vez de hacer una consulta por selector.
 */
export async function todos() {
  const items = await prisma.catalogoItem.findMany({
    where: { activo: true },
    orderBy: [{ orden: 'asc' }, { valor: 'asc' }],
  });

  const agrupado = {};
  for (const t of TIPOS) agrupado[t] = [];
  for (const item of items) {
    if (!agrupado[item.tipo]) agrupado[item.tipo] = [];
    agrupado[item.tipo].push(serializar(item));
  }
  return agrupado;
}

export async function crear(body, req) {
  if (body.tipo === 'RUBRO_GASTO' && !body.scope) {
    throw ApiError.badRequest(
      'Un rubro de gasto tiene que indicar si es de expediente o del estudio'
    );
  }

  const existente = await prisma.catalogoItem.findUnique({
    where: { tipo_valor: { tipo: body.tipo, valor: body.valor } },
  });

  // Si el valor ya existe pero estaba desactivado, se reactiva en vez de tirar
  // un error de duplicado que al usuario no le dice nada.
  if (existente) {
    if (existente.activo) throw ApiError.conflicto('Esa opcion ya existe en la lista');
    const reactivado = await prisma.catalogoItem.update({
      where: { id: existente.id },
      data: { activo: true, orden: body.orden, scope: body.scope || existente.scope },
    });
    await registrarAccion({
      req,
      entidad: 'CatalogoItem',
      entidadId: reactivado.id,
      accion: 'RESTAURAR',
      valorNuevo: body.tipo + ': ' + body.valor,
    });
    return serializar(reactivado);
  }

  const item = await prisma.$transaction(async (tx) => {
    const creado = await tx.catalogoItem.create({
      data: {
        tipo: body.tipo,
        valor: body.valor,
        orden: body.orden,
        scope: body.scope || null,
        computaComoActivo: body.computaComoActivo,
      },
    });
    await registrarAccion({
      tx,
      req,
      entidad: 'CatalogoItem',
      entidadId: creado.id,
      accion: 'CREAR',
      valorNuevo: creado.tipo + ': ' + creado.valor,
    });
    return creado;
  });

  return serializar(item);
}

export async function actualizar(id, body, req) {
  const actual = await prisma.catalogoItem.findUnique({ where: { id } });
  if (!actual) throw ApiError.noEncontrado('La opcion no existe');

  const datos = {
    valor: body.valor,
    orden: body.orden,
    activo: body.activo,
    scope: body.scope || actual.scope,
    computaComoActivo: body.computaComoActivo,
  };

  const item = await prisma.$transaction(async (tx) => {
    const guardado = await tx.catalogoItem.update({ where: { id }, data: datos });
    await registrarCambios({
      tx,
      req,
      entidad: 'CatalogoItem',
      entidadId: id,
      anterior: actual,
      nuevo: datos,
    });
    return guardado;
  });

  return serializar(item);
}

/**
 * "Eliminar" es desactivar. Se informa cuantos registros lo estan usando para
 * que el usuario entienda por que la opcion no desaparece del historial.
 */
export async function desactivar(id, req) {
  const actual = await prisma.catalogoItem.findUnique({ where: { id } });
  if (!actual) throw ApiError.noEncontrado('La opcion no existe');

  const enUso = await contarUsos(actual);

  await prisma.$transaction(async (tx) => {
    await tx.catalogoItem.update({ where: { id }, data: { activo: false } });
    await registrarAccion({
      tx,
      req,
      entidad: 'CatalogoItem',
      entidadId: id,
      accion: 'ELIMINAR',
      valorAnterior: actual.tipo + ': ' + actual.valor + ' (usos: ' + enUso + ')',
    });
  });

  return { id, desactivado: true, registrosQueLoUsan: enUso };
}

/** Cuenta en cuantos registros esta usado el item, segun su tipo. */
async function contarUsos(item) {
  switch (item.tipo) {
    case 'PROVINCIA':
      return prisma.cliente.count({ where: { provinciaId: item.id } });
    case 'ORIGEN_CONTACTO':
      return prisma.cliente.count({ where: { origenId: item.id } });
    case 'FUERO':
      return prisma.expediente.count({ where: { fueroId: item.id } });
    case 'JUZGADO':
      return prisma.expediente.count({ where: { juzgadoId: item.id } });
    case 'ETAPA_PROCESAL':
      return prisma.expediente.count({ where: { etapaId: item.id } });
    case 'ESTADO_EXPEDIENTE':
      return prisma.expediente.count({ where: { estadoId: item.id } });
    case 'TIPO_EVENTO':
      return prisma.eventoPuntual.count({ where: { tipoId: item.id } });
    case 'TIPO_EVENTO_RECURRENTE':
      return prisma.eventoRecurrente.count({ where: { tipoId: item.id } });
    case 'RUBRO_GASTO':
      return prisma.gasto.count({ where: { rubroId: item.id } });
    case 'MEDIO_PAGO': {
      const [gastos, pagos] = await Promise.all([
        prisma.gasto.count({ where: { medioPagoId: item.id } }),
        prisma.honorarioPago.count({ where: { medioPagoId: item.id } }),
      ]);
      return gastos + pagos;
    }
    default:
      return 0;
  }
}

/**
 * Valida que un id de catalogo exista y sea del tipo esperado.
 * La usan los demas modulos antes de guardar, para dar un mensaje claro en vez
 * de un error de clave foranea.
 */
export async function validarItem(id, tipo, etiquetaCampo) {
  if (id == null) return null;
  const item = await prisma.catalogoItem.findFirst({ where: { id, tipo } });
  if (!item) throw ApiError.badRequest('El valor elegido para "' + etiquetaCampo + '" no existe');
  return item;
}
