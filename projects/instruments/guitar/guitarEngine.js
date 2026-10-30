"use strict";

(function (root, factory) {
  if (typeof define === "function" && define.amd) {
    define([], factory);
  } else if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.GuitarEngine = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  const STANDARD_TUNING = [
    { name: "E2", frequency: 82.4069 },
    { name: "A2", frequency: 110.0 },
    { name: "D3", frequency: 146.832 },
    { name: "G3", frequency: 195.998 },
    { name: "B3", frequency: 246.942 },
    { name: "E4", frequency: 329.628 },
  ];

  const NOTE_NAMES = [
    "C",
    "C#",
    "D",
    "D#",
    "E",
    "F",
    "F#",
    "G",
    "G#",
    "A",
    "A#",
    "B",
  ];

  
  class SampleLoadError extends Error {
    constructor(
      message,
      { type = "UNKNOWN", url = "", status = null, originalError = null } = {}
    ) {
      super(message);
      this.name = "SampleLoadError";
      this.type = type; // 'NOT_FOUND' | 'CORS' | 'NETWORK' | 'DECODE' | 'FORBIDDEN' | 'SERVER_ERROR' | 'INVALID_INPUT' | 'ABORTED'
      this.url = url;
      this.status = status;
      this.originalError = originalError;
    }
  }

  const DEFAULTS = {
    duration: 2.2,
    volume: 0.45,
    decay: 2,
    brightness: 0.35,
  };

  class GuitarEngine {
    constructor(options = {}) {
      this.options = {
        ...DEFAULTS,
        ...options,
      };

      this.audioContext = null;
      this.masterGain = null;
      this.activeVoices = new Set();
      this.sampleBuffers = new Map();
      this.sampleLoadErrors = new Map();
      this.sampleErrorListeners = [];
      this.initialized = false;
    }

    initialize() {
      if (this.initialized) {
        return this.audioContext;
      }

      const AudioContext =
        (typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext)) ||
        (typeof globalThis !== "undefined" && (globalThis.AudioContext || globalThis.webkitAudioContext));

      if (!AudioContext) {
        throw new Error("Web Audio API is not supported in this browser.");
      }

      this.audioContext = new AudioContext();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = this.options.volume;
      this.masterGain.connect(this.audioContext.destination);

      this.initialized = true;

      return this.audioContext;
    }

    async resume() {
      this.initialize();

      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume();
      }

      return this.audioContext;
    }

    midiToFrequency(midi) {
      return 440 * Math.pow(2, (midi - 69) / 12);
    }

    noteToMidi(note) {
      const match = /^([A-G])(#|b)?(-?\d+)$/.exec(note);

      if (!match) {
        throw new Error(`Invalid note: ${note}`);
      }

      const letter = match[1];
      const accidental = match[2] || "";
      const octave = Number(match[3]);

      let semitone = {
        C: 0,
        D: 2,
        E: 4,
        F: 5,
        G: 7,
        A: 9,
        B: 11,
      }[letter];

      if (accidental === "#") {
        semitone += 1;
      }

      if (accidental === "b") {
        semitone -= 1;
      }

      return (octave + 1) * 12 + semitone;
    }

    midiToNote(midi) {
      const octave = Math.floor(midi / 12) - 1;
      const note = NOTE_NAMES[((midi % 12) + 12) % 12];

      return `${note}${octave}`;
    }

    getFrequency(stringIndex, fret = 0) {
      this.validateString(stringIndex);

      if (!Number.isInteger(fret) || fret < 0) {
        throw new Error("Fret must be a non-negative integer.");
      }

      const baseFrequency = STANDARD_TUNING[stringIndex].frequency;

      return baseFrequency * Math.pow(2, fret / 12);
    }

    getNote(stringIndex, fret = 0) {
      this.validateString(stringIndex);

      if (!Number.isInteger(fret) || fret < 0) {
        throw new Error("Fret must be a non-negative integer.");
      }

      const baseNote = STANDARD_TUNING[stringIndex].name;
      const midi = this.noteToMidi(baseNote) + fret;

      return this.midiToNote(midi);
    }

    getString(stringIndex) {
      this.validateString(stringIndex);

      return {
        index: stringIndex,
        name: STANDARD_TUNING[stringIndex].name,
        frequency: STANDARD_TUNING[stringIndex].frequency,
      };
    }

    getTuning() {
      return STANDARD_TUNING.map((string, index) => ({
        index,
        ...string,
      }));
    }

    async playString(stringIndex, fret = 0, options = {}) {
      await this.resume();

      this.validateString(stringIndex);

      const sampleBuffer = this.sampleBuffers.get(stringIndex);
      if (sampleBuffer && fret === 0) {
        try {
          const source = this.audioContext.createBufferSource();
          source.buffer = sampleBuffer;
          source.connect(this.masterGain);
          source.start(this.audioContext.currentTime);
          return;
        } catch (err) {
          console.warn(`Failed to play sample for string ${stringIndex}, falling back to synthesis:`, err);
        }
      }

      const frequency = this.getFrequency(stringIndex, fret);
      const note = this.getNote(stringIndex, fret);

      const settings = {
        ...this.options,
        ...options,
      };

      const now = this.audioContext.currentTime;

      const oscillator = this.audioContext.createOscillator();
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(frequency, now);

      const harmonic = this.audioContext.createOscillator();
      harmonic.type = "sine";
      harmonic.frequency.setValueAtTime(frequency * 2, now);

      const gain = this.audioContext.createGain();

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.9, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + settings.duration);

      const harmonicGain = this.audioContext.createGain();

      harmonicGain.gain.setValueAtTime(0.0001, now);
      harmonicGain.gain.exponentialRampToValueAtTime(
        settings.brightness * 0.25,
        now + 0.006
      );
      harmonicGain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + settings.duration * 0.7
      );

      const filter = this.audioContext.createBiquadFilter();

      filter.type = "lowpass";
      filter.frequency.setValueAtTime(Math.min(5000, frequency * 12), now);
      filter.Q.value = 0.7;

      const noiseBuffer = this.createPluckNoise();
      const noise = this.audioContext.createBufferSource();

      noise.buffer = noiseBuffer;

      const noiseGain = this.audioContext.createGain();

      noiseGain.gain.setValueAtTime(0.18, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);

      oscillator.connect(gain).connect(filter);

      harmonic.connect(harmonicGain).connect(filter);

      noise.connect(noiseGain).connect(filter);

      filter.connect(this.masterGain);

      const voice = {
        oscillator,
        harmonic,
        noise,
        gain,
        harmonicGain,
        noiseGain,
        filter,
      };

      this.activeVoices.add(voice);

      oscillator.start(now);
      harmonic.start(now);
      noise.start(now);

      const stopTime = now + settings.duration + 0.05;

      oscillator.stop(stopTime);
      harmonic.stop(stopTime);
      noise.stop(now + 0.06);

      oscillator.addEventListener("ended", () => {
        this.activeVoices.delete(voice);
      });

      return {
        string: stringIndex,
        fret,
        note,
        frequency,
      };
    }

    async playNote(frequency, options = {}) {
      if (!Number.isFinite(frequency) || frequency <= 0) {
        throw new Error("Frequency must be a positive number.");
      }

      await this.resume();

      const settings = {
        ...this.options,
        ...options,
      };

      const now = this.audioContext.currentTime;

      const oscillator = this.audioContext.createOscillator();
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(frequency, now);

      const gain = this.audioContext.createGain();

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.8, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + settings.duration);

      oscillator.connect(gain).connect(this.masterGain);

      oscillator.start(now);
      oscillator.stop(now + settings.duration + 0.05);

      return {
        frequency,
      };
    }

    async strum(stringIndexes = [0, 1, 2, 3, 4, 5], options = {}) {
      await this.resume();

      const direction = options.direction || "down";
      const delay = options.delay ?? 0.035;

      const strings =
        direction === "up" ? [...stringIndexes].reverse() : [...stringIndexes];

      const results = [];

      for (let index = 0; index < strings.length; index++) {
        const result = await new Promise(resolve => {
          setTimeout(async () => {
            const note = await this.playString(
              strings[index],
              options.fret ?? 0,
              options
            );

            resolve(note);
          }, index * delay);
        });

        results.push(result);
      }

      return results;
    }

    createPluckNoise() {
      const sampleRate = this.audioContext.sampleRate;
      const duration = 0.06;

      const buffer = this.audioContext.createBuffer(
        1,
        sampleRate * duration,
        sampleRate
      );

      const data = buffer.getChannelData(0);

      for (let i = 0; i < data.length; i++) {
        const envelope = 1 - i / data.length;

        data[i] = (Math.random() * 2 - 1) * envelope;
      }

      return buffer;
    }

    stopAll() {
      for (const voice of this.activeVoices) {
        try {
          voice.oscillator.stop();
        } catch (_) {}

        try {
          voice.harmonic.stop();
        } catch (_) {}

        try {
          voice.noise.stop();
        } catch (_) {}
      }

      this.activeVoices.clear();
    }

    setVolume(value) {
      this.initialize();

      const volume = Math.max(0, Math.min(1, Number(value)));

      this.options.volume = volume;

      this.masterGain.gain.setTargetAtTime(
        volume,
        this.audioContext.currentTime,
        0.01
      );
    }

    validateString(stringIndex) {
      if (
        !Number.isInteger(stringIndex) ||
        stringIndex < 0 ||
        stringIndex >= STANDARD_TUNING.length
      ) {
        throw new Error(`Invalid guitar string: ${stringIndex}`);
      }
    }

  
    onSampleError(callback) {
      if (typeof callback === "function") {
        this.sampleErrorListeners.push(callback);
      }
      return () => {
        const idx = this.sampleErrorListeners.indexOf(callback);
        if (idx !== -1) this.sampleErrorListeners.splice(idx, 1);
      };
    }

    emitSampleError(error) {
      this.sampleErrorListeners.forEach(listener => {
        try {
          listener(error);
        } catch (cbErr) {
          console.error("Error in GuitarEngine sample error listener:", cbErr);
        }
      });
    }

    async loadSample(stringIndex, url, options = {}) {
      if (!Number.isInteger(stringIndex) || stringIndex < 0 || stringIndex >= STANDARD_TUNING.length) {
        const err = new SampleLoadError(
          `Invalid guitar string index "${stringIndex}". Must be an integer between 0 and ${STANDARD_TUNING.length - 1}.`,
          { type: "INVALID_INPUT", url }
        );
        this.sampleLoadErrors.set(stringIndex, err);
        this.emitSampleError(err);
        if (options.throwOnError) throw err;
        return { success: false, stringIndex, error: err.message, errorDetails: err, type: err.type, url };
      }

      let context;
      try {
        context = options.audioContext || this.initialize();
      } catch (ctxErr) {
        const err = new SampleLoadError(
          `Cannot load audio sample: AudioContext is not available or supported in this environment.`,
          { type: "INVALID_INPUT", url, originalError: ctxErr }
        );
        this.sampleLoadErrors.set(stringIndex, err);
        this.emitSampleError(err);
        if (options.throwOnError) throw err;
        return { success: false, stringIndex, error: err.message, errorDetails: err, type: err.type, url };
      }

      const fetchFn =
        options.fetchFn ||
        (typeof fetch === "function" ? fetch : null) ||
        (typeof globalThis !== "undefined" && typeof globalThis.fetch === "function"
          ? globalThis.fetch
          : null);

      if (!fetchFn) {
        const err = new SampleLoadError(
          `Fetch API is not available in the current environment to load audio sample "${url}".`,
          { type: "NETWORK", url }
        );
        this.sampleLoadErrors.set(stringIndex, err);
        this.emitSampleError(err);
        if (options.throwOnError) throw err;
        return { success: false, stringIndex, error: err.message, errorDetails: err, type: err.type, url };
      }

      if (!url || typeof url !== "string" || !url.trim()) {
        const err = new SampleLoadError(
          `Invalid audio sample URL provided for guitar string ${stringIndex}: expected non-empty string.`,
          { type: "INVALID_INPUT", url }
        );
        this.sampleLoadErrors.set(stringIndex, err);
        this.emitSampleError(err);
        if (options.throwOnError) throw err;
        return { success: false, stringIndex, error: err.message, errorDetails: err, type: err.type, url };
      }

      const trimmedUrl = url.trim();

      let response;
      try {
        const fetchOpts = {
          mode: options.corsMode || "cors",
          ...options.fetchOptions,
        };
        response = await fetchFn(trimmedUrl, fetchOpts);
      } catch (fetchErr) {
        const isAborted = fetchErr.name === "AbortError";
        const msg = fetchErr.message || "";
        const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;
        const isCors =
          !isOffline &&
          (fetchErr.name === "SecurityError" ||
            msg.toLowerCase().includes("cors") ||
            msg.toLowerCase().includes("cross-origin") ||
            msg.includes("Failed to fetch") ||
            msg.includes("NetworkError"));

        let errType = isAborted ? "ABORTED" : isCors ? "CORS" : "NETWORK";
        let errMsg = isAborted
          ? `Audio sample request for string ${stringIndex} (${trimmedUrl}) was aborted.`
          : isCors
            ? `Failed to load audio sample for string ${stringIndex} from "${trimmedUrl}": Cross-Origin Request Blocked (CORS restriction). The audio sample server must allow cross-origin requests via Access-Control-Allow-Origin headers.`
            : `Failed to load audio sample for string ${stringIndex} from "${trimmedUrl}": Network failure (${msg || "connection refused or host unreachable"}). Verify network connectivity and server availability.`;

        const err = new SampleLoadError(errMsg, {
          type: errType,
          url: trimmedUrl,
          originalError: fetchErr,
        });

        this.sampleLoadErrors.set(stringIndex, err);
        this.emitSampleError(err);
        if (typeof options.onError === "function") options.onError(err);
        if (!options.silent) console.error(`[GuitarEngine] ${errMsg}`);
        if (options.throwOnError) throw err;
        return { success: false, stringIndex, error: errMsg, errorDetails: err, type: errType, url: trimmedUrl };
      }

      if (!response.ok) {
        const status = response.status;
        const statusText = response.statusText || "";
        let errType = "HTTP_ERROR";
        let errMsg = "";

        if (status === 404) {
          errType = "NOT_FOUND";
          errMsg = `Failed to load audio sample for string ${stringIndex} from "${trimmedUrl}": File not found (HTTP 404). Ensure the sample audio file exists at the specified URL.`;
        } else if (status === 403) {
          errType = "FORBIDDEN";
          errMsg = `Failed to load audio sample for string ${stringIndex} from "${trimmedUrl}": Access denied (HTTP 403). Permissions or credentials required.`;
        } else if (status >= 500) {
          errType = "SERVER_ERROR";
          errMsg = `Failed to load audio sample for string ${stringIndex} from "${trimmedUrl}": Server error (HTTP ${status} ${statusText}). The audio host encountered an internal error.`;
        } else {
          errMsg = `Failed to load audio sample for string ${stringIndex} from "${trimmedUrl}": HTTP ${status} (${statusText || "Request failed"}).`;
        }

        const err = new SampleLoadError(errMsg, {
          type: errType,
          url: trimmedUrl,
          status,
          originalError: new Error(`HTTP ${status} ${statusText}`),
        });

        this.sampleLoadErrors.set(stringIndex, err);
        this.emitSampleError(err);
        if (typeof options.onError === "function") options.onError(err);
        if (!options.silent) console.error(`[GuitarEngine] ${errMsg}`);
        if (options.throwOnError) throw err;
        return { success: false, stringIndex, error: errMsg, errorDetails: err, type: errType, url: trimmedUrl, status };
      }

      let arrayBuffer;
      try {
        arrayBuffer = await response.arrayBuffer();
        if (!arrayBuffer || arrayBuffer.byteLength === 0) {
          const err = new SampleLoadError(
            `Failed to load audio sample for string ${stringIndex} from "${trimmedUrl}": Received empty audio payload (0 bytes).`,
            { type: "DECODE", url: trimmedUrl }
          );
          this.sampleLoadErrors.set(stringIndex, err);
          this.emitSampleError(err);
          if (options.throwOnError) throw err;
          return { success: false, stringIndex, error: err.message, errorDetails: err, type: "DECODE", url: trimmedUrl };
        }
      } catch (readErr) {
        const err = new SampleLoadError(
          `Failed to read audio data stream for string ${stringIndex} from "${trimmedUrl}": ${readErr.message}`,
          { type: "NETWORK", url: trimmedUrl, originalError: readErr }
        );
        this.sampleLoadErrors.set(stringIndex, err);
        this.emitSampleError(err);
        if (options.throwOnError) throw err;
        return { success: false, stringIndex, error: err.message, errorDetails: err, type: "NETWORK", url: trimmedUrl };
      }

      return new Promise((resolve, reject) => {
        const onDecodeSuccess = decoded => {
          this.sampleBuffers.set(stringIndex, decoded);
          this.sampleLoadErrors.delete(stringIndex);
          resolve({
            success: true,
            stringIndex,
            buffer: decoded,
            url: trimmedUrl,
            error: null,
          });
        };

        const onDecodeFailure = decodeErr => {
          const err = new SampleLoadError(
            `Failed to decode audio sample for string ${stringIndex} from "${trimmedUrl}": The audio file is corrupted or in an unsupported format.`,
            { type: "DECODE", url: trimmedUrl, originalError: decodeErr }
          );
          this.sampleLoadErrors.set(stringIndex, err);
          this.emitSampleError(err);
          if (typeof options.onError === "function") options.onError(err);
          if (!options.silent) console.error(`[GuitarEngine] ${err.message}`);
          if (options.throwOnError) {
            reject(err);
          } else {
            resolve({
              success: false,
              stringIndex,
              buffer: null,
              error: err.message,
              errorDetails: err,
              type: "DECODE",
              url: trimmedUrl,
            });
          }
        };

        try {
          const bufferCopy = arrayBuffer.slice(0);
          const promise = context.decodeAudioData(
            bufferCopy,
            onDecodeSuccess,
            onDecodeFailure
          );

          if (promise && typeof promise.then === "function") {
            promise.then(onDecodeSuccess).catch(onDecodeFailure);
          }
        } catch (exc) {
          onDecodeFailure(exc);
        }
      });
    }

    async loadSamples(sampleMap, options = {}) {
      const results = {};
      if (!sampleMap || typeof sampleMap !== "object") {
        return results;
      }

      await Promise.all(
        Object.entries(sampleMap).map(async ([key, url]) => {
          const idx = Number(key);
          results[idx] = await this.loadSample(idx, url, {
            ...options,
            throwOnError: false,
          });
        })
      );

      return results;
    }

    getSample(stringIndex) {
      return this.sampleBuffers.get(stringIndex) || null;
    }

    hasSample(stringIndex) {
      return this.sampleBuffers.has(stringIndex);
    }

    getSampleErrors() {
      return new Map(this.sampleLoadErrors);
    }

    clearSamples() {
      this.sampleBuffers.clear();
      this.sampleLoadErrors.clear();
    }

    static get STANDARD_TUNING() {
      return STANDARD_TUNING.map(string => ({
        ...string,
      }));
    }
  }

  GuitarEngine.SampleLoadError = SampleLoadError;
  return GuitarEngine;
});
