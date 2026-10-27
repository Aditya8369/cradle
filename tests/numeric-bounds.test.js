"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const storage = require("../src/components/ui/storage.js");
const cannonStorage = require("../projects/games/cannon-shooting/cannonStorage.js");
const cannonEngine = require("../projects/games/cannon-shooting/cannonEngine.js");
const rpsStorage = require("../projects/games/stone-paper-scissors-game/rpsStorage.js");
const game2048Storage = require("../projects/games/2048-game/storage.js");
const memoryFlipUtils = require("../projects/games/memory-flip-game/utils.js");
const { setupLocalStorageMock } = require("./helpers/localstorage-mock.js");

setupLocalStorageMock();

test("storage.clampNumber handles edge cases and invalid numeric types", () => {
  // Boundary cases
  assert.equal(storage.clampNumber(0, 0, 100), 0);
  assert.equal(storage.clampNumber(100, 0, 100), 100);
  assert.equal(storage.clampNumber(-0.001, 0, 100), 0);
  assert.equal(storage.clampNumber(100.001, 0, 100), 100);

  // String numeric inputs
  assert.equal(storage.clampNumber("75", 0, 100), 75);
  assert.equal(storage.clampNumber("-20", 0, 100), 0);
  assert.equal(storage.clampNumber("999", 0, 100), 100);

  // Non-numeric or empty string inputs fall back
  assert.equal(storage.clampNumber("", 0, 100, 5), 5);
  assert.equal(storage.clampNumber("   ", 0, 100, 5), 5);
  assert.equal(storage.clampNumber(null, 0, 100, 5), 5);
  assert.equal(storage.clampNumber(undefined, 0, 100, 5), 5);
  assert.equal(storage.clampNumber(false, 0, 100, 5), 5);
  assert.equal(storage.clampNumber(true, 0, 100, 5), 5);
  assert.equal(storage.clampNumber(NaN, 0, 100, 5), 5);
  assert.equal(storage.clampNumber(Infinity, 0, 100, 100), 100);
  assert.equal(storage.clampNumber(-Infinity, 0, 100, 0), 0);
  assert.equal(storage.clampNumber({}, 0, 100, 5), 5);
  assert.equal(storage.clampNumber([], 0, 100, 5), 5);
});

test("storage.validateBoundedNumber correctly validates integer and bounds rules", () => {
  // Default bounds [0, MAX_SAFE_INTEGER]
  assert.equal(storage.validateBoundedNumber(0), true);
  assert.equal(storage.validateBoundedNumber(Number.MAX_SAFE_INTEGER), true);
  assert.equal(storage.validateBoundedNumber(-1), false);
  assert.equal(storage.validateBoundedNumber(Number.MAX_SAFE_INTEGER + 100), false);

  // Explicit min and max
  assert.equal(
    storage.validateBoundedNumber(5, { min: 1, max: 10 }),
    true
  );
  assert.equal(
    storage.validateBoundedNumber(0, { min: 1, max: 10 }),
    false
  );
  assert.equal(
    storage.validateBoundedNumber(11, { min: 1, max: 10 }),
    false
  );

  // Integer requirement
  assert.equal(
    storage.validateBoundedNumber(4.2, { min: 0, max: 10, integer: false }),
    true
  );
  assert.equal(
    storage.validateBoundedNumber(4.2, { min: 0, max: 10, integer: true }),
    false
  );
  assert.equal(
    storage.validateBoundedNumber(4, { min: 0, max: 10, integer: true }),
    true
  );

  // Strings and invalid values
  assert.equal(storage.validateBoundedNumber("10", { min: 0, max: 20 }), true);
  assert.equal(storage.validateBoundedNumber("abc", { min: 0, max: 20 }), false);
  assert.equal(storage.validateBoundedNumber(null, { min: 0, max: 20 }), false);
  assert.equal(storage.validateBoundedNumber(NaN, { min: 0, max: 20 }), false);
});

test("storage.getNumber and storage.setNumber protect against corrupted storage", () => {
  localStorage.clear();

  // setNumber rejects invalid number
  assert.equal(
    storage.setNumber("level", -1, { min: 1, max: 50, integer: true }),
    false
  );
  assert.equal(storage.getNumber("level", 1), 1);

  // setNumber accepts valid number
  assert.equal(
    storage.setNumber("level", 10, { min: 1, max: 50, integer: true }),
    true
  );
  assert.equal(
    storage.getNumber("level", 1, { min: 1, max: 50, integer: true }),
    10
  );

  // External tamper: corrupted negative value
  localStorage.setItem("level", "-5");
  assert.equal(
    storage.getNumber("level", 1, { min: 1, max: 50, integer: true }),
    1
  );

  // External tamper: non-numeric string
  localStorage.setItem("level", "DROP TABLE users");
  assert.equal(
    storage.getNumber("level", 1, { min: 1, max: 50, integer: true }),
    1
  );

  // External tamper: overflow
  localStorage.setItem("level", "99999999999999999999999999999999");
  assert.equal(
    storage.getNumber("level", 1, { min: 1, max: 50, integer: true }),
    1
  );
});

