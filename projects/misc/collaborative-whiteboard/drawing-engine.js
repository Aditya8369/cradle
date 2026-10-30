/**
 * Drawing Engine
 * Handles Canvas 2D rendering, brush properties, vector stroke tracking,
 * and deterministic local stroke-by-stroke undo/redo stack.
 */
export class DrawingEngine {
  constructor(canvasOrId) {
    if (typeof canvasOrId === "string") {
      this.canvas =
        typeof document !== "undefined"
          ? document.getElementById(canvasOrId)
          : null;
    } else {
      this.canvas = canvasOrId || null;
    }

    this.ctx =
      this.canvas && typeof this.canvas.getContext === "function"
        ? this.canvas.getContext("2d")
        : null;

    this.isDrawing = false;
    this.lastX = 0;
    this.lastY = 0;

    this.color = "#3b82f6";
    this.lineWidth = 3;

    // Stroke-based history for deterministic LIFO undo/redo
    this.strokes = [];
    this.redoStack = [];
    this.currentStroke = null;

    // Snapshot history maintained for WebRTC state sync compatibility
    this.history = [];
    this.historyStep = -1;
    this.maxHistory = 20;

    if (this.canvas && typeof window !== "undefined") {
      this.resizeCanvas();
      window.addEventListener("resize", () => this.resizeCanvas());
      this.setupCanvasEvents();
    }
    this.saveState(); // Initial blank state
  }

