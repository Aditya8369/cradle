/**
 * Cradle UI — Project Metadata Sanitizer & Validator
 * ──────────────────────────────────────────────────
 * Validates and sanitizes untrusted project entries from data/projects.json,
 * IndexedDB cache, or localStorage before they are processed or rendered
 * into the DOM by UI components (CradleCard, CradleButton, search suggestions,
 * category filters, clipboard actions, etc.).
 *
 * Prevents:
 *  - XSS via malicious executable schemes in `path` (javascript:, data:, vbscript:)
 *  - Markup injection in `title`, `category`, `description`
 *  - Prototype pollution attacks
 *  - Attribute breakout or malformed parameter injection in `thumbnailHash`
 *  - Malformed dates or non-standard category slugs
 */

const DANGEROUS_PROTOCOL_PATTERN = /^\s*(javascript|data|vbscript|file):/i;
const SCRIPT_TAG_PATTERN =
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
const HTML_TAG_PATTERN = /<[^>]*>/g;
const CONTROL_CHAR_PATTERN = /[\x00-\x1f\x7f]/g;
const HEX_HASH_PATTERN = /^[0-9a-f]{8}$/i;
const SAFE_CATEGORY_PATTERN = /^[a-z0-9-]+$/;

const APPROVED_CATEGORIES = new Set([
  "aiml",
  "dev-tools",
  "editor",
  "file-tools",
  "games",
  "instruments",
  "math",
  "misc",
  "productivity",
]);

/**
 * Strips HTML tags, script blocks, and invisible control characters from a string.
 *
 * @param {*} value
 * @returns {string}
 */
export function stripMarkup(value) {
  if (typeof value !== "string") return "";
  return value
    .replace(CONTROL_CHAR_PATTERN, "")
    .replace(SCRIPT_TAG_PATTERN, "")
    .replace(HTML_TAG_PATTERN, "")
    .trim();
}

/**
 * Validates and sanitizes a project title.
 * Strips HTML markup and control characters; returns safe text or empty string.
 *
 * @param {*} rawTitle
 * @returns {string}
 */
export function sanitizeProjectTitle(rawTitle) {
  if (typeof rawTitle !== "string") return "";
  return stripMarkup(rawTitle);
}

/**
 * Validates and sanitizes a project category slug.
 *
 * @param {*} rawCategory
 * @returns {string} Safe category slug, defaulting to "misc" if invalid.
 */
export function sanitizeProjectCategory(rawCategory) {
  if (typeof rawCategory !== "string") return "misc";
  const cleaned = stripMarkup(rawCategory).toLowerCase();
  if (APPROVED_CATEGORIES.has(cleaned)) {
    return cleaned;
  }
  if (SAFE_CATEGORY_PATTERN.test(cleaned)) {
    return cleaned;
  }
  return "misc";
}

/**
 * Checks whether a project path is safe to render in href/links/thumbnails.
 * Rejects dangerous protocols, protocol-relative paths, path traversal,
 * HTML/quote characters, and non-relative paths.
 *
 * @param {*} rawPath
 * @returns {boolean}
 */
