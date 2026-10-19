const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeCode,
  tokenize,
  calculateJaccardSimilarity,
  analyzeDuplicateModules,
} = require("../scripts/detect-duplicate-js.js");

test("normalizeCode strips comments and whitespace", () => {
  const code = `
    // This is a comment
    function hello() {
      /* Block comment */
      console.log("world");
    }
  `;
  const normalized = normalizeCode(code);
  assert.equal(normalized.includes("// This is a comment"), false);
  assert.equal(normalized.includes("/* Block comment */"), false);
  assert.ok(normalized.includes('console.log("world");'));
});

test("tokenize extracts identifier words", () => {
  const lines = [
    "const a = 10;",
    "function computeSum(x, y) { return x + y; }",
  ];
  const tokens = tokenize(lines);
  assert.ok(tokens.includes("const"));
  assert.ok(tokens.includes("computeSum"));
  assert.ok(tokens.includes("return"));
});

test("calculateJaccardSimilarity calculates ratio between sets accurately", () => {
  const setA = new Set(["a", "b", "c"]);
  const setB = new Set(["b", "c", "d"]);
  // Intersection = 2, Union = 4 => 2/4 = 0.5
  assert.equal(calculateJaccardSimilarity(setA, setB), 0.5);

  const setIdentical = new Set(["a", "b"]);
  assert.equal(calculateJaccardSimilarity(setIdentical, setIdentical), 1.0);
});

test("analyzeDuplicateModules runs on projects directory without error", () => {
  const duplicates = analyzeDuplicateModules(0.8);
  assert.ok(Array.isArray(duplicates));
});
