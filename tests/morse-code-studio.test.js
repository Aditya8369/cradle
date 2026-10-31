import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import MorseEngine from "../projects/misc/morse-code-studio/morseEngine.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const scriptSource = fs.readFileSync(
  path.join(__dirname, "../projects/misc/morse-code-studio/script.js"),
  "utf8"
);

function createStudioSandbox() {
  const listeners = {
    window: {},
    document: {},
  };

  let oscillatorStopped = false;
  let oscillatorDisconnected = false;
  let gainValuesCancelled = false;
  let gainDisconnected = false;
  let contextSuspended = false;
  let contextClosed = false;

  const mockOscillator = {
    type: "sine",
    frequency: { value: 650 },
    connect: () => {},
    disconnect: () => {
      oscillatorDisconnected = true;
    },
    start: () => {},
    stop: () => {
      oscillatorStopped = true;
    },
    addEventListener: (evt, fn) => {
      if (evt === "ended") {
        setTimeout(fn, 0);
      }
    },
  };

  const mockGain = {
    gain: {
      setValueAtTime: () => {},
      exponentialRampToValueAtTime: () => {},
      cancelScheduledValues: () => {
        gainValuesCancelled = true;
      },
    },
    connect: () => {},
    disconnect: () => {
      gainDisconnected = true;
    },
  };

  const mockAudioContext = {
    currentTime: 0,
    state: "running",
    createOscillator: () => mockOscillator,
    createGain: () => mockGain,
    suspend: async () => {
      contextSuspended = true;
      mockAudioContext.state = "suspended";
    },
    resume: async () => {
      mockAudioContext.state = "running";
    },
    close: async () => {
      contextClosed = true;
      mockAudioContext.state = "closed";
    },
    destination: {},
  };

  const mockElements = {
    inputText: { value: "SOS" },
    outputText: { value: "... --- ..." },
    decodeBtn: { addEventListener: () => {} },
    encodeBtn: { addEventListener: () => {} },
    clearBtn: { addEventListener: () => {} },
    copyBtn: { addEventListener: () => {}, textContent: "" },
    playBtn: {
      addEventListener: () => {},
      disabled: false,
      textContent: "▶ Play",
    },
    speedSlider: { value: "20", addEventListener: () => {} },
    speedValue: { textContent: "" },
  };

  const mockWindow = {
    AudioContext: function () {
      return mockAudioContext;
    },
    addEventListener: (evt, fn) => {
      listeners.window[evt] = listeners.window[evt] || [];
      listeners.window[evt].push(fn);
    },
  };

  const mockDocument = {
    hidden: false,
    getElementById: id => mockElements[id] || null,
    addEventListener: (evt, fn) => {
      listeners.document[evt] = listeners.document[evt] || [];
      listeners.document[evt].push(fn);
    },
  };

  const sandbox = {
    window: mockWindow,
    document: mockDocument,
    MorseEngine,
    setTimeout,
    clearTimeout,
    module: { exports: {} },
    console,
  };

  vm.createContext(sandbox);
  vm.runInContext(scriptSource, sandbox);

  return {
    sandbox,
    listeners,
    mockAudioContext,
    mockOscillator,
    mockGain,
    mockElements,
    getAudioFlags: () => ({
      get oscillatorStopped() {
        return oscillatorStopped;
      },
      get oscillatorDisconnected() {
        return oscillatorDisconnected;
      },
      get gainValuesCancelled() {
        return gainValuesCancelled;
      },
      get gainDisconnected() {
        return gainDisconnected;
      },
      get contextSuspended() {
        return contextSuspended;
      },
      get contextClosed() {
        return contextClosed;
      },
    }),
  };
}

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

