const test = require("node:test");
const assert = require("node:assert/strict");
const {
  determineWinner,
} = require("../projects/games/stone-paper-scissors-game/game-engine");

test("RPS classic rules evaluate correctly", () => {
  // Rock beats scissors
  assert.deepStrictEqual(determineWinner("rock", "scissors"), {
    outcome: "player",
    message: "Rock crushes Scissors! You win!",
  });

  // Paper loses to scissors
  assert.deepStrictEqual(determineWinner("paper", "scissors"), {
    outcome: "computer",
    message: "Scissors cuts Paper! Computer wins!",
  });

  // Rock ties with rock
  assert.deepStrictEqual(determineWinner("rock", "rock"), {
    outcome: "tie",
    message: "It's a tie!",
  });
});

test("RPS Lizard Spock rules evaluate correctly", () => {
  // Spock vaporizes Rock
  assert.deepStrictEqual(determineWinner("spock", "rock"), {
    outcome: "player",
    message: "Spock vaporizes Rock! You win!",
  });

  // Lizard poisons Spock
  assert.deepStrictEqual(determineWinner("lizard", "spock"), {
    outcome: "player",
    message: "Lizard poisons Spock! You win!",
  });

  // Spock loses to Paper
  assert.deepStrictEqual(determineWinner("spock", "paper"), {
    outcome: "computer",
    message: "Paper disproves Spock! Computer wins!",
  });
});

test("rpsStorage bounds counters and sanitizes corrupted state", () => {
  const rpsStorage = require("../projects/games/stone-paper-scissors-game/rpsStorage");

  const corrupted = {
    wins: -5,
    losses: NaN,
    ties: "invalid",
    currentStreak: -2,
    bestStreak: -10,
    moveCounts: { rock: -1, paper: 1e30, scissors: NaN },
  };

  const sanitized = rpsStorage.sanitizeStats(corrupted);
  assert.equal(sanitized.wins, 0);
  assert.equal(sanitized.losses, 0);
  assert.equal(sanitized.ties, 0);
  assert.equal(sanitized.currentStreak, 0);
  assert.equal(sanitized.bestStreak, 0);
  assert.equal(sanitized.moveCounts.rock, 0);
  assert.equal(sanitized.moveCounts.scissors, 0);
  assert.ok(sanitized.moveCounts.paper <= Number.MAX_SAFE_INTEGER);

  // When currentStreak is higher than bestStreak, bestStreak is normalized
  const streakMismatch = {
    currentStreak: 15,
    bestStreak: 5,
  };
  const sanitizedStreak = rpsStorage.sanitizeStats(streakMismatch);
  assert.equal(sanitizedStreak.currentStreak, 15);
  assert.equal(sanitizedStreak.bestStreak, 15);
});
