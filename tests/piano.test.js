import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import PianoEngine from "../projects/instruments/piano/pianoEngine.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createPianoSandbox() {
  const listeners = new Map();
  const keys = [];

  class MockElement {
    constructor(tagName, id = "", className = "") {
      this.tagName = tagName;
      this.id = id;
      this.className = className;
      this.classList = {
        add: (...names) => {
          const current = this.className.split(" ").filter(Boolean);
          names.forEach(n => {
            if (!current.includes(n)) current.push(n);
          });
          this.className = current.join(" ");
        },
        remove: (...names) => {
          this.className = this.className
            .split(" ")
            .filter(n => Boolean(n) && !names.includes(n))
            .join(" ");
        },
        toggle: (name, force) => {
          const has = this.className.split(" ").includes(name);
          if (force === true || (!has && force === undefined)) {
            this.classList.add(name);
            return true;
          } else {
            this.classList.remove(name);
            return false;
          }
        },
        contains: name => this.className.split(" ").includes(name),
      };
      this.dataset = {};
      this.attributes = new Map();
      this.listeners = new Map();
      this.style = {};
    }

    setAttribute(name, val) {
      this.attributes.set(name, String(val));
    }
    getAttribute(name) {
      return this.attributes.has(name) ? this.attributes.get(name) : null;
    }
    setPointerCapture() {}
    releasePointerCapture() {}

    addEventListener(evt, cb) {
      if (!this.listeners.has(evt)) this.listeners.set(evt, []);
      this.listeners.get(evt).push(cb);
    }
    dispatchEvent(evt) {
      const list = this.listeners.get(evt.type) || [];
      evt.preventDefault = evt.preventDefault || (() => {});
      list.forEach(fn => fn(evt));
    }
  }

  const noteList = [
    "C4",
    "C#4",
    "D4",
    "D#4",
    "E4",
    "F4",
    "F#4",
    "G4",
    "G#4",
    "A4",
    "A#4",
    "B4",
    "C5",
  ];
  noteList.forEach(note => {
    const el = new MockElement("button", "", "key");
    el.dataset.note = note;
    keys.push(el);
  });

  const statusEl = new MockElement("div", "status");

  const documentMock = {
    createElement: tag => new MockElement(tag),
    getElementById: id =>
      id === "status" ? statusEl : new MockElement("div", id),
    querySelectorAll: selector => (selector === ".key" ? keys : []),
    addEventListener: (evt, cb) => {
      if (!listeners.has(evt)) listeners.set(evt, []);
      listeners.get(evt).push(cb);
    },
    dispatchEvent: evt => {
      const list = listeners.get(evt.type) || [];
      evt.preventDefault = evt.preventDefault || (() => {});
      list.forEach(fn => fn(evt));
    },
    hidden: false,
  };

  const windowListeners = new Map();

  function createMockAudioNode() {
    return {
      connect: dest => dest,
      start: () => {},
      stop: () => {},
      frequency: {
        value: 440,
        setValueAtTime: () => {},
        exponentialRampToValueAtTime: () => {},
      },
      detune: {
        value: 0,
        setValueAtTime: () => {},
        exponentialRampToValueAtTime: () => {},
      },
      gain: {
        value: 1,
        setValueAtTime: () => {},
        exponentialRampToValueAtTime: () => {},
        linearRampToValueAtTime: () => {},
        cancelScheduledValues: () => {},
      },
      buffer: null,
      type: "sine",
      threshold: { setValueAtTime: () => {} },
      knee: { setValueAtTime: () => {} },
      ratio: { setValueAtTime: () => {} },
      attack: { setValueAtTime: () => {} },
      release: { setValueAtTime: () => {} },
    };
  }

  const windowMock = {
    AudioContext: class {
      constructor() {
        this.state = "running";
        this.destination = {};
        this.currentTime = 0;
        this.sampleRate = 44100;
      }
      resume() {
        return Promise.resolve();
      }
      suspend() {
        return Promise.resolve();
      }
      createGain() {
        return createMockAudioNode();
      }
      createOscillator() {
        return createMockAudioNode();
      }
      createBuffer() {
        return { getChannelData: () => new Float32Array(100) };
      }
      createBufferSource() {
        return createMockAudioNode();
      }
      createBiquadFilter() {
        return createMockAudioNode();
      }
      createDynamicsCompressor() {
        return createMockAudioNode();
      }
    },
    setTimeout: () => 1,
    clearTimeout: () => {},
    addEventListener: (evt, cb) => {
      if (!windowListeners.has(evt)) windowListeners.set(evt, []);
      windowListeners.get(evt).push(cb);
    },
    dispatchEvent: evt => {
      const list = windowListeners.get(evt.type) || [];
      evt.preventDefault = evt.preventDefault || (() => {});
      list.forEach(fn => fn(evt));
    },
  };

  const scriptPath = path.join(
    __dirname,
    "..",
    "projects",
    "instruments",
    "piano",
    "script.js"
  );
  const scriptCode = fs.readFileSync(scriptPath, "utf8");

  const sandbox = {
    window: windowMock,
    document: documentMock,
    PianoEngine,
    setTimeout: windowMock.setTimeout,
    clearTimeout: windowMock.clearTimeout,
    Math,
    console,
    Float32Array,
    String,
    Map,
    Set,
    module: { exports: {} },
    require: () => PianoEngine,
  };

  vm.runInNewContext(scriptCode, sandbox);

  return {
    windowMock,
    documentMock,
    keys,
    statusEl,
    pianoStudio: sandbox.window.PianoStudio || sandbox.module.exports,
  };
}

