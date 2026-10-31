import { test } from "node:test";
import assert from "node:assert/strict";
import { filterProjects } from "../src/utils/projectSearch.js";
import { createFilterWorker } from "../src/utils/filterWorker.js";
import { isFilterRequest } from "../src/utils/messageValidation.js";

/**
 * Realistic project registry for unit testing search and filtering logic.
 */
const sampleProjects = [
  {
    id: "snake-game",
    title: "Snake Game",
    category: "games",
    description:
      "Classic retro arcade snake game where you eat food and grow longer",
  },
  {
    id: "chess",
    title: "Chess",
    category: "games",
    description:
      "Play chess against an AI opponent with customizable difficulty",
  },
  {
    id: "snake-case-converter",
    title: "Snake Case Converter",
    category: "dev-tools",
    description:
      "Convert camelCase or PascalCase strings into snake_case format",
  },
  {
    id: "regex-visualizer",
    title: "Regex Visualizer",
    category: "dev-tools",
    description:
      "Interactive visualization tool for regular expression patterns",
  },
  {
    id: "time-blocking-planner",
    title: "Time Blocking Planner",
    category: "productivity",
    description:
      "Productivity schedule planner using time blocking methodology",
  },
  {
    id: "ai-circuit-builder",
    title: "AI Circuit Builder",
    category: "aiml",
    description: "Simulate and design neural network circuits visually",
  },
  {
    id: "special-char-visualizer",
    title: "C++ & C# [Code] Visualizer (v2.0)",
    category: "dev-tools",
    description:
      "Visualizer for C++ and C# code structures with [brackets] and (parentheses)",
  },
];

/**
 * Mock Worker that mirrors scripts/worker.js behavior in a controlled test environment.
 */
class MockFilterWorker {
  constructor() {
    this.terminated = false;
    this.onmessage = null;
    this.onerror = null;
  }

  postMessage(message) {
    if (this.terminated) return;

    if (!isFilterRequest(message)) {
      if (typeof this.onmessage === "function") {
        this.onmessage({ data: [] });
      }
      return;
    }

    const { allProjects, selectedCategory, query } = message;
    const result = filterProjects(allProjects, selectedCategory, query);

    if (typeof this.onmessage === "function") {
      this.onmessage({ data: result });
    }
  }

  terminate() {
    this.terminated = true;
  }
}

/**
 * Helper to run a search through the Worker pipeline asynchronously.
 */
function searchWithWorker(allProjects, selectedCategory, query) {
  return new Promise((resolve, reject) => {
    let delivered = false;
    const worker = createFilterWorker({
      workerFactory: () => new MockFilterWorker(),
      onResult: results => {
        delivered = true;
        resolve(results);
      },
      onFailure: err => {
        if (!delivered) {
          reject(err);
        }
      },
      logger: { error: () => {} },
    });

    const success = worker.postMessage({
      allProjects,
      selectedCategory,
      query,
    });

    if (!success) {
      reject(new Error("Worker postMessage rejected request"));
    }
  });
}

// ─── 1. Exact Title Match ──────────────────────────────────────────
test("Exact title match returns the correct project", () => {
  const resultSnake = filterProjects(sampleProjects, "all", "Snake Game");
  assert.equal(resultSnake.length, 1);
  assert.equal(resultSnake[0].id, "snake-game");
  assert.equal(resultSnake[0].title, "Snake Game");

  const resultChess = filterProjects(sampleProjects, "all", "Chess");
  assert.equal(resultChess.length, 1);
  assert.equal(resultChess[0].id, "chess");

  // Case-insensitive exact title matching
  const resultLower = filterProjects(sampleProjects, "all", "snake game");
  assert.equal(resultLower.length, 1);
  assert.equal(resultLower[0].id, "snake-game");

  const resultUpper = filterProjects(sampleProjects, "all", "CHESS");
  assert.equal(resultUpper.length, 1);
  assert.equal(resultUpper[0].id, "chess");
});

// ─── 2. Partial Title Match ────────────────────────────────────────
test("Partial title match (e.g. 'snak' -> 'snake') returns the correct project", () => {
  // "snak" matches both "Snake Game" and "Snake Case Converter"
  const resultSnak = filterProjects(sampleProjects, "all", "snak");
  assert.equal(resultSnak.length, 2);
  const ids = resultSnak.map(p => p.id);
  assert.ok(ids.includes("snake-game"));
  assert.ok(ids.includes("snake-case-converter"));

  // "ches" matches "Chess"
  const resultChe = filterProjects(sampleProjects, "all", "ches");
  assert.equal(resultChe.length, 1);
  assert.equal(resultChe[0].id, "chess");

  // "reg" matches "Regex Visualizer"
  const resultReg = filterProjects(sampleProjects, "all", "reg");
  assert.equal(resultReg.length, 1);
  assert.equal(resultReg[0].id, "regex-visualizer");

  // Partial match in middle of title: "block" matches "Time Blocking Planner"
  const resultBlock = filterProjects(sampleProjects, "all", "block");
  assert.equal(resultBlock.length, 1);
  assert.equal(resultBlock[0].id, "time-blocking-planner");
});

