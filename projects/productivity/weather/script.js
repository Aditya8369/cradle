import {
  DEFAULT_LOCATION,
  PRESET_LOCATIONS,
  handleGeolocationError,
  parseWeatherData,
  formatTemperature,
  findPresetLocation,
} from "./weatherEngine.js";

/**
 * Weather App State
 */
const state = {
  currentUnit: "C", // 'C' | 'F'
  currentData: null,
  activeLocation: DEFAULT_LOCATION,
  isLoading: false,
};

// DOM Elements
const searchForm = document.getElementById("search-form");
const cityInput = document.getElementById("city-search-input");
const btnLocation = document.getElementById("btn-location");
const btnUnitToggle = document.getElementById("btn-unit-toggle");
const statusBanner = document.getElementById("status-banner");
const locationNameEl = document.getElementById("location-name");
const weatherConditionEl = document.getElementById("weather-condition");
const weatherIconEl = document.getElementById("weather-icon");
const temperatureEl = document.getElementById("temperature");
const humidityEl = document.getElementById("humidity");
const windSpeedEl = document.getElementById("wind-speed");
const pressureEl = document.getElementById("pressure");
const forecastGridEl = document.getElementById("forecast-grid");

/**
 * Displays a status notification banner.
 */
function showStatus(message, type = "info") {
  if (!statusBanner) return;
  statusBanner.textContent = message;
  statusBanner.className = `status-banner visible status-${type}`;
}

/**
 * Clears the status banner.
 */
function clearStatus() {
  if (!statusBanner) return;
  statusBanner.textContent = "";
  statusBanner.className = "status-banner";
}

/**
 * Fetches weather data for latitude/longitude, falling back to offline presets or mock data.
 * When statusNotice is supplied (e.g. on geolocation denial), it remains displayed after fetch.
 */
async function fetchWeather(lat, lon, locationName, statusNotice = null) {
  state.isLoading = true;
  if (!statusNotice) {
    showStatus(`Fetching weather for ${locationName}...`, "info");
  } else {
    showStatus(statusNotice, "warning");
  }

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,surface_pressure&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`Weather service returned ${res.status}`);
    }

    const data = await res.json();
    const parsed = parseWeatherData(data, locationName);
    state.currentData = parsed;
    renderWeather(parsed);

    if (statusNotice) {
      showStatus(statusNotice, "warning");
    } else {
      clearStatus();
    }
  } catch (err) {
    console.warn(
      "Live weather fetch failed, utilizing preset offline data:",
      err.message
    );
    const preset = findPresetLocation(locationName) || PRESET_LOCATIONS.london;
    const fallbackParsed = parseWeatherData(preset.mockWeather, preset.name);
    state.currentData = fallbackParsed;
    renderWeather(fallbackParsed);
    if (statusNotice) {
      showStatus(statusNotice, "warning");
    } else {
      showStatus(
        `Network request unavailable. Displaying cached weather for ${preset.name}.`,
        "warning"
      );
    }
  } finally {
    state.isLoading = false;
  }
}

/**
 * Renders the parsed weather data to the DOM.
 */
function renderWeather(data) {
  if (!data) return;

  locationNameEl.textContent = data.locationName;
  weatherConditionEl.textContent = data.condition;
  weatherIconEl.textContent = data.icon;
  temperatureEl.textContent = formatTemperature(
    data.temperatureC,
    state.currentUnit
  );
  humidityEl.textContent = `${data.humidity}%`;
  windSpeedEl.textContent = `${data.windSpeed} km/h`;
  pressureEl.textContent = `${data.pressure} hPa`;

  // Render 5-Day Forecast
  forecastGridEl.innerHTML = "";
  if (Array.isArray(data.forecast) && data.forecast.length > 0) {
    data.forecast.forEach(item => {
      const card = document.createElement("div");
      card.className = "forecast-day";
      card.innerHTML = `
        <span class="forecast-day-name">${item.day}</span>
        <span class="forecast-icon" aria-hidden="true">${item.icon}</span>
        <div class="forecast-temps">
          <span class="forecast-max">${formatTemperature(item.maxC, state.currentUnit)}</span>
          <span class="forecast-min">${formatTemperature(item.minC, state.currentUnit)}</span>
        </div>
        <span class="forecast-cond">${item.condition}</span>
      `;
      forecastGridEl.appendChild(card);
    });
  }
}