test("stopAudio stops active oscillator, gain node, suspends context, and resets UI", () => {
  const env = createStudioSandbox();
  const { sandbox, mockAudioContext, mockElements, getAudioFlags } = env;
  const { module } = sandbox;
  const { stopAudio, setAudioContext, setIsPlaying } = module.exports;

  setAudioContext(mockAudioContext);
  setIsPlaying(true);
  mockElements.playBtn.disabled = true;
  mockElements.playBtn.textContent = "■ Playing...";

  // Simulate active oscillator and gain node
  const osc = mockAudioContext.createOscillator();
  const gain = mockAudioContext.createGain();
  module.exports.setActiveNodes(osc, gain);

  // Run stopAudio
  stopAudio();

  assert.equal(
    module.exports.getAudioState().isPlaying,
    false,
    "isPlaying should be false"
  );
  assert.equal(
    mockElements.playBtn.disabled,
    false,
    "playBtn should be enabled"
  );
  assert.equal(
    mockElements.playBtn.textContent,
    "▶ Play",
    "playBtn text should be reset"
  );
  assert.equal(
    getAudioFlags().oscillatorStopped,
    true,
    "active oscillator should be stopped"
  );
  assert.equal(
    getAudioFlags().oscillatorDisconnected,
    true,
    "active oscillator should be disconnected"
  );
  assert.equal(
    getAudioFlags().gainValuesCancelled,
    true,
    "gain values should be cancelled"
  );
  assert.equal(
    getAudioFlags().gainDisconnected,
    true,
    "active gain node should be disconnected"
  );
  assert.equal(
    getAudioFlags().contextSuspended,
    true,
    "audioContext should be suspended"
  );
});

test("pagehide event listener halts audio playback and closes AudioContext", () => {
  const env = createStudioSandbox();
  const { sandbox, listeners, mockAudioContext, mockElements, getAudioFlags } =
    env;
  const { module } = sandbox;
  const { setAudioContext, setIsPlaying } = module.exports;

  setAudioContext(mockAudioContext);
  setIsPlaying(true);
  mockElements.playBtn.disabled = true;

  assert.ok(
    listeners.window.pagehide && listeners.window.pagehide.length > 0,
    "pagehide listener should be registered"
  );

  // Trigger pagehide
  listeners.window.pagehide.forEach(fn => fn());

  assert.equal(
    module.exports.getAudioState().isPlaying,
    false,
    "Playback should stop on pagehide"
  );
  assert.equal(
    getAudioFlags().contextClosed,
    true,
    "AudioContext should close on pagehide"
  );
  assert.equal(mockElements.playBtn.disabled, false);
});

test("visibilitychange event listener halts audio playback when document is hidden", () => {
  const env = createStudioSandbox();
  const { sandbox, listeners, mockAudioContext, mockElements, getAudioFlags } =
    env;
  const { module } = sandbox;
  const { setAudioContext, setIsPlaying } = module.exports;

  setAudioContext(mockAudioContext);
  setIsPlaying(true);
  mockElements.playBtn.disabled = true;

  assert.ok(
    listeners.document.visibilitychange &&
      listeners.document.visibilitychange.length > 0,
    "visibilitychange listener should be registered"
  );

  // When visible, should not stop
  sandbox.document.hidden = false;
  listeners.document.visibilitychange.forEach(fn => fn());
  assert.equal(
    module.exports.getAudioState().isPlaying,
    true,
    "Playback should continue when document is visible"
  );

  // When hidden, should stop
  sandbox.document.hidden = true;
  listeners.document.visibilitychange.forEach(fn => fn());
  assert.equal(
    module.exports.getAudioState().isPlaying,
    false,
    "Playback should stop when document is hidden"
  );
  assert.equal(
    getAudioFlags().contextSuspended,
    true,
    "AudioContext should suspend when document is hidden"
  );
});

test("clicking Back to Home button stops playback and closes AudioContext", () => {
  const env = createStudioSandbox();
  const { sandbox, listeners, mockAudioContext, mockElements, getAudioFlags } =
    env;
  const { module } = sandbox;
  const { setAudioContext, setIsPlaying } = module.exports;

  setAudioContext(mockAudioContext);
  setIsPlaying(true);
  mockElements.playBtn.disabled = true;

  assert.ok(
    listeners.document.click && listeners.document.click.length > 0,
    "click listener should be registered on document"
  );

  const mockBackBtn = {
    matches: sel => sel.includes(".cradle-back-home"),
  };
  const mockClickEvent = {
    target: {
      closest: sel => (sel.includes(".cradle-back-home") ? mockBackBtn : null),
    },
  };

  listeners.document.click.forEach(fn => fn(mockClickEvent));

  assert.equal(
    module.exports.getAudioState().isPlaying,
    false,
    "Playback should stop on BackToHome click"
  );
  assert.equal(
    getAudioFlags().contextClosed,
    true,
    "AudioContext should close on BackToHome click"
  );
  assert.equal(mockElements.playBtn.disabled, false);
});

