const test = require("node:test");
const assert = require("node:assert/strict");
const storage = require("../src/components/ui/storage.js");
const { setupLocalStorageMock } = require("./helpers/localstorage-mock");

setupLocalStorageMock();

test("isAvailable is true with a working localStorage", () => {
  assert.equal(storage.isAvailable(), true);
});

test("set/get round-trips JSON values", () => {
  localStorage.clear();
  assert.equal(storage.get("missing"), null);
  assert.equal(storage.get("missing", { fallback: true }).fallback, true);

  const obj = { wins: 3, tags: ["a", "b"] };
  storage.set("cradle_test_obj", obj);
  assert.deepEqual(storage.get("cradle_test_obj"), obj);

  storage.set("cradle_test_num", 42);
  assert.equal(storage.get("cradle_test_num"), 42);

  storage.set("cradle_test_bool", false);
  assert.equal(storage.get("cradle_test_bool"), false);
});

test("get returns fallback for corrupt JSON", () => {
  localStorage.clear();
  storage.setRaw("cradle_test_broken", "{not valid json");
  assert.equal(storage.get("cradle_test_broken", "default"), "default");
});

test("getRaw/setRaw store verbatim strings", () => {
  localStorage.clear();
  storage.setRaw("cradle_test_theme", "dark");
  assert.equal(storage.getRaw("cradle_test_theme"), "dark");
  assert.equal(storage.getRaw("cradle_test_missing", "light"), "light");
});

test("remove deletes a single key", () => {
  localStorage.clear();
  storage.set("cradle_test_tmp", { a: 1 });
  assert.equal(storage.remove("cradle_test_tmp"), true);
  assert.equal(storage.get("cradle_test_tmp"), null);
});

test("keys filters by prefix and returns sorted results", () => {
  localStorage.clear();
  storage.set("cradle_k_alpha", 1);
  storage.set("cradle_k_beta", 2);
  storage.set("other_key", 3);
  assert.deepEqual(storage.keys("cradle_k_"), [
    "cradle_k_alpha",
    "cradle_k_beta",
  ]);
  assert.deepEqual(storage.keys("nope"), []);
  assert.deepEqual(storage.keys(), [
    "cradle_k_alpha",
    "cradle_k_beta",
    "other_key",
  ]);
});

test("clear removes only matching keys and reports count", () => {
  localStorage.clear();
  storage.set("cradle_c_a", 1);
  storage.set("cradle_c_b", 2);
  storage.set("keep_me", 3);
  const removed = storage.clear("cradle_c_");
  assert.equal(removed, 2);
  assert.equal(storage.get("cradle_c_a"), null);
  assert.equal(storage.get("cradle_c_b"), null);
  assert.equal(storage.get("keep_me"), 3);
});

test("namespace prefixes all operations and scopes clear/keys", () => {
  localStorage.clear();
  const store = storage.namespace("cradle_ns_");
  const other = storage.namespace("cradle_other_");

  store.set("stats", { wins: 1 });
  other.set("stats", { wins: 2 });

  assert.deepEqual(store.get("stats"), { wins: 1 });
  assert.deepEqual(other.get("stats"), { wins: 2 });

  assert.deepEqual(store.keys(), ["cradle_ns_stats"]);
  assert.deepEqual(other.keys(), ["cradle_other_stats"]);

  assert.equal(store.clear(), 1);
  assert.equal(store.get("stats"), null);
  assert.deepEqual(other.get("stats"), { wins: 2 });
});

test("namespace raw helpers round-trip strings", () => {
  localStorage.clear();
  const store = storage.namespace("cradle_nsraw_");
  store.setRaw("theme", "light");
  assert.equal(store.getRaw("theme"), "light");
  assert.equal(store.getRaw("nope", "dark"), "dark");
});

test("storage gracefully handles QuotaExceededError on writes", () => {
  localStorage.clear();
  localStorage.simulateQuotaExceeded(true);

  // set and setRaw should return false instead of throwing unhandled exceptions
  assert.equal(storage.set("cradle_quota_test", { highscore: 100 }), false);
  assert.equal(storage.setRaw("cradle_quota_raw", "data"), false);
});

test("storage gracefully returns fallback values when localStorage throws SecurityError", () => {
  localStorage.clear();
  localStorage.simulateSecurityError(true);

  // get, getRaw, and remove should safely fall back and return false
  assert.equal(storage.get("cradle_sec_test", "fallback"), "fallback");
  assert.equal(storage.getRaw("cradle_sec_raw", "default"), "default");
  assert.equal(storage.remove("cradle_sec_key"), false);
});

