/**
 * Cradle UI — CradleDB (IndexedDB Projects Registry Cache Layer)
 * ─────────────────────────────────────────────────────────────
 * Provides client-side caching for `data/projects.json` using IndexedDB.
 * Reduces redundant network requests on subsequent page loads while
 * ensuring graceful fallbacks for cache misses, corrupted stores,
 * private browsing SecurityErrors, and schema version upgrades.
 */

export const DB_NAME = "CradleDB";
export const DB_VERSION = 1;
export const STORE_NAME = "projectsStore";
export const PROJECTS_KEY = "projects";

/**
 * Resolves the available IndexedDB factory.
 * Accepts a custom instance (e.g. fake-indexeddb in tests) or falls back
 * to window.indexedDB or global indexedDB.
 *
 * @param {IDBFactory|null} [customInstance=null]
 * @returns {IDBFactory|null}
 */
export function getIndexedDBFactory(customInstance = null) {
  if (customInstance) return customInstance;
  if (typeof indexedDB !== "undefined") return indexedDB;
  if (typeof window !== "undefined" && window.indexedDB)
    return window.indexedDB;
  return null;
}

/**
 * Opens the CradleDB IndexedDB database.
 * Handles store creation and automatic cache invalidation on version upgrade.
 *
 * @param {Object} [options={}]
 * @param {string} [options.dbName=DB_NAME] - Database name
 * @param {number} [options.version=DB_VERSION] - Database schema version
 * @param {IDBFactory} [options.indexedDBInstance=null] - Optional injected IndexedDB factory
 * @returns {Promise<IDBDatabase>}
 */
export function openDB({
  dbName = DB_NAME,
  version = DB_VERSION,
  indexedDBInstance = null,
} = {}) {
  return new Promise((resolve, reject) => {
    let idb;
    try {
      idb = getIndexedDBFactory(indexedDBInstance);
    } catch (accessErr) {
      return reject(accessErr);
    }

    if (!idb) {
      const err = new Error(
        "IndexedDB is not supported or accessible in this environment."
      );
      err.name = "SecurityError";
      return reject(err);
    }

    let request;
    try {
      request = idb.open(dbName, version);
    } catch (openErr) {
      return reject(openErr);
    }

    request.onerror = () => {
      reject(
        request.error ||
          new Error("Failed to open CradleDB IndexedDB database.")
      );
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = event => {
      try {
        const db = event.target.result;
        const transaction = event.target.transaction;
        const oldVersion = event.oldVersion;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, {
            keyPath: "id",
          });
        } else if (oldVersion > 0 && oldVersion < event.newVersion) {
          // Version upgrade: purge stale cache so it can be cleanly repopulated
          const store = transaction.objectStore(STORE_NAME);
          store.clear();
        }
      } catch (upgradeErr) {
        // Upgrade transaction error
      }
    };
  });
}

/**
 * Retrieves cached project data from the IndexedDB store.
 * Validates integrity and falls back gracefully to `null` if the store is empty,
 * missing, or contains corrupted data (e.g. malformed JSON or non-array).
 *
 * @param {IDBDatabase} db - Opened IndexedDB instance
 * @param {string} [storeName=STORE_NAME] - Object store name
 * @param {string} [key=PROJECTS_KEY] - Primary key for cached record
 * @returns {Promise<Array|null>} Resolves to array of projects, or null on cache miss/corruption.
 */
export function getCachedProjects(
  db,
  storeName = STORE_NAME,
  key = PROJECTS_KEY
) {
  return new Promise(resolve => {
    if (!db || typeof db.transaction !== "function") {
      return resolve(null);
    }

    try {
      if (!db.objectStoreNames.contains(storeName)) {
        return resolve(null);
      }

      const transaction = db.transaction([storeName], "readonly");
      const store = transaction.objectStore(storeName);
      const request = store.get(key);

      request.onerror = () => {
        resolve(null);
      };

      request.onsuccess = () => {
        try {
          const record = request.result;
          if (!record || record.data === undefined || record.data === null) {
            return resolve(null);
          }

          let data = record.data;

          // If serialized as string, parse it safely
          if (typeof data === "string") {
            try {
              data = JSON.parse(data);
            } catch {
              // Corrupted JSON string in store
              return resolve(null);
            }
          }

          // Projects registry MUST be an array
          if (!Array.isArray(data)) {
            return resolve(null);
          }

          resolve(data);
        } catch {
          resolve(null);
        }
      };
    } catch {
      resolve(null);
    }
  });
}

