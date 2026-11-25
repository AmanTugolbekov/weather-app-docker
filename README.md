# Weather App + Docker

Небольшое приложение для погоды: поиск города, текущая погода и прогноз на 5 дней.
Данные берутся из [Open-Meteo](https://open-meteo.com/) — API-ключ не нужен.

## Структура

```
.
├── Dockerfile
├── docker-compose.yml
├── package.json
├── src/
│   ├── server.js      # Express: статику и API
│   └── weather.js     # запросы к Open-Meteo, кэш, обработка ошибок
├── public/
│   ├── index.html
│   ├── app.js
│   └── styles.css
└── test/
    └── weather.test.js
```

## Запуск через Docker (рекомендуемый способ)

```bash
docker compose up --build
```

Откройте <http://localhost:8080>. Остановка: `docker compose down`.

Хост-порт можно изменить через переменную `APP_PORT`:

```bash
APP_PORT=9000 docker compose up --build
```

В Windows PowerShell:

```powershell
$env:APP_PORT = "9000"
docker compose up --build
```

## Локальный запуск без Docker

Нужен Node.js 20+.

```bash
npm install
npm start
```

Откройте <http://localhost:3000>. Для разработки с автоперезапуском: `npm run dev`.

Настройки можно вынести в `.env` (скопируйте `.env.example`) и запускать так:

```bash
node --env-file=.env src/server.js
```

## Переменные окружения

| Переменная     | По умолчанию | Назначение                                  |
| -------------- | ------------ | ------------------------------------------- |
| `PORT`         | `3000`       | Порт, который слушает приложение            |
| `APP_PORT`     | `8080`       | Порт на хосте в `docker-compose.yml`        |
| `CACHE_TTL_MS` | `600000`     | Время жизни кэша ответов погоды (10 минут)  |

## API

- `GET /api/health` — состояние сервиса.
- `GET /api/weather?city=Москва` — город, текущая погода и прогноз, единицы измерения.
- `GET /api/forecast?city=Москва` — только город и прогноз на 5 дней.

Пример ответа `/api/weather`:

```json
{
  "city": { "name": "Москва", "country": "Россия", "region": "Москва", "latitude": 55.75, "longitude": 37.62 },
  "current": {
    "time": "2026-11-25T12:00",
    "temperature": 3.4,
    "feelsLike": 1.2,
    "humidity": 78,
    "windSpeed": 12.3,
    "code": 61,
    "description": "Небольшой дождь",
    "icon": "🌦️"
  },
  "forecast": [
    { "date": "2026-11-25", "description": "Небольшой дождь", "icon": "🌦️", "max": 4, "min": -1 }
  ],
  "units": { "temperature": "°C", "windSpeed": "km/h" },
  "fetchedAt": "2026-11-25T12:00:00.000Z",
  "cached": false
}
```

Ошибки возвращаются в формате `{"error": "..."}` с подходящим HTTP-кодом:
400 — не указан город, 404 — город не найден, 502 — внешний сервис недоступен.

Кэш in-memory, один ответ на город хранится `CACHE_TTL_MS` миллисекунд; конкурентные запросы
к одному городу объединяются в один запрос к API.

## Тесты

```bash
npm test
```

Тесты проверяют нормализацию ввода, сопоставление кодов погоды, форму ответа, кэш и обработку
ошибок — без обращения к сети.

## Возможные проблемы

- Если погода не загружается, проверьте доступ к `open-meteo.com` и ответ `/api/health`.
- Порт 8080 занят — задайте другой `APP_PORT`.
- Контейнер собирается из `node:20-alpine` и запускается от непривилегированного пользователя.
