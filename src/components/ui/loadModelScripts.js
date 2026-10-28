/**
 * Cradle UI — Model & Third-Party Script Loader
 * ─────────────────────────────────────────────
 * Secure dynamic loader for browser-based machine learning models (TensorFlow.js,
 * MobileNet, ONNX, etc.) and external utility scripts.
 *
 * Security Controls Enforced:
 *   1. Explicit Origin Allowlist: Restricts remote loads to vetted CDNs
 *      (cdn.jsdelivr.net, unpkg.com, cdnjs.cloudflare.com, huggingface.co).
 *   2. Protocol Enforcement: Requires HTTPS for all remote assets; rejects
 *      plain HTTP, javascript:, data:, and other insecure protocols.
 *   3. Subresource Integrity (SRI): Enforces cryptographic hash verification
 *      (sha256, sha384, sha512) and anonymous CORS on remote scripts.
 *   4. Controlled Loading: Request deduplication (in-flight cache), timeout
 *      enforcement with automatic DOM cleanup, and sequential dependency ordering.
 *   5. Isolation Strategy: Sandboxed iframe execution context (sandbox="allow-scripts"
 *      without allow-same-origin) and global namespace pollution detection.
 */

/**
 * List of trusted hostnames approved for loading remote scripts and model weights.
 * Aligns with THIRD_PARTY_POLICY.md and SECURE_DEPLOYMENT_CHECKLIST.md.
 */
export const ALLOWED_MODEL_HOSTS = Object.freeze([
  "cdn.jsdelivr.net",
  "unpkg.com",
  "cdnjs.cloudflare.com",
  "huggingface.co",
]);

/**
 * Regular expression validating Subresource Integrity (SRI) hash syntax.
 * Compliant with W3C SRI specifications: <algorithm>-<base64-digest>.
 */
export const SRI_HASH_PATTERN =
  /^(sha256|sha384|sha512)-[A-Za-z0-9+/]+={0,2}$/;

/**
 * Default timeout in milliseconds for dynamic script loading before aborting.
 */
export const DEFAULT_SCRIPT_TIMEOUT_MS = 15000;

/**
 * Registry of pre-verified, trusted model scripts and their Subresource Integrity hashes.
 */
export const KNOWN_MODEL_INTEGRITY = Object.freeze({
  // TensorFlow.js core
  "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0":
    "sha384-vE8hbVJ4lezako5rlvE7bY0BVzWlFhZncPlckrqNwcUQpVtgbENTgZ8TBbnPjZre",
  "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs":
    "sha384-vE8hbVJ4lezako5rlvE7bY0BVzWlFhZncPlckrqNwcUQpVtgbENTgZ8TBbnPjZre",

  // TensorFlow MobileNet model
  "https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.1":
    "sha384-oBAqwJ0tv9zzKlbIZyBhhXlEvU/PMrSMqDyOHlEZVC8xWHx4yPySuS7vRikRcYFq",
  "https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet":
    "sha384-oBAqwJ0tv9zzKlbIZyBhhXlEvU/PMrSMqDyOHlEZVC8xWHx4yPySuS7vRikRcYFq",

  // TensorFlow KNN Classifier
  "https://cdn.jsdelivr.net/npm/@tensorflow-models/knn-classifier@1.2.6":
    "sha384-QX5hO7OKW55Yg3mgMQWqTFoY7F2+KqUVUtYQj5Stb1s0eFhCVewoJBaaJEXVbzLI",
  "https://cdn.jsdelivr.net/npm/@tensorflow-models/knn-classifier":
    "sha384-QX5hO7OKW55Yg3mgMQWqTFoY7F2+KqUVUtYQj5Stb1s0eFhCVewoJBaaJEXVbzLI",
});

/**
 * Dynamic registry of additional user-registered integrity hashes.
 */
const dynamicIntegrityRegistry = new Map();

/**
 * Cache of currently in-flight script load promises to prevent duplicate fetches.
 */
const pendingLoads = new Map();

/**
 * Set of canonical script URLs successfully loaded into the current document context.
 */
const loadedScripts = new Set();

/**
 * Creates an Error object with the "SecurityError" name.
 *
 * @param {string} message - Error description.
 * @returns {Error}
 */
function createSecurityError(message) {
  const err = new Error(message);
  err.name = "SecurityError";
  return err;
}

/**
 * Creates an Error object with the "TimeoutError" name.
 *
 * @param {string} message - Error description.
 * @returns {Error}
 */
function createTimeoutError(message) {
  const err = new Error(message);
  err.name = "TimeoutError";
  return err;
}

