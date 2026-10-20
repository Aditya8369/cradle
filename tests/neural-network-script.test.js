const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const PROJECT_DIR = path.resolve(
  __dirname,
  "..",
  "projects",
  "aiml",
  "neural-network-playground"
);
const ENGINE_SOURCE = fs.readFileSync(
  path.join(PROJECT_DIR, "nnEngine.js"),
  "utf-8"
);
const SCRIPT_SOURCE = fs.readFileSync(
  path.join(PROJECT_DIR, "script.js"),
  "utf-8"
);

function createCanvasContext() {
  const gradient = { addColorStop() {} };

  return {
    createImageData(width, height) {
      return { data: new Uint8ClampedArray(width * height * 4) };
    },
    createRadialGradient() {
      return gradient;
    },
    createLinearGradient() {
      return gradient;
    },
    putImageData() {},
    clearRect() {},
    beginPath() {},
    closePath() {},
    arc() {},
    moveTo() {},
    lineTo() {},
    fill() {},
    stroke() {},
    fillRect() {},
    strokeRect() {},
    fillText() {},
    setLineDash() {},
    save() {},
    restore() {},
    measureText() {
      return { width: 10 };
    },
  };
}

function createElement() {
  const listeners = new Map();
  const context = createCanvasContext();

  return {
    value: "",
    selectionStart: 0,
    selectionEnd: 0,
    innerHTML: "",
    textContent: "",
    className: "",
    disabled: false,
    checked: true,
    style: {},
    dataset: {},
    width: 60,
    height: 60,
    listeners,
    classList: {
      add() {},
      remove() {},
      toggle() {},
      contains() {
        return false;
      },
    },
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    removeEventListener() {},
    appendChild() {},
    removeChild() {},
    replaceChild() {},
    remove() {},
    focus() {},
    click() {},
    closest() {
      return null;
    },
    querySelector() {
      return createElement();
    },
    querySelectorAll() {
      return [];
    },
    getContext() {
      return context;
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 60, height: 60 };
    },
  };
}

function createDocument() {
  const elements = new Map();
  const documentListeners = new Map();

  return {
    elements,
    documentListeners,
    body: {
      classList: {
        add() {},
        remove() {},
        toggle() {},
      },
      appendChild() {},
      removeChild() {},
      style: {},
    },
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, createElement());
      return elements.get(id);
    },
    createElement() {
      return createElement();
    },
    addEventListener(type, handler) {
      documentListeners.set(type, handler);
    },
    querySelectorAll() {
      return [];
    },
    querySelector() {
      return null;
    },
  };
}

function createWorkerClass(instances, throwOnCreate = false) {
  return class FakeWorker {
    constructor(url) {
      if (throwOnCreate) throw new Error("Worker construction blocked");
      this.url = url;
      this.messages = [];
      this.onmessage = null;
      this.onerror = null;
      this.terminated = false;
      instances.push(this);
    }

    postMessage(message) {
      this.messages.push(message);
    }

    terminate() {
      this.terminated = true;
    }
  };
}

function loadPage({ Worker, quiet = false } = {}) {
  const document = createDocument();
  const sandbox = {
    document,
    console: quiet ? { ...console, warn() {}, error() {} } : console,
    setTimeout(handler) {
      handler();
      return 0;
    },
    clearTimeout() {},
    requestAnimationFrame() {
      return 1;
    },
    cancelAnimationFrame() {},
  };

  sandbox.window = sandbox;
  if (Worker) sandbox.Worker = Worker;

  const context = vm.createContext(sandbox);
  vm.runInContext(ENGINE_SOURCE, context, { filename: "nnEngine.js" });
  vm.runInContext(SCRIPT_SOURCE, context, { filename: "script.js" });

  const domReady = document.documentListeners.get("DOMContentLoaded");
  assert.equal(
    typeof domReady,
    "function",
    "page must register DOMContentLoaded"
  );
  domReady();

  return { document, sandbox };
}

test("page sends the current network and displayed points to a new worker", () => {
  const instances = [];
  const { document } = loadPage({
    Worker: createWorkerClass(instances),
  });

  assert.equal(instances.length, 1);
  const worker = instances[0];

  const initNetwork = worker.messages.find(
    message => message.type === "INIT_NETWORK"
  );
  const initData = worker.messages.find(
    message => message.type === "INIT_DATA"
  );

  assert.ok(initNetwork, "worker must receive INIT_NETWORK on startup");
  assert.ok(initData, "worker must receive INIT_DATA on startup");
  assert.deepEqual(Array.from(initNetwork.payload.layers), [2, 6, 4, 1]);
  assert.ok(Array.isArray(initNetwork.payload.weights));
  assert.ok(Array.isArray(initNetwork.payload.biases));
  assert.equal(initData.payload.points.length, 200);

  const trainButton = document.getElementById("btnTrain");
  trainButton.listeners.get("click")();

  const trainMessage = worker.messages.find(
    message => message.type === "TRAIN_STEP"
  );
  assert.ok(trainMessage, "clicking Train must ask the worker to train");
  assert.equal(trainMessage.payload.speed, 50);
  assert.equal(trainMessage.payload.batchSize, 16);
});

test("page trains on the main thread when Worker is unavailable", () => {
  const { document } = loadPage();

  const epochCount = document.getElementById("epochCount");
  assert.equal(Number(epochCount.textContent), 0);

  const trainButton = document.getElementById("btnTrain");
  trainButton.listeners.get("click")();

  assert.ok(
    Number(epochCount.textContent) > 0,
    "main-thread fallback must advance the epoch"
  );
  assert.match(
    document.getElementById("lossValue").textContent,
    /^\d+\.\d{4}$/
  );
  assert.match(document.getElementById("accuracyValue").textContent, /%$/);
  assert.equal(trainButton.disabled, true);
  assert.equal(document.getElementById("btnPause").disabled, false);
});

test("page falls back to the main thread when the Worker constructor throws", () => {
  const instances = [];
  const { document } = loadPage({
    Worker: createWorkerClass(instances, true),
    quiet: true,
  });

  assert.equal(instances.length, 0);
  assert.equal(Number(document.getElementById("epochCount").textContent), 0);

  const trainButton = document.getElementById("btnTrain");
  trainButton.listeners.get("click")();

  assert.ok(Number(document.getElementById("epochCount").textContent) > 0);
  assert.equal(trainButton.disabled, true);
});