/**
 * Fetches projects from the network and caches them in IndexedDB if available.
 *
 * @param {IDBDatabase|null} db - Opened IndexedDB instance (optional)
 * @param {Object} [options={}]
 * @param {string} [options.url="./data/projects.json"] - URL to fetch
 * @param {Function} [options.fetchFn=null] - Optional custom fetch function
 * @param {string} [options.storeName=STORE_NAME] - Object store name
 * @param {string} [options.key=PROJECTS_KEY] - Cache key
 * @returns {Promise<Array>} The fetched projects array
 */
export async function fetchAndCacheProjects(
  db,
  {
    url = "./data/projects.json",
    fetchFn = null,
    storeName = STORE_NAME,
    key = PROJECTS_KEY,
  } = {}
) {
  const fetcher =
    fetchFn ||
    (typeof fetch === "function"
      ? fetch
      : typeof window !== "undefined" && typeof window.fetch === "function"
        ? window.fetch.bind(window)
        : null);

  if (!fetcher) {
    throw new Error("Fetch API is unavailable.");
  }

  const response = await fetcher(url);
  if (!response.ok) {
    throw new Error(
      `Failed to load projects: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error("Invalid projects payload: expected JSON array.");
  }

  if (db && typeof db.transaction === "function") {
    try {
      if (db.objectStoreNames.contains(storeName)) {
        const transaction = db.transaction([storeName], "readwrite");
        const store = transaction.objectStore(storeName);
        store.put({
          id: key,
          data: data,
          cachedAt: Date.now(),
        });
      }
    } catch (cacheErr) {
      console.warn("Failed to cache projects in IndexedDB:", cacheErr);
    }
  }

  return data;
}

/**
 * High-level project loading orchestrator:
 * 1. Attempts to open IndexedDB (gracefully catching SecurityErrors in private browsing).
 * 2. Attempts to read cached projects.
 * 3. Returns cached projects on hit.
 * 4. Falls back to network fetch on cache miss, corruption, or database error.
 *
 * @param {Object} [options={}]
 * @param {string} [options.dbName=DB_NAME]
 * @param {number} [options.version=DB_VERSION]
 * @param {IDBFactory} [options.indexedDBInstance=null]
 * @param {Function} [options.fetchFn=null]
 * @param {string} [options.url="./data/projects.json"]
 * @returns {Promise<{projects: Array, fromCache: boolean, db: IDBDatabase|null}>}
 */
export async function loadProjects({
  dbName = DB_NAME,
  version = DB_VERSION,
  indexedDBInstance = null,
  fetchFn = null,
  url = "./data/projects.json",
} = {}) {
  let db = null;

  try {
    db = await openDB({ dbName, version, indexedDBInstance });
    const cachedProjects = await getCachedProjects(db);

    if (cachedProjects && cachedProjects.length > 0) {
      return {
        projects: cachedProjects,
        fromCache: true,
        db,
      };
    }
  } catch (dbErr) {
    // Catches SecurityError, private browsing denial, or initialization failures
    console.warn(
      "IndexedDB unavailable or access denied, falling back to direct fetch:",
      dbErr
    );
  }

  // Cache miss, corrupted data, or IndexedDB unavailable -> fetch from network
  const freshProjects = await fetchAndCacheProjects(db, { url, fetchFn });
  return {
    projects: freshProjects,
    fromCache: false,
    db,
  };
}

export const CradleDB = {
  DB_NAME,
  DB_VERSION,
  STORE_NAME,
  PROJECTS_KEY,
  getIndexedDBFactory,
  openDB,
  getCachedProjects,
  fetchAndCacheProjects,
  loadProjects,
};

export default CradleDB;
