const test = require("node:test");
const assert = require("node:assert");
const visualizerEngine = require("../projects/misc/sound-wave-visualizer/visualizerEngine.js");
const presetsEngine = require("../projects/misc/sound-wave-visualizer/audioPresetsEngine.js");

test("calculatePeakLevel evaluates maximum amplitude accurately", () => {
  const quietData = new Uint8Array([128, 128, 128, 128]);
  assert.strictEqual(visualizerEngine.calculatePeakLevel(quietData), 0);

  const loudData = new Uint8Array([128, 255, 0, 128]);
  assert.strictEqual(visualizerEngine.calculatePeakLevel(loudData), 1);
});

test("calculateFrequencyBands divides frequency spectrum into logarithmic bins", () => {
  const mockFreqs = new Uint8Array(256);
  for (let i = 0; i < 256; i++) mockFreqs[i] = i;

  const bands = visualizerEngine.calculateFrequencyBands(mockFreqs, 8);
  assert.strictEqual(bands.length, 8);
  assert.ok(
    bands.every(val => typeof val === "number" && val >= 0 && val <= 1)
  );
});

test("calculateRadialBar computes circular endpoint coordinates", () => {
  const bar = visualizerEngine.calculateRadialBar(0, 4, 100, 50, 200, 200);
  assert.strictEqual(bar.startX, 300); // 200 + 100 * cos(0)
  assert.strictEqual(bar.endX, 350); // 200 + 150 * cos(0)
});

test("audioPresetsEngine converts musical MIDI note numbers to Hz frequencies", () => {
  const a4 = presetsEngine.calculateFrequencyFromNote(69);
  assert.strictEqual(Math.round(a4), 440);

  const presets = presetsEngine.getPresets();
  assert.ok(presets.length >= 4);
});
