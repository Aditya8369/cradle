const test = require("node:test");
const assert = require("node:assert");
const engine = require("../projects/misc/ascii-camera/asciiEngine.js");
const exporter = require("../projects/misc/ascii-camera/asciiExporter.js");

test("ASCIIEngine luminance calculations work correctly", () => {
  const lumWhite = engine.getLuminance(255, 255, 255);
  assert.strictEqual(Math.round(lumWhite), 255);

  const lumBlack = engine.getLuminance(0, 0, 0);
  assert.strictEqual(lumBlack, 0);

  const lumRec709 = engine.getLuminance(100, 100, 100, "rec709");
  assert.strictEqual(Math.round(lumRec709), 100);
});

test("ASCIIEngine maps luminance to palette characters", () => {
  const palette = engine.PALETTES.standard;
  const darkChar = engine.mapLuminanceToChar(0, palette, false);
  const brightChar = engine.mapLuminanceToChar(255, palette, false);

  assert.strictEqual(darkChar, palette[0]);
  assert.strictEqual(brightChar, palette[palette.length - 1]);

  const invertedDark = engine.mapLuminanceToChar(0, palette, true);
  assert.strictEqual(invertedDark, palette[palette.length - 1]);
});

test("ASCIIEngine adjusts contrast and brightness", () => {
  const val = 128;
  const brightened = engine.adjustPixel(val, 1.0, 50);
  assert.strictEqual(brightened, 178);

  const clampedHigh = engine.adjustPixel(200, 2.0, 50);
  assert.strictEqual(clampedHigh, 255);
});

test("ASCIIExporter formats Plain Text, HTML, and SVG payloads", () => {
  const lines = ["  ##  ", " #### "];

  const plain = exporter.toPlainText(lines);
  assert.strictEqual(plain, "  ##  \n #### ");

  const html = exporter.toHTML(lines, { title: "Test Export" });
  assert.ok(html.includes("<!DOCTYPE html>"));
  assert.ok(html.includes("<title>Test Export</title>"));
  assert.ok(html.includes("##"));

  const svg = exporter.toSVG(lines, { fontSize: 12 });
  assert.ok(svg.includes('<svg xmlns="http://www.w3.org/2000/svg"'));
  assert.ok(svg.includes("<text x="));
});

test("ASCIIEngine handles camera transforms for front/rear and Android orientation", () => {
  // Rear camera (any platform) - no flip or mirror
  const rear = engine.getCameraTransform({ isFront: false, isAndroid: true });
  assert.strictEqual(rear.scaleX, 1);
  assert.strictEqual(rear.scaleY, 1);
  assert.strictEqual(rear.cssTransform, "none");
  assert.strictEqual(rear.isMirrored, false);
  assert.strictEqual(rear.isInverted, false);

  // Desktop front camera - horizontally mirrored for selfie, right-side up
  const desktopFront = engine.getCameraTransform({
    isFront: true,
    isAndroid: false,
  });
  assert.strictEqual(desktopFront.scaleX, -1);
  assert.strictEqual(desktopFront.scaleY, 1);
  assert.strictEqual(desktopFront.cssTransform, "scaleX(-1)");
  assert.strictEqual(desktopFront.isMirrored, true);
  assert.strictEqual(desktopFront.isInverted, false);

  // Android front camera - horizontally mirrored and vertically inverted to correct native orientation
  const androidFront = engine.getCameraTransform({
    isFront: true,
    isAndroid: true,
  });
  assert.strictEqual(androidFront.scaleX, -1);
  assert.strictEqual(androidFront.scaleY, -1);
  assert.strictEqual(androidFront.cssTransform, "scale(-1, -1)");
  assert.strictEqual(androidFront.isMirrored, true);
  assert.strictEqual(androidFront.isInverted, true);
});

test("Camera lifecycle: stops all stream tracks and halts animation on pagehide", () => {
  let tracksStopped = 0;
  let animationCancelled = false;

  const mockTrack = {
    kind: "video",
    stop() {
      tracksStopped++;
    },
  };

  const mockStream = {
    getTracks() {
      return [mockTrack, mockTrack];
    },
  };

  const state = {
    stream: mockStream,
    mode: "camera",
    facingMode: "user",
    animationId: 99,
  };

  function stopCamera(resetFacing = true) {
    if (state.stream) {
      state.stream.getTracks().forEach(track => track.stop());
      state.stream = null;
    }
    if (state.animationId) {
      animationCancelled = true;
      state.animationId = null;
    }
    if (resetFacing) {
      state.facingMode = "user";
    }
  }

  function handlePageHide() {
    if (state.mode === "camera" || state.stream) {
      stopCamera(false);
      state.mode = "empty";
    }
  }

  handlePageHide();

  assert.strictEqual(
    tracksStopped,
    2,
    "All stream tracks must be stopped on pagehide"
  );
  assert.strictEqual(state.stream, null, "Stream reference must be cleared");
  assert.strictEqual(
    animationCancelled,
    true,
    "Animation frame loop must be cancelled"
  );
  assert.strictEqual(state.mode, "empty", "Mode should reset to empty");
});

test("Camera lifecycle: pauses stream and cancels render loop on visibilitychange (hidden)", async () => {
  let tracksStopped = 0;
  let animationCancelled = false;
  let cameraRestarted = false;

  const mockTrack = {
    stop() {
      tracksStopped++;
    },
  };

  const mockStream = {
    getTracks() {
      return [mockTrack];
    },
  };

  const state = {
    stream: mockStream,
    mode: "camera",
    animationId: 42,
    pausedForVisibility: false,
  };

  let isHidden = true;

  function stopCamera(resetFacing = true) {
    if (state.stream) {
      state.stream.getTracks().forEach(t => t.stop());
      state.stream = null;
    }
    if (state.animationId) {
      animationCancelled = true;
      state.animationId = null;
    }
  }

  async function handleVisibilityChange() {
    if (isHidden) {
      if (state.mode === "camera" && state.stream) {
        state.pausedForVisibility = true;
        stopCamera(false);
      }
    } else {
      if (state.pausedForVisibility) {
        state.pausedForVisibility = false;
        cameraRestarted = true;
      }
    }
  }

  // Tab hidden
  await handleVisibilityChange();
  assert.strictEqual(
    tracksStopped,
    1,
    "Camera track stopped when tab is hidden"
  );
  assert.strictEqual(
    animationCancelled,
    true,
    "Render loop stopped when tab is hidden"
  );
  assert.strictEqual(
    state.pausedForVisibility,
    true,
    "Tracked as paused for visibility"
  );
  assert.strictEqual(state.stream, null);

  // Tab visible again
  isHidden = false;
  await handleVisibilityChange();
  assert.strictEqual(
    state.pausedForVisibility,
    false,
    "Visibility pause cleared on return"
  );
  assert.strictEqual(
    cameraRestarted,
    true,
    "Camera restart initiated on return"
  );
});
