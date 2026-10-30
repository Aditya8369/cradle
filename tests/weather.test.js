const test = require("node:test");
const assert = require("node:assert/strict");
const {
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
} = require("../projects/productivity/weather/weatherEngine.js");

test("DEFAULT_LOCATION points to London with valid coordinates", () => {
  assert.equal(DEFAULT_LOCATION.name, "London");
  assert.equal(DEFAULT_LOCATION.country, "United Kingdom");
  assert.equal(typeof DEFAULT_LOCATION.latitude, "number");
  assert.equal(typeof DEFAULT_LOCATION.longitude, "number");
  assert.equal(DEFAULT_LOCATION.latitude, 51.5074);
  assert.equal(DEFAULT_LOCATION.longitude, -0.1278);
});

test("handleGeolocationError handles PERMISSION_DENIED (code 1) with descriptive message and London fallback", () => {
  const deniedError = {
    code: 1,
    message: "User denied Geolocation",
    PERMISSION_DENIED: 1,
  };
  const result = handleGeolocationError(deniedError);

  assert.equal(result.type, "denied");
  assert.equal(result.code, 1);
  assert.equal(result.title, "Location access denied.");
  assert.ok(result.message.includes("Location access denied."));
  assert.ok(result.message.includes("London"));
  assert.deepEqual(result.fallbackLocation, DEFAULT_LOCATION);
});

test("handleGeolocationError handles string message containing 'denied'", () => {
  const customError = { message: "Permission was denied by browser setting" };
  const result = handleGeolocationError(customError);

  assert.equal(result.title, "Location access denied.");
  assert.ok(result.message.includes("Location access denied."));
  assert.deepEqual(result.fallbackLocation, DEFAULT_LOCATION);
});

test("handleGeolocationError handles POSITION_UNAVAILABLE (code 2) gracefully", () => {
  const unavailableError = { code: 2, message: "Position unavailable" };
  const result = handleGeolocationError(unavailableError);

  assert.ok(result.message.includes("Location position unavailable."));
  assert.deepEqual(result.fallbackLocation, DEFAULT_LOCATION);
});

test("handleGeolocationError handles TIMEOUT (code 3) gracefully", () => {
  const timeoutError = { code: 3, message: "Timeout" };
  const result = handleGeolocationError(timeoutError);

  assert.ok(result.message.includes("Location request timed out."));
  assert.deepEqual(result.fallbackLocation, DEFAULT_LOCATION);
});

test("handleGeolocationError handles null or undefined error safely", () => {
  const resultNull = handleGeolocationError(null);
  assert.equal(resultNull.title, "Location access denied.");
  assert.deepEqual(resultNull.fallbackLocation, DEFAULT_LOCATION);

  const resultUndefined = handleGeolocationError(undefined);
  assert.equal(resultUndefined.title, "Location access denied.");
  assert.deepEqual(resultUndefined.fallbackLocation, DEFAULT_LOCATION);
});

test("getWeatherCondition maps WMO codes correctly", () => {
  assert.deepEqual(getWeatherCondition(0), {
    condition: "Clear sky",
    icon: "☀️",
  });
  assert.deepEqual(getWeatherCondition(2), {
    condition: "Partly cloudy",
    icon: "⛅",
  });
  assert.deepEqual(getWeatherCondition(3), {
    condition: "Overcast",
    icon: "☁️",
  });
  assert.deepEqual(getWeatherCondition(61), {
    condition: "Slight rain",
    icon: "🌧️",
  });
  assert.deepEqual(getWeatherCondition(71), {
    condition: "Slight snow fall",
    icon: "🌨️",
  });
  assert.deepEqual(getWeatherCondition(95), {
    condition: "Thunderstorm",
    icon: "⛈️",
  });
});

test("getWeatherCondition falls back gracefully on unknown WMO code", () => {
  const unknown = getWeatherCondition(999);
  assert.equal(unknown.condition, "Variable");
  assert.equal(unknown.icon, "🌤️");
});

test("temperature conversions calculate accurately", () => {
  assert.equal(celsiusToFahrenheit(0), 32);
  assert.equal(celsiusToFahrenheit(20), 68);
  assert.equal(celsiusToFahrenheit(100), 212);
  assert.equal(celsiusToFahrenheit(-10), 14);

  assert.equal(fahrenheitToCelsius(32), 0);
  assert.equal(fahrenheitToCelsius(68), 20);
  assert.equal(fahrenheitToCelsius(212), 100);
});

test("formatTemperature displays correct unit and formatting", () => {
  assert.equal(formatTemperature(15, "C"), "15°C");
  assert.equal(formatTemperature(15, "F"), "59°F");
  assert.equal(formatTemperature(0, "C"), "0°C");
  assert.equal(formatTemperature(0, "F"), "32°F");
});

test("findPresetLocation matches common cities case-insensitively", () => {
  const london = findPresetLocation("London");
  assert.ok(london);
  assert.equal(london.name, "London");

  const tokyo = findPresetLocation("tokyo");
  assert.ok(tokyo);
  assert.equal(tokyo.name, "Tokyo");

  const newYork = findPresetLocation("New York");
  assert.ok(newYork);
  assert.equal(newYork.name, "New York");

  const unknown = findPresetLocation("NonExistentCity12345");
  assert.equal(unknown, null);
});

test("parseWeatherData processes standard Open-Meteo API response structure", () => {
  const mockApiData = {
    current: {
      temperature_2m: 18.4,
      relative_humidity_2m: 65,
      weather_code: 1,
      wind_speed_10m: 12.3,
      surface_pressure: 1014.2,
    },
    daily: {
      time: [
        "2026-10-31",
        "2026-11-01",
        "2026-11-02",
        "2026-11-03",
        "2026-11-04",
      ],
      temperature_2m_max: [19.2, 17.5, 18.0, 16.2, 15.9],
      temperature_2m_min: [11.1, 10.4, 12.0, 9.8, 8.5],
      weather_code: [1, 2, 61, 3, 0],
    },
  };

  const parsed = parseWeatherData(mockApiData, "Paris");
  assert.equal(parsed.locationName, "Paris");
  assert.equal(parsed.temperatureC, 18);
  assert.equal(parsed.condition, "Mainly clear");
  assert.equal(parsed.icon, "🌤️");
  assert.equal(parsed.humidity, 65);
  assert.equal(parsed.windSpeed, 12);
  assert.equal(parsed.pressure, 1014);
  assert.equal(parsed.forecast.length, 5);
  assert.equal(parsed.forecast[0].maxC, 19);
  assert.equal(parsed.forecast[0].minC, 11);
  assert.equal(parsed.forecast[0].condition, "Mainly clear");
});

test("parseWeatherData processes offline preset weather format", () => {
  const presetMock = PRESET_LOCATIONS.london.mockWeather;
  const parsed = parseWeatherData(presetMock, "London");

  assert.equal(parsed.locationName, "London");
  assert.equal(parsed.temperatureC, 15);
  assert.equal(parsed.condition, "Partly cloudy");
  assert.equal(parsed.humidity, 68);
  assert.equal(parsed.forecast.length, 5);
});

test("parseWeatherData throws error on invalid or empty payload", () => {
  assert.throws(() => parseWeatherData(null), /Invalid weather data payload/);
  assert.throws(() => parseWeatherData({}), /Invalid weather data payload/);
});