  resizeCanvas() {
    if (!this.canvas || !this.canvas.parentElement) return;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      this.canvas.width = rect.width;
      this.canvas.height = rect.height;
    }
    if (this.ctx) {
      this.ctx.lineCap = "round";
      this.ctx.lineJoin = "round";
    }
    this.redraw();
  }

  setupCanvasEvents() {
    if (!this.canvas) return;

    this.canvas.addEventListener("mousedown", e => this.startDrawing(e));
    this.canvas.addEventListener("mousemove", e => this.draw(e));
    this.canvas.addEventListener("mouseup", () => this.stopDrawing());
    this.canvas.addEventListener("mouseleave", () => this.stopDrawing());

    // Touch support
    this.canvas.addEventListener(
      "touchstart",
      e => {
        e.preventDefault();
        if (e.touches && e.touches[0]) {
          this.startDrawing(e.touches[0]);
        }
      },
      { passive: false }
    );
    this.canvas.addEventListener(
      "touchmove",
      e => {
        e.preventDefault();
        if (e.touches && e.touches[0]) {
          this.draw(e.touches[0]);
        }
      },
      { passive: false }
    );
    this.canvas.addEventListener("touchend", () => this.stopDrawing());
    this.canvas.addEventListener("touchcancel", () => this.stopDrawing());
  }

  getCoordinates(e) {
    if (
      !this.canvas ||
      typeof this.canvas.getBoundingClientRect !== "function"
    ) {
      return {
        x: e && e.clientX !== undefined ? e.clientX : 0,
        y: e && e.clientY !== undefined ? e.clientY : 0,
      };
    }
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX !== undefined ? e.clientX : 0) - rect.left,
      y: (e.clientY !== undefined ? e.clientY : 0) - rect.top,
    };
  }

  startDrawing(e) {
    if (!e) return;
    this.isDrawing = true;
    const coords = this.getCoordinates(e);
    this.lastX = coords.x;
    this.lastY = coords.y;

    this.currentStroke = {
      color: this.color,
      lineWidth: Number(this.lineWidth),
      points: [{ x: coords.x, y: coords.y }],
      isRemote: false,
    };

    if (this.ctx) {
      this.ctx.save();
      this.ctx.fillStyle = this.color;
      this.ctx.beginPath();
      this.ctx.arc(
        coords.x,
        coords.y,
        Math.max(1, this.lineWidth / 2),
        0,
        Math.PI * 2
      );
      this.ctx.fill();
      this.ctx.restore();
    }
  }

  draw(e) {
    if (!this.isDrawing || !e) return;
    const coords = this.getCoordinates(e);

    if (this.currentStroke) {
      this.currentStroke.points.push({ x: coords.x, y: coords.y });
    }

    if (this.ctx) {
      this.ctx.beginPath();
      this.ctx.moveTo(this.lastX, this.lastY);
      this.ctx.lineTo(coords.x, coords.y);
      this.ctx.strokeStyle = this.color;
      this.ctx.lineWidth = Number(this.lineWidth);
      this.ctx.lineCap = "round";
      this.ctx.lineJoin = "round";
      this.ctx.stroke();
    }

    this.lastX = coords.x;
    this.lastY = coords.y;
  }

  stopDrawing() {
    if (this.isDrawing) {
      this.isDrawing = false;
      if (this.currentStroke && this.currentStroke.points.length > 0) {
        this.strokes.push(this.currentStroke);
        this.redoStack = []; // Truncate redo history on new stroke
        this.currentStroke = null;
      }
      this.saveState();
    }
  }

  renderStroke(stroke) {
    if (!this.ctx || !stroke || !stroke.points || stroke.points.length === 0)
      return;
    this.ctx.save();
    this.ctx.strokeStyle = stroke.color;
    this.ctx.fillStyle = stroke.color;
    this.ctx.lineWidth = Number(stroke.lineWidth);
    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";

    if (stroke.points.length === 1) {
      this.ctx.beginPath();
      this.ctx.arc(
        stroke.points[0].x,
        stroke.points[0].y,
        Math.max(1, stroke.lineWidth / 2),
        0,
        Math.PI * 2
      );
      this.ctx.fill();
    } else {
      this.ctx.beginPath();
      this.ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        this.ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  redraw() {
    if (!this.ctx || !this.canvas) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (const stroke of this.strokes) {
      this.renderStroke(stroke);
    }
  }

  saveState() {
    if (!this.canvas || typeof this.canvas.toDataURL !== "function") return;
    this.historyStep++;
    if (this.historyStep < this.history.length) {
      this.history.length = this.historyStep;
    }
    this.history.push(this.canvas.toDataURL());
    if (this.history.length > this.maxHistory) {
      this.history.shift();
      this.historyStep--;
    }
  }

  undo() {
    let localIdx = -1;
    for (let i = this.strokes.length - 1; i >= 0; i--) {
      if (!this.strokes[i].isRemote) {
        localIdx = i;
        break;
      }
    }
    if (localIdx !== -1) {
      const [removed] = this.strokes.splice(localIdx, 1);
      this.redoStack.push(removed);
      this.redraw();
      this.saveState();
      return true;
    }
    return false;
  }

  redo() {
    if (this.redoStack.length > 0) {
      const restored = this.redoStack.pop();
      this.strokes.push(restored);
      this.redraw();
      this.saveState();
      return true;
    }
    return false;
  }

  restoreState() {
    if (this.historyStep < 0 || this.historyStep >= this.history.length) return;
    if (!this.ctx || !this.canvas) return;
    const img = new Image();
    img.onload = () => {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.drawImage(img, 0, 0);
    };
    img.src = this.history[this.historyStep];
    if (img.complete && img.naturalWidth !== 0) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.drawImage(img, 0, 0);
    }
  }

  clear() {
    this.strokes = [];
    this.redoStack = [];
    this.currentStroke = null;
    if (this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    this.saveState();
  }

  setBrush(color, width) {
    this.color = color;
    this.lineWidth = Number(width);
  }

  // Called when receiving remote draw commands
  drawRemote(x1, y1, x2, y2, color, width) {
    if (this.ctx) {
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.moveTo(x1, y1);
      this.ctx.lineTo(x2, y2);
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = Number(width);
      this.ctx.lineCap = "round";
      this.ctx.lineJoin = "round";
      this.ctx.stroke();
      this.ctx.restore();
    }
    this.strokes.push({
      color,
      lineWidth: Number(width),
      points: [
        { x: x1, y: y1 },
        { x: x2, y: y2 },
      ],
      isRemote: true,
    });
    this.saveState();
  }

  // Called when receiving remote clear
  clearRemote() {
    this.clear();
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { DrawingEngine };
}
