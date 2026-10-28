const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseColorToRgba,
  buildGradientCSS,
  renderGradientToCanvas,
  exportPNG,
} = require("../projects/editor/css-gradient-generator/script.js");

test("parseColorToRgba formats hex and rgba with alpha channel", () => {
  // 0% opacity produces fully transparent rgba(r, g, b, 0)
  assert.equal(parseColorToRgba("#ff0000", 0), "rgba(255, 0, 0, 0)");
  assert.equal(parseColorToRgba("#0000ff", 0), "rgba(0, 0, 255, 0)");

  // 50% opacity produces rgba with alpha 0.5
  assert.equal(parseColorToRgba("#00ff00", 50), "rgba(0, 255, 0, 0.5)");

  // 100% opacity preserves 6-digit hex
  assert.equal(parseColorToRgba("#ff0000", 100), "#ff0000");

  // 3-digit hex expansion
  assert.equal(parseColorToRgba("#f00", 0), "rgba(255, 0, 0, 0)");
  assert.equal(parseColorToRgba("#f00", 100), "#ff0000");

  // Pre-existing rgba strings
  assert.equal(
    parseColorToRgba("rgba(255, 0, 0, 0)", 100),
    "rgba(255, 0, 0, 0)"
  );
  assert.equal(
    parseColorToRgba("rgba(0, 0, 255, 1)", 50),
    "rgba(0, 0, 255, 0.5)"
  );
});

test("buildGradientCSS formats gradients with transparent color stops", () => {
  const transparentStops = [
    { color: "#ff0000", opacity: 0, pos: 0 },
    { color: "#0000ff", opacity: 100, pos: 100 },
  ];

  // Linear gradient
  const linearCss = buildGradientCSS("linear", 90, transparentStops);
  assert.equal(
    linearCss,
    "linear-gradient(90deg, rgba(255, 0, 0, 0) 0%, #0000ff 100%)"
  );

  // Radial gradient
  const radialCss = buildGradientCSS("radial", 0, transparentStops);
  assert.equal(
    radialCss,
    "radial-gradient(circle, rgba(255, 0, 0, 0) 0%, #0000ff 100%)"
  );

  // Conic gradient
  const conicCss = buildGradientCSS("conic", 45, transparentStops);
  assert.equal(
    conicCss,
    "conic-gradient(from 45deg, rgba(255, 0, 0, 0) 0%, #0000ff 100%)"
  );
});

test("renderGradientToCanvas creates transparent canvas and adds alpha color stops", () => {
  const addedStops = [];
  let clearRectCalled = false;
  let filledWithGradient = false;

  const mockCtx = {
    clearRect(x, y, w, h) {
      clearRectCalled = true;
    },
    createLinearGradient(x0, y0, x1, y1) {
      return {
        addColorStop(offset, color) {
          addedStops.push({ offset, color });
        },
      };
    },
    fillRect(x, y, w, h) {
      filledWithGradient = true;
    },
    set fillStyle(val) {},
  };

  const mockCanvas = {
    width: 0,
    height: 0,
    getContext(type) {
      return type === "2d" ? mockCtx : null;
    },
  };

  const stops = [
    { color: "#ff0000", opacity: 0, pos: 0 },
    { color: "#0000ff", opacity: 100, pos: 100 },
  ];

  renderGradientToCanvas(mockCanvas, {
    width: 800,
    height: 450,
    gradientType: "linear",
    angle: 90,
    stops,
  });

  // Must clear canvas rather than painting solid white
  assert.equal(clearRectCalled, true);
  assert.equal(filledWithGradient, true);

  // Color stop at 0% must have rgba alpha 0
  assert.equal(addedStops[0].offset, 0);
  assert.equal(addedStops[0].color, "rgba(255, 0, 0, 0)");

  // Color stop at 100% must have full opacity
  assert.equal(addedStops[1].offset, 1);
  assert.equal(addedStops[1].color, "#0000ff");
});

test("exportPNG strictly requests image/png to preserve alpha channel transparency", () => {
  let requestedMimeType = null;

  const mockCanvas = {
    width: 800,
    height: 450,
    toDataURL(mimeType) {
      requestedMimeType = mimeType;
      return `data:${mimeType};base64,mockPngData`;
    },
  };

  // Set global HTMLCanvasElement for mock test
  global.HTMLCanvasElement = function () {};
  Object.setPrototypeOf(mockCanvas, global.HTMLCanvasElement.prototype);

  try {
    const dataUrl = exportPNG(mockCanvas);
    assert.equal(requestedMimeType, "image/png");
    assert.ok(dataUrl.startsWith("data:image/png"));
  } finally {
    delete global.HTMLCanvasElement;
  }
});