test("getFrequency returns correct frequency for piano notes", () => {
  assert.equal(PianoEngine.getFrequency("A4"), 440);
  assert.equal(PianoEngine.getFrequency("C4"), 261.63);
  assert.equal(PianoEngine.getFrequency("E4"), 329.63);
});

test("getFrequency returns null for an invalid note", () => {
  assert.equal(PianoEngine.getFrequency("H4"), null);
  assert.equal(PianoEngine.getFrequency("C#9"), null);
});

test("getNoteFromKey returns the correct note for keyboard mappings", () => {
  assert.equal(PianoEngine.getNoteFromKey("a"), "C4");
  assert.equal(PianoEngine.getNoteFromKey("q"), "D4");
  assert.equal(PianoEngine.getNoteFromKey("r"), "E4");
  assert.equal(PianoEngine.getNoteFromKey("t"), "F4");
  assert.equal(PianoEngine.getNoteFromKey("w"), "C#4");
  assert.equal(PianoEngine.getNoteFromKey("y"), "F#4");
});

test("getNoteFromKey handles uppercase keyboard input", () => {
  assert.equal(PianoEngine.getNoteFromKey("A"), "C4");
  assert.equal(PianoEngine.getNoteFromKey("Q"), "D4");
  assert.equal(PianoEngine.getNoteFromKey("W"), "C#4");
});

test("getNoteFromKey returns null for an unmapped key", () => {
  assert.equal(PianoEngine.getNoteFromKey("f"), null);
  assert.equal(PianoEngine.getNoteFromKey("Enter"), null);
  assert.equal(PianoEngine.getNoteFromKey(""), null);
});

test("getKeyFromNote returns the correct keyboard key", () => {
  assert.equal(PianoEngine.getKeyFromNote("C4"), "a");
  assert.equal(PianoEngine.getKeyFromNote("D4"), "q");
  assert.equal(PianoEngine.getKeyFromNote("A4"), "o");
  assert.equal(PianoEngine.getKeyFromNote("C#4"), "w");
  assert.equal(PianoEngine.getKeyFromNote("A#4"), "p");
});

test("getKeyFromNote returns null for an invalid note", () => {
  assert.equal(PianoEngine.getKeyFromNote("H4"), null);
  assert.equal(PianoEngine.getKeyFromNote("C#9"), null);
});

