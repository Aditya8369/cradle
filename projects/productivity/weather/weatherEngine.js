/**
 * Weather Engine
 * Pure logic module for parsing weather responses, WMO weather codes,
 * geolocation error resolution, temperature conversions, and offline presets.
 */

export const DEFAULT_LOCATION = {
  name: "London",
  country: "United Kingdom",
  latitude: 51.5074,
  longitude: -0.1278,
};

export const WMO_CODE_MAP = {
  0: { condition: "Clear sky", icon: "☀️" },
  1: { condition: "Mainly clear", icon: "🌤️" },
  2: { condition: "Partly cloudy", icon: "⛅" },
  3: { condition: "Overcast", icon: "☁️" },
  45: { condition: "Fog", icon: "🌫️" },
  48: { condition: "Depositing rime fog", icon: "🌫️" },
  51: { condition: "Light drizzle", icon: "🌦️" },
  53: { condition: "Moderate drizzle", icon: "🌦️" },
  55: { condition: "Dense drizzle", icon: "🌧️" },
  61: { condition: "Slight rain", icon: "🌧️" },
  63: { condition: "Moderate rain", icon: "🌧️" },
  65: { condition: "Heavy rain", icon: "🌧️" },
  71: { condition: "Slight snow fall", icon: "🌨️" },
  73: { condition: "Moderate snow fall", icon: "🌨️" },
  75: { condition: "Heavy snow fall", icon: "❄️" },
  77: { condition: "Snow grains", icon: "❄️" },
  80: { condition: "Slight rain showers", icon: "🌦️" },
  81: { condition: "Moderate rain showers", icon: "🌧️" },
  82: { condition: "Violent rain showers", icon: "⛈️" },
  85: { condition: "Slight snow showers", icon: "🌨️" },
  86: { condition: "Heavy snow showers", icon: "❄️" },
  95: { condition: "Thunderstorm", icon: "⛈️" },
  96: { condition: "Thunderstorm with slight hail", icon: "⛈️" },
  99: { condition: "Thunderstorm with heavy hail", icon: "⛈️" },
};

export const PRESET_LOCATIONS = {
  london: {
    name: "London",
    country: "United Kingdom",
    latitude: 51.5074,
    longitude: -0.1278,
    mockWeather: {
      temperature: 15,
      weatherCode: 2,
      humidity: 68,
      windSpeed: 14,
      pressure: 1013,
      forecast: [
        { day: "Mon", min: 11, max: 18, code: 2 },
        { day: "Tue", min: 12, max: 19, code: 1 },
        { day: "Wed", min: 10, max: 16, code: 61 },
        { day: "Thu", min: 9, max: 15, code: 3 },
        { day: "Fri", min: 11, max: 17, code: 0 },
      ],
    },
  },
  newyork: {
    name: "New York",
    country: "United States",
    latitude: 40.7128,
    longitude: -74.006,
    mockWeather: {
      temperature: 22,
      weatherCode: 0,
      humidity: 52,
      windSpeed: 18,
      pressure: 1016,
      forecast: [
        { day: "Mon", min: 16, max: 24, code: 0 },
        { day: "Tue", min: 18, max: 26, code: 1 },
        { day: "Wed", min: 17, max: 23, code: 2 },
        { day: "Thu", min: 15, max: 21, code: 80 },
        { day: "Fri", min: 14, max: 22, code: 1 },
      ],
    },
  },
  tokyo: {
    name: "Tokyo",
    country: "Japan",
    latitude: 35.6762,
    longitude: 139.6503,
    mockWeather: {
      temperature: 19,
      weatherCode: 1,
      humidity: 60,
      windSpeed: 10,
      pressure: 1018,
      forecast: [
        { day: "Mon", min: 14, max: 21, code: 1 },
        { day: "Tue", min: 15, max: 22, code: 2 },
        { day: "Wed", min: 13, max: 20, code: 0 },
        { day: "Thu", min: 12, max: 18, code: 3 },
        { day: "Fri", min: 14, max: 21, code: 61 },
      ],
    },
  },
  paris: {
    name: "Paris",
    country: "France",
    latitude: 48.8566,
    longitude: 2.3522,
    mockWeather: {
      temperature: 17,
      weatherCode: 3,
      humidity: 64,
      windSpeed: 12,
      pressure: 1015,
      forecast: [
        { day: "Mon", min: 12, max: 19, code: 3 },
        { day: "Tue", min: 13, max: 20, code: 2 },
        { day: "Wed", min: 11, max: 17, code: 61 },
        { day: "Thu", min: 10, max: 16, code: 1 },
        { day: "Fri", min: 12, max: 18, code: 0 },
      ],
    },
  },
  sydney: {
    name: "Sydney",
    country: "Australia",
    latitude: -33.8688,
    longitude: 151.2093,
    mockWeather: {
      temperature: 24,
      weatherCode: 0,
      humidity: 55,
      windSpeed: 16,
      pressure: 1020,
      forecast: [
        { day: "Mon", min: 18, max: 26, code: 0 },
        { day: "Tue", min: 19, max: 27, code: 1 },
        { day: "Wed", min: 17, max: 25, code: 2 },
        { day: "Thu", min: 16, max: 23, code: 80 },
        { day: "Fri", min: 18, max: 26, code: 0 },
      ],
    },
  },
};

