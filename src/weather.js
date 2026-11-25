'use strict';

const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const DEFAULT_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 200;
const UPSTREAM_TIMEOUT_MS = 8000;

class WeatherError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'WeatherError';
    this.status = status;
  }
}

// WMO weather interpretation codes used by Open-Meteo.
const WEATHER_CODES = new Map([
  [0, { label: 'Ясно', icon: '☀️', nightIcon: '🌙' }],
  [1, { label: 'Преимущественно ясно', icon: '🌤️', nightIcon: '🌙' }],
  [2, { label: 'Переменная облачность', icon: '⛅', nightIcon: '☁️' }],
  [3, { label: 'Пасмурно', icon: '☁️' }],
  [45, { label: 'Туман', icon: '🌫️' }],
  [48, { label: 'Изморозь', icon: '🌫️' }],
  [51, { label: 'Лёгкая морось', icon: '🌦️' }],
  [53, { label: 'Морось', icon: '🌦️' }],
  [55, { label: 'Сильная морось', icon: '🌧️' }],
  [56, { label: 'Лёгкая ледяная морось', icon: '🌧️' }],
  [57, { label: 'Сильная ледяная морось', icon: '🌧️' }],
  [61, { label: 'Небольшой дождь', icon: '🌦️' }],
  [63, { label: 'Дождь', icon: '🌧️' }],
  [65, { label: 'Сильный дождь', icon: '🌧️' }],
  [66, { label: 'Ледяной дождь', icon: '🌧️' }],
  [67, { label: 'Сильный ледяной дождь', icon: '🌧️' }],
  [71, { label: 'Небольшой снег', icon: '🌨️' }],
  [73, { label: 'Снег', icon: '❄️' }],
  [75, { label: 'Сильный снег', icon: '❄️' }],
  [77, { label: 'Снежные зёрна', icon: '🌨️' }],
  [80, { label: 'Небольшой ливень', icon: '🌦️' }],
  [81, { label: 'Ливень', icon: '🌧️' }],
  [82, { label: 'Сильный ливень', icon: '🌧️' }],
  [85, { label: 'Небольшой снегопад', icon: '🌨️' }],
  [86, { label: 'Сильный снегопад', icon: '❄️' }],
  [95, { label: 'Гроза', icon: '⛈️' }],
  [96, { label: 'Гроза с градом', icon: '⛈️' }],
  [99, { label: 'Сильная гроза с градом', icon: '⛈️' }],
]);

function normalizeCity(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').slice(0, 100);
}

function weatherInfo(code, isDay = true) {
  const info = WEATHER_CODES.get(Number(code)) || { label: 'Неизвестные условия', icon: '🌡️' };
  return {
    description: info.label,
    icon: isDay ? info.icon : (info.nightIcon || info.icon),
  };
}

function pick(result, mode) {
  const { cached, ...data } = result;
  if (mode === 'forecast') {
    return {
      city: data.city,
      forecast: data.forecast,
      units: data.units,
      cached,
    };
  }
  return { ...data, cached };
}

function createWeatherService({
  fetchImpl = globalThis.fetch,
  ttlMs = DEFAULT_TTL_MS,
  now = () => Date.now(),
} = {}) {
  const cache = new Map();
  const inFlight = new Map();

  async function requestJson(url, purpose) {
    let response;
    try {
      response = await fetchImpl(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
    } catch {
      throw new WeatherError(`Не удалось получить ${purpose}: сервис погоды недоступен`, 502);
    }

    if (!response.ok) {
      throw new WeatherError(`Сервис погоды вернул ошибку при запросе ${purpose}`, 502);
    }

    try {
      return await response.json();
    } catch {
      throw new WeatherError(`Сервис погоды вернул некорректный ответ для ${purpose}`, 502);
    }
  }

  async function geocode(city) {
    const params = new URLSearchParams({
      name: city,
      count: '1',
      language: 'ru',
      format: 'json',
    });
    const data = await requestJson(`${GEOCODING_URL}?${params}`, 'список городов');
    const match = data && Array.isArray(data.results) ? data.results[0] : null;
    if (!match || !Number.isFinite(match.latitude) || !Number.isFinite(match.longitude)) {
      throw new WeatherError(`Город «${city}» не найден`, 404);
    }
    return match;
  }

  function buildResponse(match, data) {
    const current = data.current || {};
    const daily = data.daily || {};
    const currentInfo = weatherInfo(current.weather_code, current.is_day !== 0);

    return {
      city: {
        name: match.name || '',
        country: match.country || '',
        region: match.admin1 || '',
        latitude: match.latitude,
        longitude: match.longitude,
      },
      current: {
        time: current.time || null,
        temperature: current.temperature_2m ?? null,
        feelsLike: current.apparent_temperature ?? null,
        humidity: current.relative_humidity_2m ?? null,
        windSpeed: current.wind_speed_10m ?? null,
        code: current.weather_code ?? null,
        description: currentInfo.description,
        icon: currentInfo.icon,
      },
      forecast: (Array.isArray(daily.time) ? daily.time : []).map((date, index) => {
        const info = weatherInfo(daily.weather_code?.[index], true);
        return {
          date,
          description: info.description,
          icon: info.icon,
          max: daily.temperature_2m_max?.[index] ?? null,
          min: daily.temperature_2m_min?.[index] ?? null,
        };
      }),
      units: {
        temperature: '°C',
        windSpeed: 'km/h',
      },
      fetchedAt: new Date(now()).toISOString(),
    };
  }

  async function load(city) {
    const match = await geocode(city);
    const params = new URLSearchParams({
      latitude: String(match.latitude),
      longitude: String(match.longitude),
      current: [
        'temperature_2m',
        'relative_humidity_2m',
        'apparent_temperature',
        'weather_code',
        'wind_speed_10m',
        'is_day',
      ].join(','),
      daily: 'weather_code,temperature_2m_max,temperature_2m_min',
      timezone: 'auto',
      forecast_days: '5',
    });
    const data = await requestJson(`${FORECAST_URL}?${params}`, 'прогноз');
    return buildResponse(match, data);
  }

  function setCache(key, value) {
    if (cache.size >= MAX_CACHE_ENTRIES) {
      const oldest = cache.keys().next().value;
      cache.delete(oldest);
    }
    cache.set(key, { value, expires: now() + ttlMs });
  }

  async function getWeather(query, { mode = 'full' } = {}) {
    const city = normalizeCity(query);
    if (!city) {
      throw new WeatherError('Укажите название города, например: Москва', 400);
    }

    const key = city.toLocaleLowerCase('ru');
    const cached = cache.get(key);
    if (cached && cached.expires > now()) {
      return pick({ ...cached.value, cached: true }, mode);
    }
    if (cached) cache.delete(key);

    if (inFlight.has(key)) {
      return pick({ ...(await inFlight.get(key)), cached: false }, mode);
    }

    const pending = load(city)
      .then((value) => {
        setCache(key, value);
        return value;
      })
      .finally(() => inFlight.delete(key));

    inFlight.set(key, pending);
    return pick({ ...(await pending), cached: false }, mode);
  }

  function clearCache() {
    cache.clear();
  }

  return { getWeather, clearCache, cache };
}

module.exports = {
  createWeatherService,
  normalizeCity,
  weatherInfo,
  WeatherError,
};
