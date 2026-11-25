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
// `icon` is a semantic key; the client renders it as a monochrome SVG glyph.
const WEATHER_CODES = new Map([
  [0, { label: 'Clear', icon: 'clear', nightIcon: 'clear-night' }],
  [1, { label: 'Mostly clear', icon: 'mostly-clear', nightIcon: 'clear-night' }],
  [2, { label: 'Partly cloudy', icon: 'partly-cloudy', nightIcon: 'partly-cloudy-night' }],
  [3, { label: 'Overcast', icon: 'cloudy' }],
  [45, { label: 'Fog', icon: 'fog' }],
  [48, { label: 'Rime fog', icon: 'fog' }],
  [51, { label: 'Light drizzle', icon: 'drizzle' }],
  [53, { label: 'Drizzle', icon: 'drizzle' }],
  [55, { label: 'Heavy drizzle', icon: 'drizzle' }],
  [56, { label: 'Light freezing drizzle', icon: 'drizzle' }],
  [57, { label: 'Heavy freezing drizzle', icon: 'drizzle' }],
  [61, { label: 'Light rain', icon: 'rain' }],
  [63, { label: 'Rain', icon: 'rain' }],
  [65, { label: 'Heavy rain', icon: 'rain' }],
  [66, { label: 'Freezing rain', icon: 'rain' }],
  [67, { label: 'Heavy freezing rain', icon: 'rain' }],
  [71, { label: 'Light snow', icon: 'snow' }],
  [73, { label: 'Snow', icon: 'snow' }],
  [75, { label: 'Heavy snow', icon: 'snow' }],
  [77, { label: 'Snow grains', icon: 'snow' }],
  [80, { label: 'Light showers', icon: 'rain' }],
  [81, { label: 'Showers', icon: 'rain' }],
  [82, { label: 'Heavy showers', icon: 'rain' }],
  [85, { label: 'Light snow showers', icon: 'snow' }],
  [86, { label: 'Heavy snow showers', icon: 'snow' }],
  [95, { label: 'Thunderstorm', icon: 'thunder' }],
  [96, { label: 'Thunderstorm with hail', icon: 'thunder' }],
  [99, { label: 'Severe thunderstorm with hail', icon: 'thunder' }],
]);

function normalizeCity(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').slice(0, 100);
}

function weatherInfo(code, isDay = true) {
  const info = WEATHER_CODES.get(Number(code)) || { label: 'Unknown conditions', icon: 'unknown' };
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
      throw new WeatherError(`Could not retrieve ${purpose}: weather service unavailable`, 502);
    }

    if (!response.ok) {
      throw new WeatherError(`Weather service returned an error while fetching ${purpose}`, 502);
    }

    try {
      return await response.json();
    } catch {
      throw new WeatherError(`Weather service returned an invalid response for ${purpose}`, 502);
    }
  }

  async function geocode(city) {
    const params = new URLSearchParams({
      name: city,
      count: '1',
      language: 'en',
      format: 'json',
    });
    const data = await requestJson(`${GEOCODING_URL}?${params}`, 'cities');
    const match = data && Array.isArray(data.results) ? data.results[0] : null;
    if (!match || !Number.isFinite(match.latitude) || !Number.isFinite(match.longitude)) {
      throw new WeatherError(`City "${city}" not found`, 404);
    }
    return match;
  }

  function buildResponse(match, data) {
    const current = data.current || {};
    const daily = data.daily || {};
    const isDay = current.is_day !== 0;
    const currentInfo = weatherInfo(current.weather_code, isDay);

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
        isDay,
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
    const data = await requestJson(`${FORECAST_URL}?${params}`, 'the forecast');
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
      throw new WeatherError('Enter a city name, for example: London', 400);
    }

    const key = city.toLocaleLowerCase('en');
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
