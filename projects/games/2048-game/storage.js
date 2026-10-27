(function (root, factory) {
  const getCradleStorage = () => {
    if (typeof window !== "undefined" && window.CradleStorage) {
      return window.CradleStorage;
    }
    if (typeof root !== "undefined" && root.CradleStorage) {
      return root.CradleStorage;
    }
    if (typeof require !== "undefined") {
      try {
        return require("../../../src/components/ui/storage.js");
      } catch (e) {
        // fallback if required path not found
      }
    }
    return null;
  };

  const api = factory(getCradleStorage);

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  root.__2048Storage = api;
  if (typeof root === "object" && root !== null) {
    root.saveGameState = api.saveGameState;
    root.loadGameState = api.loadGameState;
    root.clearGameState = api.clearGameState;
    root.saveBestScore = api.saveBestScore;
    root.getBestScore = api.getBestScore;
    root.isValidScore = api.isValidScore;
    root.isValidSize = api.isValidSize;
    root.MAX_SCORE = api.MAX_SCORE;
    root.MIN_SIZE = api.MIN_SIZE;
    root.MAX_SIZE = api.MAX_SIZE;
  }
})(
  typeof globalThis !== "undefined" ? globalThis : this,
  function (getStorageFn) {
    const STATE_KEY_PREFIX = "cradle_2048_game_state_";
    const BEST_KEY_PREFIX = "cradle_2048_best_score_";
    const LEGACY_STATE_KEY_PREFIX = "2048_game_state_";
    const LEGACY_BEST_KEY_PREFIX = "2048_best_score_";

    const MAX_SCORE = Number.MAX_SAFE_INTEGER;
    const MIN_SIZE = 3;
    const MAX_SIZE = 8;

    function resolveStorage() {
      if (typeof window !== "undefined" && window.CradleStorage) {
        return window.CradleStorage;
      }
      if (typeof getStorageFn === "function") {
        return getStorageFn();
      }
      return null;
    }

    function isValidSize(size) {
      if (size === null || size === undefined || typeof size === "boolean") {
        return false;
      }
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

    function saveGameState(sizeOrState, state) {
      let size = sizeOrState;
      let targetState = state;
      if (
        targetState === undefined &&
        typeof sizeOrState === "object" &&
        sizeOrState !== null
      ) {
        targetState = sizeOrState;
        size = targetState.size || 4;
      }
      if (!isValidSize(size) || !targetState || typeof targetState !== "object")
        return;

      const storage = resolveStorage();
      if (!storage || typeof storage.set !== "function") return;

      const sanitizedState = {
        ...targetState,
        size: Number(size),
        score: isValidScore(targetState.score) ? Number(targetState.score) : 0,
        bestScore: isValidScore(targetState.bestScore)
          ? Number(targetState.bestScore)
          : 0,
        board: Array.isArray(targetState.board) ? targetState.board : [],
        won: Boolean(targetState.won),
        over: Boolean(targetState.over),
      };
      storage.set(STATE_KEY_PREFIX + size, sanitizedState);
    }

    function loadGameState(size = 4) {
      if (size === undefined || size === null) size = 4;
      if (!isValidSize(size)) return null;

      const storage = resolveStorage();
      if (!storage || typeof storage.get !== "function") return null;

      const raw =
        storage.get(STATE_KEY_PREFIX + size, null) ??
        storage.get(LEGACY_STATE_KEY_PREFIX + size, null);

      if (!raw || typeof raw !== "object" || !Array.isArray(raw.board)) {
        return null;
      }

      return {
        ...raw,
        size: Number(size),
        score: isValidScore(raw.score) ? Number(raw.score) : 0,
        bestScore: isValidScore(raw.bestScore) ? Number(raw.bestScore) : 0,
      };
    }

    function clearGameState(size = 4) {
      if (size === undefined || size === null) size = 4;
      if (!isValidSize(size)) return;

      const storage = resolveStorage();
      if (!storage || typeof storage.remove !== "function") return;

      storage.remove(STATE_KEY_PREFIX + size);
      storage.remove(LEGACY_STATE_KEY_PREFIX + size);
    }

    function saveBestScore(sizeOrScore, score) {
      let size = sizeOrScore;
      let targetScore = score;
      if (targetScore === undefined) {
        targetScore = sizeOrScore;
        size = 4;
      }

      if (!isValidSize(size)) return false;
      if (!isValidScore(targetScore)) return false;

      const currentBest = getBestScore(size);
      const numScore = Number(targetScore);
      if (numScore > currentBest) {
        const storage = resolveStorage();
        if (storage) {
          if (typeof storage.setRaw === "function") {
            storage.setRaw(BEST_KEY_PREFIX + size, numScore);
          } else if (typeof storage.set === "function") {
            storage.set(BEST_KEY_PREFIX + size, numScore);
          }
        }
        return true;
      }
      return false;
    }

    function getBestScore(size = 4) {
      if (size === undefined || size === null) size = 4;
      if (!isValidSize(size)) return 0;

      const storage = resolveStorage();
      if (!storage) return 0;

      const rawBest =
        typeof storage.getRaw === "function"
          ? storage.getRaw(BEST_KEY_PREFIX + size, null)
          : null;
      const rawLegacy =
        typeof storage.getRaw === "function"
          ? storage.getRaw(LEGACY_BEST_KEY_PREFIX + size, null)
          : null;

      const raw = rawBest !== null ? rawBest : rawLegacy;
      if (raw === null || raw === "") return 0;

      const parsed = parseInt(raw, 10);
      return isValidScore(parsed) ? parsed : 0;
    }

    return {
      MAX_SCORE,
      MIN_SIZE,
      MAX_SIZE,
      isValidSize,
      isValidScore,
      saveGameState,
      loadGameState,
      clearGameState,
      saveBestScore,
      getBestScore,
    };
  }
);
