/**
 * Periodic Table Engine - Core calculation & filtering logic
 * Compatible with Node.js and Browser environments
 */

(function (exports) {
  /**
   * Converts temperature between Kelvin, Celsius, and Fahrenheit.
   * @param {number} value - Input temperature value
   * @param {string} fromUnit - 'K', 'C', or 'F'
   * @param {string} toUnit - 'K', 'C', or 'F'
   * @returns {number} Converted value rounded to 2 decimal places
   */
  function convertTemperature(value, fromUnit, toUnit) {
    if (typeof value !== "number" || isNaN(value)) return 0;
    let kelvin = value;

    if (fromUnit === "C") kelvin = value + 273.15;
    else if (fromUnit === "F") kelvin = (value - 32) * (5 / 9) + 273.15;

    let result = kelvin;
    if (toUnit === "C") result = kelvin - 273.15;
    else if (toUnit === "F") result = (kelvin - 273.15) * (9 / 5) + 32;

    return Math.round(result * 100) / 100;
  }

  /**
   * Determines the phase state of an element at a given temperature in Kelvin.
   * @param {number|null} melt - Melting point in Kelvin
   * @param {number|null} boil - Boiling point in Kelvin
   * @param {number} tempK - Target temperature in Kelvin
   * @param {string} phaseAtSTP - Fallback phase if thermal points missing
   * @returns {string} 'Solid' | 'Liquid' | 'Gas' | 'Synthetic'
   */
  function calculatePhaseState(melt, boil, tempK, phaseAtSTP = "Solid") {
    if (phaseAtSTP === "Synthetic" && !melt) {
      return "Synthetic";
    }

    if (!melt && !boil) return phaseAtSTP || "Solid";

    if (melt && tempK < melt) return "Solid";
    if (melt && boil && tempK >= melt && tempK < boil) return "Liquid";
    if (boil && tempK >= boil) return "Gas";
    if (melt && !boil && tempK >= melt) return "Liquid";
    return "Solid";
  }

  /**
   * Parses standard electron configuration strings into principal shell counts.
   * Example: "[Ne] 3s² 3p¹" -> [2, 8, 3]
   * @param {string} configStr - Electron configuration string
   * @returns {number[]} Array of electrons per shell (n=1, n=2, etc.)
   */
  function parseShellElectrons(configStr) {
    if (!configStr || typeof configStr !== "string") return [];

    // Normalize superscripts to normal digits
    const superscriptMap = {
      "¹": "1",
      "²": "2",
      "³": "3",
      "⁴": "4",
      "⁵": "5",
      "⁶": "6",
      "⁷": "7",
      "⁸": "8",
      "⁹": "9",
      "⁰": "0",
    };
    const normalized = configStr.replace(
      /[¹²³⁴⁵⁶⁷⁸⁹⁰]/g,
      m => superscriptMap[m]
    );

    const nobleGases = {
      "[He]": [2],
      "[Ne]": [2, 8],
      "[Ar]": [2, 8, 8],
      "[Kr]": [2, 8, 18, 8],
      "[Xe]": [2, 8, 18, 18, 8],
      "[Rn]": [2, 8, 18, 32, 18, 8],
    };

    let baseShells = [];
    let remaining = normalized;

    for (const [symbol, shells] of Object.entries(nobleGases)) {
      if (normalized.includes(symbol)) {
        baseShells = [...shells];
        remaining = normalized.replace(symbol, "").trim();
        break;
      }
    }

    const orbitalRegex = /(\d)([spdfg])(\d+)/g;
    let match;
    const extraShells = {};
    let parseIterations = 0;
    const MAX_PARSE_ITERATIONS = 500;

    while ((match = orbitalRegex.exec(remaining)) !== null) {
      if (++parseIterations > MAX_PARSE_ITERATIONS) break;
      const shellNum = parseInt(match[1], 10);
      const count = parseInt(match[3], 10);
      extraShells[shellNum] = (extraShells[shellNum] || 0) + count;
    }

    const maxExtra = Object.keys(extraShells).length
      ? Math.max(...Object.keys(extraShells).map(Number))
      : 0;
    const totalShells = Math.max(baseShells.length, maxExtra);

    const result = [];
    for (let i = 1; i <= totalShells; i++) {
      const baseCount = baseShells[i - 1] || 0;
      const extraCount = extraShells[i] || 0;
      result.push(baseCount + extraCount);
    }

    return result;
  }

  /**
   * Filters array of element objects based on search criteria.
   * @param {Array} elements - List of element objects
   * @param {Object} options - Search & filter options
   * @returns {Array} Filtered elements array
   */
  function filterElements(elements, options = {}) {
    if (!Array.isArray(elements)) return [];
    const {
      search = "",
      category = "all",
      block = "all",
      tempK = 298,
      phaseFilter = "all",
    } = options;

    const query = search.trim().toLowerCase();

    return elements.filter(elem => {
      // Category match
      if (category !== "all" && elem.category !== category) {
        return false;
      }

      // Block match
      if (block !== "all" && elem.block !== block) {
        return false;
      }

      // Phase match at target temperature
      const currentPhase = calculatePhaseState(
        elem.meltingPoint,
        elem.boilingPoint,
        tempK,
        elem.phaseAtSTP
      );
      if (
        phaseFilter !== "all" &&
        currentPhase.toLowerCase() !== phaseFilter.toLowerCase()
      ) {
        return false;
      }

      // Text search match (Name, Symbol, Atomic Number, Category)
      if (query) {
        const nameMatch = elem.name.toLowerCase().includes(query);
        const symbolMatch = elem.symbol.toLowerCase().includes(query);
        const numberMatch = String(elem.number) === query;
        const categoryMatch = elem.category.toLowerCase().includes(query);
        return nameMatch || symbolMatch || numberMatch || categoryMatch;
      }

      return true;
    });
  }

  /**
   * Calculates overall periodic table stats & counts.
   * @param {Array} elements - Full elements list
   * @param {number} tempK - Current temperature in Kelvin
   * @returns {Object} Calculated stats summary
   */
  function calculateElementStats(elements, tempK = 298) {
    if (!Array.isArray(elements) || elements.length === 0) {
      return {
        total: 0,
        solid: 0,
        liquid: 0,
        gas: 0,
        synthetic: 0,
        categories: {},
      };
    }

    const stats = {
      total: elements.length,
      solid: 0,
      liquid: 0,
      gas: 0,
      synthetic: 0,
      categories: {},
    };

    elements.forEach(elem => {
      const state = calculatePhaseState(
        elem.meltingPoint,
        elem.boilingPoint,
        tempK,
        elem.phaseAtSTP
      );
      if (state === "Solid") stats.solid++;
      else if (state === "Liquid") stats.liquid++;
      else if (state === "Gas") stats.gas++;
      else if (state === "Synthetic") stats.synthetic++;

      stats.categories[elem.category] =
        (stats.categories[elem.category] || 0) + 1;
    });

    return stats;
  }

  exports.convertTemperature = convertTemperature;
  exports.calculatePhaseState = calculatePhaseState;
  exports.parseShellElectrons = parseShellElectrons;
  exports.filterElements = filterElements;
  const DEFAULT_MAX_TRAVERSAL_ITERATIONS = 1000;
  const DEFAULT_MAX_TRAVERSAL_DEPTH = 100;

  /**
   * Traverses element relationships (decay chains, periodic groups/periods, chemical bonding,
   * or custom graph topologies) while guarding against malformed cycles and excessive iteration paths.
   *
   * Returns controlled failure objects rather than throwing uncaught errors or allowing runaway processing.
   *
   * @param {string|number} startId - Initial element symbol or atomic number.
   * @param {Object|Map|Function|Array} relationships - Adjacency map, neighbor function, or element graph.
   * @param {Object} [options={}] - Traversal options.
   * @param {number} [options.maxIterations=1000] - Hard cap on total iterations to prevent runaway execution.
   * @param {number} [options.maxDepth=100] - Hard cap on traversal depth.
   * @param {string} [options.strategy='bfs'] - Traversal strategy ('bfs' or 'dfs').
   * @param {boolean} [options.allowCycles=false] - Whether to permit re-visiting nodes across paths without failing.
   * @param {boolean} [options.throwOnError=false] - If true, throws Error on limit/cycle; otherwise returns controlled failure.
   * @returns {{
   *   success: boolean,
   *   visited: Array<string|number>,
   *   path: Array<string|number>,
   *   iterations: number,
   *   hasCycle: boolean,
   *   exceededLimit: boolean,
   *   error: string|null,
   *   cycleNode?: string|number|null
   * }}
   */
  function traverseRelationships(startId, relationships, options = {}) {
    const maxIterations =
      typeof options.maxIterations === "number" && options.maxIterations > 0
        ? options.maxIterations
        : DEFAULT_MAX_TRAVERSAL_ITERATIONS;

    const maxDepth =
      typeof options.maxDepth === "number" && options.maxDepth > 0
        ? options.maxDepth
        : DEFAULT_MAX_TRAVERSAL_DEPTH;

    const strategy = options.strategy === "dfs" ? "dfs" : "bfs";
    const allowCycles = options.allowCycles === true;
    const throwOnError = options.throwOnError === true;

    let iterations = 0;
    const visited = new Set();
    const visitedOrder = [];

    function fail(errorMessage, extra = {}) {
      const result = {
        success: false,
        visited: Array.from(visited),
        path: Array.from(visitedOrder),
        iterations,
        hasCycle: extra.hasCycle || false,
        exceededLimit: extra.exceededLimit || false,
        cycleNode: extra.cycleNode ?? null,
        error: errorMessage,
      };
      if (throwOnError) {
        const err = new Error(errorMessage);
        Object.assign(err, result);
        throw err;
      }
      return result;
    }

    if (
      startId === null ||
      startId === undefined ||
      (typeof startId !== "string" && typeof startId !== "number")
    ) {
      return fail("Invalid start node provided for relationship traversal.");
    }

    if (!relationships || (typeof relationships !== "object" && typeof relationships !== "function")) {
      return fail("Invalid relationships parameter. Must be an object, Map, Array, or function.");
    }

    function getNeighbors(node) {
      if (typeof relationships === "function") {
        try {
          const res = relationships(node);
          return Array.isArray(res) ? res : [];
        } catch {
          return [];
        }
      }
      if (relationships instanceof Map) {
        const res = relationships.get(node);
        return Array.isArray(res) ? res : [];
      }
      if (Array.isArray(relationships)) {
        const item = relationships.find(
          el => el && (el.number === node || el.symbol === node || el.id === node || el.name === node)
        );
        if (item) {
          const related = item.related || item.neighbors || item.decayTo || item.connections;
          return Array.isArray(related) ? related : [];
        }
        return [];
      }
      if (typeof relationships === "object") {
        const res = relationships[node];
        return Array.isArray(res) ? res : [];
      }
      return [];
    }

    if (strategy === "bfs") {
      const queue = [{ node: startId, depth: 0, pathSet: new Set([startId]) }];
      visited.add(startId);
      visitedOrder.push(startId);

      while (queue.length > 0) {
        iterations++;
        if (iterations > maxIterations) {
          return fail(
            `Iteration limit exceeded: traversal halted after ${maxIterations} iterations.`,
            { exceededLimit: true }
          );
        }

        const current = queue.shift();
        if (current.depth >= maxDepth) {
          continue;
        }

        const neighbors = getNeighbors(current.node);
        for (const neighbor of neighbors) {
          iterations++;
          if (iterations > maxIterations) {
            return fail(
              `Iteration limit exceeded: traversal halted after ${maxIterations} iterations.`,
              { exceededLimit: true }
            );
          }

          if (!allowCycles && current.pathSet.has(neighbor)) {
            return fail(
              `Malformed cycle detected: node "${neighbor}" was re-encountered in active path.`,
              { hasCycle: true, cycleNode: neighbor }
            );
          }

          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            visitedOrder.push(neighbor);

            const nextPathSet = new Set(current.pathSet);
            nextPathSet.add(neighbor);

            queue.push({
              node: neighbor,
              depth: current.depth + 1,
              pathSet: nextPathSet,
            });
          }
        }
      }
    } else {
      const activePath = new Set();

      function dfsVisit(node, depth) {
        iterations++;
        if (iterations > maxIterations) {
          return fail(
            `Iteration limit exceeded: traversal halted after ${maxIterations} iterations.`,
            { exceededLimit: true }
          );
        }

        if (depth > maxDepth) {
          return null;
        }

        if (!allowCycles && activePath.has(node)) {
          return fail(
            `Malformed cycle detected: node "${node}" was re-encountered in active path.`,
            { hasCycle: true, cycleNode: node }
          );
        }

        activePath.add(node);
        if (!visited.has(node)) {
          visited.add(node);
          visitedOrder.push(node);
        }

        const neighbors = getNeighbors(node);
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor) || (!allowCycles && activePath.has(neighbor))) {
            const errResult = dfsVisit(neighbor, depth + 1);
            if (errResult && errResult.success === false) {
              return errResult;
            }
          }
        }

        activePath.delete(node);
        return null;
      }

      const dfsErr = dfsVisit(startId, 0);
      if (dfsErr && dfsErr.success === false) {
        return dfsErr;
      }
    }

    return {
      success: true,
      visited: Array.from(visited),
      path: Array.from(visitedOrder),
      iterations,
      hasCycle: false,
      exceededLimit: false,
      error: null,
      cycleNode: null,
    };
  }

  exports.calculateElementStats = calculateElementStats;
  exports.traverseRelationships = traverseRelationships;
  exports.DEFAULT_MAX_TRAVERSAL_ITERATIONS = DEFAULT_MAX_TRAVERSAL_ITERATIONS;
  exports.DEFAULT_MAX_TRAVERSAL_DEPTH = DEFAULT_MAX_TRAVERSAL_DEPTH;
})(typeof exports === "undefined" ? (window.PeriodicEngine = {}) : exports);