test("isValidNote correctly identifies valid piano notes", () => {
  assert.equal(PianoEngine.isValidNote("C4"), true);
  assert.equal(PianoEngine.isValidNote("A4"), true);
  assert.equal(PianoEngine.isValidNote("C#4"), true);
  assert.equal(PianoEngine.isValidNote("C5"), true);
});

test("isValidNote returns false for invalid notes", () => {
  assert.equal(PianoEngine.isValidNote("H4"), false);
  assert.equal(PianoEngine.isValidNote("C#9"), false);
  assert.equal(PianoEngine.isValidNote(""), false);
});

test("getNotes returns all visible piano notes", () => {
  const notes = PianoEngine.getNotes();

  assert.ok(notes.includes("C4"));
  assert.ok(notes.includes("D4"));
  assert.ok(notes.includes("E4"));
  assert.ok(notes.includes("F4"));
  assert.ok(notes.includes("G4"));
  assert.ok(notes.includes("A4"));
  assert.ok(notes.includes("B4"));
  assert.ok(notes.includes("C5"));
});

test("getNotes includes all black keys", () => {
  const notes = PianoEngine.getNotes();

  assert.ok(notes.includes("C#4"));
  assert.ok(notes.includes("D#4"));
  assert.ok(notes.includes("F#4"));
  assert.ok(notes.includes("G#4"));
  assert.ok(notes.includes("A#4"));
});

test("getKeyboardMap returns the expected keyboard mapping", () => {
  const map = PianoEngine.getKeyboardMap();

  assert.equal(map.a, "C4");
  assert.equal(map.w, "C#4");
  assert.equal(map.q, "D4");
  assert.equal(map.e, "D#4");
  assert.equal(map.r, "E4");
  assert.equal(map.t, "F4");
  assert.equal(map.y, "F#4");
  assert.equal(map.u, "G4");
  assert.equal(map.i, "G#4");
  assert.equal(map.o, "A4");
  assert.equal(map.p, "A#4");
  assert.equal(map["["], "B4");
  assert.equal(map.k, "C5");
});

test("note to keyboard mapping is reversible", () => {
  const notes = PianoEngine.getNotes();

  notes.forEach(note => {
    const key = PianoEngine.getKeyFromNote(note);

    if (key) {
      assert.equal(PianoEngine.getNoteFromKey(key), note);
    }
  });
});

test("simultaneous chord key presses trigger each note once without stutter or doubling", () => {
  const { documentMock, keys, pianoStudio } = createPianoSandbox();

  // Press 'A' (C4)
  documentMock.dispatchEvent({ type: "keydown", code: "KeyA", repeat: false });
  assert.equal(pianoStudio.getActiveNotes().has("C4"), true);
  assert.equal(pianoStudio.getPressedKeyboardKeys().has("KeyA"), true);

  const c4Key = keys.find(k => k.dataset.note === "C4");
  assert.equal(c4Key.classList.contains("active"), true);

  // Auto-repeated keydown for 'A' must be suppressed and not double-trigger
  documentMock.dispatchEvent({ type: "keydown", code: "KeyA", repeat: true });
  assert.equal(pianoStudio.getActiveNotes().size, 1);

  // Simultaneously press 'S' (D4) and 'D' (E4) to form a chord while 'A' is held
  documentMock.dispatchEvent({ type: "keydown", code: "KeyS", repeat: false });
  documentMock.dispatchEvent({ type: "keydown", code: "KeyD", repeat: false });

  assert.equal(pianoStudio.getActiveNotes().has("C4"), true);
  assert.equal(pianoStudio.getActiveNotes().has("D4"), true);
  assert.equal(pianoStudio.getActiveNotes().has("E4"), true);
  assert.equal(pianoStudio.getActiveNotes().size, 3);

  const d4Key = keys.find(k => k.dataset.note === "D4");
  const e4Key = keys.find(k => k.dataset.note === "E4");
  assert.equal(d4Key.classList.contains("active"), true);
  assert.equal(e4Key.classList.contains("active"), true);

  // Duplicate keydown event without repeat flag should also be ignored
  documentMock.dispatchEvent({ type: "keydown", code: "KeyA", repeat: false });
  assert.equal(pianoStudio.getActiveNotes().size, 3);

  // Release 'S' (D4) while holding 'A' (C4) and 'D' (E4)
  documentMock.dispatchEvent({ type: "keyup", code: "KeyS" });
  assert.equal(pianoStudio.getActiveNotes().has("C4"), true);
  assert.equal(pianoStudio.getActiveNotes().has("D4"), false);
  assert.equal(pianoStudio.getActiveNotes().has("E4"), true);
  assert.equal(pianoStudio.getActiveNotes().size, 2);
  assert.equal(d4Key.classList.contains("active"), false);
  assert.equal(c4Key.classList.contains("active"), true);
  assert.equal(e4Key.classList.contains("active"), true);

  // Release remaining keys
  documentMock.dispatchEvent({ type: "keyup", code: "KeyA" });
  documentMock.dispatchEvent({ type: "keyup", code: "KeyD" });
  assert.equal(pianoStudio.getActiveNotes().size, 0);
  assert.equal(c4Key.classList.contains("active"), false);
  assert.equal(e4Key.classList.contains("active"), false);
});

