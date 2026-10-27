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

  assert.equal(error, null);
  assert.equal(output, "hi World");
});

test("fuzz testing: compileRegex handles malformed, adversarial, and mutated patterns", () => {
  const malformedPatterns = [
    "(abc",
    "[a-z",
    "([0-9",
    "*abc",
    "+abc",
    "?abc",
    "a++",
    "a***",
    "a{5,2}",
    "abc\\",
    "\\",
    "\\\\\\",
    "\\c",
    "\\k",
    "(?",
    "(?=",
    "(a+)+$",
    "((a|a?)+)+",
  ];

  const malformedFlags = ["", "g", "gi", "gimmick", "1234", "g!@#$%", "gggg", null, undefined, {}];

  for (const pattern of malformedPatterns) {
    for (const flags of malformedFlags) {
      const res = RegexEngine.compileRegex(pattern, flags);
      assert.ok(res && typeof res === "object");
      assert.ok("regex" in res);
      assert.ok("error" in res);
    }
  }

  // Non-string patterns
  const nonStringPatterns = [null, undefined, 12345, {}, []];
  for (const pat of nonStringPatterns) {
    const res = RegexEngine.compileRegex(pat, "g");
    assert.ok(res && typeof res === "object");
  }
});

test("fuzz testing: parsePatternTokens and executeReplace survive adversarial inputs", () => {
  const adversarialPatterns = [
    "",
    "   ",
    null,
    undefined,
    12345,
    "\\",
    "\\\\",
    "^$.*+?()[]{}|\\",
    "((((((((((",
    "))))))))))",
  ];

  for (const pat of adversarialPatterns) {
    const tokens = RegexEngine.parsePatternTokens(pat);
    assert.ok(Array.isArray(tokens));
    for (const tok of tokens) {
      assert.ok(typeof tok.token === "string");
      assert.ok(typeof tok.type === "string");
      assert.ok(typeof tok.explanation === "string");
    }
  }

  // Replacement fuzzing
  const replacements = ["$$", "$&", "$`", "$'", "$1", "$99", "$<name>", null, undefined, 123];
  for (const rep of replacements) {
    const res = RegexEngine.executeReplace("(\\w+)", "g", "hello world", rep);
    assert.ok(res && typeof res === "object");
    assert.ok(typeof res.output === "string");
  }
});
