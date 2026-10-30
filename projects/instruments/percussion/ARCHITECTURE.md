# Project Architecture — Virtual Percussion Set

---

## Overview

The Virtual Percussion Set is a standalone interactive musical instrument mini for Cradle. It provides a playable 8-pad drum machine that supports mouse, touch, and computer keyboard interaction, delivering real-time synthesized percussion sounds using the Web Audio API alongside optional external audio sample loading with comprehensive error handling and fallback synthesis.

The project is self-contained and uses mathematical models (frequency ramps and noise bursts) to simulate drums and cymbals.

---

## Purpose & Goals

- Provide a responsive and accessible virtual percussion interface
- Implement realistic drum sounds (Kick, Snare, Hi-Hats, Toms, Clap, Crash) using the Web Audio API
- Support multi-touch polyphony for simultaneous pad hits
- Enable a seamless mapping between physical keyboard keys and percussion pads
- Provide robust audio sample loading with comprehensive diagnostics for missing files, CORS restrictions, and network failures
- Ensure low-latency audio playback across modern browsers

---

## Folder Structure

```
percussion/
├── index.html      # UI shell and percussion pad layout
├── script.js       # Browser controller, event handling, and UI synchronization
├── style.css       # Pad styling, grid layout, and active states
├── percussionEngine.js  # Core audio engine, sound synthesis logic, sample loader, and pad mappings
├── thumbnail.svg   # Project artwork
└── ARCHITECTURE.md # This file
```

---

## System / Project Architecture Overview

The project follows a controller-engine pattern. `index.html` and `style.css` define the 8-pad grid. `script.js` acts as the controller, capturing user inputs (pointer or keyboard) and communicating with `percussionEngine.js`. The engine handles the low-level Web Audio API calls, utilizing different synthesis techniques (sine ramps for kicks/toms, filtered noise for snares/hats) to produce the distinct sounds of each pad, or triggering decoded audio sample buffers when custom samples are loaded.

---

## Component Breakdown

| File                  | Responsibility                                                                 |
| --------------------- | ------------------------------------------------------------------------------ |
| `index.html`          | Defines the percussion pad DOM and status display                              |
| `script.js`           | Manages input events, UI state (active pads), and coordinates with the engine  |
| `style.css`           | Handles the visual appearance of the pads and their active states              |
| `percussionEngine.js` | Owns pad definitions, sound synthesis, audio sample loading, and error handling |

---

## Data Flow / Execution Flow

```
User triggers pad (Mouse/Touch/Keyboard)
↓
script.js captures event and maps to pad ID (via engine.getPadFromKey or data-pad attribute)
↓
script.js updates UI (adds .active class to pad element)
↓
script.js calls engine.playPad(padId)
↓
engine checks for loaded audio sample buffer:
  ├─ If sample buffer exists: plays AudioBufferSourceNode connected to context.destination
  └─ If no sample or playback error: falls back seamlessly to synthesized sound generator
↓
Sound plays through destination node
↓
script.js removes .active class after trigger duration
```

---

## Engine & Sample Loading Architecture

### `percussionEngine.js`

- **Pad Catalog**: Defines 8 drum pads (`kick`, `snare`, `hihatClosed`, `hihatOpen`, `tomLow`, `tomHigh`, `clap`, `crash`).
- **Sample Loading & Diagnostics**:
  - `loadSample(padId, url, options)`: Asynchronously loads and decodes an audio sample for a pad. Accurately classifies failure modes:
    - Missing files (`HTTP 404`): Surfaces `type: "NOT_FOUND"`.
    - CORS blocks: Detects origin / access control policy blocks, surfacing `type: "CORS"`.
    - Network failures: Identifies offline states or unreachable hosts, surfacing `type: "NETWORK"`.
    - Decoding errors: Identifies corrupt payloads or unsupported audio formats, surfacing `type: "DECODE"`.
    - Invalid inputs: Identifies missing URLs or invalid pad identifiers, surfacing `type: "INVALID_INPUT"`.
  - `loadSamples(sampleMap, options)`: Batch-loads samples across multiple pads.
  - `getSample(padId)` / `hasSample(padId)`: Queries loaded sample buffers.
  - `getSampleErrors()`: Returns a snapshot Map of pad sample load errors.
  - `onSampleError(callback)`: Registers error listeners to propagate diagnostics to UI alerts.
  - `clearSamples()`: Clears cached sample buffers and error records.
- **Synthesized Voice Fallback**: When audio samples fail to load or are not configured, pad triggers seamlessly fall back to procedural Web Audio synthesis without silence or unhandled exceptions.

---

## Design Decisions

- **Frequency Ramping**: Used exponential frequency ramps for kicks and toms to simulate the rapid pitch drop of a drum head.
- **Noise Filtering**: Employed high-pass and band-pass filters on white noise to create the "sizzle" of hi-hats and the "snap" of a snare.
- **Staggered Noise**: For the clap sound, multiple noise bursts were slightly offset in time to mimic a group of people clapping.
- **Sample Error Transparency**: Rather than failing silently on remote asset issues, errors are classified into structured `SampleLoadError` instances and surfaced to listeners and UI alert containers.
- **Decoupled Engine**: The `PercussionEngine` is implemented as a standalone module to separate synthesis and sample caching from DOM manipulation.

---

## Dependencies

None (uses native browser APIs).

---

## Future Improvements

- Support for user-uploaded custom sample files via drag-and-drop.
- Implementation of a step sequencer for creating simple beats.
- Addition of more percussion sounds (e.g., Bongos, Cowbell).

---

## Development Notes

- The `AudioContext` is resumed on the first user interaction to comply with browser autoplay policies.

---

## Known Limitations

- Procedural synthesis is a simplified acoustic model and does not fully capture the complexity of real percussion instruments.
- No support for velocity-sensitive hits.

---

## License & Attribution

- **Project License:** MIT
- **Third-Party Assets:** None.

---

## References

- [Web Audio API Documentation (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [Additive Synthesis Guide](https://en.wikipedia.org/wiki/Additive_synthesis)