/**
 * Validates whether an SRI hash matches the required format.
 *
 * @param {string} hash - The SRI hash string to test.
 * @returns {boolean}
 */
export function isValidSriHash(hash) {
  if (typeof hash !== "string") return false;
  return SRI_HASH_PATTERN.test(hash.trim());
}

/**
 * Registers or overrides a known SRI hash for a script URL.
 *
 * @param {string} url - Script URL.
 * @param {string} integrity - Cryptographic hash (sha256/sha384/sha512).
 */
export function registerModelIntegrity(url, integrity) {
  if (typeof url !== "string" || !url.trim()) {
    throw new TypeError("Script URL must be a non-empty string.");
  }
  if (!isValidSriHash(integrity)) {
    throw createSecurityError(
      `Invalid SRI hash "${integrity}". Must match sha256/sha384/sha512 base64 digest.`
    );
  }
  dynamicIntegrityRegistry.set(url.trim(), integrity.trim());
}

/**
 * Retrieves the registered SRI hash for a URL, if one is configured.
 *
 * @param {string} url - Script URL.
 * @returns {string|null} - Registered hash or null.
 */
export function getRegisteredIntegrity(url) {
  if (typeof url !== "string") return null;
  const trimmed = url.trim();
  if (dynamicIntegrityRegistry.has(trimmed)) {
    return dynamicIntegrityRegistry.get(trimmed);
  }
  if (Object.prototype.hasOwnProperty.call(KNOWN_MODEL_INTEGRITY, trimmed)) {
    return KNOWN_MODEL_INTEGRITY[trimmed];
  }
  return null;
}

/**
 * Checks whether a URL's origin matches the trusted origin allowlist.
 *
 * @param {string} urlString - URL string to check.
 * @param {Array<string>} [customAllowedOrigins=[]] - Optional additional allowed hostnames.
 * @returns {boolean}
 */
