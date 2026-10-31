/* =========================================================
   ADVANCED QR CODE GENERATOR — ENGINE MODULE
   Modular logic for QR option validation, preset storage,
   SVG export payload building, and configuration management.
   ========================================================= */

(function (root, factory) {
  if (typeof define === "function" && define.amd) {
    define([], factory);
  } else if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.QREngine = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const storage =
    typeof window !== "undefined" && window.CradleStorage
      ? window.CradleStorage
      : require("../../../src/components/ui/storage.js");

  const STORAGE_KEY = "qr-studio-presets-v1";

  const DEFAULT_OPTIONS = Object.freeze({
    text: "",
    fgColor: "#2B2D42",
    bgColor: "#FFFFFF",
    size: 300,
    margin: 10,
    errorLevel: "M",
    dotStyle: "rounded",
    cornerSquareStyle: "extra-rounded",
    cornerDotStyle: "dot",
    logo: null,
  });

  const VALID_ERROR_LEVELS = ["L", "M", "Q", "H"];
  const VALID_DOT_STYLES = [
    "square",
    "dots",
    "rounded",
    "extra-rounded",
    "classy",
    "classy-rounded",
  ];
  const VALID_CORNER_SQUARE_STYLES = ["square", "dot", "extra-rounded"];
  const VALID_CORNER_DOT_STYLES = ["square", "dot"];

  /** Validate a hex color string */
  function isValidHex(hex) {
    return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(hex);
  }

  /** Sanitize & validate configuration options */
  function sanitizeOptions(inputOpts = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...inputOpts };

    opts.text = typeof opts.text === "string" ? opts.text : "";
    opts.fgColor = isValidHex(opts.fgColor)
      ? opts.fgColor
      : DEFAULT_OPTIONS.fgColor;
    opts.bgColor = isValidHex(opts.bgColor)
      ? opts.bgColor
      : DEFAULT_OPTIONS.bgColor;

    opts.size =
      typeof opts.size === "number" && !isNaN(opts.size)
        ? Math.max(100, Math.min(1000, opts.size))
        : DEFAULT_OPTIONS.size;

    opts.margin =
      typeof opts.margin === "number" && !isNaN(opts.margin)
        ? Math.max(0, Math.min(100, opts.margin))
        : DEFAULT_OPTIONS.margin;

    opts.errorLevel = VALID_ERROR_LEVELS.includes(opts.errorLevel)
      ? opts.errorLevel
      : DEFAULT_OPTIONS.errorLevel;

    opts.dotStyle = VALID_DOT_STYLES.includes(opts.dotStyle)
      ? opts.dotStyle
      : DEFAULT_OPTIONS.dotStyle;

    opts.cornerSquareStyle = VALID_CORNER_SQUARE_STYLES.includes(
      opts.cornerSquareStyle
    )
      ? opts.cornerSquareStyle
      : DEFAULT_OPTIONS.cornerSquareStyle;

    opts.cornerDotStyle = VALID_CORNER_DOT_STYLES.includes(opts.cornerDotStyle)
      ? opts.cornerDotStyle
      : DEFAULT_OPTIONS.cornerDotStyle;

    return opts;
  }

  /** Format QRCodeStyling configuration payload */
  function buildConfigPayload(opts) {
    const sanitized = sanitizeOptions(opts);

    return {
      width: sanitized.size,
      height: sanitized.size,
      data: sanitized.text,
      margin: sanitized.margin,
      qrOptions: {
        errorCorrectionLevel: sanitized.errorLevel,
      },
      dotsOptions: {
        color: sanitized.fgColor,
        type: sanitized.dotStyle,
      },
      cornersSquareOptions: {
        color: sanitized.fgColor,
        type: sanitized.cornerSquareStyle,
      },
      cornersDotOptions: {
        color: sanitized.fgColor,
        type: sanitized.cornerDotStyle,
      },
      backgroundOptions: {
        color: sanitized.bgColor,
      },
      image: sanitized.logo || undefined,
      imageOptions: {
        crossOrigin: "anonymous",
        margin: 6,
        imageSize: 0.4,
      },
    };
  }

  /** Load saved presets from storage */
  function getSavedPresets() {
    const presets = storage.get(STORAGE_KEY, []);
    return Array.isArray(presets) ? presets : [];
  }

  /** Save preset configuration */
  function savePreset(name, options) {
    if (!name || typeof name !== "string") return false;
    const presets = getSavedPresets();
    const cleanOpts = sanitizeOptions(options);
    const existingIndex = presets.findIndex(
      p => p.name.toLowerCase() === name.toLowerCase()
    );

    const presetObj = {
      id:
        existingIndex >= 0 ? presets[existingIndex].id : Date.now().toString(),
      name: name.trim(),
      createdAt: new Date().toISOString(),
      options: {
        fgColor: cleanOpts.fgColor,
        bgColor: cleanOpts.bgColor,
        size: cleanOpts.size,
        margin: cleanOpts.margin,
        errorLevel: cleanOpts.errorLevel,
        dotStyle: cleanOpts.dotStyle,
      },
    };

    if (existingIndex >= 0) {
      presets[existingIndex] = presetObj;
    } else {
      presets.push(presetObj);
    }

    return storage.set(STORAGE_KEY, presets);
  }

  /** Delete a preset by ID */
  function deletePreset(id) {
    const presets = getSavedPresets();
    const filtered = presets.filter(p => p.id !== id);
    return storage.set(STORAGE_KEY, filtered);
  }

  /**
   * Generate a sanitized filename with appropriate extension.
   * Ensures output is always formatted e.g. "qr-code.png" or "qr-code.svg".
   */
  function getDownloadFilename(name = "qr-code", extension = "png") {
    const ext =
      typeof extension === "string"
        ? extension.toLowerCase().replace(/^\./, "").trim()
        : "png";
    const validExts = ["png", "svg", "jpeg", "jpg", "webp"];
    const resolvedExt = validExts.includes(ext)
      ? ext === "jpg"
        ? "jpeg"
        : ext
      : "png";

    let cleanName = typeof name === "string" ? name.trim() : "";
    if (!cleanName) {
      cleanName = "qr-code";
    }

    // Remove invalid filename characters: < > : " / \ | ? * and control chars
    cleanName = cleanName
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
      .replace(/\.+$/, "");
    if (!cleanName) {
      cleanName = "qr-code";
    }

    // If cleanName already ends with .ext, preserve it
    const lowerName = cleanName.toLowerCase();
    if (
      lowerName.endsWith("." + resolvedExt) ||
      (resolvedExt === "jpeg" && lowerName.endsWith(".jpg"))
    ) {
      return cleanName;
    }

    return `${cleanName}.${resolvedExt}`;
  }

  /**
   * Trigger browser download for a Blob, data URL, or object URL with an explicit filename.
   * Ensures anchor element has download="filename.ext" set before clicking.
   */
  function triggerDownload(blobOrUrl, filename = "qr-code.png", doc = null) {
    const documentObj =
      doc || (typeof document !== "undefined" ? document : null);
    if (!documentObj || typeof documentObj.createElement !== "function") {
      return false;
    }

    const isBlob = typeof Blob !== "undefined" && blobOrUrl instanceof Blob;
    let url = blobOrUrl;
    let objectUrlCreated = false;

    if (isBlob) {
      if (
        typeof URL !== "undefined" &&
        typeof URL.createObjectURL === "function"
      ) {
        url = URL.createObjectURL(blobOrUrl);
        objectUrlCreated = true;
      }
    }

    const anchor = documentObj.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.setAttribute("download", filename);

    if (
      documentObj.body &&
      typeof documentObj.body.appendChild === "function"
    ) {
      documentObj.body.appendChild(anchor);
    }

    if (typeof anchor.click === "function") {
      anchor.click();
    }

    setTimeout(() => {
      if (
        anchor.parentNode &&
        typeof anchor.parentNode.removeChild === "function"
      ) {
        anchor.parentNode.removeChild(anchor);
      }
      if (
        objectUrlCreated &&
        typeof URL !== "undefined" &&
        typeof URL.revokeObjectURL === "function"
      ) {
        URL.revokeObjectURL(url);
      }
    }, 1000);

    return true;
  }


  function isValidLogoType(type) {
    return ["image/png", "image/jpeg", "image/svg+xml"].includes(type);
  }

  async function validateLogoSignature(blobOrBytes) {
    if (!blobOrBytes) {
      return { valid: false, error: "No logo file provided." };
    }

    let bytes = null;
    if (blobOrBytes instanceof Uint8Array) {
      bytes = blobOrBytes;
    } else if (ArrayBuffer.isView(blobOrBytes)) {
      bytes = new Uint8Array(
        blobOrBytes.buffer,
        blobOrBytes.byteOffset,
        blobOrBytes.byteLength
      );
    } else if (blobOrBytes instanceof ArrayBuffer) {
      bytes = new Uint8Array(blobOrBytes);
    } else if (typeof blobOrBytes.slice === "function") {
      try {
        const slice = blobOrBytes.slice(0, 64);
        const buffer = await slice.arrayBuffer();
        bytes = new Uint8Array(buffer);
      } catch (err) {
        return { valid: false, error: "Failed to read logo header." };
      }
    }

    if (!bytes || bytes.length < 3) {
      return { valid: false, error: "Logo file is empty or corrupted." };
    }

    // JPEG: FF D8 FF
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return { valid: true, mimeType: "image/jpeg" };
    }

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    ) {
      return { valid: true, mimeType: "image/png" };
    }

    // SVG: UTF-8 XML/SVG markup
    let isSvg = false;
    let hasNull = false;
    for (let i = 0; i < Math.min(bytes.length, 32); i++) {
      if (bytes[i] === 0) {
        hasNull = true;
        break;
      }
    }
    if (!hasNull) {
      let str = "";
      try {
        if (typeof TextDecoder !== "undefined") {
          str = new TextDecoder("utf-8").decode(bytes);
        } else {
          str = String.fromCharCode.apply(null, Array.from(bytes));
        }
        const trimmed = str.trim().toLowerCase();
        if (
          trimmed.startsWith("<svg") ||
          (trimmed.startsWith("<?xml") && trimmed.includes("<svg")) ||
          trimmed.includes("<svg")
        ) {
          isSvg = true;
        }
      } catch (_) {}
    }

    if (isSvg) {
      return { valid: true, mimeType: "image/svg+xml" };
    }

    return {
      valid: false,
      error:
        "File signature does not match any supported logo format (PNG, JPEG, SVG).",
    };
  }

  return {
    DEFAULT_OPTIONS,
    isValidLogoType,
    validateLogoSignature,
    isValidHex,
    sanitizeOptions,
    buildConfigPayload,
    getSavedPresets,
    savePreset,
    deletePreset,
    getDownloadFilename,
    triggerDownload,
  };
});
