'use strict';

const elements = {
  form: document.getElementById('search-form'),
  input: document.getElementById('city'),
  button: document.getElementById('search-button'),
  error: document.getElementById('error'),
  loading: document.getElementById('loading'),
  empty: document.getElementById('empty'),
  weather: document.getElementById('weather'),
  icon: document.getElementById('current-icon'),
  temp: document.getElementById('current-temp'),
  desc: document.getElementById('current-desc'),
  city: document.getElementById('city-name'),
  country: document.getElementById('city-country'),
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

const weekday = new Intl.DateTimeFormat('ru-RU', { weekday: 'short' });
const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });
const timeFormat = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });

function celsiusToDisplay(value) {
  if (value === null || value === undefined) return '—';
  const converted = state.unit === 'F' ? value * 1.8 + 32 : value;
  return `${Math.round(converted)}°`;
}

function windToDisplay(value) {
  if (value === null || value === undefined) return '—';
  const converted = state.unit === 'F' ? value * 0.621371 : value;
  return `${Math.round(converted)} ${state.unit === 'F' ? 'mph' : 'км/ч'}`;
}

function showError(message) {
  elements.error.textContent = message;
  elements.error.hidden = false;
}

function clearError() {
  elements.error.textContent = '';
  elements.error.hidden = true;
}

function setLoading(isLoading) {
  elements.loading.hidden = !isLoading;
  elements.button.disabled = isLoading;
  elements.button.textContent = isLoading ? 'Ищем…' : 'Найти';
}

function render(data) {
  const { city, current, forecast } = data;

  elements.icon.textContent = current.icon || '🌡️';
  elements.temp.textContent = celsiusToDisplay(current.temperature);
  elements.desc.textContent = current.description || '—';
  elements.city.textContent = city.name;
  elements.country.textContent = [city.region, city.country].filter(Boolean).join(', ') || '—';
  elements.feelsLike.textContent = celsiusToDisplay(current.feelsLike);
  elements.humidity.textContent = current.humidity === null ? '—' : `${current.humidity}%`;
  elements.wind.textContent = windToDisplay(current.windSpeed);

  if (data.fetchedAt && !Number.isNaN(Date.parse(data.fetchedAt))) {
    elements.updated.textContent = `Обновлено в ${timeFormat.format(new Date(data.fetchedAt))}`;
  } else {
    elements.updated.textContent = '';
  }

  elements.forecast.replaceChildren();
  for (const day of forecast) {
    const parsed = new Date(`${day.date}T12:00:00`);
    const card = document.createElement('div');
    card.className = 'day-card';

    const name = document.createElement('span');
    name.className = 'day-name';
    name.textContent = Number.isNaN(parsed.getTime())
      ? day.date
      : weekday.format(parsed);

    const date = document.createElement('span');
    date.className = 'day-date';
    date.textContent = Number.isNaN(parsed.getTime()) ? '' : dateFormat.format(parsed);

    const icon = document.createElement('span');
    icon.className = 'day-icon';
    icon.textContent = day.icon || '🌡️';
    icon.setAttribute('aria-hidden', 'true');

    const temps = document.createElement('span');
    temps.className = 'day-temps';
    temps.textContent = `${celsiusToDisplay(day.max)} / ${celsiusToDisplay(day.min)}`;

    card.append(name, date, icon, temps);
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
      throw new Error(payload.error || 'Не удалось получить данные о погоде');
    }
    state.data = payload;
    render(payload);
    localStorage.setItem('weather-city', query);
  } catch (error) {
    if (error.name !== 'AbortError') {
      elements.weather.hidden = true;
      elements.empty.hidden = false;
      showError(error.message || 'Не удалось получить данные о погоде');
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

const lastCity = localStorage.getItem('weather-city');
if (lastCity) {
  elements.input.value = lastCity;
  search(lastCity);
}