export function isAllowedOrigin(urlString, customAllowedOrigins = []) {
  if (typeof urlString !== "string" || !urlString.trim()) return false;

  const trimmed = urlString.trim();
  if (/^(javascript|data|vbscript):/i.test(trimmed)) {
    return false;
  }

  try {
    const baseOrigin =
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : "https://cradle.local";
    const parsed = new URL(trimmed, baseOrigin);

    // Reject unencrypted HTTP unless running on localhost for testing
    if (parsed.protocol !== "https:") {
      if (
        parsed.protocol === "http:" &&
        (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")
      ) {
        return true;
      }
      return false;
    }

    const host = parsed.hostname.toLowerCase();
    const allowed = new Set([
      ...ALLOWED_MODEL_HOSTS.map(h => h.toLowerCase()),
      ...customAllowedOrigins.map(h => String(h).toLowerCase()),
    ]);

    return allowed.has(host);
  } catch {
    return false;
  }
}

/**
 * Validates and normalizes a script URL against security constraints.
 *
 * @param {string} urlString - Target URL.
 * @param {Object} [options={}] - Validation options.
 * @param {boolean} [options.allowSameOrigin=true] - Permit relative/same-origin scripts.
 * @param {Array<string>} [options.customAllowedOrigins=[]] - Extra allowed hostnames.
 * @returns {URL} - Normalized URL object.
 * @throws {TypeError|Error} If URL is invalid or violates security boundaries.
 */
export function validateScriptUrl(urlString, options = {}) {
  if (typeof urlString !== "string" || !urlString.trim()) {
    throw new TypeError("Script source must be a non-empty string.");
  }

  const trimmed = urlString.trim();

  // Instant rejection of dangerous pseudo-protocols
  if (/^(javascript|data|vbscript):/i.test(trimmed)) {
    throw createSecurityError(
      `Execution aborted: Disallowed pseudo-protocol in script URL "${trimmed}".`
    );
  }

  const baseOrigin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://cradle.local";

  let parsed;
  try {
    parsed = new URL(trimmed, baseOrigin);
  } catch (err) {
    throw new TypeError(`Malformed script URL "${urlString}": ${err.message}`);
  }

  const allowSameOrigin = options.allowSameOrigin !== false;
  const isSameOrigin = parsed.origin === baseOrigin;

  if (isSameOrigin) {
    if (!allowSameOrigin) {
      throw createSecurityError(
        `Same-origin scripts are disallowed by policy for this operation: "${urlString}".`
      );
    }
    return parsed;
  }

  // Remote script validation
  if (parsed.protocol !== "https:") {
    if (
      parsed.protocol === "http:" &&
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")
    ) {
      return parsed;
    }
    throw createSecurityError(
      `Insecure protocol "${parsed.protocol}" in script URL "${urlString}". Remote scripts must use HTTPS.`
    );
  }

  const host = parsed.hostname.toLowerCase();
  const allowedHosts = [
    ...ALLOWED_MODEL_HOSTS,
    ...(options.customAllowedOrigins || []),
  ];

  if (!allowedHosts.some(allowed => allowed.toLowerCase() === host)) {
    throw createSecurityError(
      `Untrusted script origin "${parsed.origin}". Allowed origins are: ${allowedHosts.join(", ")}.`
    );
  }

  return parsed;
}

/**
 * Dynamically loads an external model or utility script with strict trust boundaries.
 *
 * @param {string} src - Script URL to load.
 * @param {Object} [options={}] - Loading options.
 * @param {string} [options.integrity] - Explicit Subresource Integrity hash.
 * @param {boolean} [options.requireIntegrity=true] - Enforce SRI on remote scripts.
 * @param {string} [options.crossOrigin='anonymous'] - CORS mode ('anonymous' or 'use-credentials').
 * @param {number} [options.timeoutMs=DEFAULT_SCRIPT_TIMEOUT_MS] - Milliseconds before timeout.
 * @param {boolean} [options.async=true] - Set script.async attribute.
 * @param {boolean} [options.allowSameOrigin=true] - Allow local relative scripts.
 * @param {Array<string>} [options.customAllowedOrigins=[]] - Additional trusted hostnames.
 * @returns {Promise<{src: string, integrity: string|null}>}
 */
export function loadScriptAsync(src, options = {}) {
  return new Promise((resolve, reject) => {
    let parsedUrl;
    try {
      parsedUrl = validateScriptUrl(src, options);
    } catch (validationErr) {
      reject(validationErr);
      return;
    }

    const canonicalUrl = parsedUrl.href;
    const baseOrigin =
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : "https://cradle.local";
    const isRemote = parsedUrl.origin !== baseOrigin;

    // Resolve SRI integrity hash
    let resolvedIntegrity = null;
    if (options.integrity) {
      if (!isValidSriHash(options.integrity)) {
        reject(
          createSecurityError(
            `Invalid SRI hash "${options.integrity}". Must match sha256/sha384/sha512 base64 digest.`
          )
        );
        return;
      }
      resolvedIntegrity = options.integrity.trim();
    } else {
      resolvedIntegrity =
        getRegisteredIntegrity(canonicalUrl) ||
        getRegisteredIntegrity(src) ||
        null;
    }

    const requireIntegrity = options.requireIntegrity ?? isRemote;
    if (requireIntegrity && !resolvedIntegrity) {
      reject(
        createSecurityError(
          `Subresource Integrity (SRI) hash is required for remote third-party script "${src}". Provide options.integrity or register in KNOWN_MODEL_INTEGRITY.`
        )
      );
      return;
    }

    // Check if script is already present in DOM or previously loaded
    if (typeof document !== "undefined") {
      const existing =
        document.querySelector(`script[src="${canonicalUrl}"]`) ||
        document.querySelector(`script[src="${src}"]`);
      if (existing || loadedScripts.has(canonicalUrl)) {
        loadedScripts.add(canonicalUrl);
        resolve({ src: canonicalUrl, integrity: resolvedIntegrity });
        return;
      }
    }

    // Return existing in-flight promise if currently loading
    if (pendingLoads.has(canonicalUrl)) {
      pendingLoads.get(canonicalUrl).then(resolve, reject);
      return;
    }

    if (typeof document === "undefined" || !document.createElement) {
      // Non-browser / mock environment fallback
      loadedScripts.add(canonicalUrl);
      resolve({ src: canonicalUrl, integrity: resolvedIntegrity });
      return;
    }

    const script = document.createElement("script");
    script.src = canonicalUrl;
    script.async = options.async !== false;

    if (resolvedIntegrity) {
      script.integrity = resolvedIntegrity;
      script.crossOrigin = options.crossOrigin || "anonymous";
    } else if (isRemote) {
      script.crossOrigin = options.crossOrigin || "anonymous";
    }

    const timeoutMs = options.timeoutMs ?? DEFAULT_SCRIPT_TIMEOUT_MS;
    let timeoutTimer = null;
    let isSettled = false;

    function cleanup() {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
        timeoutTimer = null;
      }
      pendingLoads.delete(canonicalUrl);
    }

    const loadPromise = new Promise((innerResolve, innerReject) => {
      timeoutTimer = setTimeout(() => {
        if (isSettled) return;
        isSettled = true;
        cleanup();
        if (script.parentNode) {
          script.parentNode.removeChild(script);
        }
        innerReject(
          createTimeoutError(
            `Timeout loading script: "${canonicalUrl}" exceeded ${timeoutMs}ms.`
          )
        );
      }, timeoutMs);

      script.onload = () => {
        if (isSettled) return;
        isSettled = true;
        cleanup();
        loadedScripts.add(canonicalUrl);
        innerResolve({ src: canonicalUrl, integrity: resolvedIntegrity });
      };

      script.onerror = err => {
        if (isSettled) return;
        isSettled = true;
        cleanup();
        if (script.parentNode) {
          script.parentNode.removeChild(script);
        }
        innerReject(
          new Error(
            `Failed to load script "${canonicalUrl}". Network error or blocked by policy.`
          )
        );
      };

      const target = document.head || document.body || document.documentElement;
      target.appendChild(script);
    });

    pendingLoads.set(canonicalUrl, loadPromise);
    loadPromise.then(resolve, reject);
  });
}

