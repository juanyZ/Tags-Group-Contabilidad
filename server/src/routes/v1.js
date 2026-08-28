/**
 * Router de la API v1.
 *
 * La autenticacion se aplica UNA sola vez, aca, a todo lo que cuelga de este
 * router salvo /auth. Es mas seguro que ponerla ruta por ruta: no se puede
 * olvidar en un endpoint nuevo. La autorizacion, en cambio, si es por endpoint,
 * porque cada uno necesita un permiso distinto.
 */
import { Router } from 'express';
import { autenticar } from '../middlewares/autenticar.js';

import authRoutes from '../modules/auth/auth.routes.js';
import usuariosRoutes from '../modules/usuarios/usuarios.routes.js';
import clientesRoutes from '../modules/clientes/clientes.routes.js';
import expedientesRoutes from '../modules/expedientes/expedientes.routes.js';
import eventosRoutes from '../modules/eventos/eventos.routes.js';
import recurrentesRoutes from '../modules/recurrentes/recurrentes.routes.js';
import honorariosRoutes from '../modules/honorarios/honorarios.routes.js';
import gastosRoutes from '../modules/gastos/gastos.routes.js';
import catalogosRoutes from '../modules/catalogos/catalogos.routes.js';
import abogadosRoutes from '../modules/catalogos/abogados.routes.js';
import configRoutes from '../modules/config/config.routes.js';
import vistasRoutes from '../modules/vistas/vistas.routes.js';
import exportRoutes from '../modules/vistas/export.routes.js';
import adjuntosRoutes from '../modules/adjuntos/adjuntos.routes.js';
import auditRoutes from '../modules/audit/audit.routes.js';
import plazosRoutes from '../modules/plazos/plazos.routes.js';
import notificacionesRoutes from '../modules/notificaciones.routes.js';

const router = Router();

// --- Publico (solo login / refresh / logout) --------------------------------
router.use('/auth', authRoutes);

// --- A partir de aca, todo exige sesion valida ------------------------------
router.use(autenticar);

router.use('/usuarios', usuariosRoutes);
router.use('/clientes', clientesRoutes);
router.use('/expedientes', expedientesRoutes);
router.use('/eventos', eventosRoutes);
router.use('/recurrentes', recurrentesRoutes);
router.use('/honorarios', honorariosRoutes);
router.use('/gastos', gastosRoutes);
router.use('/catalogos', catalogosRoutes);
router.use('/abogados', abogadosRoutes);
router.use('/config', configRoutes);
router.use('/plazos', plazosRoutes);
router.use('/adjuntos', adjuntosRoutes);
router.use('/audit', auditRoutes);
router.use('/notificaciones', notificacionesRoutes);
router.use('/export', exportRoutes);

// Vistas derivadas: /dashboard, /calendario, /agenda, /cuenta-corriente, /ficha
router.use('/', vistasRoutes);

export default router;
