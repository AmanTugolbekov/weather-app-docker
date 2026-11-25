'use strict';

const elements = {
  form: document.getElementById('search-form'),
  input: document.getElementById('city'),
  button: document.getElementById('search-button'),
  error: document.getElementById('error'),
  errorText: document.getElementById('error-text'),
  loading: document.getElementById('loading'),
  empty: document.getElementById('empty'),
  weather: document.getElementById('weather'),
  icon: document.getElementById('current-icon'),
  temp: document.getElementById('current-temp'),
  desc: document.getElementById('current-desc'),
  city: document.getElementById('city-name'),
  region: document.getElementById('city-region'),
  feelsLike: document.getElementById('feels-like'),
  humidity: document.getElementById('humidity'),
  wind: document.getElementById('wind'),
  updated: document.getElementById('updated'),
  forecast: document.getElementById('forecast-list'),
};

const state = {
  unit: localStorage.getItem('weather-unit') === 'F' ? 'F' : 'C',
  data: null,
  controller: null,
};

const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short' });
const dateFormat = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short' });
const timeFormat = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });

const CLOUD = 'M19 43h26a9 9 0 0 0 0-18 13 13 0 0 0-25-3 8 8 0 0 0-1 21Z';
const SMALL_CLOUD = 'M20 46h25a8 8 0 0 0 0-16 12 12 0 0 0-23-3 8 8 0 0 0-2 19Z';

const glyphs = {
  clear: `
    <circle cx="32" cy="32" r="11" />
    <path d="M32 8v6M32 50v6M8 32h6M50 32h6M15 15l4 4M45 45l4 4M49 15l-4 4M19 45l-4 4" />`,
  'clear-night': `
    <path d="M41 11a21 21 0 1 0 12 38A23 23 0 0 1 41 11Z" />
    <path d="M14 15v6M11 18h6" />`,
  'partly-cloudy': `
    <circle cx="22" cy="20" r="7" />
    <path d="M22 5v4M22 31v4M7 20h4M33 20h4M11 9l3 3M30 28l3 3M33 9l-3 3M14 28l-3 3" />
    <path d="${SMALL_CLOUD}" />`,
  'partly-cloudy-night': `
    <path d="M28 8a14 14 0 1 0 8 25A16 16 0 0 1 28 8Z" />
    <path d="${SMALL_CLOUD}" />`,
  cloudy: `<path d="${CLOUD}" />`,
  fog: `
    <path d="${CLOUD}" />
    <path d="M16 50h32M21 56h22" />`,
  drizzle: `
    <path d="${CLOUD}" />
    <path d="M23 49v4M32 49v4M41 49v4" />`,
  rain: `
    <path d="${CLOUD}" />
    <path d="M24 48l-3 8M34 48l-3 8M44 48l-3 8" />`,
  snow: `
    <path d="${CLOUD}" />
    <path d="M23 49v7M19.5 52.5h7M20.7 50.2l4.6 4.6M25.3 50.2l-4.6 4.6" />
    <path d="M42 49v7M38.5 52.5h7M39.7 50.2l4.6 4.6M44.3 50.2l-4.6 4.6" />`,
  thunder: `
    <path d="${CLOUD}" />
    <path d="M36 46l-8 11h6l-3 8 12-13h-6l5-6Z" />`,
  unknown: `
    <circle cx="32" cy="32" r="20" />
    <path d="M24 32h16" />`,
};

function iconSvg(key) {
  const glyph = glyphs[key] || glyphs.unknown;
  return `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${glyph}</svg>`;
}

function temperature(value) {
  if (value === null || value === undefined) return '—';
  const converted = state.unit === 'F' ? value * 1.8 + 32 : value;
  return `${Math.round(converted)}°`;
}

function windSpeed(value) {
  if (value === null || value === undefined) return '—';
  const converted = state.unit === 'F' ? value * 0.621371 : value;
  return `${Math.round(converted)} ${state.unit === 'F' ? 'mph' : 'km/h'}`;
}

