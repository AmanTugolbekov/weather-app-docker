# Weather App + Docker

A minimal weather app: search a city, see current conditions and a five-day outlook.
Weather data comes from [Open-Meteo](https://open-meteo.com/) — no API key required.
The interface and all API messages are in English.

## Structure

```
.
├── Dockerfile
├── docker-compose.yml
├── package.json
├── src/
│   ├── server.js      # Express: static files and API
│   └── weather.js     # Open-Meteo requests, cache, error handling
├── public/
│   ├── index.html
│   ├── app.js
│   ├── styles.css
│   └── assets/        # sky photograph and locally hosted fonts
└── test/
    └── weather.test.js
```

## Run with Docker (recommended)

```bash
docker compose up --build
```

Open <http://localhost:8080>. Stop with `docker compose down`.

Change the host port with `APP_PORT`:

```bash
APP_PORT=9000 docker compose up --build
```

In Windows PowerShell:

```powershell
$env:APP_PORT = "9000"
docker compose up --build
```

## Run locally without Docker

Node.js 20 or newer is required.

```bash
npm install
npm start
```

Open <http://localhost:3000>. For auto-restart during development: `npm run dev`.

To use a `.env` file (copy `.env.example`):

```bash
node --env-file=.env src/server.js
```

## Environment variables

| Variable       | Default  | Purpose                                      |
| -------------- | -------- | -------------------------------------------- |
| `PORT`         | `3000`   | Port the app listens on inside the container |
| `APP_PORT`     | `8080`   | Host port in `docker-compose.yml`            |
| `CACHE_TTL_MS` | `600000` | Weather cache lifetime (10 minutes)          |

## API

- `GET /api/health` — service status.
- `GET /api/weather?city=London` — city, current conditions, five-day outlook, units.
- `GET /api/forecast?city=London` — city and five-day outlook only.

Example `/api/weather` response:

```json
{
  "city": { "name": "London", "country": "United Kingdom", "region": "England", "latitude": 51.50853, "longitude": -0.12574 },
  "current": {
    "time": "2026-11-25T12:00",
    "temperature": 6.2,
    "feelsLike": 4.1,
    "humidity": 81,
    "windSpeed": 11.4,
    "code": 3,
    "isDay": true,
    "description": "Overcast",
    "icon": "cloudy"
  },
  "forecast": [
    { "date": "2026-11-25", "description": "Overcast", "icon": "cloudy", "max": 6.2, "min": 3.7 }
  ],
  "units": { "temperature": "°C", "windSpeed": "km/h" },
  "fetchedAt": "2026-11-25T12:00:00.000Z",
  "cached": false
}
```

`icon` is a semantic key (`clear`, `clear-night`, `partly-cloudy`, `cloudy`, `fog`,
`drizzle`, `rain`, `snow`, `thunder`, `unknown`) rendered by the client as a
monochrome SVG glyph — no emoji in the UI or the API.

Errors return `{"error": "..."}` with a matching HTTP status:
400 — no city given, 404 — city not found, 502 — upstream service unavailable.

The cache is in-memory: one response per city is kept for `CACHE_TTL_MS`
milliseconds, and concurrent requests for the same city are coalesced into a
single upstream call.

## Tests

```bash
npm test
```

Tests cover input normalization, WMO code mapping, response shape, cache behavior
and error handling — without network access.

## Design and assets

- **Type:** Sora for display, Plus Jakarta Sans for body text. Both are hosted
  locally in `public/assets/fonts/` under the SIL Open Font License.
- **Photo:** `Cirrus uncinus clouds in the morning sky` by ADARSHluck, via
  [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Cirrus_uncinus_clouds_in_the_morning_sky.jpg),
  licensed [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
  Credit is also shown in the app footer.
- **Material:** translucent white glass panels over the photograph, with a
  hairline border and a subtle inner highlight. No emoji and no decorative gradients.

## Troubleshooting

- If weather does not load, check access to `open-meteo.com` and `/api/health`.
- If port 8080 is taken, set a different `APP_PORT`.
- The image is built on `node:20-alpine` and runs as an unprivileged user.
