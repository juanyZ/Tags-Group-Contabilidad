# Backend — API REST

Node 20 + Express 4 + Prisma + MySQL 8. API versionada en `/api/v1`.

## Arquitectura

```
src/
  index.js              Arranque, cron y cierre ordenado
  app.js                Ensamblado de Express y middlewares
  config/
    env.js              Carga y VALIDA el entorno (corta el arranque si falta algo)
    prisma.js           Cliente Prisma único
    permisos.js         Matriz de permisos RBAC
  middlewares/
    autenticar.js       Verifica el access token
    autorizar.js        Aplica la matriz de permisos
    validar.js          Zod + piezas reutilizables de validación
    errores.js          Manejo central; nunca filtra detalle al cliente
    limites.js          Rate limiting
  services/             Lógica de negocio PURA y compartida
    semaforo.service.js       El semáforo. Único lugar del sistema.
    recurrentes.service.js    Proyección de ocurrencias
    plazos.service.js         Días hábiles, feriados y feria judicial
    honorarios.calculo.js     Totales, saldos y situación de cobranza
    vencimientos.service.js   Consultas de vencimientos compartidas
    auditoria.service.js      Registro campo por campo
    codigos.service.js        Generación de CLI-001, EXP-001...
    notificaciones.service.js Avisos en la app y por email
    email.service.js          Hook SMTP opcional
  modules/<recurso>/    routes → service (schema aparte para Zod)
  lib/consultas.js      Helpers de paginación, orden, soft delete y versión
  utils/                Fechas, dinero, errores, respuestas, CSV
```

**El flujo es `routes → service → Prisma`.** Las rutas solo traducen HTTP; toda
la lógica vive en los services, que no saben nada de `req` ni de `res` (salvo
para la auditoría, que necesita la IP). Eso es lo que permite que la ficha del
expediente reuse el service de cuenta corriente sin pasar por la red.

## Los cinco services de cálculo

Son funciones **puras**: reciben el "hoy" como parámetro y no tocan el reloj ni
la base. Por eso se pueden testear a fondo, y por eso los tests son rápidos y no
necesitan MySQL.

| Service | Responsabilidad |
|---|---|
| `semaforo` | La única definición de qué está vencido. La consumen 6 vistas. |
| `recurrentes` | Proyecta ocurrencias desde `fechaBase + periodicidad` |
| `plazos` | Días hábiles con feriados y feria; caducidad y prescripción |
| `honorarios.calculo` | IVA, total, cobrado, saldo, porcentaje y situación |
| `utils/fechas` | Toda la aritmética de fechas y el manejo de zona horaria |

## Zona horaria — leer antes de tocar fechas

Es el riesgo número uno de un sistema de plazos. Un contenedor corre en UTC; a
las 21:30 de Buenos Aires (UTC−3) **ya es el día siguiente en UTC**. Con
`new Date()` a secas, a partir de las 21hs un plazo que vence mañana aparecería
como "vence hoy" y uno que vence hoy, como "vencido".

Las reglas:

- El "hoy" del negocio sale **siempre** de `hoyISO()`, que resuelve la zona de
  Argentina con `Intl`.
- Una fecha de vencimiento es un día de calendario: se representa como string
  `'YYYY-MM-DD'` en toda la lógica y como `DATE` en MySQL.
- Para persistir se usa medianoche UTC (`aDateUTC`), que es exactamente lo que
  Prisma espera y devuelve para `@db.Date`.
- Los sellos de auditoría sí son instantes, y van en UTC.

Hay un test específico que documenta el caso de las 21:30
(`tests/fechas.test.js`).

## Comandos

```bash
npm run dev              # con --watch
npm start                # producción
npm test                 # tests de los cálculos críticos
npm run migrate:dev      # crear/aplicar migraciones en desarrollo
npm run migrate:deploy   # aplicar migraciones en producción
npm run seed             # datos base + ejemplo
npm run limpiar          # borra los datos de prueba, conserva la configuración
npm run db:reset         # CUIDADO: borra la base y vuelve a sembrar

node scripts/verificar-rutas.mjs   # lista todos los endpoints
```