function showError(message) {
  elements.errorText.textContent = message;
  elements.error.hidden = false;
}

function clearError() {
  elements.errorText.textContent = '';
  elements.error.hidden = true;
}

function setLoading(isLoading) {
  elements.loading.hidden = !isLoading;
  elements.button.disabled = isLoading;
  elements.button.textContent = isLoading ? 'Searching…' : 'Search';
}

function render(data) {
  const { city, current, forecast } = data;

  elements.icon.innerHTML = iconSvg(current.icon);
  elements.temp.textContent = temperature(current.temperature);
  elements.desc.textContent = current.description || '—';
  elements.city.textContent = city.name;
  elements.region.textContent = [city.region, city.country].filter(Boolean).join(', ') || '—';
  elements.feelsLike.textContent = temperature(current.feelsLike);
  elements.humidity.textContent = current.humidity === null ? '—' : `${current.humidity}%`;
  elements.wind.textContent = windSpeed(current.windSpeed);

  if (data.fetchedAt && !Number.isNaN(Date.parse(data.fetchedAt))) {
    elements.updated.textContent = `Updated ${timeFormat.format(new Date(data.fetchedAt))}`;
  } else {
    elements.updated.textContent = '';
  }

  elements.forecast.replaceChildren();
  for (const day of forecast) {
    const parsed = new Date(`${day.date}T12:00:00`);
    const card = document.createElement('div');
    card.className = 'day';

    const icon = document.createElement('span');
    icon.innerHTML = iconSvg(day.icon);

    const name = document.createElement('span');
    name.className = 'day-name';
    name.textContent = Number.isNaN(parsed.getTime()) ? day.date : weekday.format(parsed);

    const date = document.createElement('span');
    date.className = 'day-date';
    date.textContent = Number.isNaN(parsed.getTime()) ? '' : dateFormat.format(parsed);

    const temps = document.createElement('span');
    temps.className = 'day-temps';
    temps.textContent = `${temperature(day.max)} / ${temperature(day.min)}`;

    card.append(icon, name, date, temps);
    elements.forecast.append(card);
  }

  elements.empty.hidden = true;
  elements.weather.hidden = false;
}

async function search(city) {
  const query = city.trim();
  if (!query) return;

  if (state.controller) state.controller.abort();
  const controller = new AbortController();
  state.controller = controller;

  clearError();
  setLoading(true);

  try {
    const response = await fetch(`/api/weather?city=${encodeURIComponent(query)}`, {
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || 'Could not load the weather for this city.');
    }
    state.data = payload;
    render(payload);
    localStorage.setItem('weather-city', query);
  } catch (error) {
    if (error.name !== 'AbortError') {
      elements.weather.hidden = true;
      elements.empty.hidden = false;
      showError(error.message || 'Could not load the weather for this city.');
    }
  } finally {
    if (state.controller === controller) {
      state.controller = null;
      setLoading(false);
    }
  }
}

function setUnit(unit) {
  state.unit = unit;
  localStorage.setItem('weather-unit', unit);
  document.querySelectorAll('[data-unit]').forEach((button) => {
    const active = button.dataset.unit === unit;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  if (state.data) render(state.data);
}

elements.form.addEventListener('submit', (event) => {
  event.preventDefault();
  search(elements.input.value);
});

document.querySelectorAll('[data-city]').forEach((button) => {
  button.addEventListener('click', () => {
    elements.input.value = button.dataset.city;
    search(button.dataset.city);
  });
});

document.querySelectorAll('[data-unit]').forEach((button) => {
  button.addEventListener('click', () => setUnit(button.dataset.unit));
});

setUnit(state.unit);

// Cities saved by the previous Russian-language version are not valid
// English geocoding queries, so ignore them instead of showing a false error.
const lastCity = localStorage.getItem('weather-city');
if (lastCity && !/[\u0400-\u04FF]/.test(lastCity)) {
  elements.input.value = lastCity;
  search(lastCity);
}
