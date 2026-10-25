/**
 * Test Helper — Browser-accurate localStorage Mock
 * ────────────────────────────────────────────────
 * Provides an in-memory localStorage implementation that accurately models
 * real browser behaviors and failure modes, including:
 *   - QuotaExceededError (DOMException code 22) when storage limit is exceeded
 *     or when simulateQuotaExceeded is active.
 *   - SecurityError (DOMException code 18) when access is restricted
 *     (e.g., third-party storage blocked, private browsing, cross-origin iframes).
 *   - Global access denial simulation (accessing window.localStorage throws SecurityError).
 *   - Read-only simulation (e.g., Safari private browsing rejecting writes).
 *   - Custom / transient fault injection (setThrowOn, failNext).
 *   - HTML Storage specification argument coercion and transactional atomicity.
 *   - Clean test isolation (beforeEach / afterEach auto-reset).
 */

const DOM_EXCEPTION_CODES = {
  SECURITY_ERR: 18,
  QUOTA_EXCEEDED_ERR: 22,
};

function createDOMException(name, message, code) {
  if (code === undefined) {
    if (name === "QuotaExceededError")
      code = DOM_EXCEPTION_CODES.QUOTA_EXCEEDED_ERR;
    else if (name === "SecurityError") code = DOM_EXCEPTION_CODES.SECURITY_ERR;
  }
  if (typeof DOMException !== "undefined") {
    try {
      const err = new DOMException(message, name);
      if (code !== undefined && err.code !== code) {
        try {
          Object.defineProperty(err, "code", {
            value: code,
            configurable: true,
          });
        } catch (_) {}
      }
      return err;
    } catch (_) {}
  }
  const err = new Error(message);
  err.name = name;
  if (code !== undefined) {
    err.code = code;
  }
  return err;
}

function createQuotaExceededError(message, key) {
  const msg =
    message ||
    (key !== undefined
      ? `Failed to execute 'setItem' on 'Storage': Setting the value of '${key}' exceeded the quota.`
      : "The quota has been exceeded.");
  return createDOMException(
    "QuotaExceededError",
    msg,
    DOM_EXCEPTION_CODES.QUOTA_EXCEEDED_ERR
  );
}

function createSecurityError(message, operation) {
  const msg =
    message ||
    (operation !== undefined
      ? `Failed to execute '${operation}' on 'Storage': Access is denied for this document.`
      : "Failed to read the 'localStorage' property from 'Window': Access is denied for this document.");
  return createDOMException(
    "SecurityError",
    msg,
    DOM_EXCEPTION_CODES.SECURITY_ERR
  );
}

