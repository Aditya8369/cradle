const test = require("node:test");
const assert = require("node:assert");
const aiModule = require("../projects/games/stone-paper-scissors-game/rpsAiEngine.js");
const storageModule = require("../projects/games/stone-paper-scissors-game/rpsStorage.js");
const {
  RULES,
} = require("../projects/games/stone-paper-scissors-game/game-engine.js");

test("RPS AI Engine records moves and predicts repeated patterns", () => {
  const ai = aiModule.createAiModel(["rock", "paper", "scissors"]);

  // Train AI on repeated sequence: player always plays 'rock' after 'scissors'
  for (let i = 0; i < 5; i++) {
    ai.recordMove("scissors");
    ai.recordMove("rock");
  }
  ai.recordMove("scissors");

  // Next move prediction after 'scissors' should be 'rock'
  const prediction = ai.predictNextPlayerMove();
  assert.strictEqual(prediction, "rock");

  // Counter against 'rock' should be 'paper' or 'spock'
  const counter = ai.getOptimalCounter(RULES);
  assert.ok(["paper", "spock"].includes(counter));
});

test("RPS Storage records match outcomes and updates streaks", () => {
  storageModule.resetStats();

  const winStats = storageModule.recordOutcome("player", "rock");
  assert.strictEqual(winStats.wins, 1);
  assert.strictEqual(winStats.currentStreak, 1);
  assert.strictEqual(winStats.bestStreak, 1);
  assert.strictEqual(winStats.moveCounts.rock, 1);

  const lossStats = storageModule.recordOutcome("computer", "paper");
  assert.strictEqual(lossStats.losses, 1);
  assert.strictEqual(lossStats.currentStreak, 0);
  assert.strictEqual(lossStats.bestStreak, 1);
});
