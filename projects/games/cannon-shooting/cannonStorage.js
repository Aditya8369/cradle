// Cannon Storage System for persisting high scores and defense streaks

const storage =
  typeof window !== "undefined" && window.CradleStorage
    ? window.CradleStorage
    : require("../../../src/components/ui/storage.js");

const STORAGE_KEY = "cradle_cannon_stats";
const LEGACY_STORAGE_KEY = "cannonShootingStats";

// Safe numeric limits for game scores and persistent counters
const MAX_SCORE = Number.MAX_SAFE_INTEGER;
const MAX_STREAK = 100000;
const MAX_SHOTS = Number.MAX_SAFE_INTEGER;

function clampInt(val, min, max, fallback = min) {
  if (val === null || val === undefined || typeof val === "boolean") {
    return fallback;
  }
  const num = Number(val);
  if (!Number.isFinite(num) || Number.isNaN(num)) {
    return fallback;
  }
  return Math.min(Math.max(Math.floor(num), min), max);
}

function getInitialStats() {
  return {
    highScore: 0,
    score: 0,
    currentStreak: 0,
    bestStreak: 0,
    totalHits: 0,
    totalShots: 0,
  };
}

function sanitizeStats(saved) {
  const initial = getInitialStats();
  if (!saved || typeof saved !== "object") return initial;

  const score = clampInt(saved.score, 0, MAX_SCORE, 0);
  let highScore = clampInt(saved.highScore, 0, MAX_SCORE, 0);
  if (score > highScore) {
    highScore = score;
  }

  const currentStreak = clampInt(saved.currentStreak, 0, MAX_STREAK, 0);
  let bestStreak = clampInt(saved.bestStreak, 0, MAX_STREAK, 0);
  if (currentStreak > bestStreak) {
    bestStreak = currentStreak;
  }

  const totalShots = clampInt(saved.totalShots, 0, MAX_SHOTS, 0);
  // Invariant: totalHits cannot exceed totalShots
  const totalHits = clampInt(saved.totalHits, 0, totalShots, 0);

  return {
    highScore,
    score,
    currentStreak,
    bestStreak,
    totalHits,
    totalShots,
  };
}

function loadStats() {
  const saved =
    storage.get(STORAGE_KEY, null) ?? storage.get(LEGACY_STORAGE_KEY, null);
  return sanitizeStats(saved);
}

function saveStats(stats) {
  const sanitized = sanitizeStats(stats);
  storage.set(STORAGE_KEY, sanitized);
}

function recordShot(stats, isHit, scoreAwarded = 0, newStreak = 0) {
  const current = sanitizeStats(stats);
  const updated = { ...current };

  // Validate numeric inputs before use
  const validScoreAwarded = clampInt(scoreAwarded, 0, 1000000, 0);
  const validNewStreak = clampInt(newStreak, 0, MAX_STREAK, 0);

  if (updated.totalShots < MAX_SHOTS) {
    updated.totalShots += 1;
  }

  if (isHit) {
    if (updated.totalHits < updated.totalShots) {
      updated.totalHits += 1;
    }
    // Prevent numeric overflow on score addition
    updated.score = Math.min(MAX_SCORE, updated.score + validScoreAwarded);
    updated.currentStreak = validNewStreak;
    if (updated.score > updated.highScore) {
      updated.highScore = updated.score;
    }
    if (updated.currentStreak > updated.bestStreak) {
      updated.bestStreak = updated.currentStreak;
    }
  } else {
    updated.currentStreak = 0;
  }

  saveStats(updated);
  return updated;
}

function resetStats() {
  const fresh = getInitialStats();
  saveStats(fresh);
  return fresh;
}

const CannonStorage = {
  STORAGE_KEY,
  MAX_SCORE,
  MAX_STREAK,
  MAX_SHOTS,
  getInitialStats,
  sanitizeStats,
  loadStats,
  saveStats,
  recordShot,
  resetStats,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = CannonStorage;
} else if (typeof window !== "undefined") {
  window.CannonStorage = CannonStorage;
}
