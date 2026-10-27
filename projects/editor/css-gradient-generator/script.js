/**
 * CSS Gradient Generator (script.js)
 * Interactive browser tool for building CSS gradients and exporting transparent PNGs.
 */

(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.GradientGenerator = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  /* ── State ── */
  let gradientType = "linear";
  let angle = 135;
  let stops = [
    { color: "#6366f1", opacity: 100, pos: 0 },
    { color: "#ec4899", opacity: 100, pos: 50 },
    { color: "#f59e0b", opacity: 100, pos: 100 },
  ];

  /* ── Presets ── */
  const PRESETS = [
    {
      stops: [
        { color: "#6366f1", opacity: 100, pos: 0 },
        { color: "#ec4899", opacity: 100, pos: 100 },
      ],
      angle: 135,
    },
    {
      stops: [
        { color: "#6366f1", opacity: 0, pos: 0 },
        { color: "#ec4899", opacity: 100, pos: 100 },
      ],
      angle: 135,
    },
    {
      stops: [
        { color: "#0ea5e9", opacity: 100, pos: 0 },
        { color: "#8b5cf6", opacity: 100, pos: 100 },
      ],
      angle: 135,
    },
    {
      stops: [
        { color: "#10b981", opacity: 100, pos: 0 },
        { color: "#06b6d4", opacity: 0, pos: 100 },
      ],
      angle: 90,
    },
    {
      stops: [
        { color: "#f43f5e", opacity: 100, pos: 0 },
        { color: "#f97316", opacity: 100, pos: 100 },
      ],
      angle: 45,
    },
    {
      stops: [
        { color: "#1e1b4b", opacity: 100, pos: 0 },
        { color: "#7c3aed", opacity: 50, pos: 50 },
        { color: "#c084fc", opacity: 100, pos: 100 },
      ],
      angle: 135,
    },
    {
      stops: [
        { color: "#0f172a", opacity: 100, pos: 0 },
        { color: "#1e40af", opacity: 100, pos: 50 },
        { color: "#38bdf8", opacity: 100, pos: 100 },
      ],
      angle: 180,
    },
    {
      stops: [
        { color: "#dc2626", opacity: 100, pos: 0 },
        { color: "#facc15", opacity: 100, pos: 50 },
        { color: "#16a34a", opacity: 100, pos: 100 },
      ],
      angle: 90,
    },
    {
      stops: [
        { color: "#fbbf24", opacity: 100, pos: 0 },
        { color: "#f97316", opacity: 100, pos: 100 },
      ],
      angle: 45,
    },
    {
      stops: [
        { color: "#a855f7", opacity: 100, pos: 0 },
        { color: "#ec4899", opacity: 100, pos: 100 },
      ],
      angle: 135,
    },
    {
      stops: [
        { color: "#334155", opacity: 100, pos: 0 },
        { color: "#0f172a", opacity: 100, pos: 100 },
      ],
      angle: 180,
    },
    {
      stops: [
        { color: "#34d399", opacity: 100, pos: 0 },
        { color: "#3b82f6", opacity: 100, pos: 50 },
        { color: "#8b5cf6", opacity: 100, pos: 100 },
      ],
      angle: 135,
    },
    {
      stops: [
        { color: "#fb923c", opacity: 100, pos: 0 },
        { color: "#f43f5e", opacity: 100, pos: 100 },
      ],
      angle: 90,
    },
  ];

  /* ── Color formatting & alpha helper ── */
  function parseColorToRgba(colorStr, opacity = 100) {
    if (!colorStr) return "rgba(0, 0, 0, 1)";
    const op =
      opacity !== undefined && opacity !== null ? Number(opacity) : 100;
    const alphaFactor = Math.max(0, Math.min(100, isNaN(op) ? 100 : op)) / 100;

    const rgbaMatch = colorStr.match(
      /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/i
    );
    if (rgbaMatch) {
      const r = parseInt(rgbaMatch[1], 10);
      const g = parseInt(rgbaMatch[2], 10);
      const b = parseInt(rgbaMatch[3], 10);
      const existingA =
        rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1;
      const finalA = Math.max(0, Math.min(1, existingA * alphaFactor));
      return `rgba(${r}, ${g}, ${b}, ${parseFloat(finalA.toFixed(3))})`;
    }

    let cleanHex = colorStr.replace("#", "").trim();
    if (cleanHex.length === 3) {
      cleanHex = cleanHex
        .split("")
        .map(c => c + c)
        .join("");
    }
    if (cleanHex.length === 6) {
      const r = parseInt(cleanHex.substring(0, 2), 16) || 0;
      const g = parseInt(cleanHex.substring(2, 4), 16) || 0;
      const b = parseInt(cleanHex.substring(4, 6), 16) || 0;
      if (alphaFactor === 1) {
        return `#${cleanHex}`;
      }
      return `rgba(${r}, ${g}, ${b}, ${parseFloat(alphaFactor.toFixed(3))})`;
    } else if (cleanHex.length === 8) {
      const r = parseInt(cleanHex.substring(0, 2), 16) || 0;
      const g = parseInt(cleanHex.substring(2, 4), 16) || 0;
      const b = parseInt(cleanHex.substring(4, 6), 16) || 0;
      const existingA = (parseInt(cleanHex.substring(6, 8), 16) || 0) / 255;
      const finalA = Math.max(0, Math.min(1, existingA * alphaFactor));
      if (finalA === 1) {
        return `#${cleanHex.substring(0, 6)}`;
      }
      return `rgba(${r}, ${g}, ${b}, ${parseFloat(finalA.toFixed(3))})`;
    }

    return colorStr;
  }

  function randomHex() {
    return (
      "#" +
      Math.floor(Math.random() * 0xffffff)
        .toString(16)
        .padStart(6, "0")
    );
  }

  /* ── CSS generation ── */
  function buildGradientCSS(
    type = gradientType,
    gradAngle = angle,
    stopsList = stops
  ) {
    const sorted = [...stopsList].sort((a, b) => a.pos - b.pos);
    const stopsStr = sorted
      .map(s => {
        const opacity = s.opacity !== undefined ? s.opacity : 100;
        const color = parseColorToRgba(s.color, opacity);
        return `${color} ${s.pos}%`;
      })
      .join(", ");

    if (type === "linear") {
      return `linear-gradient(${gradAngle}deg, ${stopsStr})`;
    }
    if (type === "radial") {
      return `radial-gradient(circle, ${stopsStr})`;
    }
    return `conic-gradient(from ${gradAngle}deg, ${stopsStr})`;
  }

  function buildCSSOutput() {
    const grad = buildGradientCSS();
    return `.gradient {\n  background: ${grad};\n}`;
  }

  /* ── Canvas rendering with transparent alpha channel ── */
  function renderGradientToCanvas(canvas, options = {}) {
    const width = options.width || 1200;
    const height = options.height || 675;
    const type = options.gradientType || gradientType;
    const gradAngle = options.angle !== undefined ? options.angle : angle;
    const stopsList = options.stops || stops;

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // Ensure transparent base: clearRect prevents any default white or opaque background
    ctx.clearRect(0, 0, width, height);

    const sorted = [...stopsList].sort((a, b) => a.pos - b.pos);
    let gradient;

    if (type === "linear") {
      const rad = (gradAngle * Math.PI) / 180;
      const dx = Math.sin(rad);
      const dy = -Math.cos(rad);
      const length = Math.abs(width * dx) + Math.abs(height * dy);
      const cx = width / 2;
      const cy = height / 2;

      const x0 = cx - (dx * length) / 2;
      const y0 = cy - (dy * length) / 2;
      const x1 = cx + (dx * length) / 2;
      const y1 = cy + (dy * length) / 2;

      gradient = ctx.createLinearGradient(x0, y0, x1, y1);
    } else if (type === "radial") {
      const cx = width / 2;
      const cy = height / 2;
      const radius = Math.sqrt(cx * cx + cy * cy);
      gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    } else {
      const cx = width / 2;
      const cy = height / 2;
      const startAngleRad = ((gradAngle - 90) * Math.PI) / 180;
      if (typeof ctx.createConicGradient === "function") {
        gradient = ctx.createConicGradient(startAngleRad, cx, cy);
      } else {
        const radius = Math.sqrt(cx * cx + cy * cy);
        gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      }
    }

    sorted.forEach(s => {
      const opacity = s.opacity !== undefined ? s.opacity : 100;
      const color = parseColorToRgba(s.color, opacity);
      const offset = Math.max(0, Math.min(1, s.pos / 100));
      gradient.addColorStop(offset, color);
    });

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    return canvas;
  }

  function exportPNG(canvasOrOptions) {
    let canvas;
    if (
      typeof HTMLCanvasElement !== "undefined" &&
      canvasOrOptions instanceof HTMLCanvasElement
    ) {
      canvas = canvasOrOptions;
    } else {
      if (typeof document !== "undefined") {
        canvas = document.createElement("canvas");
        renderGradientToCanvas(canvas, canvasOrOptions || {});
      } else {
        return null;
      }
    }

    // Always use "image/png" to preserve full alpha channel transparency (not JPEG)
    return canvas.toDataURL("image/png");
  }

  function downloadGradientPNG(filename = "gradient.png") {
    if (typeof document === "undefined") return null;
    const dataUrl = exportPNG();
    if (!dataUrl) return null;

    const link = document.createElement("a");
    link.download = filename;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      if (link.parentNode) {
        link.parentNode.removeChild(link);
      }
    }, 100);

    return dataUrl;
  }

  /* ── DOM logic ── */
  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", () => {
      const typeButtons = document.querySelectorAll(".btn-type");
      const angleCard = document.getElementById("angleCard");
      const angleSlider = document.getElementById("angleSlider");
      const angleInput = document.getElementById("angleInput");
      const anglePresets = document.querySelectorAll(".btn-angle");
      const stopsContainer = document.getElementById("stopsContainer");
      const addStopBtn = document.getElementById("addStopBtn");
      const presetGrid = document.getElementById("presetGrid");
      const previewBox = document.getElementById("previewBox");
      const codeBlock = document.getElementById("codeBlock");
      const copyBtn = document.getElementById("copyBtn");
      const randomizeBtn = document.getElementById("randomizeBtn");
      const downloadBtn = document.getElementById("downloadBtn");
      const exportBtn = document.getElementById("exportBtn");
      const toast = document.getElementById("toast");

      let toastTimer;
      function showToast(msg) {
        if (!toast) return;
        toast.textContent = msg;
        toast.classList.add("visible");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove("visible"), 1800);
      }

      function renderStops() {
        if (!stopsContainer) return;
        stopsContainer.innerHTML = stops
          .map(
            (s, i) => `
            <div class="stop-row" data-index="${i}">
              <input type="color" value="${s.color.startsWith("#") ? s.color.substring(0, 7) : "#6366f1"}" data-field="color" data-index="${i}" aria-label="Stop ${i + 1} color" />
              <div class="stop-opacity-group" title="Opacity percentage">
                <input type="number" class="stop-opacity" value="${s.opacity !== undefined ? s.opacity : 100}" min="0" max="100"
                       data-field="opacity" data-index="${i}" aria-label="Stop ${i + 1} opacity percentage" />
                <span class="stop-pos-unit">%</span>
              </div>
              <div class="stop-pos-group" title="Position percentage">
                <input type="number" class="stop-pos" value="${s.pos}" min="0" max="100"
                       data-field="pos" data-index="${i}" aria-label="Stop ${i + 1} position percentage" />
                <span class="stop-pos-unit">%</span>
              </div>
              ${stops.length > 2 ? `<button class="stop-remove" data-index="${i}" title="Remove" aria-label="Remove stop ${i + 1}">✕</button>` : ""}
            </div>`
          )
          .join("");

        stopsContainer.querySelectorAll('input[type="color"]').forEach(el => {
          el.addEventListener("input", e => {
            stops[parseInt(e.target.dataset.index, 10)].color = e.target.value;
            update();
          });
        });

        stopsContainer.querySelectorAll(".stop-opacity").forEach(el => {
          el.addEventListener("input", e => {
            const v = Math.min(
              100,
              Math.max(0, parseInt(e.target.value, 10) || 0)
            );
            stops[parseInt(e.target.dataset.index, 10)].opacity = v;
            update();
          });
        });

        stopsContainer.querySelectorAll(".stop-pos").forEach(el => {
          el.addEventListener("input", e => {
            const v = Math.min(
              100,
              Math.max(0, parseInt(e.target.value, 10) || 0)
            );
            stops[parseInt(e.target.dataset.index, 10)].pos = v;
            update();
          });
        });

        stopsContainer.querySelectorAll(".stop-remove").forEach(btn => {
          btn.addEventListener("click", () => {
            stops.splice(parseInt(btn.dataset.index, 10), 1);
            renderStops();
            update();
          });
        });
      }

      function renderPresets() {
        if (!presetGrid) return;
        presetGrid.innerHTML = PRESETS.map((p, i) => {
          const sorted = [...p.stops].sort((a, b) => a.pos - b.pos);
          const grad = `linear-gradient(${p.angle}deg, ${sorted.map(s => `${parseColorToRgba(s.color, s.opacity !== undefined ? s.opacity : 100)} ${s.pos}%`).join(", ")})`;
          return `<div class="preset-swatch" data-index="${i}" style="background:${grad}" title="Preset ${i + 1}"></div>`;
        }).join("");

        presetGrid.querySelectorAll(".preset-swatch").forEach(el => {
          el.addEventListener("click", () => {
            const p = PRESETS[parseInt(el.dataset.index, 10)];
            stops = p.stops.map(s => ({ ...s }));
            angle = p.angle;
            if (angleSlider) angleSlider.value = angle;
            if (angleInput) angleInput.value = angle;
            renderStops();
            update();
            showToast("Preset applied!");
          });
        });
      }

      function update() {
        const grad = buildGradientCSS(gradientType, angle, stops);
        if (previewBox) previewBox.style.background = grad;
        if (codeBlock) codeBlock.textContent = buildCSSOutput();
      }

      typeButtons.forEach(btn => {
        btn.addEventListener("click", () => {
          typeButtons.forEach(b => b.classList.remove("active"));
          btn.classList.add("active");
          gradientType = btn.dataset.type;
          if (angleCard) {
            angleCard.style.display = gradientType === "radial" ? "none" : "";
          }
          update();
        });
      });

      if (angleSlider) {
        angleSlider.addEventListener("input", e => {
          angle = parseInt(e.target.value, 10);
          if (angleInput) angleInput.value = angle;
          angleSlider.setAttribute("aria-valuetext", `${angle} degrees`);
          anglePresets.forEach(b =>
            b.classList.toggle(
              "active",
              parseInt(b.dataset.angle, 10) === angle
            )
          );
          update();
        });
      }

      if (angleInput) {
        angleInput.addEventListener("input", e => {
          angle = Math.min(360, Math.max(0, parseInt(e.target.value, 10) || 0));
          if (angleSlider) {
            angleSlider.value = angle;
            angleSlider.setAttribute("aria-valuetext", `${angle} degrees`);
          }
          anglePresets.forEach(b =>
            b.classList.toggle(
              "active",
              parseInt(b.dataset.angle, 10) === angle
            )
          );
          update();
        });
      }

      anglePresets.forEach(btn => {
        btn.addEventListener("click", () => {
          angle = parseInt(btn.dataset.angle, 10);
          if (angleSlider) {
            angleSlider.value = angle;
            angleSlider.setAttribute("aria-valuetext", `${angle} degrees`);
          }
          if (angleInput) angleInput.value = angle;
          anglePresets.forEach(b => b.classList.remove("active"));
          btn.classList.add("active");
          update();
        });
      });

      if (addStopBtn) {
        addStopBtn.addEventListener("click", () => {
          const lastPos = stops[stops.length - 1].pos;
          const newPos = Math.min(100, lastPos + 10);
          stops.push({ color: randomHex(), opacity: 100, pos: newPos });
          renderStops();
          update();
        });
      }

      if (copyBtn) {
        copyBtn.addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(codeBlock.textContent);
            copyBtn.classList.add("copied");
            copyBtn.textContent = "✓ Copied";
            showToast("Copied to clipboard!");
            setTimeout(() => {
              copyBtn.classList.remove("copied");
              copyBtn.textContent = "📋 Copy";
            }, 2000);
          } catch {
            showToast("Copy failed — select manually");
          }
        });
      }

      const triggerDownload = () => {
        downloadGradientPNG();
        showToast("PNG exported with transparency!");
      };

      if (downloadBtn) {
        downloadBtn.addEventListener("click", triggerDownload);
      }
      if (exportBtn) {
        exportBtn.addEventListener("click", triggerDownload);
      }

      if (randomizeBtn) {
        randomizeBtn.addEventListener("click", () => {
          const count = 2 + Math.floor(Math.random() * 3);
          stops = Array.from({ length: count }, (_, i) => ({
            color: randomHex(),
            opacity: 100,
            pos: Math.round((i / (count - 1)) * 100),
          }));
          angle = Math.floor(Math.random() * 360);
          if (angleSlider) angleSlider.value = angle;
          if (angleInput) angleInput.value = angle;
          renderStops();
          update();
          showToast("Random gradient!");
        });
      }

      renderPresets();
      renderStops();
      update();
    });
  }

  return {
    parseColorToRgba,
    buildGradientCSS,
    renderGradientToCanvas,
    exportPNG,
    downloadGradientPNG,
    PRESETS,
  };
});
