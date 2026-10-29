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
