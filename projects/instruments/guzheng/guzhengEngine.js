(function (root, factory) {
  if (typeof define === "function" && define.amd) {
    define([], factory);
  } else if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.GuzhengEngine = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* Guzheng strings are tuned to a pentatonic scale (D major pentatonic:
       D E F# A B), spanning roughly 4 octaves — 21 strings, low to high. */
  const STRINGS = Object.freeze([
    { note: "D3", freq: 146.83, key: "1" },
    { note: "E3", freq: 164.81, key: "2" },
    { note: "F#3", freq: 185.0, key: "3" },
    { note: "A3", freq: 220.0, key: "4" },
    { note: "B3", freq: 246.94, key: "5" },
    { note: "D4", freq: 293.66, key: "6" },
    { note: "E4", freq: 329.63, key: "7" },
    { note: "F#4", freq: 369.99, key: "8" },
    { note: "A4", freq: 440.0, key: "9" },
    { note: "B4", freq: 493.88, key: "0" },
    { note: "D5", freq: 587.33, key: "q" },
    { note: "E5", freq: 659.25, key: "w" },
    { note: "F#5", freq: 739.99, key: "e" },
    { note: "A5", freq: 880.0, key: "r" },
    { note: "B5", freq: 987.77, key: "t" },
    { note: "D6", freq: 1174.66, key: "y" },
    { note: "E6", freq: 1318.51, key: "u" },
    { note: "F#6", freq: 1479.98, key: "i" },
    { note: "A6", freq: 1760.0, key: "o" },
    { note: "B6", freq: 1975.53, key: "p" },
    { note: "D7", freq: 2349.32, key: "[" },
  ]);

  const KEY_TO_NOTE = Object.freeze(
    Object.fromEntries(STRINGS.map(s => [s.key, s.note]))
  );

  const NOTE_TO_KEY = Object.freeze(
    Object.fromEntries(STRINGS.map(s => [s.note, s.key]))
  );

  const NOTE_TO_FREQ = Object.freeze(
    Object.fromEntries(STRINGS.map(s => [s.note, s.freq]))
  );

  let audioContext = null;

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

  const sampleBuffers = new Map();
  const sampleLoadErrors = new Map();
  const sampleErrorListeners = [];

  function onSampleError(callback) {
    if (typeof callback === "function") {
      sampleErrorListeners.push(callback);
    }
    return () => {
      const idx = sampleErrorListeners.indexOf(callback);
      if (idx !== -1) sampleErrorListeners.splice(idx, 1);
    };
  }

  function emitSampleError(error) {
    sampleErrorListeners.forEach(listener => {
      try {
        listener(error);
      } catch (cbErr) {
        console.error("Error in GuzhengEngine sample error listener:", cbErr);
      }
    });
  }


  let onBlockedCallback = null;

  async function resumeAudio() {
    const context = getAudioContext();
    if (!context) return false;
    if (context.state === "running") {
      if (typeof onBlockedCallback === "function") onBlockedCallback(false);
      return true;
    }
    try {
      await context.resume();
      if (typeof onBlockedCallback === "function") onBlockedCallback(false);
      return true;
    } catch (err) {
      console.warn("Guzheng AudioContext resume rejected:", err);
      if (typeof onBlockedCallback === "function") onBlockedCallback(true);
      return false;
    }
  }

  function getAudioContext() {
    if (typeof window === "undefined" && typeof globalThis === "undefined") {
      return null;
    }

    const AudioContext =
      (typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext)) ||
      (typeof globalThis !== "undefined" && (globalThis.AudioContext || globalThis.webkitAudioContext));

    if (!AudioContext) {
      return null;
    }

    if (!audioContext) {
      audioContext = new AudioContext();
    }

    if (audioContext.state === "suspended") {
      audioContext
        .resume()
        .then(() => {
          if (typeof onBlockedCallback === "function") onBlockedCallback(false);
        })
        .catch(err => {
          console.warn("Guzheng AudioContext resume rejected:", err);
          if (typeof onBlockedCallback === "function") onBlockedCallback(true);
        });
    }

    return audioContext;
  }

  function createPluckNoise(context, destination, frequency, time) {
    const duration = 0.03;
    const length = Math.floor(context.sampleRate * duration);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    }

    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();

    source.buffer = buffer;
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(
      Math.min(Math.max(frequency * 3, 1200), 6000),
      time
    );
    filter.Q.setValueAtTime(1.4, time);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.18, time + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(destination);

    source.start(time);
    source.stop(time + duration + 0.01);
  }

  function pluckString(note) {
    if (!isValidNote(note)) {
      return false;
    }

    const context = getAudioContext();

    if (!context) {
      return false;
    }

    const time = context.currentTime;

    const sampleBuffer = sampleBuffers.get(note);
    if (sampleBuffer) {
      try {
        const source = context.createBufferSource();
        source.buffer = sampleBuffer;
        source.connect(context.destination);
        source.start(time);
        return true;
      } catch (err) {
        console.warn(`Failed to play sample for note "${note}", falling back to synthesis:`, err);
      }
    }
    const frequency = NOTE_TO_FREQ[note];

    const output = context.createGain();
    output.gain.setValueAtTime(0.0001, time);
    output.gain.exponentialRampToValueAtTime(0.4, time + 0.004);
    output.gain.exponentialRampToValueAtTime(0.16, time + 0.5);
    output.gain.exponentialRampToValueAtTime(0.0001, time + 2.6);
    output.connect(context.destination);

    /* Harmonic series shaped for a bright, metallic zither timbre. */
    const harmonics = [
      [1, 0.65],
      [2, 0.3],
      [3, 0.16],
      [4, 0.09],
      [5, 0.05],
      [6, 0.03],
    ];

    harmonics.forEach(([multiplier, volume]) => {
      const oscillator = context.createOscillator();
      const harmonicGain = context.createGain();

      oscillator.type = multiplier === 1 ? "triangle" : "sine";
      oscillator.frequency.setValueAtTime(frequency * multiplier, time);

      harmonicGain.gain.setValueAtTime(volume, time);

      oscillator.connect(harmonicGain);
      harmonicGain.connect(output);

      oscillator.start(time);
      oscillator.stop(time + 2.7);
    });

    createPluckNoise(context, output, frequency, time);

    return true;
  }

  function pluckStringFromKey(key) {
    const note = getNoteFromKey(key);

    if (!note) {
      return false;
    }

    return pluckString(note);
  }

  function getNoteFromKey(key) {
    if (typeof key !== "string") {
      return null;
    }

    return KEY_TO_NOTE[key.toLowerCase()] || null;
  }

  function getKeyFromNote(note) {
    return NOTE_TO_KEY[note] || null;
  }

  function getFrequency(note) {
    return NOTE_TO_FREQ[note] || null;
  }

  function isValidNote(note) {
    return Object.prototype.hasOwnProperty.call(NOTE_TO_FREQ, note);
  }

  function getStrings() {
    return STRINGS.map(s => ({ ...s }));
  }


  async function loadSample(note, url, options = {}) {
    if (!isValidNote(note)) {
      const err = new SampleLoadError(
        `Invalid guzheng note identifier "${note}". Must be one of: ${STRINGS.map(s => s.note).join(", ")}.`,
        { type: "INVALID_INPUT", url }
      );
      sampleLoadErrors.set(note, err);
      emitSampleError(err);
      if (options.throwOnError) throw err;
      return { success: false, note, error: err.message, errorDetails: err, type: err.type, url };
    }

    const context = options.audioContext || getAudioContext();
    if (!context) {
      const err = new SampleLoadError(
        `Cannot load audio sample: AudioContext is not available or supported in this environment.`,
        { type: "INVALID_INPUT", url }
      );
      sampleLoadErrors.set(note, err);
      emitSampleError(err);
      if (options.throwOnError) throw err;
      return { success: false, note, error: err.message, errorDetails: err, type: err.type, url };
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
      sampleLoadErrors.set(note, err);
      emitSampleError(err);
      if (options.throwOnError) throw err;
      return { success: false, note, error: err.message, errorDetails: err, type: err.type, url };
    }

    if (!url || typeof url !== "string" || !url.trim()) {
      const err = new SampleLoadError(
        `Invalid audio sample URL provided for guzheng note "${note}": expected non-empty string.`,
        { type: "INVALID_INPUT", url }
      );
      sampleLoadErrors.set(note, err);
      emitSampleError(err);
      if (options.throwOnError) throw err;
      return { success: false, note, error: err.message, errorDetails: err, type: err.type, url };
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
        ? `Audio sample request for note "${note}" (${trimmedUrl}) was aborted.`
        : isCors
          ? `Failed to load audio sample for note "${note}" from "${trimmedUrl}": Cross-Origin Request Blocked (CORS restriction). The audio sample server must allow cross-origin requests via Access-Control-Allow-Origin headers.`
          : `Failed to load audio sample for note "${note}" from "${trimmedUrl}": Network failure (${msg || "connection refused or host unreachable"}). Verify network connectivity and server availability.`;

      const err = new SampleLoadError(errMsg, {
        type: errType,
        url: trimmedUrl,
        originalError: fetchErr,
      });

      sampleLoadErrors.set(note, err);
      emitSampleError(err);
      if (typeof options.onError === "function") options.onError(err);
      if (!options.silent) console.error(`[GuzhengEngine] ${errMsg}`);
      if (options.throwOnError) throw err;
      return { success: false, note, error: errMsg, errorDetails: err, type: errType, url: trimmedUrl };
    }

    if (!response.ok) {
      const status = response.status;
      const statusText = response.statusText || "";
      let errType = "HTTP_ERROR";
      let errMsg = "";

      if (status === 404) {
        errType = "NOT_FOUND";
        errMsg = `Failed to load audio sample for note "${note}" from "${trimmedUrl}": File not found (HTTP 404). Ensure the sample audio file exists at the specified URL.`;
      } else if (status === 403) {
        errType = "FORBIDDEN";
        errMsg = `Failed to load audio sample for note "${note}" from "${trimmedUrl}": Access denied (HTTP 403). Permissions or credentials required.`;
      } else if (status >= 500) {
        errType = "SERVER_ERROR";
        errMsg = `Failed to load audio sample for note "${note}" from "${trimmedUrl}": Server error (HTTP ${status} ${statusText}). The audio host encountered an internal error.`;
      } else {
        errMsg = `Failed to load audio sample for note "${note}" from "${trimmedUrl}": HTTP ${status} (${statusText || "Request failed"}).`;
      }

      const err = new SampleLoadError(errMsg, {
        type: errType,
        url: trimmedUrl,
        status,
        originalError: new Error(`HTTP ${status} ${statusText}`),
      });

      sampleLoadErrors.set(note, err);
      emitSampleError(err);
      if (typeof options.onError === "function") options.onError(err);
      if (!options.silent) console.error(`[GuzhengEngine] ${errMsg}`);
      if (options.throwOnError) throw err;
      return { success: false, note, error: errMsg, errorDetails: err, type: errType, url: trimmedUrl, status };
    }

    let arrayBuffer;
    try {
      arrayBuffer = await response.arrayBuffer();
      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        const err = new SampleLoadError(
          `Failed to load audio sample for note "${note}" from "${trimmedUrl}": Received empty audio payload (0 bytes).`,
          { type: "DECODE", url: trimmedUrl }
        );
        sampleLoadErrors.set(note, err);
        emitSampleError(err);
        if (options.throwOnError) throw err;
        return { success: false, note, error: err.message, errorDetails: err, type: "DECODE", url: trimmedUrl };
      }
    } catch (readErr) {
      const err = new SampleLoadError(
        `Failed to read audio data stream for note "${note}" from "${trimmedUrl}": ${readErr.message}`,
        { type: "NETWORK", url: trimmedUrl, originalError: readErr }
      );
      sampleLoadErrors.set(note, err);
      emitSampleError(err);
      if (options.throwOnError) throw err;
      return { success: false, note, error: err.message, errorDetails: err, type: "NETWORK", url: trimmedUrl };
    }

    return new Promise((resolve, reject) => {
      function onDecodeSuccess(decoded) {
        sampleBuffers.set(note, decoded);
        sampleLoadErrors.delete(note);
        resolve({
          success: true,
          note,
          buffer: decoded,
          url: trimmedUrl,
          error: null,
        });
      }

      function onDecodeFailure(decodeErr) {
        const err = new SampleLoadError(
          `Failed to decode audio sample for note "${note}" from "${trimmedUrl}": The audio file is corrupted or in an unsupported format.`,
          { type: "DECODE", url: trimmedUrl, originalError: decodeErr }
        );
        sampleLoadErrors.set(note, err);
        emitSampleError(err);
        if (typeof options.onError === "function") options.onError(err);
        if (!options.silent) console.error(`[GuzhengEngine] ${err.message}`);
        if (options.throwOnError) {
          reject(err);
        } else {
          resolve({
            success: false,
            note,
            buffer: null,
            error: err.message,
            errorDetails: err,
            type: "DECODE",
            url: trimmedUrl,
          });
        }
      }

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

  async function loadSamples(sampleMap, options = {}) {
    const results = {};
    if (!sampleMap || typeof sampleMap !== "object") {
      return results;
    }

    await Promise.all(
      Object.entries(sampleMap).map(async ([note, url]) => {
        results[note] = await loadSample(note, url, {
          ...options,
          throwOnError: false,
        });
      })
    );

    return results;
  }

  function getSample(note) {
    return sampleBuffers.get(note) || null;
  }

  function hasSample(note) {
    return sampleBuffers.has(note);
  }

  function getSampleErrors() {
    return new Map(sampleLoadErrors);
  }

  function clearSamples() {
    sampleBuffers.clear();
    sampleLoadErrors.clear();
  }

  return {
    SampleLoadError,
    loadSample,
    loadSamples,
    getSample,
    hasSample,
    getSampleErrors,
    clearSamples,
    onSampleError,
    STRINGS,
    KEY_TO_NOTE,
    NOTE_TO_KEY,
    getNoteFromKey,
    getKeyFromNote,
    getFrequency,
    isValidNote,
    getStrings,
    pluckString,
    pluckStringFromKey,
    resumeAudio,
    getAudioContext,
    setOnBlockedCallback: fn => {
      onBlockedCallback = fn;
    },
  };
});