export function isSafeProjectPath(rawPath) {
  if (typeof rawPath !== "string") return false;
  const trimmed = rawPath.trim();
  if (!trimmed) return false;

  // Block dangerous pseudo-protocols
  if (DANGEROUS_PROTOCOL_PATTERN.test(trimmed)) {
    return false;
  }

  // Block protocol-relative (//evil.com) and absolute external schemes
  if (/^\s*\/\//.test(trimmed) || /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    return false;
  }

  // Block directory traversal attempts
  if (/\.\.[/\\]/.test(trimmed)) {
    return false;
  }

  // Block raw markup or quote injection characters
  if (/[<>"'`\\]/.test(trimmed)) {
    return false;
  }

  // Normalize leading ./
  const normalized = trimmed.startsWith("./") ? trimmed.slice(2) : trimmed;

  // Must begin with projects/ and conform to safe path segments
  if (!normalized.startsWith("projects/")) {
    return false;
  }

  return true;
}

/**
 * Sanitizes a project path for safe DOM insertion.
 * Returns normalized path with trailing slash, or null if unsafe/malformed.
 *
 * @param {*} rawPath
 * @returns {string|null}
 */
export function sanitizeProjectPath(rawPath) {
  if (!isSafeProjectPath(rawPath)) {
    return null;
  }

  let cleaned = rawPath.trim().replace(CONTROL_CHAR_PATTERN, "");
  if (cleaned.startsWith("./")) {
    cleaned = cleaned.slice(2);
  }

  // Ensure trailing slash for directory paths
  if (!cleaned.endsWith("/") && !cleaned.endsWith(".html")) {
    cleaned += "/";
  }

  return cleaned;
}

/**
 * Validates and sanitizes thumbnail hash. Must be an 8-character hex string.
 *
 * @param {*} rawHash
 * @returns {string|null}
 */
export function sanitizeProjectThumbnailHash(rawHash) {
  if (typeof rawHash !== "string") return null;
  const trimmed = rawHash.trim().toLowerCase();
  if (HEX_HASH_PATTERN.test(trimmed)) {
    return trimmed;
  }
  return null;
}

/**
 * Validates and sanitizes project date.
 * Returns valid ISO string or null.
 *
 * @param {*} rawDate
 * @returns {string|null}
 */
export function sanitizeProjectDate(rawDate) {
  if (typeof rawDate !== "string" || !rawDate.trim()) return null;
  const trimmed = stripMarkup(rawDate);
  const timestamp = Date.parse(trimmed);
  if (Number.isNaN(timestamp)) {
    return null;
  }
  return trimmed;
}

/**
 * Validates whether an untrusted object meets minimal project requirements.
 *
 * @param {*} project
 * @returns {boolean}
 */
export function isValidProject(project) {
  if (!project || typeof project !== "object" || Array.isArray(project)) {
    return false;
  }
  const title = sanitizeProjectTitle(project.title);
  const path = sanitizeProjectPath(project.path);
  const category = sanitizeProjectCategory(project.category);

  return Boolean(title && path && category);
}

/**
 * Sanitizes a single project entry.
 * Strips dangerous fields, unknown properties, prototype pollution, and validates paths.
 * Returns a clean, secure project object, or null if the project is invalid/compromised.
 *
 * @param {*} rawProject
 * @returns {Object|null}
 */
export function sanitizeProject(rawProject) {
  if (
    !rawProject ||
    typeof rawProject !== "object" ||
    Array.isArray(rawProject)
  ) {
    return null;
  }

  const title = sanitizeProjectTitle(rawProject.title);
  const path = sanitizeProjectPath(rawProject.path);
  const category = sanitizeProjectCategory(rawProject.category);

  // If essential fields are missing or compromised, reject entry
  if (!title || !path || !category) {
    return null;
  }

  const clean = {
    title,
    category,
    path,
  };

  const dateAdded = sanitizeProjectDate(rawProject.dateAdded);
  if (dateAdded) {
    clean.dateAdded = dateAdded;
  }

  const thumbnailHash = sanitizeProjectThumbnailHash(rawProject.thumbnailHash);
  if (thumbnailHash) {
    clean.thumbnailHash = thumbnailHash;
  }

  if (typeof rawProject.description === "string") {
    const cleanDesc = stripMarkup(rawProject.description);
    if (cleanDesc) {
      clean.description = cleanDesc;
    }
  }

  return clean;
}

/**
 * Validates and sanitizes a list of untrusted project entries.
 * Drops malformed, compromised, or invalid entries.
 *
 * @param {*} rawProjects
 * @returns {Array<Object>}
 */
export function sanitizeProjectList(rawProjects) {
  if (!Array.isArray(rawProjects)) {
    return [];
  }

  return rawProjects
    .map(entry => sanitizeProject(entry))
    .filter(Boolean);
}

// Global attachment for non-module contexts or browser UI utilities
if (typeof globalThis !== "undefined") {
  globalThis.CradleProjectSanitizer = {
    stripMarkup,
    sanitizeProjectTitle,
    sanitizeProjectCategory,
    isSafeProjectPath,
    sanitizeProjectPath,
    sanitizeProjectThumbnailHash,
    sanitizeProjectDate,
    isValidProject,
    sanitizeProject,
    sanitizeProjectList,
  };

  if (globalThis.CradleSanitize) {
    globalThis.CradleSanitize.sanitizeProject = sanitizeProject;
    globalThis.CradleSanitize.sanitizeProjectList = sanitizeProjectList;
    globalThis.CradleSanitize.sanitizeProjectPath = sanitizeProjectPath;
  }
}