function createLocalStorageInstance(initialOptions = {}) {
  const store = new Map();
  const defaultOptions = { ...initialOptions };

  let quotaLimit = Infinity;
  let quotaUnit = "chars";
  let quotaExceeded = false;
  let accessDenied = false;
  let globalAccessDenied = false;
  let readOnly = false;
  let readOnlyErrorType = "QuotaExceededError";
  const throwOnMap = new Map();
  const failNextMap = new Map();

  function applyOptions(opts = {}) {
    quotaLimit = opts.quota !== undefined ? Number(opts.quota) : Infinity;
    quotaUnit = opts.quotaUnit === "bytes" ? "bytes" : "chars";
    quotaExceeded = Boolean(opts.simulateQuotaExceeded || opts.quotaExceeded);
    accessDenied = Boolean(opts.simulateSecurityError || opts.accessDenied);
    globalAccessDenied = Boolean(opts.globalAccessDenied);
    readOnly = Boolean(opts.readOnly);
    readOnlyErrorType = opts.readOnlyErrorType || "QuotaExceededError";
    throwOnMap.clear();
    failNextMap.clear();
    if (opts.throwOn && typeof opts.throwOn === "object") {
      for (const [op, err] of Object.entries(opts.throwOn)) {
        throwOnMap.set(op, err);
      }
    }
  }

  applyOptions(defaultOptions);

  function calculateSize(key, value, unit = quotaUnit) {
    const kStr = String(key);
    const vStr = String(value);
    const charCount = kStr.length + vStr.length;
    return unit === "bytes" ? charCount * 2 : charCount;
  }

  function getUsage(opts = {}) {
    const unit = opts.unit || quotaUnit;
    let total = 0;
    for (const [k, v] of store.entries()) {
      total += calculateSize(k, v, unit);
    }
    return total;
  }

  function checkAccess(op) {
    if (accessDenied) {
      throw createSecurityError(undefined, op);
    }
  }

  function checkFailure(op, ...args) {
    if (failNextMap.has(op)) {
      const errOrFn = failNextMap.get(op);
      failNextMap.delete(op);
      if (typeof errOrFn === "function") {
        throw errOrFn(...args);
      }
      if (errOrFn instanceof Error) {
        throw errOrFn;
      }
      throw new Error(`Simulated failure on ${op}`);
    }
    if (throwOnMap.has(op)) {
      const errOrFn = throwOnMap.get(op);
      if (typeof errOrFn === "function") {
        throw errOrFn(...args);
      }
      if (errOrFn instanceof Error) {
        throw errOrFn;
      }
      throw new Error(`Simulated failure on ${op}`);
    }
  }

  const mock = {
    get length() {
      checkAccess("length");
      checkFailure("length");
      return store.size;
    },

    key(index) {
      checkAccess("key");
      checkFailure("key", index);
      const idx = Number(index);
      return idx >= 0 && idx < store.size ? [...store.keys()][idx] : null;
    },

    getItem(key) {
      const k = String(key);
      checkAccess("getItem");
      checkFailure("getItem", k);
      return store.has(k) ? store.get(k) : null;
    },

    setItem(key, value) {
      const k = String(key);
      const v = String(value);

      checkAccess("setItem");
      checkFailure("setItem", k, v);

      if (readOnly) {
        if (readOnlyErrorType === "SecurityError") {
          throw createSecurityError(undefined, "setItem");
        }
        throw createQuotaExceededError(undefined, k);
      }

      if (quotaExceeded) {
        throw createQuotaExceededError(undefined, k);
      }

      if (Number.isFinite(quotaLimit)) {
        let projectedUsage = getUsage();
        if (store.has(k)) {
          projectedUsage -= calculateSize(k, store.get(k));
        }
        projectedUsage += calculateSize(k, v);
        if (projectedUsage > quotaLimit) {
          throw createQuotaExceededError(undefined, k);
        }
      }

      store.set(k, v);
    },

    removeItem(key) {
      const k = String(key);
      checkAccess("removeItem");
      checkFailure("removeItem", k);

      if (readOnly) {
        if (readOnlyErrorType === "SecurityError") {
          throw createSecurityError(undefined, "removeItem");
        }
        throw createQuotaExceededError(undefined, k);
      }

      store.delete(k);
    },

    clear() {
      checkAccess("clear");
      checkFailure("clear");

      if (readOnly) {
        if (readOnlyErrorType === "SecurityError") {
          throw createSecurityError(undefined, "clear");
        }
        throw createQuotaExceededError();
      }

      store.clear();
    },

    // --- Mock control and configuration methods ---

    setQuota(limit, opts = {}) {
      quotaLimit = Number(limit);
      if (opts.unit) {
        quotaUnit = opts.unit === "bytes" ? "bytes" : "chars";
      }
    },

    getQuota() {
      return quotaLimit;
    },

    getUsage(opts) {
      return getUsage(opts);
    },

    simulateQuotaExceeded(enabled = true) {
      quotaExceeded = Boolean(enabled);
    },
    setQuotaExceeded(enabled = true) {
      quotaExceeded = Boolean(enabled);
    },

    simulateSecurityError(enabled = true) {
      accessDenied = Boolean(enabled);
    },
    setAccessDenied(enabled = true) {
      accessDenied = Boolean(enabled);
    },

    setGlobalAccessDenied(enabled = true) {
      globalAccessDenied = Boolean(enabled);
    },
    isGlobalAccessDenied() {
      return globalAccessDenied;
    },

    setReadOnly(enabled = true, errorType = "QuotaExceededError") {
      readOnly = Boolean(enabled);
      readOnlyErrorType = errorType;
    },

    setThrowOn(operation, errorOrBool) {
      if (
        errorOrBool === null ||
        errorOrBool === false ||
        errorOrBool === undefined
      ) {
        throwOnMap.delete(operation);
      } else {
        throwOnMap.set(
          operation,
          errorOrBool === true
            ? new Error(`Simulated failure on ${operation}`)
            : errorOrBool
        );
      }
    },

    failNext(operation, errorOrBool) {
      if (
        errorOrBool === null ||
        errorOrBool === false ||
        errorOrBool === undefined
      ) {
        failNextMap.delete(operation);
      } else {
        failNextMap.set(
          operation,
          errorOrBool === true
            ? new Error(`Simulated transient failure on ${operation}`)
            : errorOrBool
        );
      }
    },

    resetFailures() {
      applyOptions(defaultOptions);
    },

    reset() {
      applyOptions(defaultOptions);
      store.clear();
    },

    getStore() {
      return new Map(store);
    },
  };

  return mock;
}

let activeMock = null;
let hooksRegistered = false;

function registerHooks() {
  if (hooksRegistered) return;
  try {
    const { beforeEach, afterEach } = require("node:test");
    if (typeof beforeEach === "function" && typeof afterEach === "function") {
      beforeEach(() => {
        resetLocalStorageMock();
      });
      afterEach(() => {
        resetLocalStorageMock();
      });
      hooksRegistered = true;
    }
  } catch (e) {
    // Ignore if hooks cannot be bound
  }
}

function setupLocalStorageMock(options = {}) {
  activeMock = createLocalStorageInstance(options);

  try {
    Object.defineProperty(global, "localStorage", {
      get() {
        if (activeMock && activeMock.isGlobalAccessDenied()) {
          throw createSecurityError();
        }
        return activeMock;
      },
      set(val) {
        activeMock = val;
      },
      configurable: true,
      enumerable: true,
    });
  } catch (_) {
    global.localStorage = activeMock;
  }

  registerHooks();
  activeMock.reset();
  return activeMock;
}

function resetLocalStorageMock() {
  if (activeMock) {
    activeMock.reset();
  } else if (
    global.localStorage &&
    typeof global.localStorage.clear === "function"
  ) {
    try {
      global.localStorage.clear();
    } catch (_) {}
  }
}

module.exports = {
  setupLocalStorageMock,
  resetLocalStorageMock,
  createDOMException,
  createQuotaExceededError,
  createSecurityError,
  DOM_EXCEPTION_CODES,
};
