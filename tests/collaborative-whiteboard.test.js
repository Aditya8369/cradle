const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DrawingEngine,
} = require("../projects/misc/collaborative-whiteboard/drawing-engine.js");

function createMockCanvas(width = 800, height = 600) {
  const operations = [];
  const ctx = {
    canvas: null,
    beginPath() {
      operations.push({ op: "beginPath" });
    },
    moveTo(x, y) {
      operations.push({ op: "moveTo", x, y });
    },
    lineTo(x, y) {
      operations.push({ op: "lineTo", x, y });
    },
    stroke() {
      operations.push({ op: "stroke" });
    },
    fill() {
      operations.push({ op: "fill" });
    },
    arc(x, y, r, startAngle, endAngle) {
      operations.push({ op: "arc", x, y, r, startAngle, endAngle });
    },
    clearRect(x, y, w, h) {
      operations.push({ op: "clearRect", x, y, w, h });
    },
    save() {
      operations.push({ op: "save" });
    },
    restore() {
      operations.push({ op: "restore" });
    },
    drawImage() {
      operations.push({ op: "drawImage" });
    },
    strokeStyle: "#000000",
    fillStyle: "#000000",
    lineWidth: 1,
    lineCap: "round",
    lineJoin: "round",
  };

  const canvas = {
    width,
    height,
    getContext(type) {
      if (type === "2d") return ctx;
      return null;
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, width, height };
    },
    toDataURL() {
      return "data:image/png;base64,mockCanvasData";
    },
    addEventListener() {},
    removeEventListener() {},
  };
  ctx.canvas = canvas;

  return { canvas, ctx, operations };
}

test("DrawingEngine initializes with empty stroke stack and defaults", () => {
  const { canvas } = createMockCanvas();
  const engine = new DrawingEngine(canvas);

  assert.equal(engine.strokes.length, 0);
  assert.equal(engine.redoStack.length, 0);
  assert.equal(engine.isDrawing, false);
  assert.equal(engine.color, "#3b82f6");
  assert.equal(engine.lineWidth, 3);
  assert.equal(engine.history.length, 1); // Initial blank snapshot
});

test("DrawingEngine records a continuous stroke with coordinates", () => {
  const { canvas } = createMockCanvas();
  const engine = new DrawingEngine(canvas);

  engine.startDrawing({ clientX: 10, clientY: 20 });
  engine.draw({ clientX: 30, clientY: 40 });
  engine.draw({ clientX: 50, clientY: 60 });
  engine.stopDrawing();

  assert.equal(engine.strokes.length, 1);
  assert.equal(engine.strokes[0].points.length, 3);
  assert.deepEqual(engine.strokes[0].points[0], { x: 10, y: 20 });
  assert.deepEqual(engine.strokes[0].points[1], { x: 30, y: 40 });
  assert.deepEqual(engine.strokes[0].points[2], { x: 50, y: 60 });
  assert.equal(engine.strokes[0].color, "#3b82f6");
  assert.equal(engine.strokes[0].lineWidth, 3);
});

test("DrawingEngine records single-click tap as a 1-point stroke (dot)", () => {
  const { canvas } = createMockCanvas();
  const engine = new DrawingEngine(canvas);

  engine.startDrawing({ clientX: 100, clientY: 100 });
  engine.stopDrawing();

  assert.equal(engine.strokes.length, 1);
  assert.equal(engine.strokes[0].points.length, 1);
  assert.deepEqual(engine.strokes[0].points[0], { x: 100, y: 100 });
});

test("DrawingEngine removes exactly one stroke at a time on undo (LIFO)", () => {
  const { canvas } = createMockCanvas();
  const engine = new DrawingEngine(canvas);

  // Stroke 1
  engine.startDrawing({ clientX: 10, clientY: 10 });
  engine.draw({ clientX: 20, clientY: 20 });
  engine.stopDrawing();

  // Stroke 2
  engine.startDrawing({ clientX: 30, clientY: 30 });
  engine.draw({ clientX: 40, clientY: 40 });
  engine.stopDrawing();

  // Stroke 3
  engine.startDrawing({ clientX: 50, clientY: 50 });
  engine.draw({ clientX: 60, clientY: 60 });
  engine.stopDrawing();

  assert.equal(engine.strokes.length, 3, "3 strokes drawn");

  // Undo 1: leaves exactly 2 strokes
  const undoResult1 = engine.undo();
  assert.equal(undoResult1, true);
  assert.equal(
    engine.strokes.length,
    2,
    "After first undo, exactly 2 strokes remain"
  );
  assert.equal(engine.redoStack.length, 1);

  // Undo 2: leaves exactly 1 stroke
  const undoResult2 = engine.undo();
  assert.equal(undoResult2, true);
  assert.equal(
    engine.strokes.length,
    1,
    "After second undo, exactly 1 stroke remains"
  );
  assert.equal(engine.redoStack.length, 2);

  // Undo 3: leaves 0 strokes (blank canvas)
  const undoResult3 = engine.undo();
  assert.equal(undoResult3, true);
  assert.equal(
    engine.strokes.length,
    0,
    "After third undo, 0 strokes remain (blank canvas)"
  );
  assert.equal(engine.redoStack.length, 3);

  // Undo 4: nothing left to undo
  const undoResult4 = engine.undo();
  assert.equal(undoResult4, false);
  assert.equal(engine.strokes.length, 0);
});

