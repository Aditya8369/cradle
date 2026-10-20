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
const WORKER_SOURCE = fs.readFileSync(
  path.join(PROJECT_DIR, "nnWorker.js"),
  "utf-8"
);

function loadWorker() {
  const messages = [];
  const self = {
    onmessage: null,
    postMessage(message) {
      messages.push(message);
    },
  };

  const sandbox = { self, console };
  const context = vm.createContext(sandbox);
  sandbox.importScripts = () => {
    vm.runInContext(ENGINE_SOURCE, context, { filename: "nnEngine.js" });
  };

  vm.runInContext(WORKER_SOURCE, context, { filename: "nnWorker.js" });

  return {
    messages,
    send(data) {
      assert.equal(typeof self.onmessage, "function");
      self.onmessage({ data });
    },
  };
}

test("worker applies supplied weights during INIT_NETWORK", () => {
  const worker = loadWorker();

  worker.send({
    type: "INIT_NETWORK",
    payload: {
      layers: [2, 2, 1],
      activationName: "relu",
      lr: 0.1,
      weights: [
        [
          [0, 0],
          [0, 0],
        ],
        [[0, 0]],
      ],
      biases: [[0, 0], [0]],
    },
  });

  const initMessage = worker.messages.pop();
  assert.equal(initMessage.type, "NETWORK_INITED");

  worker.send({
    type: "PREDICT_GRID",
    payload: { width: 2, height: 2, res: 1 },
  });

  const result = worker.messages.pop();
  assert.equal(result.type, "GRID_PREDICTIONS");
  assert.equal(result.payload.length, 4);

  for (const value of result.payload) {
    assert.ok(
      Math.abs(value - 0.5) < 1e-9,
      `zero weights should predict 0.5, got ${value}`
    );
  }
});

test("worker trains on the supplied points instead of generating new ones", () => {
  const worker = loadWorker();
  const points = [
    [0, 0, 1],
    [1, 1, 0],
    [-1, -1, 0],
    [1, -1, 1],
  ];

  worker.send({
    type: "INIT_NETWORK",
    payload: { layers: [2, 2, 1], activationName: "relu", lr: 0.1 },
  });
  worker.messages.length = 0;

  worker.send({
    type: "INIT_DATA",
    payload: {
      datasetType: "circle",
      numPoints: 500,
      noise: 0,
      points,
    },
  });

  const dataMessage = worker.messages.pop();
  assert.equal(dataMessage.type, "DATA_INITED");
  assert.equal(dataMessage.payload.count, points.length);

  worker.send({
    type: "TRAIN_STEP",
    payload: { speed: 2, batchSize: 2 },
  });

  const result = worker.messages.pop();
  assert.equal(result.type, "TRAIN_STEP_COMPLETE");
  assert.equal(result.payload.epochs, 2);
  assert.equal(result.payload.weights.length, 2);
  assert.equal(result.payload.biases.length, 2);
  assert.ok(Number.isFinite(result.payload.loss));
  assert.ok(Number.isFinite(result.payload.accuracy));
});

test("worker falls back to generating a dataset when points are absent", () => {
  const worker = loadWorker();

  worker.send({
    type: "INIT_DATA",
    payload: {
      datasetType: "xor",
      numPoints: 12,
      noise: 0,
    },
  });

  const dataMessage = worker.messages.pop();
  assert.equal(dataMessage.type, "DATA_INITED");
  assert.equal(dataMessage.payload.count, 12);
});