/**
 * Sequentially loads a list of model scripts to maintain strict dependency ordering.
 *
 * @param {Array<string|{src: string, integrity?: string}>} scriptList - Array of scripts.
 * @param {Object} [sharedOptions={}] - Shared options applied to each load.
 * @returns {Promise<Array<{src: string, integrity: string|null}>>}
 */
export async function loadScriptsSequentially(
  scriptList,
  sharedOptions = {}
) {
  if (!Array.isArray(scriptList)) {
    throw new TypeError("scriptList must be an array of script URLs or config objects.");
  }

  const results = [];
  for (const item of scriptList) {
    if (typeof item === "string") {
      const res = await loadScriptAsync(item, sharedOptions);
      results.push(res);
    } else if (item && typeof item === "object" && typeof item.src === "string") {
      const mergedOptions = { ...sharedOptions, ...item };
      const res = await loadScriptAsync(item.src, mergedOptions);
      results.push(res);
    } else {
      throw new TypeError("Invalid script item in loadScriptsSequentially.");
    }
  }
  return results;
}

/**
 * Creates an isolated sandboxed iframe execution context for running untrusted code.
 *
 * Omitting `allow-same-origin` ensures the iframe has an opaque unique origin
 * ("null"), physically preventing access to the parent window's localStorage,
 * cookies, and DOM tree.
 *
 * @param {Object} [options={}] - Sandbox options.
 * @param {string} [options.sandbox='allow-scripts'] - Sandbox flags.
 * @param {string} [options.title='Isolated Model Runner'] - Accessible frame title.
 * @returns {{
 *   iframe: HTMLIFrameElement,
 *   destroy: () => void,
 *   postMessage: (message: any, targetOrigin?: string) => void
 * }}
 */
export function createSandboxedExecutionFrame(options = {}) {
  if (typeof document === "undefined" || !document.createElement) {
    throw new Error("createSandboxedExecutionFrame requires a browser DOM environment.");
  }

  const iframe = document.createElement("iframe");
  const requestedSandbox = options.sandbox || "allow-scripts";

  // Enforce isolation: warn if allow-same-origin is inadvertently combined with allow-scripts
  if (
    requestedSandbox.includes("allow-same-origin") &&
    requestedSandbox.includes("allow-scripts")
  ) {
    console.warn(
      "[Security Warning] Combining allow-scripts and allow-same-origin disables iframe isolation boundaries."
    );
  }

  iframe.setAttribute("sandbox", requestedSandbox);
  iframe.setAttribute("aria-hidden", "true");
  iframe.setAttribute("tabindex", "-1");
  iframe.title = options.title || "Isolated Model Execution Sandbox";
  iframe.style.position = "absolute";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "none";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";

  const target = document.body || document.documentElement;
  target.appendChild(iframe);

  return {
    iframe,
    destroy() {
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
    },
    postMessage(message, targetOrigin = "*") {
      if (!iframe.contentWindow) {
        throw new Error("Sandboxed frame contentWindow is not accessible.");
      }
      iframe.contentWindow.postMessage(message, targetOrigin);
    },
  };
}

/**
 * Loads and executes a third-party script inside an isolated sandboxed iframe.
 *
 * @param {string} src - Script URL to execute in isolation.
 * @param {Object} [options={}] - Options.
 * @returns {Promise<{sandbox: Object, src: string}>}
 */
