# Relator Pro

Asistente web integral para **relatores independientes de fútbol**: preparás el partido, lo relatás en vivo con
cancha táctica, reloj y eventos, y lo archivás con estadísticas y resumen. Pensado para trabajar solo o en equipo
(relator + comentarista + operador) con sincronización en tiempo real.

## Qué incluye

| Módulo | Qué hace |
| --- | --- |
| **Previa** | Datos del partido, alineaciones editables (formación, titulares, suplentes), notas por jugador, notas libres, historial directo y tabla de posiciones (API). |
| **En vivo** | Cancha interactiva (arrastrá jugadores), reloj con períodos y tiempo agregado, botonera de eventos de un click (gol, tarjetas, cambios, córner, VAR…), cronología editable, buscador de fichas, banco de frases y notas a mano. |
| **Post-partido** | Estadísticas del relato, goleadores y tarjetas, resumen autogenerado y editable, exportación a `.txt` / PDF (imprimir). |
| **Banco de frases** | Frases por categoría (apertura, gol, cierre…), favoritas y ordenadas por uso. Cada cuenta arranca con un set inicial. |
| **Notas** | Apuntes privados, fijables, asociables a un partido. |
| **Equipos y planteles** | Carga manual (con “carga rápida” pegando la lista) o importación desde la API deportiva. |
| **Equipo de transmisión** | Compartí un partido por email con un **rol** (Editor, Campo, Comentarista, Solo lectura). Todos ven los cambios al instante (WebSocket), quién está conectado y **quién cargó cada evento**. Podés guardar un **equipo de transmisión** y sumarlo con un click, o dejarlo como predeterminado para que cada partido nuevo lo incluya. Hay **chat** por partido. |
| **Integración deportiva** | API-Football: buscar partidos por fecha/liga/equipo, importar partido + plantillas + **alineación oficial** con posiciones en la cancha. |

El reloj lo lleva el **servidor** (no el navegador): si se cierra la pestaña o se cae el WiFi, el partido sigue marcando bien y todos los dispositivos ven la misma hora.

## Roles en un partido

| Rol | Puede |
| --- | --- |
| **Propietario** (creador) | Todo, incluido borrar el partido y gestionar al equipo. |
| **Editor** | Reloj, alineaciones, fichas, eventos, cambios, resumen y datos del partido. |
| **Campo** | Cargar eventos y cambios desde el estadio; edita/borra solo lo que cargó. No toca el reloj ni las fichas. |
| **Comentarista** | Ver todo, escribir notas (eventos tipo nota) y chatear. |
| **Solo lectura** | Ver todo y chatear. |

Los permisos los valida siempre el servidor (`server/lib/permissions.js`); la interfaz solo oculta lo que el rol no puede usar.

## Arquitectura

```
client/   React 19 + Vite + Tailwind v4 + React Router   (SPA)
server/   Node 20+ · Express · PostgreSQL (pg) · WebSocket (ws) · JWT · zod
```

En producción es **un solo servicio**: Express sirve la API (`/api`), el WebSocket (`/ws`) y el frontend compilado (`client/dist`).

## Desarrollo local

Requisitos: Node 20+.

```bash
npm install                 # dependencias del servidor
npm --prefix client install # dependencias del frontend
cp .env.example .env        # ya trae valores para desarrollo

npm run dev:db              # Postgres local embebido (sin Docker). Dejalo corriendo.
npm run dev                 # en otra terminal: API (3001) + web (5173)
```

Abrí <http://localhost:5173>, creá tu cuenta y listo. Las tablas se crean solas al arrancar.

> Si ya tenés Postgres o Docker, apuntá `DATABASE_URL` en `.env` y omití `npm run dev:db`.

### Tests

```bash
npm test
```

Incluye tests de dominio (formaciones, reloj, marcador) y de integración contra Postgres real (registro, permisos,
partido en vivo, cambios, colaboración, WebSocket) y contra un **servidor simulado de API-Football** (importación de
partidos y alineaciones). Los de integración se saltean si no hay base disponible.

## Despliegue en Railway (desde GitHub)

1. Subí este repo a GitHub.
2. En [Railway](https://railway.com): **New Project → Deploy from GitHub repo** y elegí el repo.
   Railway lee `railway.json` (build: `npm run build`, start: `npm start`, healthcheck: `/api/health`).
3. En el mismo proyecto: **+ New → Database → Add PostgreSQL**.
4. En el servicio de la app → **Variables**:

   | Variable | Valor |
   | --- | --- |
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (referencia al plugin de Postgres) |
   | `JWT_SECRET` | string largo y aleatorio (**obligatorio**). Ej.: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
   | `API_FOOTBALL_KEY` | *(opcional)* key global de API-Football. Cada relator puede cargar la suya en **Ajustes**. |
   | `REGISTRATION_CODE` | *(opcional)* si lo definís, el registro exige este código de invitación (útil para cerrar el acceso). |
   | `APP_SECRET` | *(opcional)* clave para cifrar las API keys de usuarios; por defecto deriva de `JWT_SECRET`. |

5. **Settings → Networking → Generate Domain**. Listo: cada `git push` a la rama configurada redeploya.

Notas:
- `PORT` lo define Railway; no lo configures.
- La conexión interna (`DATABASE_URL` de referencia) no necesita SSL. Solo si usás la URL *pública* de Postgres, agregá `PGSSL=true`.
- El esquema es idempotente y se aplica en cada arranque, así que no hay pasos de migración manuales.
- Si cambiás `JWT_SECRET`, se cierran todas las sesiones (y, si no definiste `APP_SECRET`, las API keys guardadas dejan de poder descifrarse: se vuelven a cargar en Ajustes).

## CI

`.github/workflows/ci.yml` corre los tests contra un Postgres de servicio y compila el frontend en cada push y pull request.

## API-Football

- Registro y key: <https://www.api-football.com/> (el plan gratuito da ~100 consultas/día y limita temporadas).
- Los datos se piden **una vez** y se guardan en tu base (equipos, jugadores, partido, alineación); además el servidor cachea
  respuestas unos minutos/horas para cuidar la cuota.
- Sin key la app funciona completa con carga manual.
- La alineación oficial suele publicarse ~1 h antes del partido; si todavía no está, se arma una automática con el plantel
  (podés ajustarla en la Previa).

## Seguridad

- Contraseñas con bcrypt; sesiones con JWT (30 días); límite de intentos en login/registro.
- Cada usuario solo ve sus equipos, notas y frases; los partidos se comparten explícitamente por email.
- Las API keys de terceros se guardan **cifradas** (AES-256-GCM) y nunca se devuelven al navegador.
- Validación de entradas con zod en todas las rutas y consultas SQL parametrizadas.

## Scripts

| Comando | Descripción |
| --- | --- |
| `npm run dev` | API + frontend con recarga en caliente |
| `npm run dev:db` | Postgres local embebido para desarrollo |
| `npm run build` | Compila el frontend (`client/dist`) |
| `npm start` | Servidor de producción |
| `npm test` | Tests de dominio e integración |
