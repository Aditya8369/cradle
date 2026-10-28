const test = require("node:test");
const assert = require("node:assert");
const undoManagerModule = require("../projects/games/2048-game/gameUndoManager.js");
const themeEngineModule = require("../projects/games/2048-game/gameThemeEngine.js");
const { setupLocalStorageMock } = require("./helpers/localstorage-mock");

setupLocalStorageMock();

test("UndoManager pushes state snapshots and restores board/score on undo", () => {
  const manager = undoManagerModule.createUndoManager(5);

  const initialGameState = {
    board: [
      [2, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    score: 0,
    won: false,
    over: false,
    size: 4,
  };

  manager.pushState(initialGameState);
  assert.strictEqual(manager.getCanUndo(), true);
  assert.strictEqual(manager.getHistoryCount(), 1);

  // Modify game state simulate move
  initialGameState.board[0][0] = 4;
  initialGameState.score = 4;

  // Perform undo
  const previous = manager.undo(initialGameState);

  assert.strictEqual(previous.score, 0);
  assert.strictEqual(initialGameState.score, 0);
  assert.strictEqual(initialGameState.board[0][0], 2);
  assert.strictEqual(manager.getCanUndo(), false);
});

test("UndoManager enforces max stack capacity limit", () => {
  const manager = undoManagerModule.createUndoManager(3);
  for (let i = 1; i <= 5; i++) {
    manager.pushState({
      board: [[i]],
      score: i * 10,
    });
  }

  assert.strictEqual(manager.getHistoryCount(), 3);
});

test("ThemeEngine provides valid theme presets and tile color mappings", () => {
  const themes = themeEngineModule.getAvailableThemes();
  assert.ok(themes.length >= 3);

  const classicTheme = themeEngineModule.getTheme("classic");
  assert.strictEqual(classicTheme.name, "Classic");

  const tile8Color = themeEngineModule.getTileColor(8, "darkNeon");
  assert.strictEqual(typeof tile8Color, "string");
});

test("2048 storage enforces numeric bounds on scores and grid sizes", () => {
  const gameStorage = require("../projects/games/2048-game/storage.js");

  // Invalid grid size
  assert.strictEqual(gameStorage.saveBestScore(1, 100), false);
  assert.strictEqual(gameStorage.saveBestScore(99, 100), false);
  assert.strictEqual(gameStorage.getBestScore(1), 0);

  // Invalid scores (negative, NaN, Infinity, floats, excessive)
  assert.strictEqual(gameStorage.saveBestScore(4, -50), false);
  assert.strictEqual(gameStorage.saveBestScore(4, NaN), false);
  assert.strictEqual(gameStorage.saveBestScore(4, Infinity), false);
  assert.strictEqual(gameStorage.saveBestScore(4, 12.34), false);
  assert.strictEqual(
    gameStorage.saveBestScore(4, Number.MAX_SAFE_INTEGER + 1000),
    false
  );

  // Valid score save
  assert.strictEqual(gameStorage.saveBestScore(4, 256), true);
  assert.strictEqual(gameStorage.getBestScore(4), 256);

  // Lower score does not overwrite
  assert.strictEqual(gameStorage.saveBestScore(4, 128), false);
  assert.strictEqual(gameStorage.getBestScore(4), 256);

  // Load and save state bounds validation
  gameStorage.saveGameState(4, {
    board: [
      [2, 4],
      [0, 0],
    ],
    score: -500, // corrupt negative score
    bestScore: NaN,
  });
  const loaded = gameStorage.loadGameState(4);
  assert.strictEqual(loaded.score, 0);
  assert.strictEqual(loaded.bestScore, 0);

  gameStorage.clearGameState(4);
});

test("2048 storage persists high score and game state across simulated browser sessions using CradleStorage", () => {
  const gameStorage = require("../projects/games/2048-game/storage.js");

  // Clean slate
  gameStorage.clearGameState(4);
  localStorage.removeItem("cradle_2048_best_score_4");

  // Session 1: Player scores 512
  assert.strictEqual(gameStorage.saveBestScore(4, 512), true);
  gameStorage.saveGameState(4, {
    board: [
      [2, 4, 8, 16],
      [32, 64, 128, 256],
      [512, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    score: 512,
    bestScore: 512,
    won: false,
    over: false,
  });

  // Verify Session 1 stored values
  assert.strictEqual(gameStorage.getBestScore(4), 512);

  // Session 2: Simulated page reload / new session
  // Load state and best score as script.js initGame does
  const restoredState = gameStorage.loadGameState(4);
  assert.ok(restoredState);
  assert.strictEqual(restoredState.score, 512);
  assert.strictEqual(restoredState.size, 4);
  assert.strictEqual(restoredState.board[2][0], 512);

  const restoredBestScore = gameStorage.getBestScore(4);
  assert.strictEqual(restoredBestScore, 512);

  // Achieving a higher score updates the persisted best
  assert.strictEqual(gameStorage.saveBestScore(4, 1024), true);
  assert.strictEqual(gameStorage.getBestScore(4), 1024);

  // Clearing game state on restart keeps the best score intact
  gameStorage.clearGameState(4);
  assert.strictEqual(gameStorage.loadGameState(4), null);
  assert.strictEqual(gameStorage.getBestScore(4), 1024);

  // Cleanup
  gameStorage.clearGameState(4);
  localStorage.removeItem("cradle_2048_best_score_4");
});

test("2048 storage handles default arguments and legacy keys gracefully", () => {
  const gameStorage = require("../projects/games/2048-game/storage.js");

  localStorage.removeItem("cradle_2048_best_score_4");
  localStorage.removeItem("2048_best_score_4");

  // Default size 4 when omitted
  assert.strictEqual(gameStorage.saveBestScore(100), true);
  assert.strictEqual(gameStorage.getBestScore(), 100);

  // Legacy key fallback
  localStorage.removeItem("cradle_2048_best_score_4");
  localStorage.setItem("2048_best_score_4", "768");
  assert.strictEqual(gameStorage.getBestScore(4), 768);

  // Cleanup
  localStorage.removeItem("cradle_2048_best_score_4");
  localStorage.removeItem("2048_best_score_4");
});
