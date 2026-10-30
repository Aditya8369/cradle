# Project Architecture — Virtual Piano

---

## Overview

The Virtual Piano is a standalone interactive musical instrument mini for Cradle. It provides a playable piano keyboard that supports mouse, touch, computer keyboard, and MIDI controller interaction, delivering real-time synthesized piano notes using the Web Audio API alongside optional external audio sample loading with comprehensive error handling and fallback synthesis.

The project is self-contained with no frontend frameworks or external audio libraries.

---

## Purpose & Goals

- Provide a responsive and accessible virtual piano interface
- Implement realistic note synthesis using a combination of oscillators and noise buffers
- Support multi-note polyphony through an active voice management system
- Enable robust, validated mappings between physical computer keys, MIDI controllers, and musical notes
- Provide robust audio sample loading with diagnostics for missing files (404), CORS restrictions, network failures, and decode errors
- Ensure low-latency audio playback across modern browsers

---

## Folder Structure

```
piano/
├── index.html      # UI shell and piano keyboard layout
├── script.js       # Browser controller, event handling, and UI synchronization
├── style.css       # Keyboard styling, key states, and responsive layout
├── pianoEngine.js  # Core audio engine, note frequencies, synthesis logic, and sample loader
├── thumbnail.svg   # Project artwork
└── ARCHITECTURE.md # This file
```

---

## System / Project Architecture Overview

The project follows a decoupled architecture where the UI and audio logic are separated. `index.html` and `style.css` define the visual representation. `script.js` acts as the controller, capturing user inputs (pointer, keyboard, or Web MIDI) and communicating with `pianoEngine.js`. The engine handles the low-level Web Audio API calls, managing the creation and destruction of oscillators and sample buffer playback to produce sound.

---

## Component Breakdown

| File             | Responsibility                                                                |
| ---------------- | ----------------------------------------------------------------------------- |
| `index.html`     | Defines the piano keyboard DOM and status display                             |
| `script.js`      | Manages input events, UI state (active keys), and coordinates with the engine |
| `style.css`      | Handles the visual appearance of white/black keys and active states           |
| `pianoEngine.js` | Owns note frequencies, MIDI/keyboard validation, synthesis, and sample loading |

---

## Data Flow / Execution Flow

```
User triggers input (Mouse/Touch/Keyboard/MIDI)
↓
script.js captures event and maps to musical note (via engine.getNoteFromKey or engine.getNoteFromMidi)
↓
script.js updates UI (adds .active class to key element)
↓
script.js calls engine.startNote(note) / engine.playNote(note)
↓
engine checks for loaded audio sample buffer:
  ├─ If sample buffer exists: creates AudioBufferSourceNode and connects to destination
  └─ If no sample or playback error: falls back smoothly to additive synthesis oscillators
↓
Sound plays through destination / master compressor node
↓
User releases input → script.js calls engine.stopNote(note)
↓
engine applies exponential release ramp and stops voices
↓
script.js removes .active class from key element
```

---

## Core Engine & Mapping Subsystems

### `pianoEngine.js`

- **Harmonic Series Definition**: Maps each note (`C3`–`E6`) to exact fundamental frequencies.
- **Mapping Management**:
  - `validateKeyboardMapping(mapping, options)` / `validateMidiMapping(mapping, options)`: Inspects incoming configuration structures for duplicates, invalid keys, unsupported notes, and format errors.
  - `applyKeyboardMapping(mapping, options)` / `applyMidiMapping(mapping, options)`: Atomically updates mapping state if validation succeeds.
  - `resetKeyboardMapping()` / `resetMidiMapping()`: Restores defaults.
- **Sample Loading & Diagnostics**:
  - `loadSample(note, url, options)`: Asynchronously loads and decodes an audio sample for a piano note. Surfaces structured `SampleLoadError` instances:
    - Missing files (`HTTP 404`): Surfaces `type: "NOT_FOUND"`.
    - CORS blocks: Detects origin / access control restrictions, surfacing `type: "CORS"`.
    - Network failures: Identifies offline states or unreachable hosts, surfacing `type: "NETWORK"`.
    - Decoding errors: Identifies corrupted audio files or unsupported formats, surfacing `type: "DECODE"`.
    - Invalid inputs: Identifies missing URLs or invalid note identifiers, surfacing `type: "INVALID_INPUT"`.
  - `loadSamples(sampleMap, options)`: Batch-loads samples across multiple notes.
  - `getSample(note)` / `hasSample(note)`: Queries loaded sample buffers.
  - `getSampleErrors()`: Returns a snapshot Map of note sample load errors.
  - `onSampleError(callback)`: Registers error listeners to propagate diagnostics to UI alerts.
  - `clearSamples()`: Clears cached sample buffers and error records.
- **Polyphony & Voice Lifecycle**:
  - `createVoice()`: Implements additive synthesis by layering harmonics.
  - `createHammerAttack()`: Generates a short burst of filtered noise for realism.
  - `startNote()` / `stopNote()`: Public API for controlling audio playback and polyphonic voice tracking.

---

## Design Decisions

- **Additive Synthesis**: Used a combination of a fundamental triangle wave and several sine harmonics to approximate the timbre of a piano.
- **Noise-based Attack**: Added a high-pass filtered noise burst at the start of each note to simulate the hammer hitting the string.
- **Master Dynamics Compression**: Polyphonic chord playback can quickly exceed 0 dBFS when multiple oscillators and noise bursts are active at once; routing through a compressor ensures clean sound without digital clipping.
- **Strict Chord Deduplication**: Checking both `pressedKeyboardKeys` and `activeNotes` prevents double note triggers when chord keys are pressed in rapid succession or held.
- **Controlled Mapping Validation**: Rather than throwing uncaught exceptions on malformed input, validation methods return structured result descriptors (`{ isValid, errors, warnings, sanitizedMapping }`).
- **Sample Error Diagnostics**: Errors when loading audio sample assets are never swallowed; informative diagnostics are emitted via `onSampleError` and displayed in the status banner.
- **Exponential Decay**: Implemented exponential gain ramps for a natural-sounding fade-out.
- **Decoupled Engine**: Wrapped the audio logic in a UMD-style `PianoEngine` to make it reusable in other projects.

---

## Dependencies

None (uses native browser APIs).

---

## Future Improvements

- Support for different piano tones (e.g., Grand Piano, Electric Piano).
- Implementation of a sustain pedal functionality.
- Ability to record and playback sequences of notes.

---

## Development Notes

- The `AudioContext` is resumed on the first user interaction to comply with browser autoplay policies.

**Note:-** frequencies are based on A4 = 440Hz.

---

## Known Limitations

- Procedural synthesis is a simplified model and does not fully capture the complex harmonics of an acoustic piano.
- No support for velocity (volume depends on synthesis settings).

---

## License & Attribution

- **Project License:** MIT
- **Third-Party Assets:** None.

---

## References

- [Web Audio API Documentation (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [Web MIDI API Specification (W3C)](https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API)
- [Piano Frequency Table](https://www.musicca.com/piano-notes-frequencies)
