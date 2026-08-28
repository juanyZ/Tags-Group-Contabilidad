# Sistema de gestión — TAGS Group

Aplicación web que reemplaza la planilla de Excel del estudio: clientes,
expedientes, vencimientos, honorarios, gastos y cuenta corriente. Multiusuario,
con permisos por rol, auditoría de todo lo que se toca y cálculos que no se
rompen cuando alguien escribe encima de una celda.

```
/server   API REST — Node 20 + Express + Prisma + MySQL 8
/client   SPA — React 18 + Vite + TanStack Query + Zustand
/docs     Modelo de datos y decisiones de diseño
```

---

## Puesta en marcha con Docker

Es la vía recomendada: levanta MySQL, el backend y el frontend con un comando.

```bash
# 1. Configurar los secretos
cp .env.example .env
# Editá .env: cambiá TODAS las contraseñas y generá el secreto del JWT con
#   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 2. Levantar todo
docker compose up -d --build

# 3. Crear las tablas y cargar los datos base
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npm run seed
```

El seed imprime **una sola vez** las credenciales generadas. Anotalas: no se
vuelven a mostrar.

- Frontend: <http://localhost:5173>
- API: <http://localhost:4000/api/v1>
- Health check: <http://localhost:4000/health>

### Sin datos de ejemplo

Para arrancar con la base limpia desde el principio (solo configuración,
catálogos y el usuario administrador, sin clientes ni causas de prueba):

```bash
docker compose exec -e SEED_SOLO_BASE=true backend npm run seed
```

### Borrar los datos de prueba después de haber probado

Si ya cargaste datos de ejemplo y querés empezar a usar el sistema en serio:

```bash
cd server
npm run limpiar -- --confirmar
```

Borra clientes, expedientes, vencimientos, honorarios, gastos, adjuntos y el
registro de auditoría. **Conserva** los datos del estudio, todas las listas de
desplegables, el calendario procesal, el usuario administrador y la ficha de
abogado del titular. Cierra todas las sesiones abiertas.

Exige `--confirmar` a propósito: es irreversible. Conviene sacar un volcado
antes (`mysqldump -u root --databases estudio_juridico > respaldo.sql`).

Los códigos legibles (`CLI-001`, `EXP-001`…) siguen la numeración interna de
MySQL, así que después de limpiar arrancan donde habían quedado. Para que
vuelvan a empezar en 001 hay que reiniciar los contadores a mano:

```sql
ALTER TABLE clientes AUTO_INCREMENT = 1;
-- lo mismo para expedientes, eventos_puntuales, eventos_recurrentes,
-- honorarios y gastos
```

---

## Puesta en marcha sin Docker

Requiere Node 20+ y un MySQL 8 accesible.

```bash
# Backend
cd server
cp ../.env.example .env      # ajustá DATABASE_URL a tu MySQL
npm install
npx prisma migrate dev       # crea las tablas
npm run seed                 # datos base + ejemplo
npm run dev                  # http://localhost:4000

# Frontend (en otra terminal)
cd client
npm install
npm run dev                  # http://localhost:5173
```

El servidor de desarrollo de Vite proxea `/api` al backend, así que en
desarrollo no hay que configurar CORS ni tocar `VITE_API_URL`.

---

## Qué hace, solapa por solapa

Réplica funcional de las 12 solapas de la planilla, más lo que se sumó.

