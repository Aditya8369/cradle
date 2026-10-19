const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildAdjacency,
  bfs,
  dfs,
  primMST,
  dijkstra,
} = require("../projects/math/graph-theory-explorer/graphLogic");

// Small fixed graph used across tests:
//
//     A --1-- B
//     |       |
//     4       2
//     |       |
//     C --1-- D
//
const nodes = [{ id: "A" }, { id: "B" }, { id: "C" }, { id: "D" }];
const edges = [
  { from: "A", to: "B", weight: 1 },
  { from: "A", to: "C", weight: 4 },
  { from: "B", to: "D", weight: 2 },
  { from: "C", to: "D", weight: 1 },
];

test("buildAdjacency creates an undirected adjacency list", () => {
  const adj = buildAdjacency(nodes, edges);
  assert.equal(adj.get("A").length, 2);
  assert.ok(adj.get("B").some(e => e.to === "A"));
  assert.ok(adj.get("A").some(e => e.to === "B"));
});

test("bfs visits every reachable node starting from A", () => {
  const steps = bfs(nodes, edges, "A");
  const visitedOrder = steps.filter(s => s.type === "visit").map(s => s.node);
  assert.deepStrictEqual(visitedOrder, ["A", "B", "C", "D"]);
});

test("dfs visits every reachable node starting from A", () => {
  const steps = dfs(nodes, edges, "A");
  const visitedOrder = steps.filter(s => s.type === "visit").map(s => s.node);
  assert.deepStrictEqual(visitedOrder, ["A", "B", "D", "C"]);
});

test("primMST finds a minimum spanning tree with correct total weight", () => {
  const { mstEdges, totalWeight } = primMST(nodes, edges, "A");
  assert.equal(mstEdges.length, 3);
  assert.equal(totalWeight, 4);
});

test("dijkstra finds the shortest path and distance from A to D", () => {
  const { distances, path } = dijkstra(nodes, edges, "A", "D");
  assert.equal(distances.D, 3);
  assert.deepStrictEqual(path, ["A", "B", "D"]);
});

test("dijkstra reports Infinity for unreachable nodes", () => {
  const isolatedNodes = [{ id: "X" }, { id: "Y" }];
  const isolatedEdges = [];
  const { distances, path } = dijkstra(isolatedNodes, isolatedEdges, "X", "Y");
  assert.equal(distances.Y, Infinity);
  assert.deepStrictEqual(path, []);
});
