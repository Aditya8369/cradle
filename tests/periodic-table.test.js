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


test("traverseRelationships traverses standard linear and DAG relationships cleanly", () => {
  const decayChain = {
    U: ["Th"],
    Th: ["Pa"],
    Pa: ["U_decayed"],
  };

  const result = periodicEngine.traverseRelationships("U", decayChain);
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.hasCycle, false);
  assert.strictEqual(result.exceededLimit, false);
  assert.deepStrictEqual(result.visited, ["U", "Th", "Pa", "U_decayed"]);
});

test("traverseRelationships supports direct element/symbol values and Maps", () => {
  const singleValues = {
    92: 90, // Uranium -> Thorium
    90: 88, // Thorium -> Radium
    88: 86, // Radium -> Radon
  };

  const res = periodicEngine.traverseRelationships(92, singleValues);
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.hasCycle, false);
  assert.deepStrictEqual(res.visited, [92, 90, 88, 86]);

  const mapGraph = new Map([
    ["H", ["He"]],
    ["He", ["Li"]],
  ]);
  const mapRes = periodicEngine.traverseRelationships("H", mapGraph);
  assert.strictEqual(mapRes.success, true);
  assert.deepStrictEqual(mapRes.visited, ["H", "He", "Li"]);
});

test("traverseRelationships detects direct self-cycle and returns controlled failure", () => {
  const selfLoop = {
    A: ["A"],
  };

  const result = periodicEngine.traverseRelationships("A", selfLoop);
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.hasCycle, true);
  assert.strictEqual(result.cycleNode, "A");
  assert.ok(result.error.includes("Malformed cycle detected"));
});

test("traverseRelationships detects mutual cycle (A -> B -> A) and returns controlled failure", () => {
  const mutualCycle = {
    U: ["Th"],
    Th: ["U"],
  };

  const result = periodicEngine.traverseRelationships("U", mutualCycle);
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.hasCycle, true);
  assert.strictEqual(result.cycleNode, "U");
  assert.strictEqual(result.exceededLimit, false);
});

test("traverseRelationships detects deeper cycles in both BFS and DFS modes", () => {
  const deepCycle = {
    A: ["B"],
    B: ["C"],
    C: ["D"],
    D: ["B"], // Cycle back to B
  };

  // BFS mode
  const bfsResult = periodicEngine.traverseRelationships("A", deepCycle, {
    strategy: "bfs",
  });
  assert.strictEqual(bfsResult.success, false);
  assert.strictEqual(bfsResult.hasCycle, true);
  assert.strictEqual(bfsResult.cycleNode, "B");

  // DFS mode
  const dfsResult = periodicEngine.traverseRelationships("A", deepCycle, {
    strategy: "dfs",
  });
  assert.strictEqual(dfsResult.success, false);
  assert.strictEqual(dfsResult.hasCycle, true);
  assert.strictEqual(dfsResult.cycleNode, "B");
});

test("traverseRelationships enforces iteration limits and halts runaway loops", () => {
  // Infinite neighbor generator without cycle: produces n+1 continuously
  const infiniteGraph = node => [node + 1];

  const result = periodicEngine.traverseRelationships(1, infiniteGraph, {
    maxIterations: 25,
  });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.exceededLimit, true);
  assert.ok(result.iterations >= 25);
  assert.ok(result.error.includes("Iteration limit exceeded"));
});

test("traverseRelationships handles invalid start nodes and relationships gracefully", () => {
  const badStart1 = periodicEngine.traverseRelationships(null, {});
  assert.strictEqual(badStart1.success, false);
  assert.ok(badStart1.error.includes("Invalid start node"));

  const badStart2 = periodicEngine.traverseRelationships("   ", {});
  assert.strictEqual(badStart2.success, false);
  assert.ok(badStart2.error.includes("Invalid start node"));

  const badRel = periodicEngine.traverseRelationships("H", null);
  assert.strictEqual(badRel.success, false);
  assert.ok(badRel.error.includes("Invalid relationships parameter"));
});

test("traverseRelationships throws Error when throwOnError option is set", () => {
  const cycle = { A: ["A"] };

  assert.throws(
    () => {
      periodicEngine.traverseRelationships("A", cycle, { throwOnError: true });
    },
    err => {
      assert.ok(err.message.includes("Malformed cycle detected"));
      assert.strictEqual(err.hasCycle, true);
      assert.strictEqual(err.success, false);
      return true;
    }
  );
});

test("detectCycle helper correctly identifies cyclic and acyclic topologies", () => {
  const acyclic = { A: ["B"], B: ["C"] };
  const cyclic = { A: ["B"], B: ["A"] };

  const acResult = periodicEngine.detectCycle("A", acyclic);
  assert.strictEqual(acResult.hasCycle, false);
  assert.strictEqual(acResult.cycleNode, null);

  const cResult = periodicEngine.detectCycle("A", cyclic);
  assert.strictEqual(cResult.hasCycle, true);
  assert.strictEqual(cResult.cycleNode, "A");
});

test("getRelationshipPath finds path and detects cycles", () => {
  const graph = {
    U: ["Th"],
    Th: ["Ra"],
    Ra: ["Rn"],
  };

  const pathResult = periodicEngine.getRelationshipPath("U", "Rn", graph);
  assert.strictEqual(pathResult.success, true);
  assert.deepStrictEqual(pathResult.path, ["U", "Th", "Ra", "Rn"]);

  const cyclicGraph = {
    U: ["Th"],
    Th: ["U"],
  };
  const cyclePath = periodicEngine.getRelationshipPath("U", "Pb", cyclicGraph);
  assert.strictEqual(cyclePath.success, false);
  assert.strictEqual(cyclePath.hasCycle, true);
});

test("getDecayChain traces linear decay and detects decay loops", () => {
  const validDecay = {
    U238: "Th234",
    Th234: "Pa234",
    Pa234: "U234",
  };
  const res = periodicEngine.getDecayChain("U238", validDecay);
  assert.strictEqual(res.success, true);
  assert.deepStrictEqual(res.visited, ["U238", "Th234", "Pa234", "U234"]);

  const invalidDecay = {
    A: "B",
    B: "C",
    C: "A",
  };
  const loopRes = periodicEngine.getDecayChain("A", invalidDecay);
  assert.strictEqual(loopRes.success, false);
  assert.strictEqual(loopRes.hasCycle, true);
});