test("window blur and visibilitychange cleanly release all active chord notes", () => {
  const { documentMock, windowMock, keys, pianoStudio } = createPianoSandbox();

  // Play a 3-note chord
  documentMock.dispatchEvent({ type: "keydown", code: "KeyA", repeat: false });
  documentMock.dispatchEvent({ type: "keydown", code: "KeyS", repeat: false });
  documentMock.dispatchEvent({ type: "keydown", code: "KeyD", repeat: false });
  assert.equal(pianoStudio.getActiveNotes().size, 3);

  // Window loses focus (blur)
  windowMock.dispatchEvent({ type: "blur" });
  assert.equal(pianoStudio.getActiveNotes().size, 0);
  assert.equal(pianoStudio.getPressedKeyboardKeys().size, 0);

  keys.forEach(k => {
    assert.equal(k.classList.contains("active"), false);
  });
});

test("holding C4 and pressing E4 triggers C4 once and E4 once with no stutter or doubling", () => {
  const { documentMock, keys, statusEl, pianoStudio } = createPianoSandbox();

  // Press and hold C4 (KeyA)
  documentMock.dispatchEvent({ type: "keydown", code: "KeyA", repeat: false });
  assert.equal(pianoStudio.getActiveNotes().has("C4"), true);
  assert.equal(pianoStudio.getActiveNotes().size, 1);
  assert.equal(statusEl.textContent, "Playing C4");

  // While holding C4, press E4 (KeyD)
  documentMock.dispatchEvent({ type: "keydown", code: "KeyD", repeat: false });
  assert.equal(pianoStudio.getActiveNotes().has("C4"), true);
  assert.equal(pianoStudio.getActiveNotes().has("E4"), true);
  assert.equal(pianoStudio.getActiveNotes().size, 2);
  assert.equal(statusEl.textContent, "Playing C4, E4");

  // While still holding both, repeat events for C4 or E4 should not trigger additional notes
  documentMock.dispatchEvent({ type: "keydown", code: "KeyA", repeat: true });
  documentMock.dispatchEvent({ type: "keydown", code: "KeyD", repeat: true });
  assert.equal(pianoStudio.getActiveNotes().size, 2);

  // Release E4, C4 stays playing cleanly
  documentMock.dispatchEvent({ type: "keyup", code: "KeyD" });
  assert.equal(pianoStudio.getActiveNotes().has("C4"), true);
  assert.equal(pianoStudio.getActiveNotes().has("E4"), false);
  assert.equal(pianoStudio.getActiveNotes().size, 1);
  assert.equal(statusEl.textContent, "Playing C4");

  // Release C4
  documentMock.dispatchEvent({ type: "keyup", code: "KeyA" });
  assert.equal(pianoStudio.getActiveNotes().size, 0);
  assert.equal(statusEl.textContent, "Ready");
});