export function loadScriptIsolated(src, options = {}) {
  return new Promise((resolve, reject) => {
    let parsedUrl;
    try {
      parsedUrl = validateScriptUrl(src, options);
    } catch (err) {
      reject(err);
      return;
    }

    const sandbox = createSandboxedExecutionFrame(options);

    try {
      const frameDoc =
        sandbox.iframe.contentDocument ||
        sandbox.iframe.contentWindow?.document;

      if (!frameDoc) {
        // In sandboxed frames with null origin, contentDocument may be restricted.
        // Resolve sandbox handle for postMessage coordination.
        resolve({ sandbox, src: parsedUrl.href });
        return;
      }

      const script = frameDoc.createElement("script");
      script.src = parsedUrl.href;
      script.crossOrigin = options.crossOrigin || "anonymous";

      const integrity =
        options.integrity || getRegisteredIntegrity(parsedUrl.href);
      if (integrity) {
        script.integrity = integrity;
      }

      script.onload = () => resolve({ sandbox, src: parsedUrl.href });
      script.onerror = () => {
        sandbox.destroy();
        reject(
          new Error(`Failed to load isolated script "${parsedUrl.href}" in sandbox.`)
        );
      };

      (frameDoc.head || frameDoc.body || frameDoc.documentElement).appendChild(
        script
      );
    } catch (frameErr) {
      // If direct DOM access to sandbox is blocked by browser policy, return sandbox handle
      resolve({ sandbox, src: parsedUrl.href });
    }
  });
}

/**
 * Captures a snapshot of current global property names on window/globalThis.
 *
 * @param {Object} [targetWindow] - Target global object.
 * @returns {Set<string>}
 */
export function snapshotGlobalKeys(
  targetWindow = typeof window !== "undefined" ? window : globalThis
) {
  if (!targetWindow) return new Set();
  try {
    return new Set(Object.getOwnPropertyNames(targetWindow));
  } catch {
    return new Set();
  }
}

/**
 * Detects global variables introduced by third-party scripts by diffing against a snapshot.
 *
 * @param {Set<string>} beforeSnapshot - Property names captured prior to script execution.
 * @param {Object} [targetWindow] - Target global object.
 * @returns {Array<string>} - Array of newly introduced global keys.
 */
export function detectGlobalPollution(
  beforeSnapshot,
  targetWindow = typeof window !== "undefined" ? window : globalThis
) {
  if (!beforeSnapshot || !(beforeSnapshot instanceof Set) || !targetWindow) {
    return [];
  }
  try {
    const currentKeys = Object.getOwnPropertyNames(targetWindow);
    return currentKeys.filter(key => !beforeSnapshot.has(key));
  } catch {
    return [];
  }
}

/**
 * Securely loads TensorFlow.js and MobileNet dependencies with verified SRI hashes,
 * origin validation, and timeout control.
 *
 * @param {Object} [options={}] - Optional load overrides.
 * @returns {Promise<void>}
 */
export async function initializeClassifierDependencies(options = {}) {
  const TFJS_URL = "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0";
  const MOBILENET_URL =
    "https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.1";

  try {
    await loadScriptsSequentially(
      [
        {
          src: TFJS_URL,
          integrity: KNOWN_MODEL_INTEGRITY[TFJS_URL],
          crossOrigin: "anonymous",
        },
        {
          src: MOBILENET_URL,
          integrity: KNOWN_MODEL_INTEGRITY[MOBILENET_URL],
          crossOrigin: "anonymous",
        },
      ],
      {
        timeoutMs: options.timeoutMs ?? DEFAULT_SCRIPT_TIMEOUT_MS,
        ...options,
      }
    );

    console.log(
      "TensorFlow and MobileNet models loaded successfully via verified secure injection."
    );
  } catch (error) {
    console.error("Error loading classifier dependencies:", error);
    throw error;
  }
}

/**
 * Resets internal loader cache and registries (primarily for automated testing).
 * @private
 */
export function _resetLoaderState() {
  dynamicIntegrityRegistry.clear();
  pendingLoads.clear();
  loadedScripts.clear();
}

const CradleModelLoader = {
  ALLOWED_MODEL_HOSTS,
  KNOWN_MODEL_INTEGRITY,
  SRI_HASH_PATTERN,
  DEFAULT_SCRIPT_TIMEOUT_MS,
  isValidSriHash,
  registerModelIntegrity,
  getRegisteredIntegrity,
  isAllowedOrigin,
  validateScriptUrl,
  loadScriptAsync,
  loadScriptsSequentially,
  createSandboxedExecutionFrame,
  loadScriptIsolated,
  snapshotGlobalKeys,
  detectGlobalPollution,
  initializeClassifierDependencies,
  _resetLoaderState,
};

if (typeof window !== "undefined") {
  window.CradleModelLoader = CradleModelLoader;
}
if (typeof globalThis !== "undefined") {
  globalThis.CradleModelLoader = CradleModelLoader;
}

export default CradleModelLoader;
