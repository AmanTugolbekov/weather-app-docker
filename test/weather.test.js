'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createWeatherService,
  normalizeCity,
  weatherInfo,
  WeatherError,
} = require('../src/weather');

const geoResponse = {
  results: [
    {
      name: 'Moscow',
      country: 'Russia',
      admin1: 'Moscow',
      latitude: 55.75,
      longitude: 37.62,
    },
  ],
};

const forecastResponse = {
  current: {
    time: '2026-11-25T12:00',
    temperature_2m: 3.4,
    apparent_temperature: 1.2,
    relative_humidity_2m: 78,
    weather_code: 61,
    wind_speed_10m: 12.3,
    is_day: 1,
  },
  daily: {
    time: ['2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29'],
    weather_code: [61, 2, 0, 3, 71],
    temperature_2m_max: [4, 6, 7, 5, 1],
    temperature_2m_min: [-1, 0, 2, 1, -3],
  },
};

function fakeFetch({ geo = geoResponse, forecast = forecastResponse, forecastStatus = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url).includes('geocoding-api')) {
      return { ok: true, json: async () => geo };
    }
    return { ok: forecastStatus < 400, status: forecastStatus, json: async () => forecast };
  };
  return { fetchImpl, calls };
}

test('normalizeCity trims input and rejects empty values', () => {
  assert.equal(normalizeCity('  London   Centre '), 'London Centre');
  assert.equal(normalizeCity('   '), '');
  assert.equal(normalizeCity(undefined), '');
});

test('weatherInfo maps WMO codes to English labels and semantic icon keys', () => {
  assert.deepEqual(weatherInfo(0, true), { description: 'Clear', icon: 'clear' });
  assert.deepEqual(weatherInfo(0, false), { description: 'Clear', icon: 'clear-night' });
  assert.equal(weatherInfo(9999).description, 'Unknown conditions');
  assert.equal(weatherInfo(95).icon, 'thunder');
});

test('getWeather returns normalized data and requests both endpoints', async () => {
  const { fetchImpl, calls } = fakeFetch();
  const service = createWeatherService({ fetchImpl, now: () => Date.parse('2026-11-25T12:00:00Z') });

  const result = await service.getWeather('Moscow');

  assert.equal(calls.length, 2);
  assert.match(calls[0], /geocoding-api\.open-meteo\.com/);
  assert.match(calls[0], /name=Moscow/);
  assert.match(calls[0], /language=en/);
  assert.match(calls[1], /api\.open-meteo\.com\/v1\/forecast/);
  assert.match(calls[1], /latitude=55\.75/);
  assert.equal(result.city.name, 'Moscow');
  assert.equal(result.city.country, 'Russia');
  assert.equal(result.current.description, 'Light rain');
  assert.equal(result.current.icon, 'rain');
  assert.equal(result.current.isDay, true);
  assert.equal(result.current.temperature, 3.4);
  assert.equal(result.forecast.length, 5);
  assert.equal(result.forecast[0].min, -1);
  assert.equal(result.units.temperature, '°C');
  assert.equal(result.cached, false);
});

test('a repeated request is served from cache without calling the API again', async () => {
  const { fetchImpl, calls } = fakeFetch();
  const service = createWeatherService({ fetchImpl, ttlMs: 60_000 });

  await service.getWeather('Moscow');
  const second = await service.getWeather('moscow');

  assert.equal(calls.length, 2);
  assert.equal(second.cached, true);
  assert.equal(second.current.temperature, 3.4);
});

test('forecast mode returns only the city and the five-day outlook', async () => {
  const { fetchImpl } = fakeFetch();
  const service = createWeatherService({ fetchImpl });

  const result = await service.getWeather('Moscow', { mode: 'forecast' });

  assert.equal(result.current, undefined);
  assert.equal(result.forecast.length, 5);
  assert.equal(result.city.country, 'Russia');
});

test('an unknown city produces a 404 error', async () => {
  const { fetchImpl } = fakeFetch({ geo: { results: [] } });
  const service = createWeatherService({ fetchImpl });

  await assert.rejects(
    () => service.getWeather('Zzzqwe123nowhere'),
    (error) => error instanceof WeatherError && error.status === 404,
  );
});

test('an upstream failure becomes a 502 error', async () => {
  const { fetchImpl } = fakeFetch({ forecastStatus: 503 });
  const service = createWeatherService({ fetchImpl });

  await assert.rejects(
    () => service.getWeather('Moscow'),
    (error) => error instanceof WeatherError && error.status === 502,
  );
});
