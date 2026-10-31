/**
 * @fileoverview Reusable media validator for blobs, files, and buffers.
 * Inspects MIME types and binary file signatures (magic bytes) to verify that
 * uploaded or processed blobs match safe, expected media types.
 */

(function (root, factory) {
  if (typeof define === "function" && define.amd) {
    define([], factory);
  } else if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.CradleMediaValidator = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const MIME_ALIASES = {
    "image/jpg": "image/jpeg",
    "image/pjpeg": "image/jpeg",
    "image/svg": "image/svg+xml",
    "audio/mp3": "audio/mpeg",
    "audio/mpg": "audio/mpeg",
    "audio/wave": "audio/wav",
    "audio/x-wav": "audio/wav",
    "audio/x-flac": "audio/flac",
    "audio/x-m4a": "audio/mp4",
    "audio/m4a": "audio/mp4",
    "video/mp4": "audio/mp4",
    "video/webm": "audio/webm",
  };

  const DEFAULT_IMAGE_MIMES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
  ];

  const DEFAULT_AUDIO_MIMES = [
    "audio/mpeg",
    "audio/wav",
    "audio/ogg",
    "audio/flac",
    "audio/webm",
    "audio/mp4",
    "audio/aac",
  ];

  /**
   * Normalizes a MIME type string.
   * @param {string} mime
   * @returns {string}
   */
  function normalizeMime(mime) {
    if (typeof mime !== "string") return "";
    const cleaned = mime.split(";")[0].trim().toLowerCase();
    return MIME_ALIASES[cleaned] || cleaned;
  }

  /**
   * Checks if an input is a text-based SVG image.
   * @param {Uint8Array} bytes
   * @returns {boolean}
   */
  function isSvgBytes(bytes) {
    if (!bytes || bytes.length === 0) return false;
    // Reject binary files containing null bytes in initial chunk
    const limit = Math.min(bytes.length, 128);
    for (let i = 0; i < limit; i++) {
      if (bytes[i] === 0) return false;
    }
    let str = "";
    try {
      if (typeof TextDecoder !== "undefined") {
        str = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      } else {
        str = String.fromCharCode.apply(null, Array.from(bytes));
      }
    } catch (_) {
      return false;
    }
    const trimmed = str.trim().toLowerCase();
    return (
      trimmed.startsWith("<svg") ||
      (trimmed.startsWith("<?xml") && trimmed.includes("<svg")) ||
      trimmed.includes("<svg")
    );
  }

  /**
   * Inspects binary magic numbers from byte array to detect MIME type and category.
   * @param {Uint8Array|ArrayBuffer|Array<number>} input
   * @returns {{mimeType: string, extension: string, category: 'image'|'audio'|'video'|'other'}|null}
   */
  function detectSignature(input) {
    if (!input) return null;
    const bytes =
      input instanceof Uint8Array
        ? input
        : input instanceof ArrayBuffer
          ? new Uint8Array(input)
          : ArrayBuffer.isView(input)
            ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
            : Array.isArray(input)
              ? new Uint8Array(input)
              : null;

    if (!bytes || bytes.length < 2) return null;
    const len = bytes.length;

    // JPEG: FF D8 FF
    if (len >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return { mimeType: "image/jpeg", extension: "jpg", category: "image" };
    }

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      len >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    ) {
      return { mimeType: "image/png", extension: "png", category: "image" };
    }

    // GIF: GIF87a or GIF89a
    if (
      len >= 6 &&
      bytes[0] === 0x47 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x38 &&
      (bytes[4] === 0x37 || bytes[4] === 0x39) &&
      bytes[5] === 0x61
    ) {
      return { mimeType: "image/gif", extension: "gif", category: "image" };
    }

    // RIFF container: WebP or WAV
    if (
      len >= 12 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46
    ) {
      // WEBP: bytes 8-11: 57 45 42 50
      if (
        bytes[8] === 0x57 &&
        bytes[9] === 0x45 &&
        bytes[10] === 0x42 &&
        bytes[11] === 0x50
      ) {
        return { mimeType: "image/webp", extension: "webp", category: "image" };
      }
      // WAVE: bytes 8-11: 57 41 56 45
      if (
        bytes[8] === 0x57 &&
        bytes[9] === 0x41 &&
        bytes[10] === 0x56 &&
        bytes[11] === 0x45
      ) {
        return { mimeType: "audio/wav", extension: "wav", category: "audio" };
      }
    }

    // BMP: BM (42 4D)
    if (len >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
      return { mimeType: "image/bmp", extension: "bmp", category: "image" };
    }

    // ICO: 00 00 01 00
    if (
      len >= 4 &&
      bytes[0] === 0x00 &&
      bytes[1] === 0x00 &&
      bytes[2] === 0x01 &&
      bytes[3] === 0x00
    ) {
      return { mimeType: "image/x-icon", extension: "ico", category: "image" };
    }

    // MP3 ID3 header: 49 44 33
    if (len >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
      return { mimeType: "audio/mpeg", extension: "mp3", category: "audio" };
    }

    // MP3 Frame sync: FF FB, FF F3, FF F2 or 11 bits sync (0xFF and 0xE0 mask)
    if (len >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
      const layer = (bytes[1] >> 1) & 0x03;
      if (layer !== 0) {
        return { mimeType: "audio/mpeg", extension: "mp3", category: "audio" };
      }
    }

    // OGG: OggS (4F 67 67 53)
    if (
      len >= 4 &&
      bytes[0] === 0x4f &&
      bytes[1] === 0x67 &&
      bytes[2] === 0x67 &&
      bytes[3] === 0x53
    ) {
      return { mimeType: "audio/ogg", extension: "ogg", category: "audio" };
    }

    // FLAC: fLaC (66 4C 61 43)
    if (
      len >= 4 &&
      bytes[0] === 0x66 &&
      bytes[1] === 0x4c &&
      bytes[2] === 0x61 &&
      bytes[3] === 0x43
    ) {
      return { mimeType: "audio/flac", extension: "flac", category: "audio" };
    }

    // WebM / Matroska: 1A 45 DF A3
    if (
      len >= 4 &&
      bytes[0] === 0x1a &&
      bytes[1] === 0x45 &&
      bytes[2] === 0xdf &&
      bytes[3] === 0xa3
    ) {
      return { mimeType: "audio/webm", extension: "webm", category: "audio" };
    }

    // MP4 / M4A (ISO BMFF): ftyp box at offset 4
    if (
      len >= 8 &&
      bytes[4] === 0x66 &&
      bytes[5] === 0x74 &&
      bytes[6] === 0x79 &&
      bytes[7] === 0x70
    ) {
      return { mimeType: "audio/mp4", extension: "m4a", category: "audio" };
    }

    // AAC ADTS sync: FF F1, FF F9
    if (len >= 2 && bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0) {
      return { mimeType: "audio/aac", extension: "aac", category: "audio" };
    }

    // SVG check
    if (isSvgBytes(bytes)) {
      return {
        mimeType: "image/svg+xml",
        extension: "svg",
        category: "image",
      };
    }

    return null;
  }

  /**
   * Checks whether a MIME type satisfies an allowed list or pattern.
   * @param {string} mime
   * @param {string[]} allowedList
   * @returns {boolean}
   */
  function isMimeAllowed(mime, allowedList) {
    if (!mime || !Array.isArray(allowedList) || allowedList.length === 0) {
      return false;
    }
    const norm = normalizeMime(mime);
    return allowedList.some(pattern => {
      const pNorm = normalizeMime(pattern);
      if (pNorm.endsWith("/*")) {
        const prefix = pNorm.slice(0, -1);
        return norm.startsWith(prefix);
      }
      return norm === pNorm;
    });
  }

  /**
   * Checks if a detected MIME type is compatible with a declared MIME type.
   * @param {string} detectedMime
   * @param {string} declaredMime
   * @returns {boolean}
   */
  function isSignatureMatchingMime(detectedMime, declaredMime) {
    if (!detectedMime) return false;
    if (!declaredMime) return true; // No declaration to contradict
    const normDet = normalizeMime(detectedMime);
    const normDec = normalizeMime(declaredMime);

    if (normDet === normDec) return true;

    // Wildcard matching e.g. "image/*" or "audio/*"
    if (normDec.endsWith("/*")) {
      const prefix = normDec.slice(0, -1);
      return normDet.startsWith(prefix);
    }

    // Common audio container overlaps (e.g. video/webm -> audio/webm)
    if (
      (normDet === "audio/webm" && normDec === "video/webm") ||
      (normDet === "audio/mp4" && normDec === "video/mp4")
    ) {
      return true;
    }

    return false;
  }

  /**
   * Safely reads the initial byte header of a Blob, File, or Buffer.
   * @param {Blob|File|ArrayBuffer|Uint8Array} blob
   * @param {number} [numBytes=64]
   * @returns {Promise<Uint8Array|null>}
   */
  async function readBlobHeaderBytes(blob, numBytes = 64) {
    if (!blob) return null;

    if (blob instanceof Uint8Array) {
      return blob.subarray(0, Math.min(blob.length, numBytes));
    }
    if (blob instanceof ArrayBuffer) {
      return new Uint8Array(blob.slice(0, Math.min(blob.byteLength, numBytes)));
    }
    if (ArrayBuffer.isView(blob)) {
      return new Uint8Array(
        blob.buffer,
        blob.byteOffset,
        Math.min(blob.byteLength, numBytes)
      );
    }

    const slice =
      typeof blob.slice === "function" ? blob.slice(0, numBytes) : blob;

    if (typeof slice.arrayBuffer === "function") {
      try {
        const ab = await slice.arrayBuffer();
        return new Uint8Array(ab);
      } catch (err) {
        return null;
      }
    }

    if (typeof FileReader !== "undefined") {
      return new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(new Uint8Array(reader.result));
        reader.onerror = () => resolve(null);
        reader.readAsArrayBuffer(slice);
      });
    }

    return null;
  }

  /**
   * Validates a media Blob or File against MIME requirements and binary file signatures.
   *
   * @param {Blob|File|Uint8Array} blob
   * @param {Object} [options]
   * @param {string[]} [options.allowedMimes]
   * @param {boolean} [options.requireSignature=true]
   * @param {number} [options.maxSizeBytes]
   * @returns {Promise<{valid: boolean, detectedMime: string|null, declaredMime: string, error?: string, category?: string}>}
   */
  async function validateBlob(blob, options = {}) {
    if (!blob) {
      return {
        valid: false,
        detectedMime: null,
        declaredMime: "",
        error: "No file or blob provided.",
      };
    }

    const size = typeof blob.size === "number" ? blob.size : blob.byteLength;
    if (typeof size === "number" && size === 0) {
      return {
        valid: false,
        detectedMime: null,
        declaredMime: "",
        error: "File is empty (0 bytes).",
      };
    }

    if (
      typeof options.maxSizeBytes === "number" &&
      typeof size === "number" &&
      size > options.maxSizeBytes
    ) {
      return {
        valid: false,
        detectedMime: null,
        declaredMime: blob.type || "",
        error: `File size (${size} bytes) exceeds limit of ${options.maxSizeBytes} bytes.`,
      };
    }

    const declaredMime = normalizeMime(blob.type || "");
    const allowedMimes = Array.isArray(options.allowedMimes)
      ? options.allowedMimes
      : null;

    // Check declared MIME against allowed list if provided
    if (allowedMimes && declaredMime) {
      if (!isMimeAllowed(declaredMime, allowedMimes)) {
        return {
          valid: false,
          detectedMime: null,
          declaredMime,
          error: `Unsupported MIME type "${declaredMime}". Allowed: ${allowedMimes.join(", ")}.`,
        };
      }
    }

    const requireSignature = options.requireSignature !== false;
    const headerBytes = await readBlobHeaderBytes(blob, 128);

    if (!headerBytes || headerBytes.length === 0) {
      if (requireSignature) {
        return {
          valid: false,
          detectedMime: null,
          declaredMime,
          error: "Unable to read file signature.",
        };
      }
      return {
        valid: true,
        detectedMime: null,
        declaredMime,
      };
    }

    const detected = detectSignature(headerBytes);

    if (!detected) {
      if (requireSignature) {
        return {
          valid: false,
          detectedMime: null,
          declaredMime,
          error:
            "File signature does not match any supported media format.",
        };
      }
      return {
        valid: true,
        detectedMime: null,
        declaredMime,
      };
    }

    // Check if detected signature matches declared MIME type
    if (declaredMime && !isSignatureMatchingMime(detected.mimeType, declaredMime)) {
      return {
        valid: false,
        detectedMime: detected.mimeType,
        declaredMime,
        error: `File signature (${detected.mimeType}) does not match declared type (${declaredMime}).`,
      };
    }

    // Check detected MIME against allowed list
    if (allowedMimes && !isMimeAllowed(detected.mimeType, allowedMimes)) {
      return {
        valid: false,
        detectedMime: detected.mimeType,
        declaredMime,
        error: `Detected file type "${detected.mimeType}" is not allowed.`,
      };
    }

    return {
      valid: true,
      detectedMime: detected.mimeType,
      declaredMime,
      extension: detected.extension,
      category: detected.category,
    };
  }

  /**
   * Validates an image blob against image MIME types and signatures.
   * @param {Blob|File|Uint8Array} blob
   * @param {string[]} [allowedMimes]
   * @returns {Promise<{valid: boolean, detectedMime: string|null, declaredMime: string, error?: string}>}
   */
  async function validateImageBlob(blob, allowedMimes = DEFAULT_IMAGE_MIMES) {
    return validateBlob(blob, {
      allowedMimes,
      requireSignature: true,
    });
  }

  /**
   * Validates an audio blob against audio MIME types and signatures.
   * @param {Blob|File|Uint8Array} blob
   * @param {string[]} [allowedMimes]
   * @returns {Promise<{valid: boolean, detectedMime: string|null, declaredMime: string, error?: string}>}
   */
  async function validateAudioBlob(blob, allowedMimes = DEFAULT_AUDIO_MIMES) {
    return validateBlob(blob, {
      allowedMimes,
      requireSignature: true,
    });
  }

  return {
    MIME_ALIASES,
    DEFAULT_IMAGE_MIMES,
    DEFAULT_AUDIO_MIMES,
    normalizeMime,
    detectSignature,
    isMimeAllowed,
    isSignatureMatchingMime,
    readBlobHeaderBytes,
    validateBlob,
    validateImageBlob,
    validateAudioBlob,
  };
});

