const test = require("node:test");
const assert = require("node:assert/strict");
const ShapeEngine = require("../projects/editor/css-shape-designer/shapeEngine");

test("ShapeEngine generates polygon clip-path correctly", () => {
  const vertices = [
    { x: 50, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];
  const css = ShapeEngine.generateClipPathCSS("polygon", { vertices });
  assert.equal(css, "clip-path: polygon(50% 0%, 100% 100%, 0% 100%);");
});

test("ShapeEngine generates circle clip-path correctly", () => {
  const circle = { cx: 50, cy: 50, r: 40 };
  const css = ShapeEngine.generateClipPathCSS("circle", { circle });
  assert.equal(css, "clip-path: circle(40% at 50% 50%);");
});

test("ShapeEngine generates ellipse clip-path correctly", () => {
  const ellipse = { cx: 50, cy: 50, rx: 40, ry: 30 };
  const css = ShapeEngine.generateClipPathCSS("ellipse", { ellipse });
  assert.equal(css, "clip-path: ellipse(40% 30% at 50% 50%);");
});

test("ShapeEngine generates blob border-radius correctly", () => {
  const blob = {
    tlh: 30,
    trh: 70,
    brh: 70,
    blh: 30,
    tlv: 30,
    trv: 30,
    brv: 70,
    blv: 70,
  };
  const css = ShapeEngine.generateClipPathCSS("blob", { blob });
  assert.equal(css, "border-radius: 30% 30% 30% 30% / 30% 30% 30% 30%;");
});

test("ShapeEngine generates valid SVG code markup", () => {
  const vertices = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
  ];
  const svg = ShapeEngine.generateSVGCode("polygon", { vertices }, 200, 200);
  assert.ok(svg.includes("<svg"));
  assert.ok(svg.includes('<polygon points="0,0 200,0 200,200"'));
});

test("ShapeEngine generates Tailwind CSS utility string", () => {
  const circle = { cx: 50, cy: 50, r: 40 };
  const tw = ShapeEngine.generateTailwindCode("circle", { circle });
  assert.ok(tw.includes('class="[clip-path:circle(40%_at_50%_50%)]"'));
});

/**
 * Issue #434: Verify that every index.html which references ShapeEngine
 * from its script.js also loads shapeEngine.js before script.js.
 *
 * Guards against the regression where shapeEngine.js is accidentally
 * removed from index.html while script.js still calls ShapeEngine.*,
 * which would throw a ReferenceError at runtime in the browser.
 */
test("Issue #434: css-shape-designer index.html loads shapeEngine.js before script.js", () => {
  const fs = require("fs");
  const path = require("path");

  const projectDir = path.resolve(
    __dirname,
    "..",
    "projects",
    "editor",
    "css-shape-designer"
  );
  const htmlPath = path.join(projectDir, "index.html");
  const htmlContent = fs.readFileSync(htmlPath, "utf-8");

  // Extract all <script src="..."> tags in order.
  const scriptSrcRegex = /<script\s+[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  const scriptSources = [];
  let match;
  while ((match = scriptSrcRegex.exec(htmlContent)) !== null) {
    scriptSources.push(match[1]);
  }

  // 1. shapeEngine.js must be loaded.
  const shapeEngineIdx = scriptSources.findIndex(src =>
    /shapeEngine\.js$/.test(src)
  );
  assert.notEqual(
    shapeEngineIdx,
    -1,
    'index.html must include <script src="shapeEngine.js"></script>'
  );

  // 2. script.js must be loaded.
  const scriptJsIdx = scriptSources.findIndex(src =>
    /(^|\/)script\.js$/.test(src)
  );
  assert.notEqual(
    scriptJsIdx,
    -1,
    'index.html must include <script src="script.js"></script>'
  );

  // 3. shapeEngine.js must appear BEFORE script.js so ShapeEngine is
  //    defined when script.js executes.
  assert.ok(
    shapeEngineIdx < scriptJsIdx,
    "shapeEngine.js must be loaded before script.js in index.html " +
      "(found shapeEngine at index " +
      shapeEngineIdx +
      ", script.js at index " +
      scriptJsIdx +
      ")"
  );
});

/**
 * Issue #434: script.js must reference ShapeEngine (otherwise the
 * dependency declaration in index.html is dead weight). This guards
 * against the inverse regression: someone removes the ShapeEngine
 * usage from script.js but leaves the <script> tag, leaving the
 * impression that shapeEngine.js is a live dependency when it isn't.
 */
test("Issue #434: css-shape-designer script.js references ShapeEngine", () => {
  const fs = require("fs");
  const path = require("path");

  const scriptPath = path.resolve(
    __dirname,
    "..",
    "projects",
    "editor",
    "css-shape-designer",
    "script.js"
  );
  const scriptContent = fs.readFileSync(scriptPath, "utf-8");

  assert.ok(
    /\bShapeEngine\b/.test(scriptContent),
    "script.js should reference ShapeEngine — if not, the " +
      "shapeEngine.js <script> tag in index.html is unnecessary."
  );
});
