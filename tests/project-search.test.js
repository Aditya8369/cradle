import { test } from "node:test";
import assert from "node:assert/strict";
import { filterProjects } from "../src/utils/projectSearch.js";

const sampleProjects = [
  {
    id: "chess",
    title: "Chess Game",
    category: "games",
    description: "Classic chess with AI",
  },
  {
    id: "regex",
    title: "Regex Visualizer",
    category: "dev-tools",
    description: "Visualize regular expressions",
  },
  {
    id: "planner",
    title: "Time Blocking Planner",
    category: "productivity",
    description: "Productivity schedule planner",
  },
];

test("filters by category and title using shared search rules", () => {
  assert.deepEqual(filterProjects(sampleProjects, "games", "chess"), [
    sampleProjects[0],
  ]);
});

test("filters by category and description using AND logic", () => {
  // Query "AI" matches chess description within games category
  assert.deepEqual(filterProjects(sampleProjects, "games", "ai"), [
    sampleProjects[0],
  ]);

  // Query "AI" does not match when non-matching category is selected
  assert.deepEqual(filterProjects(sampleProjects, "productivity", "ai"), []);
});

test("matches formatted category names on the main-thread fallback", () => {
  assert.deepEqual(filterProjects(sampleProjects, "all", "dev tools"), [
    sampleProjects[1],
  ]);
});

test("combines category filter and search query without resetting each other", () => {
  // Selecting games and searching for planner yields empty (different category)
  assert.deepEqual(filterProjects(sampleProjects, "games", "planner"), []);

  // Selecting productivity and searching for planner yields planner
  assert.deepEqual(filterProjects(sampleProjects, "productivity", "planner"), [
    sampleProjects[2],
  ]);
});

test("filtering with category 'games' and query 'snake' uses strict AND logic", () => {
  const projects = [
    {
      id: "snake-game",
      title: "Snake",
      category: "games",
      description: "Classic snake game",
    },
    {
      id: "snake-util",
      title: "Snake Case Converter",
      category: "dev-tools",
      description: "Convert text to snake_case",
    },
    {
      id: "chess",
      title: "Chess Game",
      category: "games",
      description: "Play chess",
    },
  ];

  // In category "games", only the game with snake in title/description is matched
  assert.deepEqual(filterProjects(projects, "games", "snake"), [projects[0]]);

  // Non-matching category with snake query does not return the snake game
  assert.deepEqual(filterProjects(projects, "productivity", "snake"), []);

  // Category "dev-tools" with snake query only returns dev-tools project
  assert.deepEqual(filterProjects(projects, "dev-tools", "snake"), [
    projects[1],
  ]);
});

test("returns all projects when no filters are active", () => {
  assert.deepEqual(filterProjects(sampleProjects, "all", ""), sampleProjects);
});
