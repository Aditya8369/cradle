/**
 * @fileoverview Pure logic for the AI Image Classifier.
 * @description Contains testable classification and custom-model utilities.
 */

/**
 * Formats KNN confidence results into prediction objects.
 *
 * @param {Object} confidences - Map of class IDs to confidence values.
 * @param {Array} customClasses - Custom class definitions.
 * @returns {Array<{className: string, probability: number}>}
 */
function formatCustomPredictions(confidences, customClasses) {
  return Object.entries(confidences)
    .map(([classId, probability]) => {
      const classObj = customClasses.find(c => c.id === classId);

      return {
        className: classObj ? classObj.name : "Unknown",
        probability,
      };
    })
    .sort((a, b) => b.probability - a.probability);
}

/**
 * Checks whether custom prediction can be performed.
 *
 * Prediction requires:
 * - At least two classes containing training images.
 * - A test image.
 *
 * @param {Array} customClasses - Custom class definitions.
 * @param {Object|null} testImage - Uploaded test image.
 * @returns {boolean}
 */
function canPredictCustom(customClasses, testImage) {
  const validClassesCount = customClasses.filter(
    classObj => classObj.count > 0
  ).length;

  return validClassesCount >= 2 && !!testImage;
}

/**
 * Checks whether a prediction has low confidence.
 *
 * @param {Array} predictions - Prediction objects.
 * @param {number} threshold - Confidence threshold.
 * @returns {boolean}
 */
function hasLowConfidence(predictions, threshold = 0.1) {
  if (!predictions || predictions.length === 0) {
    return false;
  }

  return predictions[0].probability < threshold;
}

/**
 * Validates a new custom class name.
 *
 * @param {string} className - Class name entered by the user.
 * @param {Array} customClasses - Existing custom classes.
 * @returns {{valid: boolean, error: string|null}}
 */
function validateClassName(className, customClasses) {
  const name = className.trim();

  if (!name) {
    return {
      valid: false,
      error: "Class name cannot be empty.",
    };
  }

  if (customClasses.some(c => c.name === name)) {
    return {
      valid: false,
      error: "Class name already exists.",
    };
  }

  return {
    valid: true,
    error: null,
  };
}

/**
 * Counts custom classes that contain training images.
 *
 * @param {Array} customClasses - Custom class definitions.
 * @returns {number}
 */
function countTrainedClasses(customClasses) {
  return customClasses.filter(classObj => classObj.count > 0).length;
}

/**
 * Removes classes with zero training images.
 *
 * @param {Array} customClasses - Custom class definitions.
 * @returns {Array}
 */
function getTrainedClasses(customClasses) {
  return customClasses.filter(classObj => classObj.count > 0);
}

/**
 * Converts prediction probabilities to percentage values.
 *
 * @param {number} probability - Probability between 0 and 1.
 * @returns {string}
 */
function formatConfidence(probability) {
  return (probability * 100).toFixed(2);
}

/**
 * Maximum allowed dimension (width or height) for input images.
 */
const MAX_IMAGE_DIMENSION = 1024;

/**
 * Calculates new dimensions for an image clamped to maxDimension while preserving aspect ratio.
 *
 * @param {number} width - Original image width.
 * @param {number} height - Original image height.
 * @param {number} [maxDimension=MAX_IMAGE_DIMENSION] - Maximum allowed dimension.
 * @returns {{width: number, height: number, resized: boolean}}
 */
function calculateClampedDimensions(
  width,
  height,
  maxDimension = MAX_IMAGE_DIMENSION
) {
  const w = Number(width);
  const h = Number(height);
  const max = Number(maxDimension);

  if (isNaN(w) || isNaN(h) || w <= 0 || h <= 0) {
    return { width: 0, height: 0, resized: false };
  }

  if (w <= max && h <= max) {
    return { width: w, height: h, resized: false };
  }

  let newWidth;
  let newHeight;
  if (w >= h) {
    newWidth = max;
    newHeight = Math.round((h * max) / w);
  } else {
    newHeight = max;
    newWidth = Math.round((w * max) / h);
  }

  return {
    width: newWidth,
    height: newHeight,
    resized: true,
  };
}

/**
 * Validates and checks whether image dimensions exceed the maximum dimension limit.
 *
 * @param {Object} imageInput - Object with width and height or naturalWidth and naturalHeight properties.
 * @param {number} [maxDimension=MAX_IMAGE_DIMENSION]
 * @returns {{valid: boolean, resized: boolean, width: number, height: number, originalWidth: number, originalHeight: number, warning: string|null, error: string|null}}
 */
function validateAndClampImage(imageInput, maxDimension = MAX_IMAGE_DIMENSION) {
  if (!imageInput) {
    return {
      valid: false,
      resized: false,
      width: 0,
      height: 0,
      originalWidth: 0,
      originalHeight: 0,
      warning: null,
      error: "No image input provided.",
    };
  }

  const origWidth = imageInput.naturalWidth || imageInput.width || 0;
  const origHeight = imageInput.naturalHeight || imageInput.height || 0;

  if (!origWidth || !origHeight || origWidth <= 0 || origHeight <= 0) {
    return {
      valid: false,
      resized: false,
      width: 0,
      height: 0,
      originalWidth: origWidth,
      originalHeight: origHeight,
      warning: null,
      error: "Invalid or zero-sized image input.",
    };
  }

  const clamped = calculateClampedDimensions(
    origWidth,
    origHeight,
    maxDimension
  );

  if (clamped.resized) {
    return {
      valid: true,
      resized: true,
      width: clamped.width,
      height: clamped.height,
      originalWidth: origWidth,
      originalHeight: origHeight,
      warning: `Image dimensions (${origWidth}x${origHeight}) exceeded the maximum limit of ${maxDimension}px and were resized to ${clamped.width}x${clamped.height}.`,
      error: null,
    };
  }

  return {
    valid: true,
    resized: false,
    width: origWidth,
    height: origHeight,
    originalWidth: origWidth,
    originalHeight: origHeight,
    warning: null,
    error: null,
  };
}

