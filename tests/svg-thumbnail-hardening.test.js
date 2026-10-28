const test = require("node:test");
const assert = require("node:assert/strict");
const {
  sanitizeSvg,
  isSvgSafe,
  validateSvgThumbnail,
  BLOCKED_ELEMENTS,
} = require("../src/components/ui/sanitizeSvg.js");

test("SVG Validator: allows safe, valid SVG thumbnail content", () => {
  const cleanSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675" width="100%" height="100%">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#111827" />
          <stop offset="100%" stop-color="#1f2937" />
        </linearGradient>
      </defs>
      <rect width="1200" height="675" fill="url(#grad)" />
      <circle cx="600" cy="337" r="100" fill="#3b82f6" />
      <text x="600" y="500" font-size="48" fill="#ffffff" text-anchor="middle">SAFE PREVIEW</text>
    </svg>
  `;

  assert.equal(isSvgSafe(cleanSvg), true);
  const result = validateSvgThumbnail(cleanSvg);
  assert.equal(result.safe, true);
  assert.deepEqual(result.violations, []);
});

test("SVG Validator: flags script execution attempts (<script> tag)", () => {
  const malicious = '<svg viewBox="0 0 100 100"><script>alert("pwned")</script></svg>';
  assert.equal(isSvgSafe(malicious), false);
  const result = validateSvgThumbnail(malicious);
  assert.equal(result.safe, false);
  assert.ok(result.violations.some(v => v.includes("<script>")));
});

test("SVG Validator: flags inline DOM event handlers", () => {
  const withOnLoad = '<svg viewBox="0 0 100 100" onload="alert(1)"><rect width="10" height="10"/></svg>';
  const withOnClick = '<svg viewBox="0 0 100 100"><circle r="10" onclick="alert(document.cookie)"/></svg>';
  const withOnMouse = '<svg viewBox="0 0 100 100"><path d="M0 0" onmouseover="malicious()"/></svg>';

  assert.equal(isSvgSafe(withOnLoad), false);
  assert.equal(isSvgSafe(withOnClick), false);
  assert.equal(isSvgSafe(withOnMouse), false);

  const res = validateSvgThumbnail(withOnLoad);
  assert.ok(res.violations.some(v => v.includes("inline event handler")));
});

test("SVG Validator: flags SMIL animation event handlers", () => {
  const withOnBegin = '<svg viewBox="0 0 100 100"><animate attributeName="opacity" dur="1s" onbegin="alert(1)"/></svg>';
  const withOnEnd = '<svg viewBox="0 0 100 100"><set attributeName="visibility" to="visible" onend="alert(2)"/></svg>';

  assert.equal(isSvgSafe(withOnBegin), false);
  assert.equal(isSvgSafe(withOnEnd), false);
});

test("SVG Validator: flags <foreignObject> embedding arbitrary HTML", () => {
  const withForeignObject = `
    <svg viewBox="0 0 100 100">
      <foreignObject width="100" height="100">
        <iframe src="https://evil.com"></iframe>
      </foreignObject>
    </svg>
  `;

  assert.equal(isSvgSafe(withForeignObject), false);
  const res = validateSvgThumbnail(withForeignObject);
  assert.ok(res.violations.some(v => v.includes("<foreignObject>")));
});

test("SVG Validator: flags dangerous pseudo-protocols (javascript:, data:)", () => {
  const withJsHref = '<svg viewBox="0 0 100 100"><a href="javascript:alert(1)"><text>Click</text></a></svg>';
  const withXlink = '<svg viewBox="0 0 100 100"><a xlink:href="javascript:evil()"><circle r="5"/></a></svg>';

  assert.equal(isSvgSafe(withJsHref), false);
  assert.equal(isSvgSafe(withXlink), false);
  const res = validateSvgThumbnail(withJsHref);
  assert.ok(res.violations.some(v => v.includes("dangerous protocol")));
});

test("SVG Validator: flags external network references (<use>, <image>, <feImage>)", () => {
  const extUse = '<svg viewBox="0 0 100 100"><use href="https://evil.com/icon.svg#sym"/></svg>';
  const extImage = '<svg viewBox="0 0 100 100"><image href="https://evil.com/tracker.png" width="1" height="1"/></svg>';
  const extFeImage = '<svg viewBox="0 0 100 100"><filter id="f"><feImage href="http://evil.com/filter.png"/></filter></svg>';

  assert.equal(isSvgSafe(extUse), false);
  assert.equal(isSvgSafe(extImage), false);
  assert.equal(isSvgSafe(extFeImage), false);

  const res = validateSvgThumbnail(extUse);
  assert.ok(res.violations.some(v => v.includes("external network reference")));
});

test("SVG Validator: flags external stylesheet imports and remote url() in <style>", () => {
  const withImport = `
    <svg viewBox="0 0 100 100">
      <style>@import url('https://evil.com/style.css'); circle { fill: red; }</style>
      <circle r="10"/>
    </svg>
  `;

  const withRemoteUrl = `
    <svg viewBox="0 0 100 100">
      <style>circle { fill: url('https://evil.com/leak.png'); }</style>
      <circle r="10"/>
    </svg>
  `;

  assert.equal(isSvgSafe(withImport), false);
  assert.equal(isSvgSafe(withRemoteUrl), false);
});

test("SVG Validator: flags XXE declarations and DOCTYPE directives", () => {
  const withDoctype = `
    <!DOCTYPE svg [
      <!ENTITY xxe SYSTEM "file:///etc/passwd">
    ]>
    <svg viewBox="0 0 100 100"><text>&xxe;</text></svg>
  `;

  assert.equal(isSvgSafe(withDoctype), false);
  const res = validateSvgThumbnail(withDoctype);
  assert.ok(res.violations.some(v => v.includes("XXE risk")));
});

test("SVG Sanitizer: strips scripts and preserves safe vector paths", () => {
  const dirty = `
    <svg viewBox="0 0 100 100">
      <script>alert("bad")</script>
      <circle cx="50" cy="50" r="40" fill="blue" />
    </svg>
  `;

  const clean = sanitizeSvg(dirty);
  assert.ok(!clean.includes("<script>"));
  assert.ok(!clean.includes('alert("bad")'));
  assert.ok(clean.includes('<circle cx="50" cy="50" r="40" fill="blue" />'));
  assert.equal(isSvgSafe(clean), true);
});

test("SVG Sanitizer: strips event handlers while keeping geometry and style attributes", () => {
  const dirty = '<svg viewBox="0 0 100 100" onload="evil()"><rect x="10" y="10" width="50" height="50" fill="green" onclick="hack()"/></svg>';
  const clean = sanitizeSvg(dirty);

  assert.ok(!clean.includes("onload="));
  assert.ok(!clean.includes("onclick="));
  assert.ok(clean.includes('fill="green"'));
  assert.ok(clean.includes('width="50"'));
  assert.equal(isSvgSafe(clean), true);
});

test("SVG Sanitizer: strips <foreignObject> and embedded HTML", () => {
  const dirty = `
    <svg viewBox="0 0 100 100">
      <foreignObject width="100" height="100">
        <iframe src="https://evil.com/xss"></iframe>
      </foreignObject>
      <path d="M0 0 L10 10" stroke="black"/>
    </svg>
  `;

  const clean = sanitizeSvg(dirty);
  assert.ok(!clean.includes("<foreignObject>"));
  assert.ok(!clean.includes("<iframe>"));
  assert.ok(!clean.includes("https://evil.com/xss"));
  assert.ok(clean.includes('<path d="M0 0 L10 10" stroke="black"/>'));
  assert.equal(isSvgSafe(clean), true);
});

test("SVG Sanitizer: strips external network references in <use> and <image>", () => {
  const dirty = `
    <svg viewBox="0 0 100 100">
      <use href="https://evil.com/sprite.svg#icon"/>
      <image href="https://evil.com/pic.png"/>
      <rect width="20" height="20" fill="orange"/>
    </svg>
  `;

  const clean = sanitizeSvg(dirty);
  assert.ok(!clean.includes("https://evil.com"));
  assert.ok(clean.includes('<rect width="20" height="20" fill="orange"/>'));
  assert.equal(isSvgSafe(clean), true);
});

test("SVG Sanitizer: strips XXE and DOCTYPE declarations", () => {
  const dirty = `
    <!DOCTYPE svg SYSTEM "http://evil.com/xxe.dtd">
    <svg viewBox="0 0 100 100"><circle r="10"/></svg>
  `;

  const clean = sanitizeSvg(dirty);
  assert.ok(!clean.includes("<!DOCTYPE"));
  assert.ok(clean.includes('<circle r="10"/>'));
  assert.equal(isSvgSafe(clean), true);
});

test("SVG Sanitizer: strips SMIL animation hijacking target attributes", () => {
  const dirty = `
    <svg viewBox="0 0 100 100">
      <a href="https://safe.org">
        <circle r="10"/>
        <set attributeName="href" to="javascript:alert(1)"/>
      </a>
    </svg>
  `;

  const clean = sanitizeSvg(dirty);
  assert.ok(!clean.includes('attributeName="href"'));
  assert.ok(!clean.includes("javascript:"));
  assert.equal(isSvgSafe(clean), true);
});