test("pointerdown on Back to Home button halts playback immediately in capture phase", () => {
  const env = createStudioSandbox();
  const { sandbox, listeners, mockAudioContext, mockElements, getAudioFlags } =
    env;
  const { module } = sandbox;
  const { setAudioContext, setIsPlaying } = module.exports;

  setAudioContext(mockAudioContext);
  setIsPlaying(true);
  mockElements.playBtn.disabled = true;

  assert.ok(
    listeners.document.pointerdown && listeners.document.pointerdown.length > 0,
    "pointerdown listener should be registered on document"
  );

  const mockBackBtn = {
    matches: sel => sel.includes(".cradle-back-home"),
  };
  const mockPointerEvent = {
    target: {
      closest: sel => (sel.includes(".cradle-back-home") ? mockBackBtn : null),
    },
  };

  listeners.document.pointerdown.forEach(fn => fn(mockPointerEvent));

  assert.equal(
    module.exports.getAudioState().isPlaying,
    false,
    "Playback should stop on pointerdown"
  );
  assert.equal(
    getAudioFlags().contextClosed,
    true,
    "AudioContext should close on pointerdown"
  );
});

test("beforeunload, unload, and popstate listeners close AudioContext and stop playback", () => {
  const env = createStudioSandbox();
  const { sandbox, listeners, mockAudioContext, mockElements, getAudioFlags } =
    env;
  const { module } = sandbox;
  const { setAudioContext, setIsPlaying } = module.exports;

  assert.ok(
    listeners.window.beforeunload && listeners.window.beforeunload.length > 0,
    "beforeunload listener registered"
  );
  assert.ok(
    listeners.window.unload && listeners.window.unload.length > 0,
    "unload listener registered"
  );
  assert.ok(
    listeners.window.popstate && listeners.window.popstate.length > 0,
    "popstate listener registered"
  );

  // Trigger beforeunload
  setAudioContext(mockAudioContext);
  setIsPlaying(true);
  mockElements.playBtn.disabled = true;
  listeners.window.beforeunload.forEach(fn => fn());
  assert.equal(module.exports.getAudioState().isPlaying, false);
  assert.equal(getAudioFlags().contextClosed, true);

  // Trigger popstate
  let popstateClosed = false;
  const freshCtx = {
    currentTime: 0,
    state: "running",
    close: async () => {
      popstateClosed = true;
      freshCtx.state = "closed";
    },
    suspend: async () => {},
  };
  setAudioContext(freshCtx);
  setIsPlaying(true);
  listeners.window.popstate.forEach(fn => fn());
  assert.equal(module.exports.getAudioState().isPlaying, false);
  assert.equal(popstateClosed, true);
});

test("stopAudio with closeContext=true closes and nulls AudioContext", () => {
  const env = createStudioSandbox();
  const { sandbox, mockAudioContext, getAudioFlags } = env;
  const { module } = sandbox;
  const { stopAudio, setAudioContext, setIsPlaying } = module.exports;

  setAudioContext(mockAudioContext);
  setIsPlaying(true);

  stopAudio({ closeContext: true });

  assert.equal(module.exports.getAudioState().isPlaying, false);
  assert.equal(getAudioFlags().contextClosed, true);
  assert.equal(module.exports.getAudioState().audioContext, null);
});

test("playMorse creates new AudioContext if previous context is closed or null", async () => {
  const env = createStudioSandbox();
  const { sandbox, mockElements } = env;
  const { module } = sandbox;
  const { playMorse, setAudioContext, getAudioState } = module.exports;

  // Closed context initially
  setAudioContext({ state: "closed" });
  mockElements.outputText.value = ".";

  await playMorse();

  const currentCtx = getAudioState().audioContext;
  assert.ok(currentCtx, "A new AudioContext should be created");
  assert.notEqual(currentCtx.state, "closed", "State should not be closed");
});
