const test = require("node:test");
const assert = require("node:assert/strict");

const {
  detectSignature,
  normalizeMime,
  isMimeAllowed,
  isSignatureMatchingMime,
  validateBlob,
  validateImageBlob,
  validateAudioBlob,
} = require("../src/utils/mediaValidator.js");

/* ----------------------------------------------------
   Signature Detection
---------------------------------------------------- */

test("detectSignature detects JPEG magic bytes", () => {
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  const result = detectSignature(bytes);
  assert.ok(result);
  assert.equal(result.mimeType, "image/jpeg");
  assert.equal(result.extension, "jpg");
  assert.equal(result.category, "image");
});

test("detectSignature detects PNG magic bytes", () => {
  const bytes = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
  ]);
  const result = detectSignature(bytes);
  assert.ok(result);
  assert.equal(result.mimeType, "image/png");
  assert.equal(result.extension, "png");
  assert.equal(result.category, "image");
});

test("detectSignature detects GIF87a and GIF89a", () => {
  const gif87 = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]);
  const gif89 = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);

  assert.equal(detectSignature(gif87)?.mimeType, "image/gif");
  assert.equal(detectSignature(gif89)?.mimeType, "image/gif");
});

test("detectSignature detects WebP image", () => {
  // RIFF .... WEBP
  const bytes = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
  ]);
  const result = detectSignature(bytes);
  assert.ok(result);
  assert.equal(result.mimeType, "image/webp");
  assert.equal(result.extension, "webp");
});

test("detectSignature detects WAV audio", () => {
  // RIFF .... WAVE
  const bytes = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
  ]);
  const result = detectSignature(bytes);
  assert.ok(result);
  assert.equal(result.mimeType, "audio/wav");
  assert.equal(result.category, "audio");
});

test("detectSignature detects MP3 ID3 header and frame sync", () => {
  const id3 = new Uint8Array([0x49, 0x44, 0x33, 0x03, 0x00]);
  assert.equal(detectSignature(id3)?.mimeType, "audio/mpeg");

  const sync = new Uint8Array([0xff, 0xfb, 0x90, 0x64]);
  assert.equal(detectSignature(sync)?.mimeType, "audio/mpeg");
});

test("detectSignature detects OGG audio", () => {
  const bytes = new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0x00, 0x02]);
  assert.equal(detectSignature(bytes)?.mimeType, "audio/ogg");
});

test("detectSignature detects FLAC audio", () => {
  const bytes = new Uint8Array([0x66, 0x4c, 0x61, 0x43, 0x00, 0x00]);
  assert.equal(detectSignature(bytes)?.mimeType, "audio/flac");
});

test("detectSignature detects MP4 / M4A audio via ftyp box", () => {
  const bytes = new Uint8Array([
    0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20,
  ]);
  assert.equal(detectSignature(bytes)?.mimeType, "audio/mp4");
});

test("detectSignature detects SVG markup", () => {
  const enc = new TextEncoder();
  const svg1 = enc.encode('<svg width="100" height="100"></svg>');
  const svg2 = enc.encode('<?xml version="1.0"?><svg></svg>');

  assert.equal(detectSignature(svg1)?.mimeType, "image/svg+xml");
  assert.equal(detectSignature(svg2)?.mimeType, "image/svg+xml");
});

test("detectSignature rejects unknown binary headers or executable files", () => {
  const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]); // MZ executable
  assert.equal(detectSignature(exe), null);

  const script = new TextEncoder().encode("#!/bin/bash\necho hello");
  assert.equal(detectSignature(script), null);
});

/* ----------------------------------------------------
   MIME Normalization and Matching
---------------------------------------------------- */

test("normalizeMime normalizes and resolves aliases", () => {
  assert.equal(normalizeMime("image/jpg"), "image/jpeg");
  assert.equal(normalizeMime("IMAGE/JPEG; charset=utf-8"), "image/jpeg");
  assert.equal(normalizeMime("audio/mp3"), "audio/mpeg");
  assert.equal(normalizeMime("audio/x-m4a"), "audio/mp4");
});

test("isMimeAllowed supports direct matches and wildcards", () => {
  assert.ok(isMimeAllowed("image/jpeg", ["image/jpeg", "image/png"]));
  assert.ok(isMimeAllowed("image/jpeg", ["image/*"]));
  assert.ok(isMimeAllowed("audio/mpeg", ["audio/*"]));
  assert.ok(!isMimeAllowed("text/html", ["image/*", "audio/*"]));
});

test("isSignatureMatchingMime detects matching and mismatching types", () => {
  assert.ok(isSignatureMatchingMime("image/jpeg", "image/jpeg"));
  assert.ok(isSignatureMatchingMime("image/jpeg", "image/jpg"));
  assert.ok(isSignatureMatchingMime("image/png", "image/*"));
  assert.ok(!isSignatureMatchingMime("image/png", "image/jpeg"));
  assert.ok(!isSignatureMatchingMime("application/octet-stream", "image/jpeg"));
});

/* ----------------------------------------------------
   Blob Validation
---------------------------------------------------- */

test("validateBlob rejects empty input", async () => {
  const result = await validateBlob(null);
  assert.equal(result.valid, false);
});

test("validateBlob rejects empty 0-byte buffer", async () => {
  const empty = new Uint8Array(0);
  const result = await validateBlob(empty);
  assert.equal(result.valid, false);
});

test("validateBlob rejects spoofed MIME types (extension renamed executable)", async () => {
  // Pretends to be image/jpeg, but content is an executable
  const fakeJpeg = {
    type: "image/jpeg",
    size: 256,
    arrayBuffer: async () =>
      new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]).buffer,
  };

  const result = await validateImageBlob(fakeJpeg);
  assert.equal(result.valid, false);
  assert.ok(result.error);
});

test("validateBlob rejects mismatched file signature (e.g. PNG declared as JPEG)", async () => {
  const pngAsJpeg = {
    type: "image/jpeg",
    size: 100,
    arrayBuffer: async () =>
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer,
  };

  const result = await validateBlob(pngAsJpeg, {
    allowedMimes: ["image/jpeg"],
  });
  assert.equal(result.valid, false);
});

test("validateAudioBlob accepts genuine audio and rejects non-audio", async () => {
  const wavFile = {
    type: "audio/wav",
    size: 500,
    arrayBuffer: async () =>
      new Uint8Array([
        0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56,
        0x45,
      ]).buffer,
  };

  const validResult = await validateAudioBlob(wavFile);
  assert.equal(validResult.valid, true);
  assert.equal(validResult.detectedMime, "audio/wav");

  const textFileAsAudio = {
    type: "audio/mpeg",
    size: 100,
    arrayBuffer: async () => new TextEncoder().encode("Not an audio file").buffer,
  };

  const invalidResult = await validateAudioBlob(textFileAsAudio);
  assert.equal(invalidResult.valid, false);
});

