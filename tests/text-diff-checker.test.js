const test = require("node:test");
const assert = require("node:assert/strict");

const {
  diffArrays,
  toLines,
  toWordTokens,
  escapeHtml,
  inlineWordDiff,
} = require("../projects/dev-tools/text-diff-checker/diffEngine.js");

test("diffArrays identifies equal values", () => {
  assert.deepEqual(diffArrays(["a", "b"], ["a", "b"]), [
    { type: "equal", value: "a" },
    { type: "equal", value: "b" },
  ]);
});

test("diffArrays identifies additions", () => {
  assert.deepEqual(diffArrays(["a"], ["a", "b"]), [
    { type: "equal", value: "a" },
    { type: "add", value: "b" },
  ]);
});

test("diffArrays identifies deletions", () => {
  assert.deepEqual(diffArrays(["a", "b"], ["a"]), [
    { type: "equal", value: "a" },
    { type: "del", value: "b" },
  ]);
});

test("diffArrays handles completely different arrays", () => {
  const result = diffArrays(["old"], ["new"]);

  assert.deepEqual(result, [
    { type: "del", value: "old" },
    { type: "add", value: "new" },
  ]);
});

test("diffArrays handles empty arrays", () => {
  assert.deepEqual(diffArrays([], []), []);
});

test("toLines splits text by newline", () => {
  assert.deepEqual(toLines("line one\nline two\nline three"), [
    "line one",
    "line two",
    "line three",
  ]);
});

test("toLines returns empty array for empty text", () => {
  assert.deepEqual(toLines(""), []);
});

test("toWordTokens preserves whitespace", () => {
  assert.deepEqual(toWordTokens("hello world"), ["hello", " ", "world"]);
});

test("toWordTokens handles multiple spaces", () => {
  assert.deepEqual(toWordTokens("hello   world"), ["hello", "   ", "world"]);
});

test("toWordTokens returns empty array for empty text", () => {
  assert.deepEqual(toWordTokens(""), []);
});

test("escapeHtml escapes HTML-sensitive characters", () => {
  assert.equal(
    escapeHtml('<script>alert("XSS & test")</script>'),
    '&lt;script&gt;alert("XSS &amp; test")&lt;/script&gt;'
  );
});

test("inlineWordDiff highlights deleted words on the left", () => {
  const result = inlineWordDiff("hello world", "hello there");

  assert.match(result.leftHtml, /word-del/);
  assert.match(result.rightHtml, /word-add/);

  assert.match(result.leftHtml, /world/);
  assert.match(result.rightHtml, /there/);
});

test("inlineWordDiff preserves unchanged words", () => {
  const result = inlineWordDiff("hello world", "hello there");

  assert.match(result.leftHtml, /hello/);
  assert.match(result.rightHtml, /hello/);
});

test("inlineWordDiff escapes HTML in changed words", () => {
  const result = inlineWordDiff("<script>", "safe");

  assert.match(result.leftHtml, /&lt;script&gt;/);
  assert.doesNotMatch(result.leftHtml, /<script>/);
});