/**
 * Resizes an image element using HTMLCanvasElement if it exceeds maxDimension.
 *
 * @param {Object} imageElement - Image element or object.
 * @param {number} [maxDimension=MAX_IMAGE_DIMENSION]
 * @returns {{element: Object, resized: boolean, warning: string|null, valid: boolean, error: string|null}}
 */

/**
 * Inspects MIME type and file signature (magic bytes) of an image blob or file.
 * @param {Blob|File|Uint8Array} blob
 * @returns {Promise<{valid: boolean, error: string|null, detectedType: string|null}>}
 */
async function validateImageFile(blob) {
  if (!blob) {
    return { valid: false, error: "No image file provided.", detectedType: null };
  }

  if (
    typeof globalThis !== "undefined" &&
    globalThis.CradleMediaValidator &&
    typeof globalThis.CradleMediaValidator.validateImageBlob === "function"
  ) {
    const res = await globalThis.CradleMediaValidator.validateImageBlob(blob);
    return {
      valid: res.valid,
      error: res.error || null,
      detectedType: res.detectedMime || null,
    };
  }

  const declaredType = (blob.type || "").trim().toLowerCase();
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (declaredType && !allowed.includes(declaredType) && declaredType !== "image/jpg") {
    return {
      valid: false,
      error: `Unsupported image MIME type: "${declaredType}". Please upload a JPEG, PNG, WebP, or GIF image.`,
      detectedType: null,
    };
  }

  if (typeof blob.slice === "function" || blob instanceof Uint8Array || ArrayBuffer.isView(blob)) {
    try {
      let b;
      if (blob instanceof Uint8Array) {
        b = blob;
      } else if (ArrayBuffer.isView(blob)) {
        b = new Uint8Array(blob.buffer, blob.byteOffset, blob.byteLength);
      } else {
        const slice = blob.slice(0, 16);
        const ab = await slice.arrayBuffer();
        b = new Uint8Array(ab);
      }

      if (b.length < 3) {
        return { valid: false, error: "Image file is empty or corrupted.", detectedType: null };
      }

      const isJpeg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
      const isPng =
        b.length >= 8 &&
        b[0] === 0x89 &&
        b[1] === 0x50 &&
        b[2] === 0x4e &&
        b[3] === 0x47 &&
        b[4] === 0x0d &&
        b[5] === 0x0a &&
        b[6] === 0x1a &&
        b[7] === 0x0a;
      const isGif =
        b.length >= 6 &&
        b[0] === 0x47 &&
        b[1] === 0x49 &&
        b[2] === 0x46 &&
        b[3] === 0x38 &&
        (b[4] === 0x37 || b[4] === 0x39) &&
        b[5] === 0x61;
      const isWebp =
        b.length >= 12 &&
        b[0] === 0x52 &&
        b[1] === 0x49 &&
        b[2] === 0x46 &&
        b[3] === 0x46 &&
        b[8] === 0x57 &&
        b[9] === 0x45 &&
        b[10] === 0x42 &&
        b[11] === 0x50;

      let detected = null;
      if (isJpeg) detected = "image/jpeg";
      else if (isPng) detected = "image/png";
      else if (isGif) detected = "image/gif";
      else if (isWebp) detected = "image/webp";

      if (!detected) {
        return {
          valid: false,
          error: "File signature does not match any supported image format (JPEG, PNG, WebP, GIF).",
          detectedType: null,
        };
      }

      if (
        declaredType &&
        declaredType !== detected &&
        !(declaredType === "image/jpg" && detected === "image/jpeg")
      ) {
        return {
          valid: false,
          error: `File signature (${detected}) does not match declared type (${declaredType}).`,
          detectedType: detected,
        };
      }

      return { valid: true, error: null, detectedType: detected };
    } catch (err) {
      return { valid: false, error: "Failed to read image file signature.", detectedType: null };
    }
  }

  return { valid: true, error: null, detectedType: null };
}

function resizeImage(imageElement, maxDimension = MAX_IMAGE_DIMENSION) {
  const check = validateAndClampImage(imageElement, maxDimension);
  if (!check.valid) {
    return {
      element: imageElement,
      resized: false,
      warning: null,
      valid: false,
      error: check.error,
    };
  }

  if (!check.resized) {
    return {
      element: imageElement,
      resized: false,
      warning: null,
      valid: true,
      error: null,
    };
  }

  if (typeof document !== "undefined" && document.createElement) {
    const canvas = document.createElement("canvas");
    canvas.width = check.width;
    canvas.height = check.height;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(imageElement, 0, 0, check.width, check.height);
      return {
        element: canvas,
        resized: true,
        warning: check.warning,
        valid: true,
        error: null,
      };
    }
  }

  return {
    element: imageElement,
    resized: true,
    warning: check.warning,
    valid: true,
    error: null,
  };
}

(function (root) {
  const api = {
    MAX_IMAGE_DIMENSION,
    calculateClampedDimensions,
    validateAndClampImage,
    resizeImage,
    formatCustomPredictions,
    canPredictCustom,
    hasLowConfidence,
    validateClassName,
    countTrainedClasses,
    getTrainedClasses,
    formatConfidence,
    validateImageFile,
  };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.ClassifierEngine = api;
})(typeof self !== "undefined" ? self : this);
