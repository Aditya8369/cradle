/**
 * ASCII Camera Rendering Engine
 * Provides luminance mapping, character scaling, Sobel edge detection,
 * Floyd-Steinberg dithering, contrast/brightness adjustments.
 */
(function (exports) {
  "use strict";

  const PALETTES = {
    standard: " .:-=+*#%@",
    detailed:
      " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
    blocks: " ░▒▓█",
    binary: " 01",
    minimal: " .#",
  };

  /**
   * Convert RGB to Luminance based on standard formula.
   */
  function getLuminance(r, g, b, mode = "standard") {
    if (mode === "rec709") {
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
    if (mode === "average") {
      return (r + g + b) / 3;
    }
    // Standard Rec. 601
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }

  /**
   * Map luminance (0-255) to character in palette string.
   */
  function mapLuminanceToChar(
    lum,
    palette = PALETTES.standard,
    invert = false
  ) {
    const norm = Math.max(0, Math.min(255, lum)) / 255;
    const effectiveNorm = invert ? 1 - norm : norm;
    const index = Math.floor(effectiveNorm * (palette.length - 1));
    return palette[index];
  }

  /**
   * Adjust pixel contrast and brightness.
   */
  function adjustPixel(val, contrast = 1.0, brightness = 0) {
    const adjusted = contrast * (val - 128) + 128 + brightness;
    return Math.max(0, Math.min(255, adjusted));
  }

  /**
   * Apply 3x3 Sobel Edge Detection kernel over grayscale buffer.
   */
  function applySobelEdgeDetection(pixels, width, height) {
    const output = new Uint8ClampedArray(width * height);

    const gx = [
      [-1, 0, 1],
      [-2, 0, 2],
      [-1, 0, 1],
    ];
    const gy = [
      [-1, -2, -1],
      [0, 0, 0],
      [1, 2, 1],
    ];

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let sumX = 0;
        let sumY = 0;

        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const val = pixels[(y + ky) * width + (x + kx)];
            sumX += val * gx[ky + 1][kx + 1];
            sumY += val * gy[ky + 1][kx + 1];
          }
        }

        const mag = Math.sqrt(sumX * sumX + sumY * sumY);
        output[y * width + x] = Math.min(255, mag);
      }
    }
    return output;
  }

  /**
   * Convert RGBA image buffer to 2D ASCII character grid.
   */
  function renderImageDataToASCII(imageData, options = {}) {
    const {
      paletteKey = "standard",
      customPalette = null,
      invert = false,
      contrast = 1.0,
      brightness = 0,
      edgeDetection = false,
    } = options;

    const palette = customPalette || PALETTES[paletteKey] || PALETTES.standard;
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;

    const grayBuffer = new Uint8ClampedArray(width * height);
    for (let i = 0; i < width * height; i++) {
      const idx = i * 4;
      const r = adjustPixel(data[idx], contrast, brightness);
      const g = adjustPixel(data[idx + 1], contrast, brightness);
      const b = adjustPixel(data[idx + 2], contrast, brightness);
      grayBuffer[i] = getLuminance(r, g, b);
    }

    const processedBuffer = edgeDetection
      ? applySobelEdgeDetection(grayBuffer, width, height)
      : grayBuffer;

    const asciiLines = [];
    for (let y = 0; y < height; y++) {
      let line = "";
      for (let x = 0; x < width; x++) {
        const lum = processedBuffer[y * width + x];
        line += mapLuminanceToChar(lum, palette, invert);
      }
      asciiLines.push(line);
    }

    return {
      lines: asciiLines,
      width,
      height,
      rawText: asciiLines.join("\n"),
    };
  }

  /**
   * Determine video and canvas transformation parameters based on camera facing mode and OS.
   * Handles Android Chrome front-camera native orientation metadata inversion and selfie mirroring.
   */
  function getCameraTransform(options = {}) {
    const { isFront = false, isAndroid = false } = options;

    if (!isFront) {
      return {
        scaleX: 1,
        scaleY: 1,
        cssTransform: "none",
        isMirrored: false,
        isInverted: false,
      };
    }

    if (isAndroid) {
      return {
        scaleX: -1,
        scaleY: -1,
        cssTransform: "scale(-1, -1)",
        isMirrored: true,
        isInverted: true,
      };
    }

    return {
      scaleX: -1,
      scaleY: 1,
      cssTransform: "scaleX(-1)",
      isMirrored: true,
      isInverted: false,
    };
  }

  exports.PALETTES = PALETTES;
  exports.getLuminance = getLuminance;
  exports.mapLuminanceToChar = mapLuminanceToChar;
  exports.adjustPixel = adjustPixel;
  exports.applySobelEdgeDetection = applySobelEdgeDetection;
  exports.renderImageDataToASCII = renderImageDataToASCII;

  /**
   * Validates image magic bytes against supported image signatures (JPEG, PNG, GIF, WebP).
   * @param {Uint8Array|ArrayBuffer|Array<number>} bytes
   * @returns {{valid: boolean, mimeType: string|null}}
   */
  function validateImageSignature(bytes) {
    if (!bytes || bytes.length < 3) return { valid: false, mimeType: null };
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
      return { valid: true, mimeType: "image/jpeg" };
    }
    if (
      b.length >= 8 &&
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47 &&
      b[4] === 0x0d &&
      b[5] === 0x0a &&
      b[6] === 0x1a &&
      b[7] === 0x0a
    ) {
      return { valid: true, mimeType: "image/png" };
    }
    if (
      b.length >= 6 &&
      b[0] === 0x47 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x38 &&
      (b[4] === 0x37 || b[4] === 0x39) &&
      b[5] === 0x61
    ) {
      return { valid: true, mimeType: "image/gif" };
    }
    if (
      b.length >= 12 &&
      b[0] === 0x52 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x46 &&
      b[8] === 0x57 &&
      b[9] === 0x45 &&
      b[10] === 0x42 &&
      b[11] === 0x50
    ) {
      return { valid: true, mimeType: "image/webp" };
    }
    return { valid: false, mimeType: null };
  }

  exports.getCameraTransform = getCameraTransform;
  exports.validateImageSignature = validateImageSignature;
})(typeof exports === "undefined" ? (window.ASCIIEngine = {}) : exports);
