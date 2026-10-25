const test = require("node:test");
const assert = require("node:assert/strict");
const {
  setupLocalStorageMock,
  resetLocalStorageMock,
  createDOMException,
  createQuotaExceededError,
  createSecurityError,
  DOM_EXCEPTION_CODES,
} = require("./helpers/localstorage-mock");

setupLocalStorageMock();

test("DOMException helper produces standard error names and numeric codes", () => {
  const quotaErr = createQuotaExceededError();
  assert.equal(quotaErr.name, "QuotaExceededError");
  assert.equal(quotaErr.code, DOM_EXCEPTION_CODES.QUOTA_EXCEEDED_ERR);
  assert.equal(quotaErr.code, 22);

  const secErr = createSecurityError();
  assert.equal(secErr.name, "SecurityError");
  assert.equal(secErr.code, DOM_EXCEPTION_CODES.SECURITY_ERR);
  assert.equal(secErr.code, 18);

  const customEx = createDOMException(
    "NotSupportedError",
    "Feature unsupported",
    9
  );
  assert.equal(customEx.name, "NotSupportedError");
  assert.equal(customEx.code, 9);
  assert.equal(customEx.message, "Feature unsupported");
});

test("Quota limits trigger QuotaExceededError and preserve storage atomicity", () => {
  // Quota of 10 characters (key.length + value.length)
  localStorage.setQuota(10);
  assert.equal(localStorage.getQuota(), 10);
  assert.equal(localStorage.getUsage(), 0);

  // Storing "ab" -> "123" uses 2 + 3 = 5 characters (<= 10)
  localStorage.setItem("ab", "123");
  assert.equal(localStorage.getItem("ab"), "123");
  assert.equal(localStorage.getUsage(), 5);

  // Storing "cd" -> "12345" requires 2 + 5 = 7 characters; total 5 + 7 = 12 > 10
  assert.throws(
    () => {
      localStorage.setItem("cd", "12345");
    },
    err => {
      return (
        err.name === "QuotaExceededError" &&
        err.code === 22 &&
        err.message.includes("cd")
      );
    }
  );

  // Atomicity: "cd" was not partially written, "ab" is still intact
  assert.equal(localStorage.getItem("cd"), null);
  assert.equal(localStorage.getItem("ab"), "123");
  assert.equal(localStorage.length, 1);
  assert.equal(localStorage.getUsage(), 5);

  // Overwriting "ab" with a larger value that exceeds quota preserves the old value
  assert.throws(
    () => {
      localStorage.setItem("ab", "1234567890"); // 2 + 10 = 12 > 10
    },
    err => err.name === "QuotaExceededError" && err.code === 22
  );
  assert.equal(localStorage.getItem("ab"), "123");
  assert.equal(localStorage.getUsage(), 5);

  // Overwriting with a smaller value updates usage accurately
  localStorage.setItem("ab", "1"); // 2 + 1 = 3 chars
  assert.equal(localStorage.getItem("ab"), "1");
  assert.equal(localStorage.getUsage(), 3);

  // Removing key reduces usage
  localStorage.removeItem("ab");
  assert.equal(localStorage.getUsage(), 0);
  assert.equal(localStorage.length, 0);
});

test("Byte-based quota calculations accurately reflect UTF-16 code unit footprints", () => {
  // 12 bytes quota (unit: "bytes" = (key.length + value.length) * 2)
  localStorage.setQuota(12, { unit: "bytes" });

  // "k" -> "v" uses (1 + 1) * 2 = 4 bytes
  localStorage.setItem("k", "v");
  assert.equal(localStorage.getUsage({ unit: "bytes" }), 4);

  // "k2" -> "abcd" uses (2 + 4) * 2 = 12 bytes; 4 + 12 = 16 bytes > 12 bytes
  assert.throws(
    () => {
      localStorage.setItem("k2", "abcd");
    },
    err => err.name === "QuotaExceededError" && err.code === 22
  );

  assert.equal(localStorage.getItem("k2"), null);
});

test("simulateQuotaExceeded unconditionally fails setItem regardless of storage capacity", () => {
  localStorage.simulateQuotaExceeded(true);

  assert.throws(
    () => {
      localStorage.setItem("tiny", "1");
    },
    err => err.name === "QuotaExceededError" && err.code === 22
  );

  // Disabling the simulation restores normal write operations
  localStorage.simulateQuotaExceeded(false);
  localStorage.setItem("tiny", "1");
  assert.equal(localStorage.getItem("tiny"), "1");
});