/**
 * Maps WMO code to condition text and emoji icon.
 */
export function getWeatherCondition(wmoCode) {
  const code = Number(wmoCode);
  if (WMO_CODE_MAP[code]) {
    return WMO_CODE_MAP[code];
  }
  return { condition: "Variable", icon: "🌤️" };
}

/**
 * Converts Celsius to Fahrenheit.
 */
export function celsiusToFahrenheit(celsius) {
  return Math.round((Number(celsius) * 9) / 5 + 32);
}

/**
 * Converts Fahrenheit to Celsius.
 */
export function fahrenheitToCelsius(fahrenheit) {
  return Math.round(((Number(fahrenheit) - 32) * 5) / 9);
}

/**
 * Formats temperature according to current unit ('C' or 'F').
 */
export function formatTemperature(celsius, unit = "C") {
  const c = Math.round(Number(celsius));
  if (unit === "F") {
    return `${celsiusToFahrenheit(c)}°F`;
  }
  return `${c}°C`;
}

/**
 * Handles geolocation errors and provides a descriptive user message
 * and fallback default location.
 */
export function handleGeolocationError(error) {
  let userMsg = "Location access denied.";
  if (
    error &&
    (error.code === 1 ||
      String(error.message || "")
        .toLowerCase()
        .includes("denied"))
  ) {
    userMsg = "Location access denied.";
  } else if (error && error.code === 2) {
    userMsg = "Location position unavailable.";
  } else if (error && error.code === 3) {
    userMsg = "Location request timed out.";
  }

  return {
    type: "denied",
    code: (error && error.code) || 1,
    title: "Location access denied.",
    message: `${userMsg} Showing weather for ${DEFAULT_LOCATION.name} (default location). Use the search above to view another city.`,
    fallbackLocation: DEFAULT_LOCATION,
  };
}

/**
 * Parses Open-Meteo API response into a structured model.
 */
export function parseWeatherData(apiData, locationName = "Current Location") {
  if (!apiData || !apiData.current) {
    // If raw API data is not in standard Open-Meteo format, check for mock preset format
    if (apiData && typeof apiData.temperature === "number") {
      const cond = getWeatherCondition(apiData.weatherCode || 0);
      return {
        locationName,
        temperatureC: Math.round(apiData.temperature),
        condition: cond.condition,
        icon: cond.icon,
        weatherCode: apiData.weatherCode || 0,
        humidity: apiData.humidity || 50,
        windSpeed: apiData.windSpeed || 10,
        pressure: apiData.pressure || 1013,
        forecast: (apiData.forecast || []).map(f => {
          const fCond = getWeatherCondition(f.code);
          return {
            day: f.day,
            minC: f.min,
            maxC: f.max,
            condition: fCond.condition,
            icon: fCond.icon,
            code: f.code,
          };
        }),
      };
    }
    throw new Error("Invalid weather data payload");
  }

  const current = apiData.current;
  const daily = apiData.daily || {};
  const cond = getWeatherCondition(current.weather_code);

  const forecast = [];
  if (Array.isArray(daily.time)) {
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    for (let i = 0; i < Math.min(5, daily.time.length); i++) {
      const date = new Date(daily.time[i]);
      const dayName = isNaN(date.getDay())
        ? `Day ${i + 1}`
        : dayNames[date.getDay()];
      const dayCode = daily.weather_code ? daily.weather_code[i] : 0;
      const dayCond = getWeatherCondition(dayCode);
      forecast.push({
        day: dayName,
        minC: Math.round(
          daily.temperature_2m_min
            ? daily.temperature_2m_min[i]
            : current.temperature_2m - 5
        ),
        maxC: Math.round(
          daily.temperature_2m_max
            ? daily.temperature_2m_max[i]
            : current.temperature_2m + 5
        ),
        condition: dayCond.condition,
        icon: dayCond.icon,
        code: dayCode,
      });
    }
  }

  return {
    locationName,
    temperatureC: Math.round(current.temperature_2m),
    condition: cond.condition,
    icon: cond.icon,
    weatherCode: current.weather_code,
    humidity:
      current.relative_humidity_2m !== undefined
        ? Math.round(current.relative_humidity_2m)
        : 60,
    windSpeed:
      current.wind_speed_10m !== undefined
        ? Math.round(current.wind_speed_10m)
        : 10,
    pressure:
      current.surface_pressure !== undefined
        ? Math.round(current.surface_pressure)
        : 1013,
    forecast,
  };
}

/**
 * Matches a query against offline presets or formats a search string.
 */
export function findPresetLocation(query) {
  if (!query || typeof query !== "string") return null;
  const key = query
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  return PRESET_LOCATIONS[key] || null;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    DEFAULT_LOCATION,
    WMO_CODE_MAP,
    PRESET_LOCATIONS,
    getWeatherCondition,
    celsiusToFahrenheit,
    fahrenheitToCelsius,
    formatTemperature,
    handleGeolocationError,
    parseWeatherData,
    findPresetLocation,
  };
}
