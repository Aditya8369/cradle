const test = require("node:test");
const assert = require("node:assert/strict");
const ContrastEngine = require("../projects/dev-tools/color-contrast-checker/contrastEngine.js");

test("normalizeHex accepts 3 and 6 digit hex colors", () => {
  assert.equal(ContrastEngine.normalizeHex("#fff"), "#ffffff");
  assert.equal(ContrastEngine.normalizeHex("0f172a"), "#0f172a");
  assert.equal(ContrastEngine.normalizeHex("ABC"), "#aabbcc");
});

test("isValidHexColor rejects invalid hex values", () => {
  assert.equal(ContrastEngine.isValidHexColor("#12"), false);
  assert.equal(ContrastEngine.isValidHexColor("#gggggg"), false);
  assert.equal(ContrastEngine.isValidHexColor("12345z"), false);
  assert.equal(ContrastEngine.isValidHexColor(null), false);
});

test("calculateContrastRatio returns WCAG contrast for black and white", () => {
  assert.equal(ContrastEngine.calculateContrastRatio("#000000", "#ffffff"), 21);
});

test("calculateContrastRatio is order independent", () => {
  const first = ContrastEngine.calculateContrastRatio("#1e293b", "#f8fafc");
  const second = ContrastEngine.calculateContrastRatio("#f8fafc", "#1e293b");
  assert.equal(first, second);
});

test("getWcagStatus marks AA and AAA pass states", () => {
  assert.deepEqual(ContrastEngine.getWcagStatus(7), {
    normalAA: true,
    normalAAA: true,
    largeAA: true,
    largeAAA: true,
    uiAA: true,
  });
});

test("getWcagStatus marks normal text fail while UI components pass at 3:1", () => {
  const status = ContrastEngine.getWcagStatus(3);
  assert.equal(status.normalAA, false);
  assert.equal(status.normalAAA, false);
  assert.equal(status.largeAA, true);
  assert.equal(status.uiAA, true);
});

test("getContrastReport returns invalid result for bad inputs", () => {
  const report = ContrastEngine.getContrastReport("#12345z", "#ffffff");
  assert.equal(report.valid, false);
  assert.match(report.error, /valid/i);
});

test("getContrastReport includes ratio, pass/fail status, and CSS variables", () => {
  const report = ContrastEngine.getContrastReport("#ffffff", "#020617");
  assert.equal(report.valid, true);
  assert.ok(report.ratio >= 15);
  assert.equal(report.status.normalAA, true);
  assert.match(report.cssVariables, /--contrast-foreground: #ffffff/);
  assert.match(report.cssVariables, /--contrast-background: #020617/);
});

test("suggestAccessibleAlternatives returns AA normal candidates for failing colors", () => {
  const suggestions = ContrastEngine.suggestAccessibleAlternatives(
    "#94a3b8",
    "#f8fafc"
  );
  assert.ok(suggestions.length > 0);
  assert.ok(
    suggestions.every(
      item => item.ratio >= ContrastEngine.WCAG_THRESHOLDS.normalAA
    )
  );
});

test("suggestAccessibleAlternatives returns empty list for already accessible colors", () => {
  const suggestions = ContrastEngine.suggestAccessibleAlternatives(
    "#ffffff",
    "#000000"
  );
  assert.deepEqual(suggestions, []);
});