/**
 * Handles city search via geocoding API or offline preset matching.
 */
async function searchCity(query) {
  const q = String(query || "").trim();
  if (!q) return;

  const preset = findPresetLocation(q);
  if (preset) {
    state.activeLocation = preset;
    await fetchWeather(preset.latitude, preset.longitude, preset.name);
    return;
  }

  showStatus(`Searching for "${q}"...`, "info");
  try {
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(geoUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) throw new Error("Geocoding failed");
    const data = await res.json();

    if (data && data.results && data.results.length > 0) {
      const result = data.results[0];
      const loc = {
        name: `${result.name}${result.country ? `, ${result.country}` : ""}`,
        latitude: result.latitude,
        longitude: result.longitude,
      };
      state.activeLocation = loc;
      await fetchWeather(loc.latitude, loc.longitude, loc.name);
    } else {
      showStatus(
        `Location "${q}" not found. Showing weather for London (default location).`,
        "warning"
      );
      cityInput.focus();
    }
  } catch (err) {
    console.warn(
      "Geocoding failed, falling back to preset search:",
      err.message
    );
    const fallbackPreset = PRESET_LOCATIONS.london;
    state.activeLocation = fallbackPreset;
    await fetchWeather(
      fallbackPreset.latitude,
      fallbackPreset.longitude,
      fallbackPreset.name
    );
    showStatus(
      `Search unavailable offline. Showing weather for London (default location).`,
      "warning"
    );
  }
}

/**
 * Requests browser geolocation with explicit denial and error callbacks.
 */
export function requestGeolocation() {
  if (
    !navigator.geolocation ||
    typeof navigator.geolocation.getCurrentPosition !== "function"
  ) {
    showStatus(
      "Geolocation is not supported by your browser. Showing weather for London (default location).",
      "warning"
    );
    fetchWeather(
      DEFAULT_LOCATION.latitude,
      DEFAULT_LOCATION.longitude,
      DEFAULT_LOCATION.name
    );
    return;
  }

  showStatus("Requesting location access...", "info");

  navigator.geolocation.getCurrentPosition(
    // Success callback
    position => {
      clearStatus();
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;
      state.activeLocation = {
        name: "Your Location",
        latitude: lat,
        longitude: lon,
      };
      fetchWeather(lat, lon, "Your Location");
    },
    // Error callback: Handles denial, timeout, or position unavailable
    error => {
      const errInfo = handleGeolocationError(error);
      // 1. Show clear denial message
      showStatus(errInfo.message, "warning");

      // 2. Offer manual city search as fallback (focus input)
      if (cityInput) {
        cityInput.focus();
      }

      // 3. Load weather for London (default location) with notice so the page is never blank
      state.activeLocation = errInfo.fallbackLocation;
      fetchWeather(
        errInfo.fallbackLocation.latitude,
        errInfo.fallbackLocation.longitude,
        errInfo.fallbackLocation.name,
        errInfo.message
      );
    },
    { timeout: 8000, maximumAge: 300000 }
  );
}

// Event Listeners
searchForm?.addEventListener("submit", e => {
  e.preventDefault();
  searchCity(cityInput.value);
});

btnLocation?.addEventListener("click", () => {
  requestGeolocation();
});

btnUnitToggle?.addEventListener("click", () => {
  state.currentUnit = state.currentUnit === "C" ? "F" : "C";
  if (state.currentData) {
    renderWeather(state.currentData);
  }
});

// Quick city chips
document.querySelectorAll(".chip")?.forEach(chip => {
  chip.addEventListener("click", () => {
    const city = chip.getAttribute("data-city");
    if (cityInput) cityInput.value = city;
    searchCity(city);
  });
});

// Lifecycle setup
document.addEventListener("DOMContentLoaded", () => {
  // Try to load initial location or default
  requestGeolocation();
});