test("DrawingEngine redo restores undone strokes in reverse order", () => {
  const { canvas } = createMockCanvas();
  const engine = new DrawingEngine(canvas);

  // Draw 2 strokes
  engine.startDrawing({ clientX: 10, clientY: 10 });
  engine.draw({ clientX: 20, clientY: 20 });
  engine.stopDrawing();

  engine.startDrawing({ clientX: 30, clientY: 30 });
  engine.draw({ clientX: 40, clientY: 40 });
  engine.stopDrawing();

  // Undo both
  engine.undo();
  engine.undo();
  assert.equal(engine.strokes.length, 0);

  // Redo 1
  const redo1 = engine.redo();
  assert.equal(redo1, true);
  assert.equal(engine.strokes.length, 1);

  // Redo 2
  const redo2 = engine.redo();
  assert.equal(redo2, true);
  assert.equal(engine.strokes.length, 2);

  // Redo when stack empty returns false
  const redo3 = engine.redo();
  assert.equal(redo3, false);
  assert.equal(engine.strokes.length, 2);
});

test("DrawingEngine drawing a new stroke clears the redo stack", () => {
  const { canvas } = createMockCanvas();
  const engine = new DrawingEngine(canvas);

  engine.startDrawing({ clientX: 10, clientY: 10 });
  engine.draw({ clientX: 20, clientY: 20 });
  engine.stopDrawing();

  engine.undo();
  assert.equal(engine.redoStack.length, 1);

  // Draw a new stroke
  engine.startDrawing({ clientX: 50, clientY: 50 });
  engine.draw({ clientX: 60, clientY: 60 });
  engine.stopDrawing();

  assert.equal(engine.strokes.length, 1);
  assert.equal(
    engine.redoStack.length,
    0,
    "Redo stack was cleared on new stroke"
  );
});

test("DrawingEngine clear() resets all strokes and redo stack", () => {
  const { canvas, operations } = createMockCanvas();
  const engine = new DrawingEngine(canvas);

  engine.startDrawing({ clientX: 10, clientY: 10 });
  engine.draw({ clientX: 20, clientY: 20 });
  engine.stopDrawing();

  engine.clear();

  assert.equal(engine.strokes.length, 0);
  assert.equal(engine.redoStack.length, 0);
  assert.ok(operations.some(op => op.op === "clearRect"));
});

test("DrawingEngine setBrush updates color and lineWidth", () => {
  const { canvas } = createMockCanvas();
  const engine = new DrawingEngine(canvas);

  engine.setBrush("#ff0000", "8");
  assert.equal(engine.color, "#ff0000");
  assert.equal(engine.lineWidth, 8);

  engine.startDrawing({ clientX: 10, clientY: 10 });
  engine.draw({ clientX: 20, clientY: 20 });
  engine.stopDrawing();

  assert.equal(engine.strokes[0].color, "#ff0000");
  assert.equal(engine.strokes[0].lineWidth, 8);
});

test("DrawingEngine preserves remote strokes when local undo is performed", () => {
  const { canvas } = createMockCanvas();
  const engine = new DrawingEngine(canvas);

  // Local stroke 1
  engine.startDrawing({ clientX: 10, clientY: 10 });
  engine.draw({ clientX: 20, clientY: 20 });
  engine.stopDrawing();

  // Remote stroke from peer
  engine.drawRemote(100, 100, 120, 120, "#10b981", 4);

  // Local stroke 2
  engine.startDrawing({ clientX: 30, clientY: 30 });
  engine.draw({ clientX: 40, clientY: 40 });
  engine.stopDrawing();

  assert.equal(engine.strokes.length, 3);

  // Undo should remove the latest LOCAL stroke (local stroke 2), preserving remote stroke
  engine.undo();
  assert.equal(engine.strokes.length, 2);
  assert.equal(
    engine.strokes.some(s => s.isRemote),
    true,
    "Remote stroke remains intact"
  );
});
