/**
 * Endpoints de exportacion. PDF para lo que se imprime o se le manda al
 * cliente; CSV para lo que se sigue trabajando en una planilla.
 *
 * Todas las descargas quedan auditadas: llevan datos personales.
 */
import { Router } from 'express';
import { z } from 'zod';
import { validar, idParam, fechaISO } from '../../middlewares/validar.js';
import { autorizar } from '../../middlewares/autorizar.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { generarCSV, enviarCSV, numeroAR } from '../../utils/csv.js';
import { formatoAR, hoyISO } from '../../utils/fechas.js';
import { registrarAccion } from '../../services/auditoria.service.js';
import { obtenerConfig } from '../config/config.service.js';
import { cuentaCorriente } from './cuentacorriente.service.js';
import { ficha as obtenerFicha } from './ficha.service.js';
import { pdfCuentaCorriente, pdfFichaExpediente } from './export.service.js';
import * as clientesServicio from '../clientes/clientes.service.js';
import * as expedientesServicio from '../expedientes/expedientes.service.js';
import * as eventosServicio from '../eventos/eventos.service.js';
import * as honorariosServicio from '../honorarios/honorarios.service.js';
import * as gastosServicio from '../gastos/gastos.service.js';

const router = Router();

/** Los CSV se generan sobre el listado completo, no sobre la pagina visible. */
const TOPE_EXPORT = 5000;

// --- PDF -------------------------------------------------------------------

router.get(
  '/cuenta-corriente/:id.pdf',
  autorizar('cuentacorriente:leer'),
  validar({ params: idParam }),
  asyncHandler(async (req, res) => {
    const [cuenta, estudio] = await Promise.all([
      cuentaCorriente(req.params.id),
      obtenerConfig(),
    ]);

    await registrarAccion({
      req,
      entidad: 'CuentaCorriente',
      entidadId: req.params.id,
      accion: 'DESCARGA',
      valorNuevo: 'PDF cuenta corriente de ' + cuenta.cliente.nombre,
    });

    return pdfCuentaCorriente(res, cuenta, estudio);
  })
);

router.get(
  '/ficha/:id.pdf',
  autorizar('expedientes:leer'),
  validar({ params: idParam }),
  asyncHandler(async (req, res) => {
    const [ficha, estudio] = await Promise.all([obtenerFicha(req.params.id), obtenerConfig()]);

    await registrarAccion({
      req,
      entidad: 'Expediente',
      entidadId: req.params.id,
      accion: 'DESCARGA',
      valorNuevo: 'PDF ficha de ' + ficha.expediente.codigo,
    });

    return pdfFichaExpediente(res, ficha, estudio);
  })
);

// --- CSV -------------------------------------------------------------------

async function auditarExport(req, entidad, cantidad) {
  await registrarAccion({
    req,
    entidad,
    accion: 'DESCARGA',
    valorNuevo: 'CSV con ' + cantidad + ' registros',
  });
}

router.get(
  '/clientes.csv',
  autorizar('clientes:leer'),
  asyncHandler(async (req, res) => {
    const r = await clientesServicio.listar({ page: 1, limit: TOPE_EXPORT, orden: 'asc', ordenarPor: 'nombre' }, null);

    const columnas = [
      { clave: 'codigo', titulo: 'ID' },
      { clave: 'tipoPersona', titulo: 'Tipo de persona' },
      { clave: 'nombre', titulo: 'Apellido y nombre / Razon social' },
      { clave: 'documento', titulo: 'DNI / CUIT' },
      { clave: 'domicilio', titulo: 'Domicilio' },
      { clave: 'provincia', titulo: 'Provincia' },
      { clave: 'telefono', titulo: 'Telefono' },
      { clave: 'email', titulo: 'Email' },
      { clave: 'origen', titulo: 'Origen del contacto' },
      { clave: 'estado', titulo: 'Estado' },
      { clave: 'fechaAltaAR', titulo: 'Fecha de alta' },
      { clave: 'abogado', titulo: 'Abogado responsable' },
      { clave: 'observaciones', titulo: 'Observaciones' },
    ];

    const filas = r.items.map((c) =>
      Object.assign({}, c, { fechaAltaAR: formatoAR(c.fechaAlta) })
    );

    await auditarExport(req, 'Cliente', filas.length);
    return enviarCSV(res, 'clientes-' + hoyISO() + '.csv', generarCSV(columnas, filas));
  })
);

router.get(
  '/expedientes.csv',
  autorizar('expedientes:leer'),
  asyncHandler(async (req, res) => {
    const r = await expedientesServicio.listar(
      { page: 1, limit: TOPE_EXPORT, orden: 'asc', ordenarPor: 'caratula' },
      null
    );

    const columnas = [
      { clave: 'codigo', titulo: 'ID' },
      { clave: 'fechaInicioAR', titulo: 'Fecha de inicio' },
      { clave: 'caratula', titulo: 'Caratula' },
      { clave: 'cliente', titulo: 'Cliente' },
      { clave: 'caracter', titulo: 'Caracter' },
      { clave: 'contraparte', titulo: 'Contraparte' },
      { clave: 'fuero', titulo: 'Fuero / materia' },
      { clave: 'juzgado', titulo: 'Juzgado' },
      { clave: 'numeroExpediente', titulo: 'N de expediente' },
      { clave: 'etapa', titulo: 'Etapa procesal' },
      { clave: 'estado', titulo: 'Estado' },
      { clave: 'abogado', titulo: 'Abogado' },
      { clave: 'ultimaActuacionAR', titulo: 'Ultima actuacion' },
      { clave: 'proximoVtoAR', titulo: 'Proximo vencimiento' },
      { clave: 'situacionEtiqueta', titulo: 'Situacion' },
      { clave: 'pendientes', titulo: 'Vtos. pendientes' },
      { clave: 'montoReclamadoAR', titulo: 'Monto reclamado' },
    ];

    const filas = r.items.map((e) =>
      Object.assign({}, e, {
        fechaInicioAR: formatoAR(e.fechaInicio),
        ultimaActuacionAR: formatoAR(e.ultimaActuacion),
        proximoVtoAR: formatoAR(e.proximoVto),
        montoReclamadoAR: numeroAR(e.montoReclamado),
      })
    );

    await auditarExport(req, 'Expediente', filas.length);
    return enviarCSV(res, 'expedientes-' + hoyISO() + '.csv', generarCSV(columnas, filas));
  })
);

