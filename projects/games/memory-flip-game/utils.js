const storage =
  typeof window !== "undefined" && window.CradleStorage
    ? window.CradleStorage
    : (function () {
        try {
          return require("../../../src/components/ui/storage.js");
        } catch (_) {
          return null;
        }
      })();

const STORAGE_KEY = "cradle_memory_flip_high_score";
const CHALLENGE_STORAGE_KEY = "cradle_memory_flip_challenge_high_score";
const LEGACY_STORAGE_KEY = "pairwise_high_score";
const LEGACY_CHALLENGE_STORAGE_KEY = "pairwise_challenge_high_score";

// Safe numeric bounds for flip count / seconds (must be positive, non-zero, finite integer)
const MIN_SCORE = 1;
const MAX_SCORE = 1000000;

function isValidScore(val) {
  if (val === null || val === undefined || typeof val === "boolean") {
    return false;
  }
  const num = Number(val);
  return Number.isInteger(num) && num >= MIN_SCORE && num <= MAX_SCORE;
}

function getRawScore(key) {
  if (storage && typeof storage.getRaw === "function") {
    return storage.getRaw(key, null);
  }
  try {
    return typeof localStorage !== "undefined"
      ? localStorage.getItem(key)
      : null;
  } catch (_) {
    return null;
  }
}

function setRawScore(key, value) {
  if (storage && typeof storage.setRaw === "function") {
    return storage.setRaw(key, value);
  }
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(key, String(value));
      return true;
    }
  } catch (_) {}
  return false;
}

function getHighScore(mode = "standard") {
  const key = mode === "challenge" ? CHALLENGE_STORAGE_KEY : STORAGE_KEY;
  const legacyKey =
    mode === "challenge" ? LEGACY_CHALLENGE_STORAGE_KEY : LEGACY_STORAGE_KEY;
  const raw = getRawScore(key) || getRawScore(legacyKey);
  if (!raw) return null;
  const parsed = parseInt(raw, 10);
  return isValidScore(parsed) ? parsed : null;
}

function saveHighScore(score, mode = "standard") {
  // Reject non-numeric, zero, negative, NaN, or excessively large values
  if (!isValidScore(score)) {
    return false;
  }
  const current = getHighScore(mode);
  const key = mode === "challenge" ? CHALLENGE_STORAGE_KEY : STORAGE_KEY;
  const numScore = Number(score);
  if (current === null || numScore < current) {
    setRawScore(key, numScore);
    return true; // new high score
  }
  return false;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    MIN_SCORE,
    MAX_SCORE,
    isValidScore,
    getHighScore,
    saveHighScore,
  };
}