### Variables de entorno

Ver `.env.example` en la raíz del repositorio. Las obligatorias:

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | Conexión de MySQL del runtime (usuario **sin** DDL) |
| `MIGRATE_DATABASE_URL` | Conexión para migraciones (usuario **con** DDL) |
| `JWT_ACCESS_SECRET` | Firma del access token. Mínimo 32 caracteres. |
| `CORS_ORIGINS` | Lista blanca de orígenes, separada por comas |

El servidor **no arranca** si algo falta o si el secreto es débil. Es
deliberado: es preferible que no levante a que firme tokens falsificables.

## Endpoints

102 en total. `node scripts/verificar-rutas.mjs` los lista.

```
POST   /api/v1/auth/login | refresh | logout | cambiar-password
GET    /api/v1/auth/me

GET    /api/v1/clientes            paginado, con filtros y búsqueda
POST   /api/v1/clientes
PUT    /api/v1/clientes/:id        exige `version` (bloqueo optimista)
DELETE /api/v1/clientes/:id        baja lógica
POST   /api/v1/clientes/:id/restaurar

       ... mismo patrón para expedientes, eventos, recurrentes,
           honorarios y gastos

PATCH  /api/v1/eventos/:id/estado             marcar cumplido con un clic
POST   /api/v1/recurrentes/:id/cumplir        registrar un período
POST   /api/v1/honorarios/:id/pagos           registrar un cobro
PATCH  /api/v1/gastos/reintegro               marcar reintegros de a lote

GET    /api/v1/dashboard                      tablero
GET    /api/v1/calendario | /calendario/mes
GET    /api/v1/agenda
GET    /api/v1/cuenta-corriente/:id
GET    /api/v1/ficha/:id

POST   /api/v1/plazos/calcular                días hábiles con feria
GET    /api/v1/export/cuenta-corriente/:id.pdf
GET    /api/v1/export/clientes.csv | expedientes.csv | eventos.csv | ...
```

### Forma de las respuestas

Siempre `{ data, error, meta }`. Los listados paginados traen
`meta: { page, limit, total, totalPaginas }`.

Los errores llegan como
`{ data: null, error: { mensaje, codigo, detalles } }`. Los de validación traen
`detalles` como lista de `{ campo, mensaje }`, que el frontend pinta debajo de
cada input.

Códigos que conviene conocer:

| Código | Significa |
|---|---|
| `TOKEN_EXPIRADO` | El frontend dispara el refresh automático y reintenta |
| `CONFLICTO_VERSION` | Otro usuario editó el registro. Se responde 409. |
| `EXPEDIENTE_REQUERIDO` | Gasto de causa sin expediente elegido |
| `SIN_PERMISO` | El rol no tiene el permiso pedido |
| `CUENTA_BLOQUEADA` | Demasiados intentos fallidos de login |

## Tests

```bash
npm test
```

67 tests sobre los cálculos críticos, con el runner nativo de Node (sin
dependencias de testing). No necesitan base de datos.

Incluyen **tests de paridad** contra los datos reales de la planilla que se
reemplaza: los próximos vencimientos de los 9 eventos recurrentes y los importes
de honorarios se verifican contra los valores que mostraba el Excel. Si el
sistema nuevo no reproduce esos números, algo cambió de significado.

## Notificaciones

Desactivadas por defecto. Con `NOTIFY_CRON_ENABLED=true` se activa un cron
diario que junta los vencimientos atrasados y los que entran en el umbral, crea
las notificaciones del panel y, si hay SMTP configurado, manda **un** resumen
por persona (no un mail por vencimiento).

La deduplicación es por `(usuario, clave)` con la fecha adentro: el cron puede
correr diez veces sin llenarle la casilla a nadie.

Para probar la configuración sin esperar al cron:
`POST /api/v1/notificaciones/generar` (solo administradores).
