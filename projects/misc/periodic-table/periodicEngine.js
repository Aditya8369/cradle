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

  const DEFAULT_MAX_TRAVERSAL_ITERATIONS = 1000;
  const DEFAULT_MAX_TRAVERSAL_DEPTH = 100;

  function normalizeNode(n) {
    if (n === null || n === undefined) return null;
    if (typeof n === "string") {
      const trimmed = n.trim();
      return trimmed !== "" ? trimmed : null;
    }
    if (typeof n === "number") {
      return !isNaN(n) ? n : null;
    }
    if (typeof n === "object") {
      return n.symbol || n.number || n.id || n.name || null;
    }
    return null;
  }

  function extractNeighborList(val) {
    if (val === null || val === undefined) return [];
    if (val instanceof Set) {
      val = Array.from(val);
    }
    if (typeof val === "string" || typeof val === "number") {
      const norm = normalizeNode(val);
      return norm !== null ? [norm] : [];
    }
    if (Array.isArray(val)) {
      return val.map(normalizeNode).filter(x => x !== null);
    }
    return [];
  }

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
   * @param {boolean} [options.failOnMaxDepth=false] - If true, exceeding maxDepth returns controlled failure instead of pruning.
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
    const failOnMaxDepth = options.failOnMaxDepth === true;
    const throwOnError = options.throwOnError === true;

    let iterations = 0;
    const visited = new Set();
    const visitedOrder = [];
    let encounteredCycle = false;
    let detectedCycleNode = null;

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

    const normalizedStart = normalizeNode(startId);
    if (normalizedStart === null) {
      return fail("Invalid start node provided for relationship traversal.");
    }

    if (
      !relationships ||
      (typeof relationships !== "object" && typeof relationships !== "function")
    ) {
      return fail(
        "Invalid relationships parameter. Must be an object, Map, Array, or function."
      );
    }

    function getNeighbors(node) {
      if (typeof relationships === "function") {
        try {
          return extractNeighborList(relationships(node));
        } catch {
          return [];
        }
      }
      if (relationships instanceof Map) {
        let res = relationships.get(node);
        if (res === undefined && typeof node === "number") {
          res = relationships.get(String(node));
        } else if (
          res === undefined &&
          typeof node === "string" &&
          !isNaN(Number(node))
        ) {
          res = relationships.get(Number(node));
        }
        return extractNeighborList(res);
      }
      if (Array.isArray(relationships)) {
        const item = relationships.find(
          el =>
            el &&
            (el.number === node ||
              el.symbol === node ||
              el.id === node ||
              el.name === node ||
              String(el.number) === String(node) ||
              (typeof el.symbol === "string" &&
                typeof node === "string" &&
                el.symbol.toLowerCase() === node.toLowerCase()))
        );
        if (item) {
          const related =
            item.related ||
            item.neighbors ||
            item.decayTo ||
            item.connections ||
            item.next;
          return extractNeighborList(related);
        }
        return [];
      }
      if (typeof relationships === "object") {
        let res = relationships[node];
        if (res === undefined && typeof node === "number") {
          res = relationships[String(node)];
        }
        return extractNeighborList(res);
      }
      return [];
    }

    if (strategy === "bfs") {
      const queue = [
        { node: normalizedStart, depth: 0, pathSet: new Set([normalizedStart]) },
      ];
      visited.add(normalizedStart);
      visitedOrder.push(normalizedStart);

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
          if (failOnMaxDepth) {
            return fail(
              `Depth limit exceeded: traversal reached maximum depth of ${maxDepth}.`,
              { exceededLimit: true, exceededDepth: true }
            );
          }
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

          if (current.pathSet.has(neighbor)) {
            encounteredCycle = true;
            if (!detectedCycleNode) detectedCycleNode = neighbor;

            if (!allowCycles) {
              return fail(
                `Malformed cycle detected: node "${neighbor}" was re-encountered in active path.`,
                { hasCycle: true, cycleNode: neighbor }
              );
            }
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
          if (failOnMaxDepth) {
            return fail(
              `Depth limit exceeded: traversal reached maximum depth of ${maxDepth}.`,
              { exceededLimit: true, exceededDepth: true }
            );
          }
          return null;
        }

        if (activePath.has(node)) {
          encounteredCycle = true;
          if (!detectedCycleNode) detectedCycleNode = node;

          if (!allowCycles) {
            return fail(
              `Malformed cycle detected: node "${node}" was re-encountered in active path.`,
              { hasCycle: true, cycleNode: node }
            );
          }
        }

        activePath.add(node);
        if (!visited.has(node)) {
          visited.add(node);
          visitedOrder.push(node);
        }

        const neighbors = getNeighbors(node);
        for (const neighbor of neighbors) {
          if (
            !visited.has(neighbor) ||
            (!allowCycles && activePath.has(neighbor))
          ) {
            const errResult = dfsVisit(neighbor, depth + 1);
            if (errResult && errResult.success === false) {
              return errResult;
            }
          }
        }

        activePath.delete(node);
        return null;
      }

      const dfsErr = dfsVisit(normalizedStart, 0);
      if (dfsErr && dfsErr.success === false) {
        return dfsErr;
      }
    }

    return {
      success: true,
      visited: Array.from(visited),
      path: Array.from(visitedOrder),
      iterations,
      hasCycle: encounteredCycle,
      exceededLimit: false,
      error: null,
      cycleNode: detectedCycleNode,
    };
  }

  /**
   * Convenience check to test whether an element relationship graph contains cycles.
   *
   * @param {string|number} startId - Starting element or identifier.
   * @param {Object|Map|Function|Array} relationships - Relationship graph.
   * @param {Object} [options={}] - Options passed to traverseRelationships.
   * @returns {{ hasCycle: boolean, cycleNode: string|number|null, iterations: number, error: string|null }}
   */
  function detectCycle(startId, relationships, options = {}) {
    const res = traverseRelationships(startId, relationships, {
      ...options,
      allowCycles: false,
      throwOnError: false,
    });
    return {
      hasCycle: res.hasCycle,
      cycleNode: res.cycleNode,
      iterations: res.iterations,
      error: res.error,
    };
  }

  /**
   * Traces a directional path between startId and targetId while preventing runaway iterations.
   *
   * @param {string|number} startId - Source element symbol or number.
   * @param {string|number} targetId - Destination element symbol or number.
   * @param {Object|Map|Function|Array} relationships - Adjacency graph.
   * @param {Object} [options={}] - Traversal options.
   * @returns {{ success: boolean, path: Array<string|number>, iterations: number, error: string|null }}
   */
  function getRelationshipPath(startId, targetId, relationships, options = {}) {
    const maxIterations =
      typeof options.maxIterations === "number" && options.maxIterations > 0
        ? options.maxIterations
        : DEFAULT_MAX_TRAVERSAL_ITERATIONS;
    const maxDepth =
      typeof options.maxDepth === "number" && options.maxDepth > 0
        ? options.maxDepth
        : DEFAULT_MAX_TRAVERSAL_DEPTH;

    const normStart = normalizeNode(startId);
    const normTarget = normalizeNode(targetId);

    if (normStart === null || normTarget === null) {
      return {
        success: false,
        path: [],
        iterations: 0,
        error: "Invalid start or target node provided.",
      };
    }

    if (normStart === normTarget) {
      return {
        success: true,
        path: [normStart],
        iterations: 0,
        error: null,
      };
    }

    let iterations = 0;
    const queue = [
      {
        node: normStart,
        path: [normStart],
        pathSet: new Set([normStart]),
      },
    ];
    const visited = new Set([normStart]);

    while (queue.length > 0) {
      iterations++;
      if (iterations > maxIterations) {
        return {
          success: false,
          path: [],
          iterations,
          exceededLimit: true,
          error: `Iteration limit exceeded: path search halted after ${maxIterations} iterations.`,
        };
      }

      const current = queue.shift();
      if (current.path.length - 1 >= maxDepth) {
        continue;
      }

      let neighbors = [];
      if (typeof relationships === "function") {
        try {
          neighbors = extractNeighborList(relationships(current.node));
        } catch {
          neighbors = [];
        }
      } else if (relationships instanceof Map) {
        neighbors = extractNeighborList(relationships.get(current.node));
      } else if (typeof relationships === "object") {
        neighbors = extractNeighborList(relationships[current.node]);
      }

      for (const neighbor of neighbors) {
        iterations++;
        if (iterations > maxIterations) {
          return {
            success: false,
            path: [],
            iterations,
            exceededLimit: true,
            error: `Iteration limit exceeded: path search halted after ${maxIterations} iterations.`,
          };
        }

        if (current.pathSet.has(neighbor)) {
          return {
            success: false,
            path: [],
            iterations,
            hasCycle: true,
            cycleNode: neighbor,
            error: `Malformed cycle detected: node "${neighbor}" was re-encountered.`,
          };
        }

        const newPath = [...current.path, neighbor];
        if (
          neighbor === normTarget ||
          String(neighbor) === String(normTarget)
        ) {
          return {
            success: true,
            path: newPath,
            iterations,
            error: null,
          };
        }

        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          const nextPathSet = new Set(current.pathSet);
          nextPathSet.add(neighbor);
          queue.push({
            node: neighbor,
            path: newPath,
            pathSet: nextPathSet,
          });
        }
      }
    }

    return {
      success: false,
      path: [],
      iterations,
      error: `No path found between "${normStart}" and "${normTarget}".`,
    };
  }

  /**
   * Follows a linear decay chain from parent element to daughter element,
   * guarding against malformed decay loops and runaway processing.
   *
   * @param {string|number} startElement - Initial radioactive element.
   * @param {Object|Map|Function|Array} decayMap - Decay relationship mapping.
   * @param {Object} [options={}] - Traversal options.
   * @returns {Object} Controlled traversal result.
   */
  function getDecayChain(startElement, decayMap, options = {}) {
    return traverseRelationships(startElement, decayMap, {
      ...options,
      strategy: "dfs",
      allowCycles: false,
    });
  }

  exports.convertTemperature = convertTemperature;
  exports.calculatePhaseState = calculatePhaseState;
  exports.parseShellElectrons = parseShellElectrons;
  exports.filterElements = filterElements;
  exports.calculateElementStats = calculateElementStats;
  exports.traverseRelationships = traverseRelationships;
  exports.detectCycle = detectCycle;
  exports.getRelationshipPath = getRelationshipPath;
  exports.getDecayChain = getDecayChain;
  exports.DEFAULT_MAX_TRAVERSAL_ITERATIONS = DEFAULT_MAX_TRAVERSAL_ITERATIONS;
  exports.DEFAULT_MAX_TRAVERSAL_DEPTH = DEFAULT_MAX_TRAVERSAL_DEPTH;
})(typeof exports === "undefined" ? (window.PeriodicEngine = {}) : exports);
