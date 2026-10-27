const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getHighScore,
  saveHighScore,
} = require("../projects/games/memory-flip-game/utils");
const { setupLocalStorageMock } = require("./helpers/localstorage-mock");

setupLocalStorageMock();

test("high score management saves and retrieves correct scores", () => {
  localStorage.clear();

  // Initial high score should be null
  assert.equal(getHighScore("standard"), null);

  // Save first score
  const isNewRecord = saveHighScore(45, "standard");
  assert.equal(isNewRecord, true);
  assert.equal(getHighScore("standard"), 45);

  // Save worse score - should not update or return true
  const isNewRecord2 = saveHighScore(50, "standard");
  assert.equal(isNewRecord2, false);
  assert.equal(getHighScore("standard"), 45);

  // Save better score - should update
  const isNewRecord3 = saveHighScore(38, "standard");
  assert.equal(isNewRecord3, true);
  assert.equal(getHighScore("standard"), 38);
});

test("challenge mode high score is saved separately from standard", () => {
  localStorage.clear();

  saveHighScore(40, "standard");
  saveHighScore(25, "challenge");

  assert.equal(getHighScore("standard"), 40);
  assert.equal(getHighScore("challenge"), 25);
});

test("high score management enforces numeric bounds and rejects invalid inputs", () => {
  localStorage.clear();

  // Reject zero, negative, NaN, Infinity, non-integer, and excessively large scores
  assert.equal(saveHighScore(0, "standard"), false);
  assert.equal(saveHighScore(-15, "standard"), false);
  assert.equal(saveHighScore(NaN, "standard"), false);
  assert.equal(saveHighScore(Infinity, "standard"), false);
  assert.equal(saveHighScore(12.5, "standard"), false);
  assert.equal(saveHighScore("invalid", "standard"), false);
  assert.equal(saveHighScore(9999999, "standard"), false);

  assert.equal(getHighScore("standard"), null);

  // Corrupted persisted score in localStorage is safely ignored
  localStorage.setItem("cradle_memory_flip_high_score", "-50");
  assert.equal(getHighScore("standard"), null);

  localStorage.setItem("cradle_memory_flip_high_score", "not_a_number");
  assert.equal(getHighScore("standard"), null);
});
