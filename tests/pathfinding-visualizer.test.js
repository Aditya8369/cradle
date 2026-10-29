const test = require("node:test");
const assert = require("node:assert");

// Import algorithms
const algorithms = require("../projects/math/pathfinding-visualizer/algorithms.js");
const { bfs, dijkstra, astar, getNodesInShortestPathOrder } = algorithms;

function createMockGrid(rows, cols) {
  const grid = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      row.push({
        r,
        c,
        isWall: false,
        isStart: r === 0 && c === 0,
        isEnd: r === rows - 1 && c === cols - 1,
        element: {
          classList: {
            classes: new Set(),
            add(cls) {
              this.classes.add(cls);
            },
            remove(...clss) {
              for (const cls of clss) this.classes.delete(cls);
            },
            contains(cls) {
              return this.classes.has(cls);
            },
          },
        },
        distance: Infinity,
        totalDistance: Infinity,
        heuristic: 0,
        previousNode: null,
        isVisited: false,
      });
    }
    grid.push(row);
  }
  return grid;
}

test("BFS finds the shortest path on an unweighted grid", () => {
  const grid = createMockGrid(5, 5);
  const start = grid[0][0];
  const end = grid[4][4];

  const result = bfs(grid, start, end);
  assert.ok(result.visitedNodesInOrder.length > 0);
  assert.ok(result.shortestPathNodes.length > 0);
  assert.strictEqual(result.shortestPathNodes[0], start);
  assert.strictEqual(
    result.shortestPathNodes[result.shortestPathNodes.length - 1],
    end
  );
  // Manhattan distance is 8 steps (length 9 including start)
  assert.strictEqual(result.shortestPathNodes.length, 9);
});

test("A* navigates around walls to find shortest path", () => {
  const grid = createMockGrid(5, 5);
  const start = grid[0][0];
  const end = grid[2][0];

  // Block direct downward route
  grid[1][0].isWall = true;

  const result = astar(grid, start, end);
  assert.ok(result.shortestPathNodes.length > 0);
  assert.strictEqual(result.shortestPathNodes.includes(grid[1][0]), false);
  assert.strictEqual(result.shortestPathNodes[0], start);
  assert.strictEqual(
    result.shortestPathNodes[result.shortestPathNodes.length - 1],
    end
  );
});

test("Dijkstra reports no path when target is completely enclosed by walls", () => {
  const grid = createMockGrid(5, 5);
  const start = grid[0][0];
  const end = grid[2][2];

  // Enclose end node
  grid[1][2].isWall = true;
  grid[3][2].isWall = true;
  grid[2][1].isWall = true;
  grid[2][3].isWall = true;

  const result = dijkstra(grid, start, end);
  assert.strictEqual(result.shortestPathNodes.length, 0);
});

test("clearWalls, clearPath, and clearBoard reset grid states accurately", () => {
  const grid = createMockGrid(3, 3);

  // Set walls and path states
  grid[0][1].isWall = true;
  grid[0][1].element.classList.add("wall");
  grid[1][1].isVisited = true;
  grid[1][1].distance = 2;
  grid[1][1].element.classList.add("visited");
  grid[2][2].element.classList.add("path");

  // Helper simulating Grid clear methods
  function clearWalls(g) {
    for (const row of g) {
      for (const node of row) {
        node.isWall = false;
        node.element.classList.remove("wall");
      }
    }
  }

  function clearPath(g) {
    for (const row of g) {
      for (const node of row) {
        node.isVisited = false;
        node.previousNode = null;
        node.distance = Infinity;
        node.totalDistance = Infinity;
        node.heuristic = 0;
        node.element.classList.remove("visited", "path");
      }
    }
  }

  function clearBoard(g) {
    clearWalls(g);
    clearPath(g);
  }

  // Test clearWalls only
  clearWalls(grid);
  assert.strictEqual(grid[0][1].isWall, false);
  assert.strictEqual(grid[0][1].element.classList.contains("wall"), false);
  // Visited and path remain
  assert.strictEqual(grid[1][1].isVisited, true);
  assert.strictEqual(grid[1][1].element.classList.contains("visited"), true);

  // Test clearBoard clears everything
  clearBoard(grid);
  assert.strictEqual(grid[1][1].isVisited, false);
  assert.strictEqual(grid[1][1].distance, Infinity);
  assert.strictEqual(grid[1][1].element.classList.contains("visited"), false);
  assert.strictEqual(grid[2][2].element.classList.contains("path"), false);
});

test("clearBoard completely resets path and visited overlays after running visualization", () => {
  const grid = createMockGrid(6, 6);
  const start = grid[0][0];
  const end = grid[5][5];

  // User places walls
  grid[0][2].isWall = true;
  grid[0][2].element.classList.add("wall");
  grid[1][2].isWall = true;
  grid[1][2].element.classList.add("wall");
  grid[2][2].isWall = true;
  grid[2][2].element.classList.add("wall");

  // Run BFS visualization
  const result = bfs(grid, start, end);
  assert.ok(result.shortestPathNodes.length > 0);

  // Simulate applying animation classes
  for (const node of result.visitedNodesInOrder) {
    if (!node.isStart && !node.isEnd) {
      node.isVisited = true;
      node.element.classList.add("visited");
    }
  }
  for (const node of result.shortestPathNodes) {
    if (!node.isStart && !node.isEnd) {
      node.element.classList.add("path");
    }
  }

  // Verify elements are marked
  let visitedCount = 0;
  let pathCount = 0;
  let wallCount = 0;
  for (const row of grid) {
    for (const node of row) {
      if (node.element.classList.contains("visited")) visitedCount++;
      if (node.element.classList.contains("path")) pathCount++;
      if (node.element.classList.contains("wall")) wallCount++;
    }
  }
  assert.ok(visitedCount > 0, "Visited cells should exist before clear");
  assert.ok(pathCount > 0, "Path cells should exist before clear");
  assert.ok(wallCount > 0, "Wall cells should exist before clear");

  // Execute full board clear (simulating Grid.clearBoard)
  function clearBoard(g) {
    for (const row of g) {
      for (const node of row) {
        node.isWall = false;
        node.isVisited = false;
        node.previousNode = null;
        node.distance = Infinity;
        node.totalDistance = Infinity;
        node.heuristic = 0;
        node.element.classList.remove("wall", "visited", "path");
      }
    }
  }

  clearBoard(grid);

  // Verify that all visited, path, and wall cells are 100% wiped
  for (const row of grid) {
    for (const node of row) {
      assert.strictEqual(node.isWall, false);
      assert.strictEqual(node.isVisited, false);
      assert.strictEqual(node.distance, Infinity);
      assert.strictEqual(node.previousNode, null);
      assert.strictEqual(node.element.classList.contains("wall"), false);
      assert.strictEqual(node.element.classList.contains("visited"), false);
      assert.strictEqual(node.element.classList.contains("path"), false);
    }
  }
});