| Pantalla | Qué es | Cómo se carga |
|---|---|---|
| **Tablero** | Todo el estudio resumido, con filtro de período | Se arma sola |
| **Clientes** | Base única de contactos, físicos y jurídicos | Cargás vos |
| **Expedientes** | Las causas, con etapa, estado y seguimiento | Cargás vos |
| **Vencimientos** | Audiencias, plazos, escritos, pericias, reuniones | Cargás vos |
| **Recurrentes** | Lo que se repite: se carga una vez y se proyecta solo | Cargás vos |
| **Calendario** | Listado por urgencia + grilla del mes | Se arma sola |
| **Agenda semanal** | Una tarjeta por día, hasta 14 días | Se arma sola |
| **Honorarios** | Lo pactado y lo cobrado, con saldo y semáforo | Mixta |
| **Gastos** | De causa y del estudio, con control de reintegros | Cargás vos |
| **Cuenta corriente** | Debe, haber y saldo de cada cliente | Se arma sola |
| **Ficha** | Todo de una causa: datos, importes y movimientos | Se arma sola |
| **Configuración** | Datos, parámetros, listas, abogados, usuarios, auditoría | Cargás vos |

### El semáforo

`VENCIDO` · `VENCE HOY` · `POR VENCER` (dentro del umbral configurable) ·
`EN FECHA` · `CUMPLIDO`, más `CANCELADO` como estado neutro propio.

Se calcula en **un solo lugar** (`server/src/services/semaforo.service.js`) y
lo consumen todas las vistas. El frontend nunca lo recalcula: solo pinta el
badge que le manda la API. Es lo que garantiza que el tablero, el calendario y
la ficha nunca digan cosas distintas del mismo plazo.

> **Las alertas del tablero son siempre globales.** Vencidos, vencen hoy y por
> vencer **no** siguen el filtro de período: si filtrás agosto, un plazo vencido
> de julio te tiene que seguir apareciendo. Facturado, cobrado y gastos sí
> responden al período.

---

## Qué mejora sobre la planilla

| El problema en el Excel | Cómo se resuelve acá |
|---|---|
| Renombrar un cliente desenganchaba sus expedientes y honorarios | Todo se relaciona por ID interno: el nombre es un dato más |
| Repetir un cliente en dos renglones duplicaba el cobrado | El cobrado es la suma de los pagos registrados; no hay campo que escribir mal |
| El tilde de cumplido se borraba a mano cada mes y no dejaba rastro | Cada período cumplido queda registrado con fecha y autor |
| Un gasto "del expediente" sin expediente quedaba en rojo y se perdía | Se rechaza el guardado con un mensaje claro |
| Borrar un valor de una lista dejaba registros huérfanos | Las opciones se desactivan, nunca se borran |
| Escribir encima de una celda blanca borraba la fórmula | Los campos calculados son de solo lectura |
| Un solo usuario por vez | Multiusuario con roles, y control de concurrencia que evita pisarse |
| Sin historial de cambios | Auditoría campo por campo: quién, qué, cuándo y desde qué IP |
| Sin cómputo de días hábiles | Motor de plazos con feriados y feria judicial configurables |

Y además: adjuntos por expediente, exportación a PDF y CSV, alertas de
caducidad de instancia y prescripción, y notificaciones por email opcionales.

---

## Nota de seguridad

Este sistema guarda **datos personales sensibles** (DNI, domicilios, causas
judiciales). Las decisiones de seguridad están explicadas en el código, pero
estas son las que hay que respetar al operarlo:

**Autenticación.** Contraseñas con bcrypt (12 rondas, configurable). El access
token es un JWT de 15 minutos que el frontend guarda **en memoria**, nunca en
`localStorage`. El refresh es un token opaco en cookie `HttpOnly` + `Secure` +
`SameSite=Strict`, del que la base guarda solo el SHA-256. Rota en cada uso y,
si se detecta que uno ya usado vuelve a aparecer, se revoca la familia entera
de sesiones: es la firma de un token robado.

**Autorización.** Matriz de permisos única en `server/src/config/permisos.js`,
aplicada endpoint por endpoint. El frontend recibe una copia para ocultar
botones, pero eso es **solo cosmética**: quien llame la API a mano recibe 403
igual.

**Entradas.** Todo input se valida con Zod en el servidor, con esquemas
estrictos que descartan cualquier campo de más (defensa contra *mass
assignment*). Las consultas van siempre parametrizadas vía Prisma: no hay
concatenación de SQL en ninguna parte.

