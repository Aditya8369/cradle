import { test } from "node:test";
import assert from "node:assert/strict";
import MorseEngine from "../projects/misc/morse-code-studio/morseEngine.js";

test("textToMorse converts plain text to standard morse representation", () => {
  assert.equal(MorseEngine.textToMorse("SOS"), "... --- ...");
  assert.equal(
    MorseEngine.textToMorse("Hello World"),
    ".... . .-.. .-.. --- / .-- --- .-. .-.. -.."
  );
});

test("morseToText decodes morse signals back to uppercase text", () => {
  assert.equal(MorseEngine.morseToText("... --- ..."), "SOS");
  assert.equal(
    MorseEngine.morseToText(".... . .-.. .-.. --- / .-- --- .-. .-.. -.."),
    "HELLO WORLD"
  );
});

test("getDitDurationMs computes duration correctly based on WPM speed", () => {
  // 1200 / 20 = 60ms
  assert.equal(MorseEngine.getDitDurationMs(20), 60);
  // 1200 / 12 = 100ms
  assert.equal(MorseEngine.getDitDurationMs(12), 100);
});

test("generateAudioSequence builds alternating tone and pause events", () => {
  const sequence = MorseEngine.generateAudioSequence(".", 20, 600);
  assert.equal(sequence.length, 1);
  assert.equal(sequence[0].type, "tone");
  assert.equal(sequence[0].durationMs, 60);
});