router.get(
  '/eventos.csv',
  autorizar('eventos:leer'),
  validar({
    query: z.object({
      desde: fechaISO.optional(),
      hasta: fechaISO.optional(),
      soloPendientes: z.coerce.boolean().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const r = await eventosServicio.listar(
      Object.assign({ page: 1, limit: TOPE_EXPORT, orden: 'asc', ordenarPor: 'fechaVto' }, req.datosQuery)
    );

    const columnas = [
      { clave: 'codigo', titulo: 'ID' },
      { clave: 'fechaVtoAR', titulo: 'Fecha vto.' },
      { clave: 'hora', titulo: 'Hora' },
      { clave: 'tipo', titulo: 'Tipo de evento' },
      { clave: 'descripcion', titulo: 'Descripcion' },
      { clave: 'expediente', titulo: 'Expediente' },
      { clave: 'cliente', titulo: 'Cliente' },
      { clave: 'responsable', titulo: 'Responsable' },
      { clave: 'prioridad', titulo: 'Prioridad' },
      { clave: 'estado', titulo: 'Estado' },
      { clave: 'situacionEtiqueta', titulo: 'Situacion' },
      { clave: 'diasTexto', titulo: 'Dias' },
    ];

    const filas = r.items.map((e) => Object.assign({}, e, { fechaVtoAR: formatoAR(e.fechaVto) }));

    await auditarExport(req, 'EventoPuntual', filas.length);
    return enviarCSV(res, 'vencimientos-' + hoyISO() + '.csv', generarCSV(columnas, filas));
  })
);

router.get(
  '/honorarios.csv',
  autorizar('honorarios:leer'),
  asyncHandler(async (req, res) => {
    const r = await honorariosServicio.listar({
      page: 1,
      limit: TOPE_EXPORT,
      orden: 'asc',
      ordenarPor: 'fechaPacto',
    });

    const columnas = [
      { clave: 'codigo', titulo: 'ID' },
      { clave: 'fechaPactoAR', titulo: 'Fecha del pacto' },
      { clave: 'cliente', titulo: 'Cliente' },
      { clave: 'expediente', titulo: 'Expediente' },
      { clave: 'tipoPacto', titulo: 'Tipo de pacto' },
      { clave: 'montoPactadoAR', titulo: 'Honorarios pactados' },
      { clave: 'ivaPorcentaje', titulo: 'IVA %' },
      { clave: 'totalConIvaAR', titulo: 'Total c/IVA' },
      { clave: 'cobradoAR', titulo: 'Cobrado' },
      { clave: 'ultimoCobroAR', titulo: 'Fecha del cobro' },
      { clave: 'saldoAR', titulo: 'Saldo' },
      { clave: 'porcentajeCobrado', titulo: '% cobrado' },
      { clave: 'situacion', titulo: 'Situacion' },
    ];

    const filas = r.items.map((h) =>
      Object.assign({}, h, {
        fechaPactoAR: formatoAR(h.fechaPacto),
        ultimoCobroAR: formatoAR(h.ultimoCobro),
        montoPactadoAR: numeroAR(h.montoPactado),
        totalConIvaAR: numeroAR(h.totalConIva),
        cobradoAR: numeroAR(h.cobrado),
        saldoAR: numeroAR(h.saldo),
      })
    );

    await auditarExport(req, 'Honorario', filas.length);
    return enviarCSV(res, 'honorarios-' + hoyISO() + '.csv', generarCSV(columnas, filas));
  })
);

router.get(
  '/gastos.csv',
  autorizar('gastos:leer'),
  validar({ query: z.object({ desde: fechaISO.optional(), hasta: fechaISO.optional() }) }),
  asyncHandler(async (req, res) => {
    const r = await gastosServicio.listar(
      Object.assign({ page: 1, limit: TOPE_EXPORT, orden: 'asc', ordenarPor: 'fecha' }, req.datosQuery)
    );

    const columnas = [
      { clave: 'codigo', titulo: 'ID' },
      { clave: 'fechaAR', titulo: 'Fecha' },
      { clave: 'tipo', titulo: 'Tipo de gasto' },
      { clave: 'expediente', titulo: 'Expediente' },
      { clave: 'cliente', titulo: 'Cliente' },
      { clave: 'rubro', titulo: 'Rubro' },
      { clave: 'detalle', titulo: 'Detalle' },
      { clave: 'medioPago', titulo: 'Medio de pago' },
      { clave: 'importeAR', titulo: 'Importe' },
      { clave: 'reembolsableTexto', titulo: 'Reembolsable' },
      { clave: 'estadoReintegro', titulo: 'Estado del reintegro' },
    ];

    const filas = r.items.map((g) =>
      Object.assign({}, g, {
        fechaAR: formatoAR(g.fecha),
        importeAR: numeroAR(g.importe),
        reembolsableTexto: g.reembolsable ? 'Si' : 'No',
      })
    );

    await auditarExport(req, 'Gasto', filas.length);
    return enviarCSV(res, 'gastos-' + hoyISO() + '.csv', generarCSV(columnas, filas));
  })
);

export default router;
