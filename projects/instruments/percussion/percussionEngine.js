(function (root, factory) {
  if (typeof define === "function" && define.amd) {
    define([], factory);
  } else if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.PercussionEngine = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const PADS = Object.freeze([
    { id: "kick", label: "Kick", key: "q" },
    { id: "snare", label: "Snare", key: "w" },
    { id: "hihatClosed", label: "Closed Hi-Hat", key: "e" },
    { id: "hihatOpen", label: "Open Hi-Hat", key: "r" },
    { id: "tomLow", label: "Low Tom", key: "a" },
    { id: "tomHigh", label: "High Tom", key: "s" },
    { id: "clap", label: "Clap", key: "d" },
    { id: "crash", label: "Crash", key: "f" },
  ]);

  const KEY_TO_PAD = Object.freeze(
    Object.fromEntries(PADS.map(pad => [pad.key, pad.id]))
  );

  const PAD_TO_KEY = Object.freeze(
    Object.fromEntries(PADS.map(pad => [pad.id, pad.key]))
  );

  const PAD_LABELS = Object.freeze(
    Object.fromEntries(PADS.map(pad => [pad.id, pad.label]))
  );

  class SampleLoadError extends Error {
    constructor(message, { type = "UNKNOWN", url = "", status = null, originalError = null } = {}) {
      super(message);
      this.name = "SampleLoadError";
      this.type = type; // 'NOT_FOUND' | 'CORS' | 'NETWORK' | 'DECODE' | 'FORBIDDEN' | 'SERVER_ERROR' | 'INVALID_INPUT' | 'ABORTED'
      this.url = url;
      this.status = status;
      this.originalError = originalError;
    }
  }

  let audioContext = null;
  let onBlockedCallback = null;

  const sampleBuffers = new Map();
  const sampleLoadErrors = new Map();
  const sampleErrorListeners = [];

  function onSampleError(callback) {
    if (typeof callback === "function") {
      sampleErrorListeners.push(callback);
    }
  }

  function emitSampleError(error) {
    for (const listener of sampleErrorListeners) {
      try {
        listener(error);
      } catch (e) {
        console.error("Error in sample error listener:", e);
      }
    }
  }

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
      console.warn("Percussion AudioContext resume rejected:", err);
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
          console.warn("Percussion AudioContext resume rejected:", err);
          if (typeof onBlockedCallback === "function") onBlockedCallback(true);
        });
    }

    return audioContext;
  }

  function createNoiseBuffer(context, duration) {
    const length = Math.floor(context.sampleRate * duration);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    return buffer;
  }

  function playKick(context, destination, time) {
    const osc = context.createOscillator();
    const gain = context.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(32, time + 0.35);

    gain.gain.setValueAtTime(1, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.4);

    osc.connect(gain);
    gain.connect(destination);

    osc.start(time);
    osc.stop(time + 0.4);
  }

  function playSnare(context, destination, time) {
    const noise = context.createBufferSource();
    noise.buffer = createNoiseBuffer(context, 0.2);

    const noiseFilter = context.createBiquadFilter();
    noiseFilter.type = "highpass";
    noiseFilter.frequency.setValueAtTime(800, time);

    const noiseGain = context.createGain();
    noiseGain.gain.setValueAtTime(0.7, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.2);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(destination);

    const osc = context.createOscillator();
    const oscGain = context.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(180, time);
    osc.frequency.exponentialRampToValueAtTime(60, time + 0.12);

    oscGain.gain.setValueAtTime(0.6, time);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.15);

    osc.connect(oscGain);
    oscGain.connect(destination);

    noise.start(time);
    noise.stop(time + 0.2);

    osc.start(time);
    osc.stop(time + 0.15);
  }

  function playHiHat(context, destination, time, isOpen) {
    const duration = isOpen ? 0.35 : 0.05;
    const noise = context.createBufferSource();
    noise.buffer = createNoiseBuffer(context, duration);

    const filter = context.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.setValueAtTime(7000, time);

    const gain = context.createGain();
    gain.gain.setValueAtTime(0.35, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(destination);

    noise.start(time);
    noise.stop(time + duration);
  }

  function playTom(context, destination, time, isHigh) {
    const osc = context.createOscillator();
    const gain = context.createGain();

    const startFreq = isHigh ? 220 : 130;
    const endFreq = isHigh ? 80 : 50;

    osc.type = "sine";
    osc.frequency.setValueAtTime(startFreq, time);
    osc.frequency.exponentialRampToValueAtTime(endFreq, time + 0.3);

    gain.gain.setValueAtTime(0.8, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.35);

    osc.connect(gain);
    gain.connect(destination);

    osc.start(time);
    osc.stop(time + 0.35);
  }

  function playClap(context, destination, time) {
    const burstOffsets = [0, 0.012, 0.024];

    burstOffsets.forEach(offset => {
      const noise = context.createBufferSource();
      noise.buffer = createNoiseBuffer(context, 0.08);

      const filter = context.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(1200, time + offset);
      filter.Q.setValueAtTime(1.2, time + offset);

      const gain = context.createGain();
      gain.gain.setValueAtTime(0.45, time + offset);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + offset + 0.08);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(destination);

      noise.start(time + offset);
      noise.stop(time + offset + 0.08);
    });
  }

  function playCrash(context, destination, time) {
    const noise = context.createBufferSource();
    noise.buffer = createNoiseBuffer(context, 1.2);

    const filter = context.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.setValueAtTime(4500, time);

    const gain = context.createGain();
    gain.gain.setValueAtTime(0.3, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 1.2);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(destination);

    noise.start(time);
    noise.stop(time + 1.2);
  }

  const PLAYERS = Object.freeze({
    kick: (context, destination, time) => playKick(context, destination, time),
    snare: (context, destination, time) =>
      playSnare(context, destination, time),
    hihatClosed: (context, destination, time) =>
      playHiHat(context, destination, time, false),
    hihatOpen: (context, destination, time) =>
      playHiHat(context, destination, time, true),
    tomLow: (context, destination, time) =>
      playTom(context, destination, time, false),
    tomHigh: (context, destination, time) =>
      playTom(context, destination, time, true),
    clap: (context, destination, time) => playClap(context, destination, time),
    crash: (context, destination, time) =>
      playCrash(context, destination, time),
  });

  function isValidPad(padId) {
    return Object.prototype.hasOwnProperty.call(PAD_LABELS, padId);
  }

  function getPadFromKey(key) {
    if (typeof key !== "string") {
      return null;
    }

    return KEY_TO_PAD[key.toLowerCase()] || null;
  }

  function getKeyFromPad(padId) {
    return PAD_TO_KEY[padId] || null;
  }

  function getPadLabel(padId) {
    return PAD_LABELS[padId] || null;
  }

  function getPads() {
    return PADS.map(pad => ({ ...pad }));
  }

  /**
   * Loads an audio sample from a URL with detailed error classification.
   */
  async function loadSample(padId, url, options = {}) {
    if (!isValidPad(padId)) {
      const err = new SampleLoadError(
        `Invalid pad identifier "${padId}". Supported pads are: ${PADS.map(p => p.id).join(", ")}.`,
        { type: "INVALID_INPUT", url }
      );
      sampleLoadErrors.set(padId, err);
      emitSampleError(err);
      if (options.throwOnError) throw err;
      return { success: false, padId, error: err.message, errorDetails: err, type: err.type, url };
    }

    const context = getAudioContext();
    if (!context) {
      const err = new SampleLoadError(
        `Cannot load audio sample: AudioContext is not available or supported in this environment.`,
        { type: "INVALID_INPUT", url }
      );
      sampleLoadErrors.set(padId, err);
      emitSampleError(err);
      if (options.throwOnError) throw err;
      return { success: false, padId, error: err.message, errorDetails: err, type: err.type, url };
    }

    // Use shared loader if available, or execute inline logic
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
      sampleLoadErrors.set(padId, err);
      emitSampleError(err);
      if (options.throwOnError) throw err;
      return { success: false, padId, error: err.message, errorDetails: err, type: err.type, url };
    }

    if (!url || typeof url !== "string" || !url.trim()) {
      const err = new SampleLoadError(
        `Invalid audio sample URL provided for pad "${padId}": expected non-empty string.`,
        { type: "INVALID_INPUT", url }
      );
      sampleLoadErrors.set(padId, err);
      emitSampleError(err);
      if (options.throwOnError) throw err;
      return { success: false, padId, error: err.message, errorDetails: err, type: err.type, url };
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
        ? `Audio sample request for pad "${padId}" (${trimmedUrl}) was aborted.`
        : isCors
          ? `Failed to load audio sample for pad "${padId}" from "${trimmedUrl}": Cross-Origin Request Blocked (CORS restriction). The audio sample server must allow cross-origin requests via Access-Control-Allow-Origin headers.`
          : `Failed to load audio sample for pad "${padId}" from "${trimmedUrl}": Network failure (${msg || "connection refused or host unreachable"}). Verify network connectivity and server availability.`;

      const err = new SampleLoadError(errMsg, {
        type: errType,
        url: trimmedUrl,
        originalError: fetchErr,
      });

      sampleLoadErrors.set(padId, err);
      emitSampleError(err);
      if (typeof options.onError === "function") options.onError(err);
      if (!options.silent) console.error(`[PercussionEngine] ${errMsg}`);
      if (options.throwOnError) throw err;
      return { success: false, padId, error: errMsg, errorDetails: err, type: errType, url: trimmedUrl };
    }

    if (!response.ok) {
      const status = response.status;
      const statusText = response.statusText || "";
      let errType = "HTTP_ERROR";
      let errMsg = "";

      if (status === 404) {
        errType = "NOT_FOUND";
        errMsg = `Failed to load audio sample for pad "${padId}" from "${trimmedUrl}": File not found (HTTP 404). Ensure the sample audio file exists at the specified URL.`;
      } else if (status === 403) {
        errType = "FORBIDDEN";
        errMsg = `Failed to load audio sample for pad "${padId}" from "${trimmedUrl}": Access denied (HTTP 403). Permissions or credentials required.`;
      } else if (status >= 500) {
        errType = "SERVER_ERROR";
        errMsg = `Failed to load audio sample for pad "${padId}" from "${trimmedUrl}": Server error (HTTP ${status} ${statusText}). The audio host encountered an internal error.`;
      } else {
        errMsg = `Failed to load audio sample for pad "${padId}" from "${trimmedUrl}": HTTP ${status} (${statusText || "Request failed"}).`;
      }

      const err = new SampleLoadError(errMsg, {
        type: errType,
        url: trimmedUrl,
        status,
        originalError: new Error(`HTTP ${status} ${statusText}`),
      });

      sampleLoadErrors.set(padId, err);
      emitSampleError(err);
      if (typeof options.onError === "function") options.onError(err);
      if (!options.silent) console.error(`[PercussionEngine] ${errMsg}`);
      if (options.throwOnError) throw err;
      return { success: false, padId, error: errMsg, errorDetails: err, type: errType, url: trimmedUrl, status };
    }

    let arrayBuffer;
    try {
      arrayBuffer = await response.arrayBuffer();
      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        const err = new SampleLoadError(
          `Failed to load audio sample for pad "${padId}" from "${trimmedUrl}": Received empty audio payload (0 bytes).`,
          { type: "DECODE", url: trimmedUrl }
        );
        sampleLoadErrors.set(padId, err);
        emitSampleError(err);
        if (options.throwOnError) throw err;
        return { success: false, padId, error: err.message, errorDetails: err, type: "DECODE", url: trimmedUrl };
      }
    } catch (readErr) {
      const err = new SampleLoadError(
        `Failed to read audio data stream for pad "${padId}" from "${trimmedUrl}": ${readErr.message}`,
        { type: "NETWORK", url: trimmedUrl, originalError: readErr }
      );
      sampleLoadErrors.set(padId, err);
      emitSampleError(err);
      if (options.throwOnError) throw err;
      return { success: false, padId, error: err.message, errorDetails: err, type: "NETWORK", url: trimmedUrl };
    }

    return new Promise((resolve, reject) => {
      function onDecodeSuccess(decoded) {
        sampleBuffers.set(padId, decoded);
        sampleLoadErrors.delete(padId);
        resolve({
          success: true,
          padId,
          buffer: decoded,
          url: trimmedUrl,
          error: null,
        });
      }

      function onDecodeFailure(decodeErr) {
        const err = new SampleLoadError(
          `Failed to decode audio sample for pad "${padId}" from "${trimmedUrl}": The audio file is corrupted or in an unsupported format.`,
          { type: "DECODE", url: trimmedUrl, originalError: decodeErr }
        );
        sampleLoadErrors.set(padId, err);
        emitSampleError(err);
        if (typeof options.onError === "function") options.onError(err);
        if (!options.silent) console.error(`[PercussionEngine] ${err.message}`);
        if (options.throwOnError) {
          reject(err);
        } else {
          resolve({
            success: false,
            padId,
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
      Object.entries(sampleMap).map(async ([padId, url]) => {
        results[padId] = await loadSample(padId, url, {
          ...options,
          throwOnError: false,
        });
      })
    );

    return results;
  }

  function getSample(padId) {
    return sampleBuffers.get(padId) || null;
  }

  function hasSample(padId) {
    return sampleBuffers.has(padId);
  }

  function getSampleErrors() {
    return new Map(sampleLoadErrors);
  }

  function clearSamples() {
    sampleBuffers.clear();
    sampleLoadErrors.clear();
  }

  function playPad(padId) {
    if (!isValidPad(padId)) {
      return false;
    }

    const context = getAudioContext();
    if (!context) {
      return false;
    }

    const time = context.currentTime;

    // Use loaded sample if present; otherwise fall back smoothly to synthesized audio
    const sampleBuffer = sampleBuffers.get(padId);
    if (sampleBuffer) {
      try {
        const source = context.createBufferSource();
        source.buffer = sampleBuffer;
        source.connect(context.destination);
        source.start(time);
        return true;
      } catch (err) {
        console.warn(`Failed to play sample buffer for pad "${padId}", falling back to synthesis:`, err);
      }
    }

    PLAYERS[padId](context, context.destination, time);
    return true;
  }

  function playPadFromKey(key) {
    const padId = getPadFromKey(key);

    if (!padId) {
      return false;
    }

    return playPad(padId);
  }

  return {
    PADS,
    KEY_TO_PAD,
    PAD_TO_KEY,
    SampleLoadError,
    getPadFromKey,
    getKeyFromPad,
    getPadLabel,
    isValidPad,
    getPads,
    loadSample,
    loadSamples,
    getSample,
    hasSample,
    getSampleErrors,
    clearSamples,
    onSampleError,
    playPad,
    playPadFromKey,
    resumeAudio,
    getAudioContext,
    setOnBlockedCallback: fn => {
      onBlockedCallback = fn;
    },
  };
});