test("validateKeyboardMapping gracefully rejects malformed inputs without throwing", () => {
  const malformedInputs = [null, undefined, 42, "invalid", true, [], Symbol("test")];

  malformedInputs.forEach(input => {
    const result = PianoEngine.validateKeyboardMapping(input);
    assert.equal(result.isValid, false);
    assert.ok(result.errors.length > 0);
    assert.deepEqual(result.sanitizedMapping, {});
  });
});

test("validateKeyboardMapping validates note names and detects invalid notes", () => {
  const result = PianoEngine.validateKeyboardMapping({
    a: "C4",
    b: "InvalidNote",
    c: "H4",
    d: "C#9",
  });

  assert.equal(result.isValid, false);
  assert.ok(result.invalidMappings.some(m => m.note === "InvalidNote"));
  assert.ok(result.invalidMappings.some(m => m.note === "H4"));
  assert.ok(result.invalidMappings.some(m => m.note === "C#9"));
  assert.equal(result.sanitizedMapping.a, "C4");
  assert.equal(result.sanitizedMapping.b, undefined);
});

test("validateKeyboardMapping detects duplicate keys and empty key strings", () => {
  const emptyKeyResult = PianoEngine.validateKeyboardMapping({
    "": "C4",
    "   ": "D4",
    a: "E4",
  });
  assert.equal(emptyKeyResult.isValid, false);
  assert.ok(emptyKeyResult.errors.some(err => err.includes("Empty or blank key identifier")));

  const duplicateKeyResult = PianoEngine.validateKeyboardMapping({
    a: "C4",
    A: "D4",
  });
  assert.equal(duplicateKeyResult.isValid, false);
  assert.ok(duplicateKeyResult.duplicateKeys.includes("a"));
});

test("validateKeyboardMapping detects duplicate note assignments when disallowed", () => {
  const resultDisallowed = PianoEngine.validateKeyboardMapping(
    {
      a: "C4",
      b: "C4",
    },
    { allowDuplicateNotes: false }
  );

  assert.equal(resultDisallowed.isValid, false);
  assert.ok(resultDisallowed.duplicateNotes.includes("C4"));

  const resultAllowed = PianoEngine.validateKeyboardMapping(
    {
      a: "C4",
      b: "C4",
    },
    { allowDuplicateNotes: true }
  );

  assert.equal(resultAllowed.isValid, true);
  assert.equal(resultAllowed.warnings.length > 0, true);
});

test("validateKeyboardMapping detects missing notes when required", () => {
  const result = PianoEngine.validateKeyboardMapping(
    { a: "C4" },
    { requireAllNotes: true, expectedNotes: ["C4", "D4", "E4"] }
  );

  assert.equal(result.isValid, false);
  assert.ok(result.missingNotes.includes("D4"));
  assert.ok(result.missingNotes.includes("E4"));
  assert.ok(!result.missingNotes.includes("C4"));
});

test("applyKeyboardMapping updates mapping and preserves previous on failure", () => {
  PianoEngine.resetKeyboardMapping();
  const initialC4Key = PianoEngine.getKeyFromNote("C4");

  // Valid mapping applied
  const applyRes = PianoEngine.applyKeyboardMapping({
    z: "C4",
    x: "D4",
  });
  assert.equal(applyRes.success, true);
  assert.equal(PianoEngine.getNoteFromKey("z"), "C4");
  assert.equal(PianoEngine.getKeyFromNote("C4"), "z");

  // Attempt invalid mapping
  const failRes = PianoEngine.applyKeyboardMapping({
    invalidKey: "NotANote",
  });
  assert.equal(failRes.success, false);
  // Previous valid mapping is preserved
  assert.equal(PianoEngine.getNoteFromKey("z"), "C4");

  // Reset restores factory default
  PianoEngine.resetKeyboardMapping();
  assert.equal(PianoEngine.getKeyFromNote("C4"), initialC4Key);
});

