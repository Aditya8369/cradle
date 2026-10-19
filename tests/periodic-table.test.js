const test = require("node:test");
const assert = require("node:assert");
const periodicEngine = require("../projects/misc/periodic-table/periodicEngine.js");
const periodicStorage = require("../projects/misc/periodic-table/periodicStorage.js");

const mockElements = [
  {
    number: 1,
    name: "Hydrogen",
    symbol: "H",
    category: "nonmetal",
    block: "s",
    phaseAtSTP: "Gas",
    meltingPoint: 13.99,
    boilingPoint: 20.271,
  },
  {
    number: 3,
    name: "Lithium",
    symbol: "Li",
    category: "alkali",
    block: "s",
    phaseAtSTP: "Solid",
    meltingPoint: 453.65,
    boilingPoint: 1603,
  },
  {
    number: 80,
    name: "Mercury",
    symbol: "Hg",
    category: "transition",
    block: "d",
    phaseAtSTP: "Liquid",
    meltingPoint: 234.32,
    boilingPoint: 629.88,
  },
  {
    number: 118,
    name: "Oganesson",
    symbol: "Og",
    category: "noble",
    block: "p",
    phaseAtSTP: "Synthetic",
    meltingPoint: null,
    boilingPoint: null,
  },
];

test("convertTemperature handles K, C, and F conversions", () => {
  assert.strictEqual(periodicEngine.convertTemperature(273.15, "K", "C"), 0);
  assert.strictEqual(periodicEngine.convertTemperature(0, "C", "K"), 273.15);
  assert.strictEqual(periodicEngine.convertTemperature(32, "F", "C"), 0);
});

test("calculatePhaseState determines states based on thermal points", () => {
  // Hydrogen at 10K (Solid)
  assert.strictEqual(
    periodicEngine.calculatePhaseState(13.99, 20.27, 10),
    "Solid"
  );
  // Hydrogen at 15K (Liquid)
  assert.strictEqual(
    periodicEngine.calculatePhaseState(13.99, 20.27, 15),
    "Liquid"
  );
  // Hydrogen at 300K (Gas)
  assert.strictEqual(
    periodicEngine.calculatePhaseState(13.99, 20.27, 300),
    "Gas"
  );
  // Oganesson (Synthetic)
  assert.strictEqual(
    periodicEngine.calculatePhaseState(null, null, 298, "Synthetic"),
    "Synthetic"
  );
});

test("parseShellElectrons parses electron configurations", () => {
  const hydrogen = periodicEngine.parseShellElectrons("1s¹");
  assert.deepStrictEqual(hydrogen, [1]);

  const neonShorthand = periodicEngine.parseShellElectrons("[Ne] 3s² 3p¹");
  assert.deepStrictEqual(neonShorthand, [2, 8, 3]);
});

test("filterElements filters by search query and category", () => {
  const hMatch = periodicEngine.filterElements(mockElements, {
    search: "hydrogen",
  });
  assert.strictEqual(hMatch.length, 1);
  assert.strictEqual(hMatch[0].symbol, "H");

  const alkali = periodicEngine.filterElements(mockElements, {
    category: "alkali",
  });
  assert.strictEqual(alkali.length, 1);
  assert.strictEqual(alkali[0].symbol, "Li");
});

test("calculateElementStats aggregates total phase counts", () => {
  const stats = periodicEngine.calculateElementStats(mockElements, 298);
  assert.strictEqual(stats.total, 4);
  assert.strictEqual(stats.gas, 1); // Hydrogen
  assert.strictEqual(stats.solid, 1); // Lithium
  assert.strictEqual(stats.liquid, 1); // Mercury
  assert.strictEqual(stats.synthetic, 1); // Oganesson
});

test("periodicStorage toggles bookmarks and preserves preferences", () => {
  const isAdded = periodicStorage.toggleBookmark(1);
  assert.strictEqual(isAdded, true);
  assert.strictEqual(periodicStorage.isBookmarked(1), true);

  const isRemoved = periodicStorage.toggleBookmark(1);
  assert.strictEqual(isRemoved, false);
  assert.strictEqual(periodicStorage.isBookmarked(1), false);
});
