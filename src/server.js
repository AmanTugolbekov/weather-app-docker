'use strict';

const path = require('node:path');
const express = require('express');
const { createWeatherService } = require('./weather');

const app = express();
const port = Number(process.env.PORT) || 3000;
const weather = createWeatherService({
  ttlMs: Number(process.env.CACHE_TTL_MS) || 10 * 60 * 1000,
});

app.disable('x-powered-by');
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', uptime: Math.round(process.uptime()) });
});

async function handleWeather(req, res, next, mode) {
  try {
    res.json(await weather.getWeather(req.query.city, { mode }));
  } catch (error) {
    next(error);
  }
}

app.get('/api/weather', (req, res, next) => handleWeather(req, res, next, 'full'));
app.get('/api/forecast', (req, res, next) => handleWeather(req, res, next, 'forecast'));

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

app.use((error, _req, res, _next) => {
  const status = Number.isInteger(error.status) ? error.status : 500;
  if (status >= 500) console.error('[error]', error);
  res.status(status).json({
    error: status === 500 ? 'Internal server error' : error.message,
  });
});

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`Weather app listening on http://0.0.0.0:${port}`);
});

function shutdown(signal) {
  console.log(`Received ${signal}, shutting down...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
