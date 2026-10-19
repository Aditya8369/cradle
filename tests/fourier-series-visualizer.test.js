/**
 * Unit tests for Fourier Series Visualizer — fourierEngine.js
 *
 * Tests are designed to be run with Node.js (no browser required):
 *   node tests/fourier-series-visualizer.test.js
 *
 * Or via the project's test suite:
 *   npm test
 */

const {
  fourierCoeff,
  computeWaveform,
  sampleAt,
  buildProgressiveFrames,
  normalise,
} = require("../projects/math/fourier-series-visualizer/fourierEngine.js");

/* ──── Test utilities ─────────────────────────────────────────────── */
let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${msg}`);
  }
}

function assertClose(actual, expected, tolerance, msg) {
  const ok = Math.abs(actual - expected) <= tolerance;
  if (ok) {
    passed++;
  } else {
    failed++;
    console.error(
      `  ✗ FAIL: ${msg} — expected ${expected} ± ${tolerance}, got ${actual}`
    );
  }
}

function assertArrayLen(arr, len, msg) {
  assert(arr.length === len, `${msg} (length: ${arr.length}, expected ${len})`);
}

function heading(title) {
  console.log(`\n  ${title}`);
}

/* ──── Tests ──────────────────────────────────────────────────────── */

// ── fourierCoeff ──
heading("fourierCoeff");

// Sine wave
assertClose(fourierCoeff("sine", 1).b, 1, 1e-10, "sine n=1 b=1");
assertClose(fourierCoeff("sine", 1).a, 0, 1e-10, "sine n=1 a=0");
assertClose(fourierCoeff("sine", 2).b, 0, 1e-10, "sine n=2 b=0");
assertClose(fourierCoeff("sine", 3).b, 0, 1e-10, "sine n=3 b=0");

// Square wave — odd harmonics
assertClose(
  fourierCoeff("square", 1).b,
  4 / Math.PI,
  1e-10,
  "square n=1 b=4/π"
);
assertClose(fourierCoeff("square", 2).b, 0, 1e-10, "square n=2 b=0");
assertClose(
  fourierCoeff("square", 3).b,
  4 / (3 * Math.PI),
  1e-10,
  "square n=3 b=4/(3π)"
);
assertClose(fourierCoeff("square", 4).b, 0, 1e-10, "square n=4 b=0");
assertClose(
  fourierCoeff("square", 5).b,
  4 / (5 * Math.PI),
  1e-10,
  "square n=5 b=4/(5π)"
);
assert(fourierCoeff("square", 1).a === 0, "square a=0 always");

// Sawtooth wave — all harmonics
assertClose(
  fourierCoeff("sawtooth", 1).b,
  2 / Math.PI,
  1e-10,
  "sawtooth n=1 b=2/π"
);
assertClose(
  fourierCoeff("sawtooth", 2).b,
  -2 / (2 * Math.PI),
  1e-10,
  "sawtooth n=2 b=-2/(2π)"
);
assertClose(
  fourierCoeff("sawtooth", 3).b,
  2 / (3 * Math.PI),
  1e-10,
  "sawtooth n=3 b=2/(3π)"
);
assertClose(fourierCoeff("sawtooth", 1).a, 0, 1e-10, "sawtooth a=0 always");

// Triangle wave — odd harmonics, alternating sign
assertClose(
  fourierCoeff("triangle", 1).b,
  8 / (Math.PI * Math.PI),
  1e-10,
  "triangle n=1 b=8/π²"
);
assertClose(fourierCoeff("triangle", 2).b, 0, 1e-10, "triangle n=2 b=0");
assertClose(
  fourierCoeff("triangle", 3).b,
  (8 * -1) / (9 * Math.PI * Math.PI),
  1e-10,
  "triangle n=3 b=-8/(9π²)"
);
assertClose(fourierCoeff("triangle", 4).b, 0, 1e-10, "triangle n=4 b=0");
assertClose(fourierCoeff("triangle", 1).a, 0, 1e-10, "triangle a=0 always");

// Unknown wave type
assertClose(
  fourierCoeff("unknown", 1).b,
  0,
  1e-10,
  "unknown wave returns zeros"
);

// ── computeWaveform ──
heading("computeWaveform");

const sampleRate = 10;
const duration = 1;

// Sine, 1 harmonic → should produce a single sine cycle
const sineResult = computeWaveform("sine", 1, 1, sampleRate, duration);
assertArrayLen(
  sineResult.time,
  sampleRate * duration,
  "sine time array length"
);
assertArrayLen(
  sineResult.samples,
  sampleRate * duration,
  "sine sample array length"
);
assertClose(sineResult.samples[0], 0, 1e-10, "sine starts at 0");
assertClose(
  sineResult.samples[Math.floor(sampleRate / 4)],
  1,
  0.1,
  "sine peaks at 1 (quarter cycle)"
);
assertClose(
  sineResult.samples[Math.floor(sampleRate / 2)],
  0,
  0.1,
  "sine crosses 0 at half cycle"
);

// Harmonics array
assert(sineResult.harmonics.length > 0, "sine has at least 1 harmonic entry");
assert(sineResult.harmonics[0].n === 1, "first harmonic is n=1");
assertArrayLen(
  sineResult.harmonics[0].samples,
  sampleRate * duration,
  "harmonic sample length"
);

// Active filter: exclude all → samples should be 0
const filtered = computeWaveform(
  "square",
  5,
  1,
  sampleRate,
  duration,
  () => false
);
let allZero = true;
for (let i = 0; i < filtered.samples.length; i++) {
  if (Math.abs(filtered.samples[i]) > 1e-10) {
    allZero = false;
    break;
  }
}
assert(allZero, "active filter returning false produces zero waveform");

// ── sampleAt ──
heading("sampleAt");

assertClose(sampleAt("sine", 1, 1, 0), 0, 1e-10, "sampleAt sine t=0 = 0");
assertClose(sampleAt("sine", 1, 1, 0.25), 1, 0.1, "sampleAt sine t=0.25 ≈ 1");

// ── buildProgressiveFrames ──
heading("buildProgressiveFrames");

const frames = buildProgressiveFrames("square", 3, 1, sampleRate, duration);
assertArrayLen(frames, 3, "3 progressive frames for 3 harmonics");
assert(frames[0].step === 1, "frame 0 step=1");
assert(frames[1].step === 2, "frame 1 step=2");
assert(frames[2].step === 3, "frame 2 step=3");
assertArrayLen(
  frames[0].samples,
  sampleRate * duration,
  "frame 0 sample length"
);
assertArrayLen(
  frames[2].samples,
  sampleRate * duration,
  "frame 2 sample length"
);

// Progressive build: adding more harmonics should change the waveform
// (Frame 1 has only n=1, frame 3 has n=1+2+3, so they differ)
let differs = false;
for (let i = 0; i < frames[0].samples.length; i++) {
  if (Math.abs(frames[0].samples[i] - frames[2].samples[i]) > 1e-10) {
    differs = true;
    break;
  }
}
assert(differs, "waveform changes as harmonics are added");

// ── normalise ──
heading("normalise");

const constArray = new Float64Array([2, 2, 2]);
const normConst = normalise(constArray);
assertClose(normConst[0], 1, 1e-10, "normalise constant array to 1");
assertClose(normConst[1], 1, 1e-10, "normalise constant[1] to 1");
assert(normConst instanceof Float64Array, "normalise returns Float64Array");

const mixedArray = new Float64Array([-3, 0, 1.5]);
const normMixed = normalise(mixedArray);
assertClose(normMixed[0], -1, 1e-10, "normalise mixed[0] to -1");
assertClose(normMixed[1], 0, 1e-10, "normalise mixed[1] to 0");
assertClose(normMixed[2], 0.5, 1e-10, "normalise mixed[2] to 0.5");

// Empty (all zeros) → should remain zeros
const zeroArray = new Float64Array([0, 0, 0]);
const normZero = normalise(zeroArray);
assert(normZero[0] === 0, "normalise zero array returns zeros");

/* ──── Summary ────────────────────────────────────────────────────── */
console.log(`\n────────────────────────────────────────`);
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log(`────────────────────────────────────────\n`);
process.exit(failed > 0 ? 1 : 0);