test("simulateSecurityError reproduces access denied exceptions on all Storage methods", () => {
  localStorage.setItem("preset", "val");
  localStorage.simulateSecurityError(true);

  // All storage methods throw SecurityError with code 18
  assert.throws(
    () => localStorage.getItem("preset"),
    err => err.name === "SecurityError" && err.code === 18
  );
  assert.throws(
    () => localStorage.setItem("newKey", "val"),
    err => err.name === "SecurityError" && err.code === 18
  );
  assert.throws(
    () => localStorage.removeItem("preset"),
    err => err.name === "SecurityError" && err.code === 18
  );
  assert.throws(
    () => localStorage.clear(),
    err => err.name === "SecurityError" && err.code === 18
  );
  assert.throws(
    () => localStorage.key(0),
    err => err.name === "SecurityError" && err.code === 18
  );
  assert.throws(
    () => localStorage.length,
    err => err.name === "SecurityError" && err.code === 18
  );

  // Disabling security error restores access
  localStorage.simulateSecurityError(false);
  assert.equal(localStorage.getItem("preset"), "val");
  assert.equal(localStorage.length, 1);
});

test("setGlobalAccessDenied simulates window.localStorage accessor throwing SecurityError", () => {
  const mock = setupLocalStorageMock();
  mock.setGlobalAccessDenied(true);

  assert.throws(
    () => {
      // Accessing the global.localStorage property itself throws SecurityError
      global.localStorage.getItem("test");
    },
    err => err.name === "SecurityError" && err.code === 18
  );

  // Directly resetting via mock handle or resetLocalStorageMock restores global access
  mock.setGlobalAccessDenied(false);
  assert.equal(localStorage.getItem("test"), null);
});

test("setReadOnly permits reads while rejecting write operations", () => {
  localStorage.setItem("initKey", "initVal");
  localStorage.setReadOnly(true);

  // Reads succeed
  assert.equal(localStorage.getItem("initKey"), "initVal");
  assert.equal(localStorage.length, 1);
  assert.equal(localStorage.key(0), "initKey");

  // Mutating operations fail
  assert.throws(
    () => localStorage.setItem("initKey", "newVal"),
    err => err.name === "QuotaExceededError"
  );
  assert.throws(
    () => localStorage.removeItem("initKey"),
    err => err.name === "QuotaExceededError"
  );
  assert.throws(
    () => localStorage.clear(),
    err => err.name === "QuotaExceededError"
  );

  // Original state is preserved
  assert.equal(localStorage.getItem("initKey"), "initVal");
});

test("Custom fault injection with setThrowOn and failNext", () => {
  // setThrowOn injects persistent failure for a specific method
  const diskErr = new Error("EIO: i/o error");
  localStorage.setThrowOn("getItem", diskErr);

  assert.throws(() => localStorage.getItem("k"), diskErr);
  assert.throws(() => localStorage.getItem("k"), diskErr);

  // Clear failure
  localStorage.setThrowOn("getItem", null);
  assert.equal(localStorage.getItem("k"), null);

  // failNext injects transient failure for one call only
  const transientErr = new Error("Temporary lock");
  localStorage.failNext("setItem", transientErr);

  assert.throws(() => localStorage.setItem("k", "v"), transientErr);
  // Second call succeeds
  localStorage.setItem("k", "v");
  assert.equal(localStorage.getItem("k"), "v");
});

test("Argument coercion occurs prior to quota check or storage modification", () => {
  const throwingKey = {
    toString() {
      throw new TypeError("Cannot convert object to string");
    },
  };

  localStorage.setQuota(5);

  assert.throws(() => localStorage.setItem(throwingKey, "val"), TypeError);
  assert.equal(localStorage.length, 0);
});

test("Isolation: Failure modes from preceding tests do not leak into subsequent tests (Part 1)", () => {
  // Activate failure modes in this test
  localStorage.simulateQuotaExceeded(true);
  localStorage.setQuota(2);
  assert.throws(() => localStorage.setItem("k", "v"));
});

test("Isolation: Failure modes from preceding tests do not leak into subsequent tests (Part 2)", () => {
  // Confirm clean slate in next test
  assert.equal(localStorage.getQuota(), Infinity);
  localStorage.setItem("k", "v");
  assert.equal(localStorage.getItem("k"), "v");
});