// ─── 3. Category Filter ────────────────────────────────────────────
test("Category filter returns only projects in that category", () => {
  // "games" returns only games
  const games = filterProjects(sampleProjects, "games", "");
  assert.equal(games.length, 2);
  assert.ok(games.every(p => p.category === "games"));
  assert.deepEqual(
    games.map(p => p.id),
    ["snake-game", "chess"]
  );

  // "dev-tools" returns only dev-tools
  const devTools = filterProjects(sampleProjects, "dev-tools", "");
  assert.equal(devTools.length, 3);
  assert.ok(devTools.every(p => p.category === "dev-tools"));

  // "productivity" returns only productivity projects
  const productivity = filterProjects(sampleProjects, "productivity", "");
  assert.equal(productivity.length, 1);
  assert.equal(productivity[0].id, "time-blocking-planner");

  // "aiml" returns only aiml projects
  const aiml = filterProjects(sampleProjects, "aiml", "");
  assert.equal(aiml.length, 1);
  assert.equal(aiml[0].id, "ai-circuit-builder");

  // Case-insensitive / trimmed category names
  const gamesCase = filterProjects(sampleProjects, "  GAMES  ", "");
  assert.equal(gamesCase.length, 2);
});

// ─── 4. Text + Category Combined (Intersection) ────────────────────
test("Text + category combined filter returns the intersection", () => {
  // Query "snake" in "games" category returns ONLY the snake game
  const gamesSnake = filterProjects(sampleProjects, "games", "snake");
  assert.equal(gamesSnake.length, 1);
  assert.equal(gamesSnake[0].id, "snake-game");

  // Query "snake" in "dev-tools" category returns ONLY the snake dev-tool
  const devToolsSnake = filterProjects(sampleProjects, "dev-tools", "snake");
  assert.equal(devToolsSnake.length, 1);
  assert.equal(devToolsSnake[0].id, "snake-case-converter");

  // Query "snake" in "productivity" category returns nothing (intersection is empty)
  const prodSnake = filterProjects(sampleProjects, "productivity", "snake");
  assert.deepEqual(prodSnake, []);

  // Query "planner" in "games" category returns nothing
  const gamesPlanner = filterProjects(sampleProjects, "games", "planner");
  assert.deepEqual(gamesPlanner, []);

  // Query "planner" in "productivity" category returns the planner
  const prodPlanner = filterProjects(sampleProjects, "productivity", "planner");
  assert.equal(prodPlanner.length, 1);
  assert.equal(prodPlanner[0].id, "time-blocking-planner");
});

// ─── 5. Description Matching ───────────────────────────────────────
test("Query matches against project descriptions when title does not match", () => {
  // "retro arcade" appears only in Snake Game description, not title
  const resultDesc = filterProjects(sampleProjects, "all", "retro arcade");
  assert.equal(resultDesc.length, 1);
  assert.equal(resultDesc[0].id, "snake-game");

  // "neural network" appears only in AI Circuit Builder description
  const resultNN = filterProjects(sampleProjects, "all", "neural network");
  assert.equal(resultNN.length, 1);
  assert.equal(resultNN[0].id, "ai-circuit-builder");

  // Description match combined with category
  const resultAiml = filterProjects(sampleProjects, "aiml", "neural network");
  assert.equal(resultAiml.length, 1);
  assert.equal(resultAiml[0].id, "ai-circuit-builder");

  // Description match with conflicting category returns empty
  const resultWrongCat = filterProjects(
    sampleProjects,
    "games",
    "neural network"
  );
  assert.deepEqual(resultWrongCat, []);
});

// ─── 6. Empty Query String ─────────────────────────────────────────
test("Empty query string returns all projects", () => {
  // Empty string query with category "all" returns the full list
  const allEmpty = filterProjects(sampleProjects, "all", "");
  assert.equal(allEmpty.length, sampleProjects.length);
  assert.deepEqual(allEmpty, sampleProjects);

  // Whitespace-only query with category "all" returns the full list
  const allWhitespace = filterProjects(sampleProjects, "all", "   ");
  assert.equal(allWhitespace.length, sampleProjects.length);
  assert.deepEqual(allWhitespace, sampleProjects);

  // Null or undefined query with category "all" returns the full list
  assert.deepEqual(filterProjects(sampleProjects, "all", null), sampleProjects);
  assert.deepEqual(
    filterProjects(sampleProjects, "all", undefined),
    sampleProjects
  );
});

