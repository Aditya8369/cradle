/**
 * Instrument Sample Loader
 * Provides robust audio sample loading, decoding, and error diagnostics for instruments.
 * Detects missing files (404), CORS restrictions, network failures, and decode errors.
 */

(function (root, factory) {
  if (typeof define === "function" && define.amd) {
    define([], factory);
  } else if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.InstrumentSampleLoader = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

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

  /**
   * Loads and decodes an audio sample from a given URL into an AudioBuffer.
   * Accurately categorizes errors (Missing file, CORS block, Network down, Decode failure).
   *
   * @param {string} url - Audio resource URL
   * @param {AudioContext} audioContext - Web Audio context for decoding
   * @param {Object} [options] - Options (fetchFn, signal, throwOnError, onError, silent, timeoutMs)
   * @returns {Promise<{ success: boolean, buffer: AudioBuffer|null, error: string|null, errorDetails?: SampleLoadError, type?: string, url: string, status?: number|null }>}
   */
  async function loadAudioSample(url, audioContext, options = {}) {
    const throwOnError = options.throwOnError === true;

    function handleFailure(message, details) {
      const error = new SampleLoadError(message, details);

      if (typeof options.onError === "function") {
        try {
          options.onError(error);
        } catch (cbErr) {
          console.error("Error in sample onError callback:", cbErr);
        }
      }

      if (!options.silent) {
        console.error(`[Instrument Sample Loader] ${message}`);
      }

      if (throwOnError) {
        throw error;
      }

      return {
        success: false,
        buffer: null,
        error: message,
        errorDetails: error,
        type: error.type,
        url: error.url,
        status: error.status,
      };
    }

    // 1. Validate URL
    if (!url || typeof url !== "string" || !url.trim()) {
      return handleFailure(
        `Invalid audio sample URL provided: expected non-empty string, received ${typeof url}.`,
        { type: "INVALID_INPUT", url: url || "" }
      );
    }

    const trimmedUrl = url.trim();

    // 2. Validate AudioContext
    if (!audioContext || typeof audioContext.decodeAudioData !== "function") {
      return handleFailure(
        `AudioContext with decodeAudioData support is required to load sample "${trimmedUrl}".`,
        { type: "INVALID_INPUT", url: trimmedUrl }
      );
    }

    // 3. Obtain fetch function
    const fetchFn =
      options.fetchFn ||
      (typeof fetch === "function" ? fetch : null) ||
      (typeof globalThis !== "undefined" && typeof globalThis.fetch === "function"
        ? globalThis.fetch
        : null);

    if (!fetchFn) {
      return handleFailure(
        `Fetch API is not available in the current environment to load audio sample "${trimmedUrl}".`,
        { type: "NETWORK", url: trimmedUrl }
      );
    }

    // 4. Fetch the audio file
    let response;
    try {
      const fetchOptions = {
        mode: options.corsMode || "cors",
        ...options.fetchOptions,
      };

      let timeoutId;
      if (typeof AbortController !== "undefined" && options.timeoutMs > 0) {
        const controller = new AbortController();
        fetchOptions.signal = controller.signal;
        timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);
      } else if (options.signal) {
        fetchOptions.signal = options.signal;
      }

      try {
        response = await fetchFn(trimmedUrl, fetchOptions);
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    } catch (fetchErr) {
      const isAborted =
        fetchErr.name === "AbortError" ||
        (fetchErr.message && fetchErr.message.includes("aborted"));
      const msg = fetchErr.message || "";
      const isOffline =
        typeof navigator !== "undefined" && navigator.onLine === false;

      let isCrossDomain = false;
      try {
        if (typeof window !== "undefined" && window.location) {
          const sampleOrigin = new URL(trimmedUrl, window.location.href).origin;
          isCrossDomain = sampleOrigin !== window.location.origin;
        }
      } catch {}

      const isCors =
        !isOffline &&
        (fetchErr.name === "SecurityError" ||
          msg.toLowerCase().includes("cors") ||
          msg.toLowerCase().includes("cross-origin") ||
          (isCrossDomain &&
            (msg.includes("Failed to fetch") || msg.includes("NetworkError"))));

      let errorType = "NETWORK";
      let message = "";

      if (isAborted) {
        errorType = "ABORTED";
        message = `Loading of audio sample from "${trimmedUrl}" was aborted.`;
      } else if (isCors) {
        errorType = "CORS";
        message = `Failed to load audio sample from "${trimmedUrl}": Cross-Origin Request Blocked (CORS restriction). The server hosting this audio sample must include the 'Access-Control-Allow-Origin' header to allow cross-origin requests.`;
      } else if (isOffline) {
        errorType = "NETWORK";
        message = `Failed to load audio sample from "${trimmedUrl}": Network offline. The device is not connected to the internet.`;
      } else {
        errorType = "NETWORK";
        message = `Failed to load audio sample from "${trimmedUrl}": Network failure (${msg || "connection refused or host unreachable"}). Verify server availability and network connectivity.`;
      }

      return handleFailure(message, {
        type: errorType,
        url: trimmedUrl,
        originalError: fetchErr,
      });
    }

    // 5. Handle HTTP status codes
    if (!response.ok) {
      const status = response.status;
      const statusText = response.statusText || "";
      let errorType = "HTTP_ERROR";
      let message = "";

      if (status === 404) {
        errorType = "NOT_FOUND";
        message = `Failed to load audio sample from "${trimmedUrl}": File not found (HTTP 404). Ensure the sample audio file exists at the specified URL/path.`;
      } else if (status === 403) {
        errorType = "FORBIDDEN";
        message = `Failed to load audio sample from "${trimmedUrl}": Access denied (HTTP 403). The server forbidden access to this sample resource.`;
      } else if (status >= 500) {
        errorType = "SERVER_ERROR";
        message = `Failed to load audio sample from "${trimmedUrl}": Server error (HTTP ${status} ${statusText}). The remote audio host encountered an internal error.`;
      } else {
        message = `Failed to load audio sample from "${trimmedUrl}": HTTP ${status} (${statusText || "Request failed"}).`;
      }

      return handleFailure(message, {
        type: errorType,
        url: trimmedUrl,
        status,
        originalError: new Error(`HTTP ${status} ${statusText}`),
      });
    }

    // 6. Read ArrayBuffer
    let arrayBuffer;
    try {
      arrayBuffer = await response.arrayBuffer();
      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        return handleFailure(
          `Failed to load audio sample from "${trimmedUrl}": Received empty audio payload (0 bytes).`,
          { type: "DECODE", url: trimmedUrl }
        );
      }
    } catch (readErr) {
      return handleFailure(
        `Failed to read audio sample response stream from "${trimmedUrl}": ${readErr.message}`,
        { type: "NETWORK", url: trimmedUrl, originalError: readErr }
      );
    }

    // 7. Decode AudioBuffer via AudioContext
    return new Promise((resolve, reject) => {
      let resolved = false;

      function onDecodeSuccess(decoded) {
        if (resolved) return;
        resolved = true;
        resolve({
          success: true,
          buffer: decoded,
          url: trimmedUrl,
          error: null,
        });
      }

      function onDecodeFailure(decodeErr) {
        if (resolved) return;
        resolved = true;
        const error = new SampleLoadError(
          `Failed to decode audio sample from "${trimmedUrl}": The audio file is corrupted or in an unsupported format.`,
          { type: "DECODE", url: trimmedUrl, originalError: decodeErr }
        );

        if (typeof options.onError === "function") {
          try {
            options.onError(error);
          } catch (cbErr) {
            console.error("Error in sample onError callback:", cbErr);
          }
        }

        if (!options.silent) {
          console.error(`[Instrument Sample Loader] ${error.message}`);
        }

        if (throwOnError) {
          reject(error);
        } else {
          resolve({
            success: false,
            buffer: null,
            error: error.message,
            errorDetails: error,
            type: "DECODE",
            url: trimmedUrl,
          });
        }
      }

      try {
        const bufferCopy = arrayBuffer.slice(0);
        const promise = audioContext.decodeAudioData(
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

  /**
   * Loads multiple audio samples in parallel, returning aggregated results and error summaries.
   *
   * @param {Object<string, string>} sampleMap - Map of identifiers to sample URLs
   * @param {AudioContext} audioContext - Web Audio context
   * @param {Object} [options] - Options passed to loadAudioSample
   * @returns {Promise<{ loaded: Object<string, AudioBuffer>, errors: Object<string, SampleLoadError>, hasErrors: boolean }>}
   */
  async function loadSampleMap(sampleMap, audioContext, options = {}) {
    const loaded = {};
    const errors = {};

    if (!sampleMap || typeof sampleMap !== "object") {
      return { loaded, errors, hasErrors: false };
    }

    const entries = Object.entries(sampleMap);
    await Promise.all(
      entries.map(async ([key, url]) => {
        const result = await loadAudioSample(url, audioContext, {
          ...options,
          throwOnError: false,
        });

        if (result.success && result.buffer) {
          loaded[key] = result.buffer;
        } else {
          errors[key] = result.errorDetails || result.error;
        }
      })
    );

    return {
      loaded,
      errors,
      hasErrors: Object.keys(errors).length > 0,
    };
  }

  return {
    SampleLoadError,
    loadAudioSample,
    loadSampleMap,
  };
});

