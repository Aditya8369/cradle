const test = require("node:test");
const assert = require("node:assert/strict");
const CannonEngine = require("../projects/games/cannon-shooting/cannonEngine");
const CannonStorage = require("../projects/games/cannon-shooting/cannonStorage");

test("Degree to radian conversion", () => {
  assert.equal(CannonEngine.degToRad(0), 0);
  assert.equal(CannonEngine.degToRad(180), Math.PI);
  assert.equal(CannonEngine.degToRad(90), Math.PI / 2);
});

test("Ball mileage trajectory calculations", () => {
  const cmCanX = 5;
  const cmCanAngle = 0; // cos(0) = 1
  const mileage0 = CannonEngine.calculateBallMileage(cmCanX, cmCanAngle);
  assert.equal(mileage0, 9.23);

  const cmCanAngle45 = 45;
  const mileage45 = CannonEngine.calculateBallMileage(cmCanX, cmCanAngle45);
  const expected = (5 + 4.23) / Math.cos(45 * (Math.PI / 180));
  assert.equal(Math.abs(mileage45 - expected) < 0.00001, true);
});

test("Hit tolerance window validations", () => {
  const userCanX = 188.95; // 5 * 37.79
  const userCanY = 20;
  const comCanX = 188.95;
  const cmCanAngle = 20;

  // Direct hit
  assert.equal(
    CannonEngine.validateHit(userCanX, userCanY, comCanX, cmCanAngle),
    true
  );

  // X out of bounds
  assert.equal(
    CannonEngine.validateHit(userCanX, userCanY, comCanX + 10, cmCanAngle),
    false
  );

  // Angle out of bounds
  assert.equal(
    CannonEngine.validateHit(userCanX, userCanY, comCanX, cmCanAngle + 5),
    false
  );
});

test("Score multiplier and streak calculation", () => {
  const miss = CannonEngine.calculateScore(false, 3);
  assert.equal(miss.scoreAwarded, 0);
  assert.equal(miss.newStreak, 0);
  assert.equal(miss.multiplier, 1);

  const hit1 = CannonEngine.calculateScore(true, 0);
  assert.equal(hit1.scoreAwarded, 100);
  assert.equal(hit1.newStreak, 1);
  assert.equal(hit1.multiplier, 1);

  const hit4 = CannonEngine.calculateScore(true, 3);
  assert.equal(hit4.scoreAwarded, 200); // 1 + floor(3/3) = 2x multiplier
  assert.equal(hit4.newStreak, 4);
  assert.equal(hit4.multiplier, 2);
});

test("Storage stats recording and persistence logic", () => {
  let stats = CannonStorage.getInitialStats();
  assert.equal(stats.score, 0);
  assert.equal(stats.currentStreak, 0);

  // Record successful hit
  stats = CannonStorage.recordShot(stats, true, 100, 1);
  assert.equal(stats.score, 100);
  assert.equal(stats.highScore, 100);
  assert.equal(stats.currentStreak, 1);
  assert.equal(stats.totalHits, 1);

  // Record miss
  stats = CannonStorage.recordShot(stats, false);
  assert.equal(stats.score, 100);
  assert.equal(stats.currentStreak, 0);
  assert.equal(stats.bestStreak, 1);
  assert.equal(stats.totalShots, 2);
});

test("Cannon storage applies numeric bounds and sanitizes corrupted state", () => {
  // Corrupted saved state with negative values, NaN, and hits exceeding shots
  const corrupted = {
    score: -50,
    highScore: -100,
    currentStreak: NaN,
    bestStreak: -5,
    totalHits: 999,
    totalShots: 10,
  };

  const sanitized = CannonStorage.sanitizeStats(corrupted);
  assert.equal(sanitized.score, 0);
  assert.equal(sanitized.highScore, 0);
  assert.equal(sanitized.currentStreak, 0);
  assert.equal(sanitized.bestStreak, 0);
  assert.equal(sanitized.totalShots, 10);
  assert.equal(sanitized.totalHits, 10); // clamped to totalShots
});

test("Cannon recordShot rejects invalid numeric inputs and prevents score overflow", () => {
  let stats = CannonStorage.getInitialStats();

  // Passing negative scoreAwarded or NaN streak should be safely handled
  stats = CannonStorage.recordShot(stats, true, -500, -10);
  assert.equal(stats.score, 0);
  assert.equal(stats.currentStreak, 0);

  // Excessive score award is safely bounded
  stats = CannonStorage.recordShot(stats, true, 2000000, 5);
  assert.equal(stats.score, 1000000);
  assert.equal(stats.currentStreak, 5);
});

test("Cannon calculateScore handles invalid or excessively large streak numbers", () => {
  const resNegative = CannonEngine.calculateScore(true, -10);
  assert.equal(resNegative.newStreak, 1);
  assert.equal(resNegative.scoreAwarded, 100);

  const resHuge = CannonEngine.calculateScore(true, 1000000);
  assert.equal(resHuge.multiplier, 5);
});
