const test = require("node:test");
const assert = require("node:assert/strict");
const {
  encodeBase64,
  decodeBase64,
  encodeURLText,
  decodeURLText,
  encodeHTML,
  decodeHTML,
  encodeUnicode,
  decodeUnicode,
  encodeHex,
  decodeHex,
  encodeBinary,
  decodeBinary,
} = require("../projects/dev-tools/encoding-toolkit/logic");

test("Base64 round-trips plain and unicode text", () => {
  assert.equal(decodeBase64(encodeBase64("Hello, world!")), "Hello, world!");
  assert.equal(
    decodeBase64(encodeBase64("Hello, 世界! 🎉")),
    "Hello, 世界! 🎉"
  );
});

test("Base64 decode rejects malformed input", () => {
  assert.throws(() => decodeBase64("not-valid-base64!!"), /Invalid Base64/);
});

test("URL encoding round-trips reserved characters", () => {
  const input = "a b&c=d/世界";
  assert.equal(decodeURLText(encodeURLText(input)), input);
});

test("URL decode rejects malformed percent-encoding", () => {
  assert.throws(() => decodeURLText("%E0%A4%A"), /Malformed URL-encoded/);
});

test("HTML entity encoding escapes and unescapes reserved characters", () => {
  const input = `<a href="x">Tom & Jerry's</a>`;
  assert.equal(decodeHTML(encodeHTML(input)), input);
});

test("HTML decode supports numeric entities", () => {
  assert.equal(decodeHTML("&#65;&#x42;"), "AB");
});

test("HTML decode rejects unknown entities", () => {
  assert.throws(() => decodeHTML("&notarealentity;"), /Unknown HTML entity/);
});

test("Unicode escape round-trips text including astral code points", () => {
  const input = "Hi 🎉 é";
  assert.equal(decodeUnicode(encodeUnicode(input)), input);
});

test("Unicode decode rejects malformed escapes", () => {
  assert.throws(() => decodeUnicode("\\uZZZZ"), /Invalid Unicode escape/);
});

test("Hex encoding round-trips unicode text", () => {
  const input = "Hi 世";
  assert.equal(decodeHex(encodeHex(input)), input);
});

test("Hex decode rejects odd-length or non-hex input", () => {
  assert.throws(() => decodeHex("zz"), /Invalid Hex/);
  assert.throws(() => decodeHex("abc"), /Invalid Hex/);
});

test("Binary encoding round-trips text", () => {
  const input = "Hi!";
  assert.equal(decodeBinary(encodeBinary(input)), input);
});

test("Binary decode rejects malformed groups", () => {
  assert.throws(() => decodeBinary("123"), /Invalid Binary/);
});

test("empty input returns empty string for every decoder", () => {
  assert.equal(decodeBase64(""), "");
  assert.equal(decodeHex(""), "");
  assert.equal(decodeBinary(""), "");
  assert.equal(decodeUnicode(""), "");
});
