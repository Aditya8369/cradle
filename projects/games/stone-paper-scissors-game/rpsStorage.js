/**
 * RPS Storage Handler - Manages score history, win streaks, and match statistics
 */
(function (exports) {
  const storage =
    typeof window !== "undefined" && window.CradleStorage
      ? window.CradleStorage
      : require("../../../src/components/ui/storage.js");
  const store = storage.namespace("cradle_rps_");

  const MAX_STAT = Number.MAX_SAFE_INTEGER;
  const MAX_STREAK = 100000;

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

  const memoryStats = {
    wins: 0,
    losses: 0,
    ties: 0,
    currentStreak: 0,
    bestStreak: 0,
    moveCounts: { rock: 0, paper: 0, scissors: 0, lizard: 0, spock: 0 },
  };

  function sanitizeStats(saved) {
    if (!saved || typeof saved !== "object") {
      return {
        wins: 0,
        losses: 0,
        ties: 0,
        currentStreak: 0,
        bestStreak: 0,
        moveCounts: { rock: 0, paper: 0, scissors: 0, lizard: 0, spock: 0 },
      };
    }

    const wins = clampInt(saved.wins, 0, MAX_STAT, 0);
    const losses = clampInt(saved.losses, 0, MAX_STAT, 0);
    const ties = clampInt(saved.ties, 0, MAX_STAT, 0);
    const currentStreak = clampInt(saved.currentStreak, 0, MAX_STREAK, 0);
    let bestStreak = clampInt(saved.bestStreak, 0, MAX_STREAK, 0);
    if (currentStreak > bestStreak) {
      bestStreak = currentStreak;
    }

    const validMoves = ["rock", "paper", "scissors", "lizard", "spock"];
    const moveCounts = { rock: 0, paper: 0, scissors: 0, lizard: 0, spock: 0 };
    if (saved.moveCounts && typeof saved.moveCounts === "object") {
      for (const m of validMoves) {
        moveCounts[m] = clampInt(saved.moveCounts[m], 0, MAX_STAT, 0);
      }
    }

    return {
      wins,
      losses,
      ties,
      currentStreak,
      bestStreak,
      moveCounts,
    };
  }

  function getStats() {
    const saved = store.get("stats", null);
    return sanitizeStats(saved);
  }

  function recordOutcome(outcome, playerChoice) {
    const stats = getStats();
    if (outcome === "player") {
      if (stats.wins < MAX_STAT) stats.wins += 1;
      if (stats.currentStreak < MAX_STREAK) stats.currentStreak += 1;
      if (stats.currentStreak > stats.bestStreak) {
        stats.bestStreak = stats.currentStreak;
      }
    } else if (outcome === "computer") {
      if (stats.losses < MAX_STAT) stats.losses += 1;
      stats.currentStreak = 0;
    } else {
      if (stats.ties < MAX_STAT) stats.ties += 1;
    }

    if (playerChoice && stats.moveCounts[playerChoice] !== undefined) {
      if (stats.moveCounts[playerChoice] < MAX_STAT) {
        stats.moveCounts[playerChoice] += 1;
      }
    }

    store.set("stats", stats);

    return stats;
  }

  function resetStats() {
    const fresh = {
      wins: 0,
      losses: 0,
      ties: 0,
      currentStreak: 0,
      bestStreak: 0,
      moveCounts: { rock: 0, paper: 0, scissors: 0, lizard: 0, spock: 0 },
    };
    store.set("stats", fresh);
    return fresh;
  }

  exports.getStats = getStats;
  exports.recordOutcome = recordOutcome;
  exports.resetStats = resetStats;
  exports.sanitizeStats = sanitizeStats;
  exports.MAX_STAT = MAX_STAT;
  exports.MAX_STREAK = MAX_STREAK;
})(typeof exports === "undefined" ? (window.RpsStorage = {}) : exports);
