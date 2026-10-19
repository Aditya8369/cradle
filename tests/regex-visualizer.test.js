import { test } from "node:test";
import assert from "node:assert/strict";
import RegexEngine from "../projects/dev-tools/regex-visualizer/regexEngine.js";

test("sanitizeFlags removes invalid flag characters and duplicates", () => {
  assert.equal(RegexEngine.sanitizeFlags("gimaxz"), "gim");
  assert.equal(RegexEngine.sanitizeFlags("gggg"), "g");
  assert.equal(RegexEngine.sanitizeFlags(null), "g");
});

test("compileRegex returns valid RegExp object for correct patterns", () => {
  const { regex, error } = RegexEngine.compileRegex("\\d+", "gi");
  assert.equal(error, null);
  assert.equal(regex instanceof RegExp, true);
  assert.equal(regex.test("123"), true);
});

test("compileRegex captures syntax error message for broken regex pattern", () => {
  const { regex, error } = RegexEngine.compileRegex("([a-z", "g");
  assert.equal(regex, null);
  assert.notEqual(error, null);
});

test("parsePatternTokens generates detailed semantic explanations", () => {
  const tokens = RegexEngine.parsePatternTokens("^\\d+$");
  assert.equal(tokens.length, 4);
  assert.equal(tokens[0].type, "anchor");
  assert.equal(tokens[1].token, "\\d");
  assert.equal(tokens[2].type, "quantifier");
  assert.equal(tokens[3].token, "$");
});

test("executeReplace performs string substitution accurately", () => {
  const { output, error } = RegexEngine.executeReplace(
    "hello",
    "gi",
    "Hello World",
    "hi"
  );
  assert.equal(error, null);
  assert.equal(output, "hi World");
});
