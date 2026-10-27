const storage =
  typeof window !== "undefined" && window.CradleStorage
    ? window.CradleStorage
    : require("../../../src/components/ui/storage.js");

const STATE_KEY_PREFIX = "cradle_2048_game_state_";
const BEST_KEY_PREFIX = "cradle_2048_best_score_";
const LEGACY_STATE_KEY_PREFIX = "2048_game_state_";
const LEGACY_BEST_KEY_PREFIX = "2048_best_score_";

const MAX_SCORE = Number.MAX_SAFE_INTEGER;
const MIN_SIZE = 3;
const MAX_SIZE = 8;

function isValidSize(size) {
  const num = Number(size);
  return Number.isInteger(num) && num >= MIN_SIZE && num <= MAX_SIZE;
}

function isValidScore(score) {
  if (score === null || score === undefined || typeof score === "boolean") {
    return false;
  }
  const num = Number(score);
  return Number.isInteger(num) && num >= 0 && num <= MAX_SCORE;
}

function saveGameState(size, state) {
  if (!isValidSize(size) || !state || typeof state !== "object") return;
  const sanitizedState = {
    ...state,
    score: isValidScore(state.score) ? Number(state.score) : 0,
    bestScore: isValidScore(state.bestScore) ? Number(state.bestScore) : 0,
  };
  storage.set(STATE_KEY_PREFIX + size, sanitizedState);
}

function loadGameState(size) {
  if (!isValidSize(size)) return null;
  const raw =
    storage.get(STATE_KEY_PREFIX + size, null) ??
    storage.get(LEGACY_STATE_KEY_PREFIX + size, null);

  if (!raw || typeof raw !== "object" || !Array.isArray(raw.board)) {
    return null;
  }

  return {
    ...raw,
    score: isValidScore(raw.score) ? Number(raw.score) : 0,
    bestScore: isValidScore(raw.bestScore) ? Number(raw.bestScore) : 0,
  };
}

function clearGameState(size) {
  if (!isValidSize(size)) return;
  storage.remove(STATE_KEY_PREFIX + size);
  storage.remove(LEGACY_STATE_KEY_PREFIX + size);
}

function saveBestScore(size, score) {
  if (!isValidSize(size)) return false;
  if (!isValidScore(score)) return false;

  const currentBest = getBestScore(size);
  const numScore = Number(score);
  if (numScore > currentBest) {
    storage.setRaw(BEST_KEY_PREFIX + size, numScore);
    return true;
  }
  return false;
}

function getBestScore(size) {
  if (!isValidSize(size)) return 0;
  const val =
    storage.getRaw(BEST_KEY_PREFIX + size, "") ||
    storage.getRaw(LEGACY_BEST_KEY_PREFIX + size, "");
  if (!val) return 0;
  const parsed = parseInt(val, 10);
  return isValidScore(parsed) ? parsed : 0;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    MAX_SCORE,
    isValidSize,
    isValidScore,
    saveGameState,
    loadGameState,
    clearGameState,
    saveBestScore,
    getBestScore,
  };
}