**Fuerza bruta.** Doble defensa: rate limit por IP (10 intentos cada 15 min) y
bloqueo por usuario persistido en la base. Uno solo no alcanza — una botnet rota
IPs, y el bloqueo por cuenta no frena probar una contraseña contra muchas.

**Base de datos.** Dos usuarios de MySQL: el runtime solo tiene DML
(`SELECT/INSERT/UPDATE/DELETE`), y las migraciones usan un usuario aparte con
DDL. Si el proceso del servidor es comprometido, el atacante no puede hacer
`DROP TABLE`.

**Adjuntos.** Se guardan fuera del webroot, con nombre generado por el servidor
(nunca el del usuario), lista blanca de tipos, tope de tamaño y verificación de
que la extensión coincida con el MIME. Se sirven solo por un endpoint que valida
sesión y permisos, siempre como `attachment`, y cada descarga queda auditada.

**Errores.** Al cliente le llega un mensaje útil pero genérico; el stack y el
detalle quedan solo en el log del servidor. Los logs no incluyen cuerpos de
peticiones ni datos de clientes.

**Secretos.** Solo por variables de entorno. El `.env` está en `.gitignore` y el
servidor **se niega a arrancar** si el secreto del JWT tiene menos de 32
caracteres o si en producción quedó el valor de ejemplo.

### Antes de poner esto en producción

1. Cambiar **todas** las contraseñas del `.env` y generar un `JWT_ACCESS_SECRET`
   nuevo y aleatorio.
2. Servir por HTTPS. En producción se activan `Secure` en las cookies y HSTS,
   que sobre HTTP no funcionan.
3. Ajustar `CORS_ORIGINS` al dominio real (nunca `*`).
4. Borrar los datos de ejemplo (`npm run db:reset` con `SEED_SOLO_BASE=true`).
5. **Backups**: los adjuntos viven en un volumen de disco, fuera del dump de
   MySQL. Hay que respaldar las dos cosas.
6. Revisar los tipos de plazo cargados por el seed: son **orientativos**.

---

## Aclaración importante sobre el cómputo de plazos

El sistema hace la **aritmética** del calendario, no interpreta derecho
procesal. Cuántos días tiene cada plazo, desde cuándo corre y si se cuenta en
días hábiles o corridos cambia según jurisdicción, fuero e instancia: todo eso
son **datos que carga el estudio** en Configuración → Calendario procesal, no
reglas escritas en el código.

Lo que sí está implementado, porque es aritmética y no criterio:

- Sábados, domingos, feriados y ferias judiciales cargados son inhábiles.
- El plazo corre desde el día hábil **siguiente** al acto (regla general del
  CPCCN art. 156).
- Un plazo en días corridos que cae en día inhábil se traslada al hábil
  siguiente.

Los tipos de plazo que trae el seed están marcados como *"REVISAR contra el
código procesal aplicable"*. Hay que hacerlo antes de confiar en ellos.

---

## Desarrollo

```bash
# Backend
cd server
npm test                  # tests de los cálculos críticos
npm run dev               # con recarga automática
node scripts/verificar-rutas.mjs   # lista los 102 endpoints

# Frontend
cd client
npm run dev
npm run build
node scripts/revisar-imports.mjs   # importaciones sobrantes
```

Los tests cubren lo que no puede fallar: el semáforo, la aritmética de fechas
(incluida la trampa de la zona horaria), la proyección de recurrentes, el
cómputo de días hábiles y los cálculos de honorarios. Varios son **tests de
paridad**: verifican que el sistema reproduzca exactamente los mismos números
que la planilla que reemplaza.

Más detalle en [`server/README.md`](server/README.md),
[`client/README.md`](client/README.md) y
[`docs/modelo-de-datos.md`](docs/modelo-de-datos.md).
