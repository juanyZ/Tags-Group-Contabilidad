# Frontend — SPA

React 18 + Vite 6 + TanStack Query + Zustand. Sin framework de UI: el sistema
visual son ~1.200 líneas de CSS con variables, hechas a medida de la identidad
del estudio.

## Por qué este stack

**TanStack Query para el estado del servidor, Zustand para el de interfaz.**

Casi todo el estado de esta app es estado *de servidor*: listas, filtros,
paginación, detalles. Meterlo en un store global obliga a reimplementar a mano
cache, invalidación y refetch — que es exactamente lo que Query ya hace bien.
Redux Toolkit habría sido sobre-ingeniería para esto.

Zustand queda para lo poco que sí es global y propio del cliente: la sesión, el
período elegido y el filtro "solo mis causas". Cero boilerplate.

**Sin WebSockets.** `refetchOnWindowFocus` cubre el caso real del estudio: dos
personas trabajando a la vez que, al volver a la pestaña, ven los datos
actualizados del otro. Para las escrituras concurrentes está el bloqueo
optimista del backend, que devuelve 409 en vez de dejar que se pisen.

## Estructura

```
src/
  main.jsx              Providers y configuración de React Query
  App.jsx               Rutas y guard de sesión
  lib/
    api.js              Axios, interceptores, refresh automático, descargas
    formato.js          Fechas dd/mm/aaaa, pesos, etiquetas. NO calcula nada.
  store/
    auth.js             Sesión y chequeo de permisos para la UI
    ui.js               Período global y filtros, en sessionStorage
  hooks/useDatos.js     Catálogos, opciones y helper de mutaciones
  components/
    Layout.jsx          Barra lateral con las 12 solapas
    Cabecera.jsx        Título de pantalla y selector de período
    Tabla.jsx           Tabla con orden, paginación y estados
    Campos.jsx          Inputs validados, editables vs. calculados
    Modal.jsx           Modal accesible y diálogo de confirmación
    Comunes.jsx         Semáforo, tarjetas, paneles, estados de carga
  pages/                Una por solapa
  styles/global.css     El sistema visual completo
```

## Reglas del frontend

**No se calcula nada acá.** Semáforos, saldos, días restantes y porcentajes
vienen resueltos del backend. `formato.js` solo *formatea*. Duplicar esa lógica
es la forma segura de que las dos mitades del sistema terminen diciendo cosas
distintas del mismo plazo.

**Los permisos son cosmética.** `puede('clientes:escribir')` sirve para ocultar
un botón. La decisión real la toma el servidor en cada pedido.

**Campos editables vs. calculados.** Se conserva la convención del Excel: lo que
se carga tiene fondo propio y borde sólido; lo que se calcula va con borde
punteado, en dorado y de solo lectura. Quien viene de la planilla ya lo entiende.

## Sistema visual

Paleta tomada de la identidad de TAGS Group: navy profundo casi negro, dorado
como único acento de marca, crema para el texto (nunca blanco puro: sobre navy
vibra).

Todo el color vive en variables CSS en `:root`. Si cambia la marca, se cambia
ese bloque y no hay que tocar ni una pantalla.

```css
--canvas          #070c14   lienzo de la app
--superficie      #0e1622   tarjetas y paneles
--superficie-alta #141e2d   cabeceras de tabla
--oro             #c69a3e   acento de marca
--texto           #eeece6   texto principal
--texto-3         #8790a0   etiquetas
```

Tres reglas sostienen el modo oscuro:

1. **Los bordes son `rgba` blanco, no un navy más claro.** Un borde translúcido
   se integra con lo que tiene detrás y da sensación de material; uno de color
   plano se ve pegoteado.
2. **Cada superficie elevada lleva un filo de luz arriba**
   (`inset 0 1px 0 rgba(255,255,255,.05)`). Es lo que separa una tarjeta del
   fondo sin recurrir a sombras pesadas.
3. **Todo número va en cifras tabulares.** En una app llena de importes y
   fechas, que los dígitos no bailen entre filas es la diferencia entre una
   tabla que se lee y una que se descifra.

La marca usa una serif con tracking ancho (el aire de papel membretado); el
resto de la interfaz va en sans. El amarillo de «por vencer» se separa a
propósito del dorado de marca: si fueran el mismo tono, un estado de urgencia
se confundiría con la decoración.

Los colores del semáforo están ajustados para tener contraste suficiente sobre
el navy. El amarillo de "por vencer" se separa a propósito del dorado de marca:
si fueran iguales, un estado de urgencia se confundiría con la decoración.

## Comandos

```bash
npm run dev       # http://localhost:5173, con proxy a la API
npm run build     # a dist/
npm run preview   # sirve el build

node scripts/revisar-imports.mjs   # importaciones sobrantes o repetidas
```

En desarrollo, Vite proxea `/api` al backend en el puerto 4000. Como el
navegador ve todo en el mismo origen, no hay problemas de CORS ni hace falta
configurar `VITE_API_URL`.

## Manejo de la sesión

El access token vive **en memoria**, nunca en `localStorage`: si un XSS logra
ejecutar código, no encuentra un token que sobreviva a la recarga. La sesión se
rehidrata al arrancar pidiendo un refresh con la cookie `HttpOnly`, que el
JavaScript de la página no puede leer.

Cuando la API devuelve `TOKEN_EXPIRADO`, un único interceptor pide un token
nuevo y reintenta la petición original de forma transparente. Si varias
peticiones vencen a la vez se encolan y comparten **un solo** refresh — si cada
una disparara el suyo, la detección de reuso del backend cortaría la sesión por
las suyas.