test("clampNumber correctly clamps and falls back on non-finite values", () => {
  assert.equal(storage.clampNumber(50, 0, 100), 50);
  assert.equal(storage.clampNumber(-10, 0, 100), 0);
  assert.equal(storage.clampNumber(250, 0, 100), 100);
  assert.equal(storage.clampNumber("42", 0, 100), 42);
  assert.equal(storage.clampNumber("not-a-number", 0, 100, 15), 15);
  assert.equal(storage.clampNumber(NaN, 0, 100, 0), 0);
  assert.equal(storage.clampNumber(Infinity, 0, 100, 100), 100);
  assert.equal(storage.clampNumber(null, 0, 100, 7), 7);
  assert.equal(storage.clampNumber(true, 0, 100, 0), 0);
});

test("validateBoundedNumber validates min, max, and integer bounds", () => {
  assert.equal(storage.validateBoundedNumber(10, { min: 0, max: 20 }), true);
  assert.equal(storage.validateBoundedNumber(-1, { min: 0, max: 20 }), false);
  assert.equal(storage.validateBoundedNumber(25, { min: 0, max: 20 }), false);
  assert.equal(storage.validateBoundedNumber(10.5, { min: 0, max: 20 }), true);
  assert.equal(
    storage.validateBoundedNumber(10.5, { min: 0, max: 20, integer: true }),
    false
  );
  assert.equal(
    storage.validateBoundedNumber(10, { min: 0, max: 20, integer: true }),
    true
  );
  assert.equal(storage.validateBoundedNumber("NaN", { min: 0, max: 20 }), false);
  assert.equal(
    storage.validateBoundedNumber(Number.MAX_SAFE_INTEGER + 1000, {
      max: Number.MAX_SAFE_INTEGER,
    }),
    false
  );
});

test("getNumber and setNumber safely store, validate, and bound persisted numbers", () => {
  localStorage.clear();

  // Reading missing key returns fallback
  assert.equal(storage.getNumber("score", 0), 0);

  // Storing valid integer score
  assert.equal(
    storage.setNumber("score", 500, { min: 0, max: 10000, integer: true }),
    true
  );
  assert.equal(
    storage.getNumber("score", 0, { min: 0, max: 10000, integer: true }),
    500
  );

  // Reject invalid score on set
  assert.equal(
    storage.setNumber("score_invalid", -50, { min: 0, max: 10000 }),
    false
  );
  assert.equal(storage.getNumber("score_invalid", 0), 0);

  // Reject excessively large number beyond max
  assert.equal(
    storage.setNumber("score_huge", 99999999, { min: 0, max: 10000 }),
    false
  );

  // Reject corrupted or negative raw value in storage
  storage.setRaw("corrupt_score", "-500");
  assert.equal(storage.getNumber("corrupt_score", 0, { min: 0 }), 0);

  storage.setRaw("overflow_score", "999999999999999999999999999999");
  assert.equal(
    storage.getNumber("overflow_score", 0, {
      min: 0,
      max: Number.MAX_SAFE_INTEGER,
    }),
    0
  );

  storage.setRaw("nan_score", "not_a_number");
  assert.equal(storage.getNumber("nan_score", 10), 10);

  // Clamping mode on read
  storage.setRaw("clamp_high", "5000");
  assert.equal(
    storage.getNumber("clamp_high", 0, { min: 0, max: 1000, clamp: true }),
    1000
  );
  storage.setRaw("clamp_low", "-50");
  assert.equal(
    storage.getNumber("clamp_low", 0, { min: 0, max: 1000, clamp: true }),
    0
  );

  // Custom function validator
  storage.setRaw("custom_num", "42");
  assert.equal(
    storage.getNumber("custom_num", 0, n => n % 2 === 0),
    42
  );
  storage.setRaw("custom_odd", "43");
  assert.equal(
    storage.getNumber("custom_odd", 0, n => n % 2 === 0),
    0
  );
});

test("namespace forwards getNumber and setNumber with prefix scoping", () => {
  localStorage.clear();
  const gameStore = storage.namespace("cradle_testgame_");

  assert.equal(
    gameStore.setNumber("score", 750, { min: 0, max: 10000, integer: true }),
    true
  );
  assert.equal(localStorage.getItem("cradle_testgame_score"), "750");
  assert.equal(
    gameStore.getNumber("score", 0, { min: 0, max: 10000, integer: true }),
    750
  );

  // Reject negative score
  assert.equal(
    gameStore.setNumber("score_bad", -10, { min: 0, max: 10000 }),
    false
  );
  assert.equal(gameStore.getNumber("score_bad", 0), 0);
});
