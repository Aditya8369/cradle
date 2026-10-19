const test = require("node:test");
const assert = require("node:assert");
const undoManagerModule = require("../projects/games/2048-game/gameUndoManager.js");
const themeEngineModule = require("../projects/games/2048-game/gameThemeEngine.js");

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