// ─── 7. Special Characters in Query Do Not Throw ───────────────────
test("Special characters in query do not throw", () => {
  const specialQueries = [
    ".*",
    "[a-z]",
    "+",
    "?",
    "\\",
    "^",
    "$",
    "(.*)",
    "{1,3}",
    "|",
    "[[[",
    ")))",
    "\\bword\\b",
    "<script>alert(1)</script>",
    "&amp;\"'%",
    "!@#$^&*()_+=-`~",
  ];

  for (const query of specialQueries) {
    assert.doesNotThrow(() => {
      const result = filterProjects(sampleProjects, "all", query);
      assert.ok(Array.isArray(result));
    }, `Query "${query}" should not throw`);
  }

  // Literal matching with special characters works correctly
  const resultPlus = filterProjects(sampleProjects, "all", "C++");
  assert.equal(resultPlus.length, 1);
  assert.equal(resultPlus[0].id, "special-char-visualizer");

  const resultBrackets = filterProjects(sampleProjects, "all", "[Code]");
  assert.equal(resultBrackets.length, 1);
  assert.equal(resultBrackets[0].id, "special-char-visualizer");

  const resultParens = filterProjects(sampleProjects, "all", "(v2.0)");
  assert.equal(resultParens.length, 1);
  assert.equal(resultParens[0].id, "special-char-visualizer");
});

// ─── 8. Worker Unavailable -> Main-Thread Fallback Parity ─────────
test("Worker unavailable -> main-thread fallback produces identical results", async () => {
  const testScenarios = [
    { category: "all", query: "Chess" },
    { category: "all", query: "snak" },
    { category: "games", query: "" },
    { category: "games", query: "snake" },
    { category: "dev-tools", query: "snake" },
    { category: "all", query: "" },
    { category: "all", query: "   " },
    { category: "all", query: "C++" },
    { category: "all", query: "[Code]" },
    { category: "all", query: ".*" },
    { category: "all", query: "nonexistent-query-xyz" },
    { category: "productivity", query: "chess" },
    { category: "aiml", query: "circuit" },
  ];

  // Verify that worker unavailable triggers fallback
  let fallbackInvoked = false;
  let fallbackError = null;

  class FailingWorker {
    constructor() {
      throw new Error("Worker unavailable in current browser environment");
    }
  }

  const workerInstance = createFilterWorker({
    workerFactory: () => new FailingWorker(),
    onResult: () => {},
    onFailure: error => {
      fallbackInvoked = true;
      fallbackError = error;
    },
    logger: { error: () => {} },
  });

  assert.equal(workerInstance, null);
  assert.equal(fallbackInvoked, true);
  assert.equal(
    fallbackError.message,
    "Worker unavailable in current browser environment"
  );

  // Verify parity: for every search scenario, the Worker result and
  // main-thread fallback produce identical filtered project lists
  for (const { category, query } of testScenarios) {
    const workerResult = await searchWithWorker(
      sampleProjects,
      category,
      query
    );
    const fallbackResult = filterProjects(sampleProjects, category, query);

    assert.deepEqual(
      workerResult,
      fallbackResult,
      `Mismatch between worker and fallback for category="${category}", query="${query}"`
    );
  }
});

// ─── 9. No Match Returns Empty Array (Not null/undefined) ──────────
test("No match -> returns empty array (not null/undefined)", () => {
  // Query matching nothing
  const noMatchQuery = filterProjects(
    sampleProjects,
    "all",
    "nonexistent-term-12345"
  );
  assert.ok(Array.isArray(noMatchQuery));
  assert.equal(noMatchQuery.length, 0);
  assert.notEqual(noMatchQuery, null);
  assert.notEqual(noMatchQuery, undefined);

  // Category matching nothing
  const noMatchCategory = filterProjects(
    sampleProjects,
    "nonexistent-category",
    ""
  );
  assert.ok(Array.isArray(noMatchCategory));
  assert.equal(noMatchCategory.length, 0);
  assert.notEqual(noMatchCategory, null);
  assert.notEqual(noMatchCategory, undefined);

  // Category and query mismatch
  const mismatch = filterProjects(sampleProjects, "games", "planner");
  assert.ok(Array.isArray(mismatch));
  assert.equal(mismatch.length, 0);
  assert.notEqual(mismatch, null);
  assert.notEqual(mismatch, undefined);

  // Invalid/empty registry input handling
  assert.deepEqual(filterProjects([], "all", "test"), []);
  assert.deepEqual(filterProjects(null, "all", "test"), []);
  assert.deepEqual(filterProjects(undefined, "all", "test"), []);
  assert.deepEqual(filterProjects("not-an-array", "all", "test"), []);
});

// ─── 10. Defensive handling for malformed project objects ──────────
test("Malformed project objects in registry are safely handled without throwing", () => {
  const malformedRegistry = [
    null,
    undefined,
    {},
    { id: "no-category", title: "Missing Category" },
    { id: "no-title", category: "games" },
    {
      id: "valid-game",
      title: "Valid Game",
      category: "games",
      description: "A valid game",
    },
  ];

  assert.doesNotThrow(() => {
    const resGames = filterProjects(malformedRegistry, "games", "");
    assert.ok(Array.isArray(resGames));
    assert.equal(resGames.length, 2);
  });

  assert.doesNotThrow(() => {
    const resQuery = filterProjects(malformedRegistry, "all", "valid");
    assert.equal(resQuery.length, 1);
    assert.equal(resQuery[0].id, "valid-game");
  });
});
