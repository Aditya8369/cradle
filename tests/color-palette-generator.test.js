const test = require("node:test");
const assert = require("node:assert/strict");

const {
  hexToRgb,
  rgbToHex,
  rgbToHsl,
  hslToRgb,
  contrastRatio,
  randomHex,
  generatePalette,
  resolveSwatchHex,
  formatExport,
} = require("../projects/editor/color-palette-generator/script.js");

test("hexToRgb parses 6-digit and 3-digit hex strings", () => {
  assert.deepEqual(hexToRgb("#ffffff"), { r: 255, g: 255, b: 255 });
  assert.deepEqual(hexToRgb("#000000"), { r: 0, g: 0, b: 0 });
  assert.deepEqual(hexToRgb("#38bdf8"), { r: 56, g: 189, b: 248 });
  assert.deepEqual(hexToRgb("#fff"), { r: 255, g: 255, b: 255 });
  assert.deepEqual(hexToRgb(""), { r: 0, g: 0, b: 0 });
});

test("rgbToHex formats RGB to uppercase 6-digit hex", () => {
  assert.equal(rgbToHex(255, 255, 255).toLowerCase(), "#ffffff");
  assert.equal(rgbToHex(0, 0, 0), "#000000");
  assert.equal(rgbToHex(56, 189, 248).toLowerCase(), "#38bdf8");
  // Clamping test
  assert.equal(rgbToHex(300, -10, 100).toLowerCase(), "#ff0064");
});

test("contrastRatio accurately computes WCAG contrast ratios", () => {
  assert.equal(Number(contrastRatio("#000000", "#ffffff").toFixed(2)), 21.0);
  assert.equal(Number(contrastRatio("#ffffff", "#ffffff").toFixed(2)), 1.0);
  // Symmetric / order independent
  const r1 = contrastRatio("#38bdf8", "#0f172a");
  const r2 = contrastRatio("#0f172a", "#38bdf8");
  assert.equal(r1.toFixed(4), r2.toFixed(4));
});

test("generatePalette generates 5 valid hex colors across all harmony modes", () => {
  const modes = [
    "complementary",
    "analogous",
    "triadic",
    "split-complementary",
    "tetradic",
    "monochromatic",
  ];

  const hexRegex = /^#[0-9a-fA-F]{6}$/;

  modes.forEach(mode => {
    const palette = generatePalette("#38bdf8", mode);
    assert.equal(palette.length, 5, `Mode ${mode} should generate 5 colors`);
    palette.forEach((color, idx) => {
      assert.match(
        color,
        hexRegex,
        `Mode ${mode} swatch ${idx} should be valid 6-digit hex: ${color}`
      );
    });
  });
});

test("Issue #999 - resolveSwatchHex resolves current swatch hex from button dataset", () => {
  const button = {
    dataset: {
      index: "0",
      hex: "#3A7BD5",
    },
  };
  const currentPalette = [
    "#3A7BD5",
    "#00D2FF",
    "#F87171",
    "#34D399",
    "#A78BFA",
  ];

  const resolved = resolveSwatchHex(button, currentPalette);
  assert.equal(resolved, "#3A7BD5");
});

test("Issue #999 - Multi-generation test: Copy HEX never returns stale closure data", () => {
  // Step 1: Initial palette generated (#38BDF8 base)
  const initialPalette = [
    "#38BDF8",
    "#F87171",
    "#34D399",
    "#FBBF24",
    "#A78BFA",
  ];
  const initialSwatchButton = {
    dataset: {
      index: "0",
      hex: initialPalette[0].toUpperCase(),
    },
  };

  const initialCopiedHex = resolveSwatchHex(
    initialSwatchButton,
    initialPalette
  );
  assert.equal(initialCopiedHex, "#38BDF8");

  // Step 2: User clicks 'Generate New Palette' (new base #3A7BD5)
  const newPalette = ["#3A7BD5", "#E11D48", "#10B981", "#F59E0B", "#8B5CF6"];
  const newSwatchButton = {
    dataset: {
      index: "0",
      hex: newPalette[0].toUpperCase(),
    },
  };

  // Step 3: User clicks 'Copy HEX' on the newly generated palette's swatch
  const newCopiedHex = resolveSwatchHex(newSwatchButton, newPalette);

  // Must copy the NEW palette's color, NEVER the previous/stale palette color
  assert.equal(
    newCopiedHex,
    "#3A7BD5",
    "Copy HEX must reflect the new palette color, not stale closure"
  );
  assert.notEqual(
    newCopiedHex,
    initialCopiedHex,
    "New copied hex must differ from the initial palette hex"
  );
});

test("Issue #999 - resolveSwatchHex falls back to live palette index when dataset.hex is missing", () => {
  const buttonWithoutHexAttr = {
    dataset: {
      index: "2",
    },
  };
  const activePalette = ["#111111", "#222222", "#334455", "#444444", "#555555"];

  const resolved = resolveSwatchHex(buttonWithoutHexAttr, activePalette);
  assert.equal(resolved, "#334455");
});

test("formatExport supports css, tailwind, json, and scss formats", () => {
  const testPalette = ["#111111", "#222222", "#333333", "#444444", "#555555"];

  // CSS variables
  const css = formatExport(testPalette, "css");
  assert.match(css, /:root \{/);
  assert.match(css, /--color-1: #111111;/);
  assert.match(css, /--color-5: #555555;/);

  // Tailwind
  const tw = formatExport(testPalette, "tailwind");
  assert.match(tw, /tailwind\.config\.js/);
  assert.match(tw, /'100': '#111111'/);

  // JSON
  const jsonStr = formatExport(testPalette, "json");
  const parsed = JSON.parse(jsonStr);
  assert.equal(parsed["color-1"].hex, "#111111");

  // SCSS
  const scss = formatExport(testPalette, "scss");
  assert.match(scss, /\$color-1: #111111;/);
  assert.match(scss, /\$palette: \(/);
});
