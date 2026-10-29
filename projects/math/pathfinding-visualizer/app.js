import { Grid } from "./grid.js";
import { bfs, dijkstra, astar } from "./algorithms.js";

document.addEventListener("DOMContentLoaded", () => {
  const ROWS = 20;
  const COLS = 40;
  const grid = new Grid(ROWS, COLS, "grid-container");

  const btnVisualize = document.getElementById("btn-visualize");
  const btnClearBoard =
    document.getElementById("btn-clear-board") ||
    document.getElementById("btn-clear-grid");
  const btnClearWalls = document.getElementById("btn-clear-walls");
  const btnClearPath = document.getElementById("btn-clear-path");
  const btnGenerateMaze = document.getElementById("btn-generate-maze");
  const algorithmSelect = document.getElementById("algorithm-select");
  const speedSelect = document.getElementById("speed-select");
  const statusMessage = document.getElementById("status-message");

  let isVisualizing = false;
  let animationSessionId = 0;

  function stopVisualization() {
    animationSessionId++;
    isVisualizing = false;
  }

  if (btnClearBoard) {
    btnClearBoard.addEventListener("click", () => {
      stopVisualization();
      grid.clearBoard();
      statusMessage.textContent = "Board cleared.";
    });
  }

  if (btnClearWalls) {
    btnClearWalls.addEventListener("click", () => {
      stopVisualization();
      grid.clearWalls();
      statusMessage.textContent = "Walls cleared.";
    });
  }

  if (btnClearPath) {
    btnClearPath.addEventListener("click", () => {
      stopVisualization();
      grid.clearPath();
      statusMessage.textContent = "Path cleared.";
    });
  }

  if (btnGenerateMaze) {
    btnGenerateMaze.addEventListener("click", () => {
      stopVisualization();
      grid.generateRandomMaze();
      statusMessage.textContent = "Random maze generated.";
    });
  }

  btnVisualize.addEventListener("click", async () => {
    if (isVisualizing) return;
    isVisualizing = true;
    grid.clearPath();
    statusMessage.textContent = "Visualizing...";

    const currentSession = ++animationSessionId;
    const algorithm = algorithmSelect.value;
    const speed = parseInt(speedSelect.value, 10);
    const startNode = grid.getStartNode();
    const endNode = grid.getEndNode();

    let result;
    switch (algorithm) {
      case "bfs":
        result = bfs(grid.grid, startNode, endNode);
        break;
      case "dijkstra":
        result = dijkstra(grid.grid, startNode, endNode);
        break;
      case "astar":
        result = astar(grid.grid, startNode, endNode);
        break;
    }

    await animateAlgorithm(
      result.visitedNodesInOrder,
      result.shortestPathNodes,
      speed,
      currentSession
    );

    if (animationSessionId !== currentSession) {
      return;
    }

    isVisualizing = false;

    if (result.shortestPathNodes.length > 0) {
      statusMessage.textContent = `Path found! Length: ${result.shortestPathNodes.length} nodes.`;
    } else {
      statusMessage.textContent = "No path found.";
    }
  });

  async function animateAlgorithm(
    visitedNodesInOrder,
    shortestPathNodes,
    speed,
    sessionId
  ) {
    for (let i = 0; i < visitedNodesInOrder.length; i++) {
      if (animationSessionId !== sessionId) return false;
      const node = visitedNodesInOrder[i];
      if (!node.isStart && !node.isEnd) {
        node.element.classList.add("visited");
      }
      await sleep(speed);
      if (animationSessionId !== sessionId) return false;
    }

    if (shortestPathNodes.length > 0) {
      await sleep(Math.min(500, 5 * speed));
      if (animationSessionId !== sessionId) return false;

      const pathDelay = Math.max(15, Math.floor(speed / 2));
      for (let i = 0; i < shortestPathNodes.length; i++) {
        if (animationSessionId !== sessionId) return false;
        const node = shortestPathNodes[i];
        if (!node.isStart && !node.isEnd) {
          node.element.classList.add("path");
        }
        await sleep(pathDelay);
        if (animationSessionId !== sessionId) return false;
      }
    }

    return true;
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
});