test("Cannon Shooting applies bounds, handles overflow and maintains invariants", () => {
  localStorage.clear();

  // Test sanitizeStats with corrupted state
  const badStats = {
    score: -100,
    highScore: -50,
    currentStreak: -3,
    bestStreak: -1,
    totalHits: 500,
    totalShots: 20, // Hits cannot exceed shots
  };
  const clean = cannonStorage.sanitizeStats(badStats);
  assert.equal(clean.score, 0);
  assert.equal(clean.highScore, 0);
  assert.equal(clean.currentStreak, 0);
  assert.equal(clean.bestStreak, 0);
  assert.equal(clean.totalShots, 20);
  assert.equal(clean.totalHits, 20); // Clamped to totalShots

  // Test recordShot with invalid numeric inputs
  let stats = cannonStorage.getInitialStats();
  stats = cannonStorage.recordShot(stats, true, -100, -5);
  assert.equal(stats.score, 0); // Negative score award rejected
  assert.equal(stats.currentStreak, 0); // Negative streak rejected

  // Test recordShot with excessive score award
  stats = cannonStorage.recordShot(stats, true, 5000000, 2);
  assert.equal(stats.score, 1000000); // Clamped to safe award cap

  // Test calculateScore bounds
  assert.equal(cannonEngine.calculateScore(false, 10).scoreAwarded, 0);
  assert.equal(cannonEngine.calculateScore(true, -5).newStreak, 1);
  assert.equal(cannonEngine.calculateScore(true, 1000).multiplier, 5);
});

test("RPS storage validates persisted stats and maintains streak invariants", () => {
  localStorage.clear();

  const malformed = {
    wins: -10,
    losses: "bad",
    ties: null,
    currentStreak: 25,
    bestStreak: 10, // Best streak cannot be lower than current streak
    moveCounts: { rock: -5, paper: "hello" },
  };

  const sanitized = rpsStorage.sanitizeStats(malformed);
  assert.equal(sanitized.wins, 0);
  assert.equal(sanitized.losses, 0);
  assert.equal(sanitized.ties, 0);
  assert.equal(sanitized.currentStreak, 25);
  assert.equal(sanitized.bestStreak, 25); // Invariant normalized
  assert.equal(sanitized.moveCounts.rock, 0);
  assert.equal(sanitized.moveCounts.paper, 0);
});

test("2048 storage enforces score bounds and validates board sizes", () => {
  localStorage.clear();

  // Grid sizes must be integers between 3 and 8
  assert.equal(game2048Storage.saveBestScore(2, 500), false);
  assert.equal(game2048Storage.saveBestScore(9, 500), false);
  assert.equal(game2048Storage.saveBestScore(4, 500), true);

  // Score must be non-negative integer within MAX_SAFE_INTEGER
  assert.equal(game2048Storage.saveBestScore(4, -1), false);
  assert.equal(game2048Storage.saveBestScore(4, NaN), false);
  assert.equal(game2048Storage.saveBestScore(4, Infinity), false);
  assert.equal(game2048Storage.saveBestScore(4, "not_a_number"), false);
  assert.equal(
    game2048Storage.saveBestScore(4, Number.MAX_SAFE_INTEGER + 1000),
    false
  );

  // Stored corrupted score
  localStorage.setItem("cradle_2048_best_score_4", "-999");
  assert.equal(game2048Storage.getBestScore(4), 0);

  localStorage.setItem("cradle_2048_best_score_4", "NaN");
  assert.equal(game2048Storage.getBestScore(4), 0);
});

test("Memory Flip Game rejects non-positive, NaN, and excessive scores", () => {
  localStorage.clear();

  // In memory flip, score is flip count/time and must be >= 1
  assert.equal(memoryFlipUtils.saveHighScore(0, "standard"), false);
  assert.equal(memoryFlipUtils.saveHighScore(-5, "standard"), false);
  assert.equal(memoryFlipUtils.saveHighScore(NaN, "standard"), false);
  assert.equal(memoryFlipUtils.saveHighScore(Infinity, "standard"), false);
  assert.equal(memoryFlipUtils.saveHighScore(2000000, "standard"), false);

  // Valid score
  assert.equal(memoryFlipUtils.saveHighScore(24, "standard"), true);
  assert.equal(memoryFlipUtils.getHighScore("standard"), 24);

  // Worse score rejected
  assert.equal(memoryFlipUtils.saveHighScore(30, "standard"), false);
  assert.equal(memoryFlipUtils.getHighScore("standard"), 24);

  // Corrupted negative score in storage
  localStorage.setItem("cradle_memory_flip_high_score", "-10");
  assert.equal(memoryFlipUtils.getHighScore("standard"), null);
});
