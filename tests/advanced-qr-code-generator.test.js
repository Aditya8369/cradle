import { test } from "node:test";
import assert from "node:assert/strict";
import QREngine from "../projects/productivity/advanced-qr-code-generator/qrEngine.js";

test("isValidHex validates hex colors correctly", () => {
  assert.equal(QREngine.isValidHex("#FFF"), true);
  assert.equal(QREngine.isValidHex("#2B2D42"), true);
  assert.equal(QREngine.isValidHex("2B2D42"), false);
  assert.equal(QREngine.isValidHex("#GGGGGG"), false);
});

test("sanitizeOptions returns fallback defaults for invalid parameters", () => {
  const sanitized = QREngine.sanitizeOptions({
    fgColor: "invalid",
    size: -50,
    errorLevel: "Z",
  });

  assert.equal(sanitized.fgColor, "#2B2D42");
  assert.equal(sanitized.size, 100);
  assert.equal(sanitized.errorLevel, "M");
});

test("buildConfigPayload formats valid QRCodeStyling config payload", () => {
  const payload = QREngine.buildConfigPayload({
    text: "https://cradle.dev",
    fgColor: "#000000",
    bgColor: "#FFFFFF",
    size: 400,
    errorLevel: "H",
  });

  assert.equal(payload.data, "https://cradle.dev");
  assert.equal(payload.width, 400);
  assert.equal(payload.dotsOptions.color, "#000000");
  assert.equal(payload.backgroundOptions.color, "#FFFFFF");
  assert.equal(payload.qrOptions.errorCorrectionLevel, "H");
});

test("getDownloadFilename generates descriptive filenames with valid extensions", () => {
  assert.equal(QREngine.getDownloadFilename(), "qr-code.png");
  assert.equal(QREngine.getDownloadFilename("qr-code", "png"), "qr-code.png");
  assert.equal(QREngine.getDownloadFilename("qr-code", "svg"), "qr-code.svg");
  assert.equal(
    QREngine.getDownloadFilename("custom-qr", "png"),
    "custom-qr.png"
  );
  assert.equal(
    QREngine.getDownloadFilename("custom-qr.png", "png"),
    "custom-qr.png"
  );
  assert.equal(
    QREngine.getDownloadFilename("custom-qr.svg", "svg"),
    "custom-qr.svg"
  );
  assert.equal(QREngine.getDownloadFilename("", "png"), "qr-code.png");
  assert.equal(QREngine.getDownloadFilename(null, "svg"), "qr-code.svg");
  assert.equal(
    QREngine.getDownloadFilename("invalid/name:code*", "png"),
    "invalid-name-code-.png"
  );
  assert.equal(
    QREngine.getDownloadFilename("qr-code", "unknown"),
    "qr-code.png"
  );
});

test("triggerDownload creates an anchor element with download attribute and clicks it", () => {
  let clicked = false;
  let appended = false;
  let removed = false;
  const createdAttr = {};

  const mockAnchor = {
    setAttribute(name, val) {
      createdAttr[name] = val;
    },
    click() {
      clicked = true;
    },
    parentNode: null,
  };

  const mockDoc = {
    createElement(tag) {
      if (tag === "a") return mockAnchor;
      return {};
    },
    body: {
      appendChild(node) {
        appended = true;
        node.parentNode = this;
      },
      removeChild(node) {
        removed = true;
        node.parentNode = null;
      },
    },
  };

  const success = QREngine.triggerDownload(
    "blob:https://example.com/mock-id",
    "qr-code.png",
    mockDoc
  );
  assert.equal(success, true);
  assert.equal(mockAnchor.download, "qr-code.png");
  assert.equal(mockAnchor.href, "blob:https://example.com/mock-id");
  assert.equal(createdAttr.download, "qr-code.png");
  assert.equal(appended, true);
  assert.equal(clicked, true);
});

test("triggerDownload returns false when document is unavailable", () => {
  const success = QREngine.triggerDownload("data:test", "qr-code.png", {});
  assert.equal(success, false);
});

test("isValidLogoType validates PNG, JPEG, SVG mime types", () => {
  assert.equal(QREngine.isValidLogoType("image/png"), true);
  assert.equal(QREngine.isValidLogoType("image/jpeg"), true);
  assert.equal(QREngine.isValidLogoType("image/svg+xml"), true);
  assert.equal(QREngine.isValidLogoType("application/x-msdownload"), false);
  assert.equal(QREngine.isValidLogoType("text/html"), false);
});

test("validateLogoSignature validates logo magic bytes", async () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const pngCheck = await QREngine.validateLogoSignature(png);
  assert.equal(pngCheck.valid, true);

  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
  const jpegCheck = await QREngine.validateLogoSignature(jpeg);
  assert.equal(jpegCheck.valid, true);

  const svg = new TextEncoder().encode("<svg viewBox='0 0 10 10'></svg>");
  const svgCheck = await QREngine.validateLogoSignature(svg);
  assert.equal(svgCheck.valid, true);

  const invalid = new Uint8Array([0x00, 0x11, 0x22, 0x33]);
  const invalidCheck = await QREngine.validateLogoSignature(invalid);
  assert.equal(invalidCheck.valid, false);
});
