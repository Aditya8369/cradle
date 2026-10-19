import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeExternalUrl } from "../src/utils/urlValidator.js";

globalThis.window = {
  location: { origin: "https://cradle.test" },
};

test("allows standard HTTP and HTTPS URLs", () => {
  assert.equal(
    sanitizeExternalUrl("https://github.com/Facelessism/cradle"),
    "https://github.com/Facelessism/cradle"
  );
  assert.equal(
    sanitizeExternalUrl("http://localhost:8000/demo"),
    "http://localhost:8000/demo"
  );
});

test("rejects JavaScript XSS vectors", () => {
  assert.equal(sanitizeExternalUrl("javascript:alert(1)"), null);
  assert.equal(sanitizeExternalUrl('JAVASCRIPT:console.log("xss")'), null);
});

test("rejects data URIs", () => {
  assert.equal(
    sanitizeExternalUrl("data:text/html,<script>alert(1)</script>"),
    null
  );
});

test("rejects unauthorized protocols", () => {
  assert.equal(sanitizeExternalUrl("file:///etc/passwd"), null);
  assert.equal(sanitizeExternalUrl("ftp://example.com"), null);
});

test("handles empty or non-string input", () => {
  assert.equal(sanitizeExternalUrl(""), null);
  assert.equal(sanitizeExternalUrl("   "), null);
  assert.equal(sanitizeExternalUrl(null), null);
  assert.equal(sanitizeExternalUrl(undefined), null);
  assert.equal(sanitizeExternalUrl(123), null);
});

test("normalizes whitespace around valid URLs", () => {
  assert.equal(
    sanitizeExternalUrl("  https://example.com/path  "),
    "https://example.com/path"
  );
});

test("resolves relative URLs against the current origin", () => {
  assert.equal(sanitizeExternalUrl("/about"), "https://cradle.test/about");
});
