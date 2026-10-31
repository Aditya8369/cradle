const test = require("node:test");
const assert = require("node:assert/strict");
const { escapeHtml, html, raw } = require("../src/components/ui/escapeHtml.js");

test("escapeHtml escapes all five special characters", () => {
  assert.equal(
    escapeHtml('<script>alert("XSS & Test")</script>'),
    "&lt;script&gt;alert(&quot;XSS &amp; Test&quot;)&lt;/script&gt;"
  );
  assert.equal(escapeHtml("John's Chip"), "John&#039;s Chip");
});

test("escapeHtml leaves plain text untouched", () => {
  assert.equal(escapeHtml("Normal Text"), "Normal Text");
  assert.equal(escapeHtml(""), "");
});

test("escapeHtml treats null and undefined as empty string", () => {
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(undefined), "");
});

test("escapeHtml coerces non-string values via String()", () => {
  assert.equal(escapeHtml(42), "42");
  assert.equal(escapeHtml(0), "0");
  assert.equal(escapeHtml(true), "true");
});

test("escapeHtml escapes already-escaped HTML entities", () => {
  assert.equal(escapeHtml("&amp;"), "&amp;amp;");
  assert.equal(escapeHtml("&lt;script&gt;"), "&amp;lt;script&amp;gt;");
});

test("html tagged template encodes dynamic expressions", () => {
  const userInput = '<img src=x onerror="alert(1)">';
  const markup = html`<div class="card"><p>${userInput}</p></div>`;

  assert.equal(
    markup,
    '<div class="card"><p>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</p></div>'
  );
});

test("html tagged template handles numbers and booleans safely", () => {
  const count = 5;
  const markup = html`<span>${count} items</span>`;
  assert.equal(markup, "<span>5 items</span>");
});

test("html tagged template preserves raw safe content", () => {
  const safeIcon = raw('<i class="icon"></i>');
  const userText = "<Danger>";
  const markup = html`<div>${safeIcon} <span>${userText}</span></div>`;

  assert.equal(
    markup,
    '<div><i class="icon"></i> <span>&lt;Danger&gt;</span></div>'
  );
});

test("html tagged template handles arrays of items", () => {
  const items = ["Apple & Pear", "<script>bad()</script>"];
  const markup = html`<ul>${items.map(item => html`<li>${item}</li>`)}</ul>`;

  assert.equal(
    markup,
    "<ul><li>Apple &amp; Pear</li><li>&lt;script&gt;bad()&lt;/script&gt;</li></ul>"
  );
});
