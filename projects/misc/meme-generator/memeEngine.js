function wrapText(ctx, text, maxWidth) {
  if (!text) return [];

  const words = text.toUpperCase().split(" ");
  const lines = [];
  let currentLine = words[0] || "";

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const width = ctx.measureText(`${currentLine} ${word}`).width;

    if (width < maxWidth) {
      currentLine += ` ${word}`;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }

  lines.push(currentLine);
  return lines;
}

function getDefaultMemeOptions() {
  return {
    topText: "WHEN THE BUILD PASSES",
    bottomText: "FIRST TRY WITHOUT BUGS",
    fontSize: 36,
    textColor: "#FFFFFF",
    strokeColor: "#000000",
    strokeWidth: 4,
    fontFamily: "Impact, sans-serif",
  };
}

function renderMemeCanvas(canvas, imgElement, options = {}) {
  if (!canvas || !imgElement) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const opts = { ...getDefaultMemeOptions(), ...options };

  canvas.width = imgElement.naturalWidth || imgElement.width || 600;
  canvas.height = imgElement.naturalHeight || imgElement.height || 400;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(imgElement, 0, 0, canvas.width, canvas.height);

  ctx.fillStyle = opts.textColor;
  ctx.strokeStyle = opts.strokeColor;
  ctx.lineWidth = opts.strokeWidth;
  ctx.textAlign = "center";
  ctx.font = `${opts.fontSize}px ${opts.fontFamily}`;

  const padding = 20;
  const maxWidth = canvas.width - padding * 2;
  const lineHeight = opts.fontSize * 1.2;

  if (opts.topText) {
    ctx.textBaseline = "top";

    const topLines = wrapText(ctx, opts.topText, maxWidth);

    topLines.forEach((line, index) => {
      const y = padding + index * lineHeight;
      ctx.strokeText(line, canvas.width / 2, y);
      ctx.fillText(line, canvas.width / 2, y);
    });
  }

  if (opts.bottomText) {
    ctx.textBaseline = "bottom";

    const bottomLines = wrapText(ctx, opts.bottomText, maxWidth);

    bottomLines.forEach((line, index) => {
      const y =
        canvas.height - padding - (bottomLines.length - 1 - index) * lineHeight;

      ctx.strokeText(line, canvas.width / 2, y);
      ctx.fillText(line, canvas.width / 2, y);
    });
  }
}

function isCanvasTainted(canvas) {
  if (!canvas) return false;

  try {
    const ctx = canvas.getContext("2d");

    if (!ctx) return false;

    ctx.getImageData(0, 0, 1, 1);
    return false;
  } catch (error) {
    if (error instanceof DOMException && error.name === "SecurityError") {
      return true;
    }

    return false;
  }
}

function exportMemeCanvas(canvas) {
  if (!canvas) {
    throw new Error("Meme canvas is unavailable.");
  }

  if (isCanvasTainted(canvas)) {
    throw new Error(
      "This meme contains a cross-origin image that cannot be exported. Upload a local image or use an image hosted with CORS enabled."
    );
  }

  return canvas.toDataURL("image/png");
}


function validateImageSignature(bytes) {
  if (!bytes || bytes.length < 3) return { valid: false, mimeType: null };
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return { valid: true, mimeType: "image/jpeg" };
  }
  if (
    b.length >= 8 &&
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  ) {
    return { valid: true, mimeType: "image/png" };
  }
  if (
    b.length >= 6 &&
    b[0] === 0x47 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x38 &&
    (b[4] === 0x37 || b[4] === 0x39) &&
    b[5] === 0x61
  ) {
    return { valid: true, mimeType: "image/gif" };
  }
  if (
    b.length >= 12 &&
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  ) {
    return { valid: true, mimeType: "image/webp" };
  }
  return { valid: false, mimeType: null };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    wrapText,
    getDefaultMemeOptions,
    renderMemeCanvas,
    isCanvasTainted,
    exportMemeCanvas,
    validateImageSignature,
  };
}

if (typeof window !== "undefined") {
  window.MemeEngine = {
    wrapText,
    getDefaultMemeOptions,
    renderMemeCanvas,
    isCanvasTainted,
    exportMemeCanvas,
    validateImageSignature,
  };
}