test("validateMidiMapping gracefully rejects malformed inputs without throwing", () => {
  const malformedInputs = [null, undefined, 123, "midi", false, []];

  malformedInputs.forEach(input => {
    const result = PianoEngine.validateMidiMapping(input);
    assert.equal(result.isValid, false);
    assert.ok(result.errors.length > 0);
  });
});

test("validateMidiMapping supports both midi-to-note and note-to-midi formats", () => {
  const midiToNote = {
    60: "C4",
    62: "D4",
    64: "E4",
  };
  const res1 = PianoEngine.validateMidiMapping(midiToNote);
  assert.equal(res1.isValid, true);
  assert.equal(res1.sanitizedMapping[60], "C4");
  assert.equal(res1.sanitizedMapping[62], "D4");

  const noteToMidi = {
    C4: 60,
    D4: 62,
    E4: 64,
  };
  const res2 = PianoEngine.validateMidiMapping(noteToMidi);
  assert.equal(res2.isValid, true);
  assert.equal(res2.sanitizedMapping[60], "C4");
  assert.equal(res2.sanitizedMapping[62], "D4");
});

test("validateMidiMapping detects out-of-range MIDI numbers and invalid notes", () => {
  const outOfRange = PianoEngine.validateMidiMapping({
    "-5": "C4",
    128: "D4",
    "60.5": "E4",
    NaN: "F4",
  });

  assert.equal(outOfRange.isValid, false);
  assert.ok(outOfRange.invalidMappings.length >= 3);

  const invalidNotes = PianoEngine.validateMidiMapping({
    60: "NotANote",
    61: "C#99",
  });

  assert.equal(invalidNotes.isValid, false);
  assert.ok(invalidNotes.invalidMappings.some(m => m.note === "NotANote"));
});

test("validateMidiMapping detects duplicate MIDI numbers and notes", () => {
  const duplicateNotes = PianoEngine.validateMidiMapping(
    {
      60: "C4",
      61: "C4",
    },
    { allowDuplicateNotes: false }
  );

  assert.equal(duplicateNotes.isValid, false);
  assert.ok(duplicateNotes.duplicateNotes.includes("C4"));
});

test("applyMidiMapping updates mapping and preserves previous on failure", () => {
  PianoEngine.resetMidiMapping();
  const initialNote60 = PianoEngine.getNoteFromMidi(60);

  // Valid MIDI mapping
  const successRes = PianoEngine.applyMidiMapping({
    60: "C3",
    62: "D3",
  });
  assert.equal(successRes.success, true);
  assert.equal(PianoEngine.getNoteFromMidi(60), "C3");
  assert.equal(PianoEngine.getMidiFromNote("C3"), 60);

  // Attempt invalid MIDI mapping
  const failRes = PianoEngine.applyMidiMapping({
    999: "C3",
  });
  assert.equal(failRes.success, false);
  // Preserves existing mapping
  assert.equal(PianoEngine.getNoteFromMidi(60), "C3");

  // Reset
  PianoEngine.resetMidiMapping();
  assert.equal(PianoEngine.getNoteFromMidi(60), initialNote60);
});

test("MIDI utility functions perform bidirectional conversions correctly", () => {
  assert.equal(PianoEngine.noteToMidiNumber("C4"), 60);
  assert.equal(PianoEngine.noteToMidiNumber("A4"), 69);
  assert.equal(PianoEngine.midiNumberToNote(60), "C4");
  assert.equal(PianoEngine.midiNumberToNote(69), "A4");

  // Frequency conversion
  assert.equal(Math.round(PianoEngine.midiToFrequency(69)), 440);
  assert.equal(PianoEngine.frequencyToMidi(440), 69);

  // Edge cases
  assert.equal(PianoEngine.noteToMidiNumber("Invalid"), null);
  assert.equal(PianoEngine.midiNumberToNote(-1), null);
  assert.equal(PianoEngine.midiNumberToNote(128), null);
  assert.equal(PianoEngine.midiToFrequency(NaN), null);
  assert.equal(PianoEngine.frequencyToMidi(-10), null);
});
