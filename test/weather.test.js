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
      name: 'Москва',
      country: 'Россия',
      admin1: 'Москва',
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

test('normalizeCity очищает ввод и отклоняет пустые значения', () => {
  assert.equal(normalizeCity('  Москва   Центр '), 'Москва Центр');
  assert.equal(normalizeCity('   '), '');
  assert.equal(normalizeCity(undefined), '');
});

test('weatherInfo сопоставляет код WMO с описанием и иконкой', () => {
  assert.deepEqual(weatherInfo(0, true), { description: 'Ясно', icon: '☀️' });
  assert.deepEqual(weatherInfo(0, false), { description: 'Ясно', icon: '🌙' });
  assert.equal(weatherInfo(9999).description, 'Неизвестные условия');
});

test('getWeather возвращает нормализованные данные и запрашивает оба эндпоинта', async () => {
  const { fetchImpl, calls } = fakeFetch();
  const service = createWeatherService({ fetchImpl, now: () => Date.parse('2026-11-25T12:00:00Z') });

  const result = await service.getWeather('Москва');

  assert.equal(calls.length, 2);
  assert.match(calls[0], /geocoding-api\.open-meteo\.com/);
  assert.match(calls[0], /name=%D0%9C%D0%BE%D1%81%D0%BA%D0%B2%D0%B0/);
  assert.match(calls[1], /api\.open-meteo\.com\/v1\/forecast/);
  assert.match(calls[1], /latitude=55\.75/);
  assert.equal(result.city.name, 'Москва');
  assert.equal(result.current.description, 'Небольшой дождь');
  assert.equal(result.current.temperature, 3.4);
  assert.equal(result.forecast.length, 5);
  assert.equal(result.forecast[0].min, -1);
  assert.equal(result.units.temperature, '°C');
  assert.equal(result.cached, false);
});

test('повторный запрос берётся из кэша и не дёргает API', async () => {
  const { fetchImpl, calls } = fakeFetch();
  const service = createWeatherService({ fetchImpl, ttlMs: 60_000 });

  await service.getWeather('Москва');
  const second = await service.getWeather('москва');

  assert.equal(calls.length, 2);
  assert.equal(second.cached, true);
  assert.equal(second.current.temperature, 3.4);
});

test('режим forecast возвращает только город и прогноз', async () => {
  const { fetchImpl } = fakeFetch();
  const service = createWeatherService({ fetchImpl });

  const result = await service.getWeather('Москва', { mode: 'forecast' });

  assert.equal(result.current, undefined);
  assert.equal(result.forecast.length, 5);
  assert.equal(result.city.country, 'Россия');
});

test('неизвестный город даёт ошибку 404', async () => {
  const { fetchImpl } = fakeFetch({ geo: { results: [] } });
  const service = createWeatherService({ fetchImpl });

  await assert.rejects(
    () => service.getWeather('Неexistус'),
    (error) => error instanceof WeatherError && error.status === 404,
  );
});

test('ошибка вышестоящего API превращается в 502', async () => {
  const { fetchImpl } = fakeFetch({ forecastStatus: 503 });
  const service = createWeatherService({ fetchImpl });

  await assert.rejects(
    () => service.getWeather('Москва'),
    (error) => error instanceof WeatherError && error.status === 502,
  );
});
