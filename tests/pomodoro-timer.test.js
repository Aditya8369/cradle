const test = require("node:test");
const assert = require("node:assert/strict");

const {
  calculateRemainingSeconds,
  computeTargetEndTime,
  syncTimerOnVisibilityChange,
  formatTime,
} = require("../projects/productivity/pomodoro-timer/script.js");

test("formatTime formats seconds into MM:SS padded string", () => {
  assert.equal(formatTime(0), "00:00");
  assert.equal(formatTime(5), "00:05");
  assert.equal(formatTime(59), "00:59");
  assert.equal(formatTime(60), "01:00");
  assert.equal(formatTime(65), "01:05");
  assert.equal(formatTime(1500), "25:00");
  assert.equal(formatTime(-10), "00:00");
  assert.equal(formatTime(null), "00:00");
});

test("computeTargetEndTime calculates target timestamp accurately", () => {
  const baseTime = 1700000000000;
  assert.equal(computeTargetEndTime(60, baseTime), baseTime + 60000);
  assert.equal(computeTargetEndTime(0, baseTime), baseTime);
  assert.equal(computeTargetEndTime(-5, baseTime), baseTime);
});

test("calculateRemainingSeconds calculates remaining seconds accurately", () => {
  const baseTime = 1700000000000;
  const endTime = baseTime + 60000; // 60 seconds

  // At start
  assert.equal(calculateRemainingSeconds(endTime, baseTime), 60);

  // After 10.5 seconds elapsed (49.5 seconds left) -> Math.ceil gives 50s
  assert.equal(calculateRemainingSeconds(endTime, baseTime + 10500), 50);

  // After 30 seconds elapsed (30 seconds left)
  assert.equal(calculateRemainingSeconds(endTime, baseTime + 30000), 30);

  // Exactly at end
  assert.equal(calculateRemainingSeconds(endTime, endTime), 0);

  // Past end (should clamp to 0, not negative)
  assert.equal(calculateRemainingSeconds(endTime, endTime + 5000), 0);

  // Invalid / null endTime safely returns 0
  assert.equal(calculateRemainingSeconds(null, baseTime), 0);
  assert.equal(calculateRemainingSeconds(undefined, baseTime), 0);
  assert.equal(calculateRemainingSeconds("invalid", baseTime), 0);
});

test("syncTimerOnVisibilityChange handles idle/paused state gracefully", () => {
  const baseTime = 1700000000000;

  // Not running
  const idle = syncTimerOnVisibilityChange({
    endTime: baseTime + 60000,
    now: baseTime + 30000,
    isRunning: false,
  });
  assert.equal(idle.remaining, null);
  assert.equal(idle.shouldComplete, false);

  // Running but null endTime
  const noEnd = syncTimerOnVisibilityChange({
    endTime: null,
    now: baseTime + 30000,
    isRunning: true,
  });
  assert.equal(noEnd.remaining, null);
  assert.equal(noEnd.shouldComplete, false);
});

test("Issue #1000 - Background tab throttling drift prevention (30 seconds away)", () => {
  const startTime = 1700000000000;
  const initialDurationSec = 60; // 60-second timer
  const endTime = computeTargetEndTime(initialDurationSec, startTime);

  // Simulating user switching to another tab for 30 real seconds:
  // In a naive setInterval throttled to fire e.g. only 3 times, tick count would show 57s remaining.
  // With Page Visibility API & timestamp synchronization:
  const returnTime = startTime + 30000; // 30 real wall-clock seconds later
  const sync = syncTimerOnVisibilityChange({
    endTime,
    now: returnTime,
    isRunning: true,
  });

  assert.equal(
    sync.remaining,
    30,
    "Timer must reflect exact 30s remaining after 30s in background tab"
  );
  assert.equal(sync.shouldComplete, false);
});

test("Issue #1000 - Background tab expiration triggers completion on tab return", () => {
  const startTime = 1700000000000;
  const initialDurationSec = 25; // 25-second countdown
  const endTime = computeTargetEndTime(initialDurationSec, startTime);

  // User stays away on another tab for 45 real seconds (longer than timer duration)
  const returnTime = startTime + 45000;
  const sync = syncTimerOnVisibilityChange({
    endTime,
    now: returnTime,
    isRunning: true,
  });

  assert.equal(sync.remaining, 0, "Remaining seconds must clamp to 0");
  assert.equal(
    sync.shouldComplete,
    true,
    "shouldComplete flag must be true when timer finishes in background"
  );
});

test("Pause and resume preserves remaining duration without drifting during idle tab switch", () => {
  const t0 = 1700000000000;
  let remaining = 60;
  let endTime = computeTargetEndTime(remaining, t0);
  let isRunning = true;

  // Run for 15 seconds
  const t1 = t0 + 15000;
  remaining = calculateRemainingSeconds(endTime, t1);
  assert.equal(remaining, 45);

  // User pauses timer at 15s elapsed (45s left)
  isRunning = false;
  endTime = null;

  // Tab is left in background for 120 seconds while paused
  const t2 = t1 + 120000;
  const syncWhilePaused = syncTimerOnVisibilityChange({
    endTime,
    now: t2,
    isRunning,
  });
  assert.equal(
    syncWhilePaused.remaining,
    null,
    "Paused timer must not change remaining duration"
  );

  // User resumes timer at t2
  isRunning = true;
  endTime = computeTargetEndTime(remaining, t2);

  // 10 seconds later
  const t3 = t2 + 10000;
  const syncAfterResume = syncTimerOnVisibilityChange({
    endTime,
    now: t3,
    isRunning,
  });
  assert.equal(
    syncAfterResume.remaining,
    35,
    "Resumed timer continues counting down from 45s without drift"
  );
  assert.equal(syncAfterResume.shouldComplete, false);
});

test("Simulating uneven throttled intervals maintains absolute wall-clock accuracy", () => {
  const t0 = 1700000000000;
  const endTime = computeTargetEndTime(60, t0);

  // Interval ticks fire with erratic jitter due to background throttling:
  // tick 1 at +1200ms
  assert.equal(calculateRemainingSeconds(endTime, t0 + 1200), 59);
  // tick 2 at +3800ms
  assert.equal(calculateRemainingSeconds(endTime, t0 + 3800), 57);
  // tick 3 at +12000ms (browser throttled heavily)
  assert.equal(calculateRemainingSeconds(endTime, t0 + 12000), 48);
  // tick 4 at +59900ms
  assert.equal(calculateRemainingSeconds(endTime, t0 + 59900), 1);
  // tick 5 at +60000ms
  assert.equal(calculateRemainingSeconds(endTime, t0 + 60000), 0);
  // tick 6 at +61500ms
  assert.equal(calculateRemainingSeconds(endTime, t0 + 61500), 0);
});
