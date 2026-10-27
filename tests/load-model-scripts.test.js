import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALLOWED_MODEL_HOSTS,
  KNOWN_MODEL_INTEGRITY,
  SRI_HASH_PATTERN,
  DEFAULT_SCRIPT_TIMEOUT_MS,
  isValidSriHash,
  registerModelIntegrity,
  getRegisteredIntegrity,
  isAllowedOrigin,
  validateScriptUrl,
  loadScriptAsync,
  loadScriptsSequentially,
  createSandboxedExecutionFrame,
  loadScriptIsolated,
  snapshotGlobalKeys,
  detectGlobalPollution,
  initializeClassifierDependencies,
  _resetLoaderState,
} from "../src/components/ui/loadModelScripts.js";

// Helper to mock DOM elements for controlled loading tests
function createMockDom() {
  const elements = [];
  const scripts = [];

  const mockHead = {
    appendChild(el) {
      elements.push(el);
      if (el.tagName === "SCRIPT") scripts.push(el);
      el.parentNode = mockHead;
      return el;
    },
    removeChild(el) {
      const idx = elements.indexOf(el);
      if (idx !== -1) elements.splice(idx, 1);
      const sIdx = scripts.indexOf(el);
      if (sIdx !== -1) scripts.splice(sIdx, 1);
      el.parentNode = null;
      return el;
    },
  };

  const mockDoc = {
    head: mockHead,
    body: mockHead,
    documentElement: mockHead,
    createElement(tagName) {
      const tag = tagName.toUpperCase();
      const el = {
        tagName: tag,
        src: "",
        async: true,
        crossOrigin: "",
        integrity: "",
        parentNode: null,
        style: {},
        attributes: {},
        setAttribute(k, v) {
          this.attributes[k] = String(v);
        },
        getAttribute(k) {
          return this.attributes[k] ?? null;
        },
        remove() {
          if (this.parentNode) {
            this.parentNode.removeChild(this);
          }
        },
        onload: null,
        onerror: null,
      };
      return el;
    },
    querySelector(selector) {
      const match = selector.match(/script\[src="([^"]+)"\]/);
      if (!match) return null;
      const targetSrc = match[1];
      return scripts.find(s => s.src === targetSrc) || null;
    },
  };

  return { mockDoc, mockHead, elements, scripts };
}

test("Origin Allowlist: validates trusted CDN origins", () => {
  assert.ok(
    isAllowedOrigin("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0")
  );
  assert.ok(isAllowedOrigin("https://unpkg.com/lodash@4.17.21/lodash.min.js"));
  assert.ok(
    isAllowedOrigin(
      "https://cdnjs.cloudflare.com/ajax/libs/tone/14.8.49/Tone.js"
    )
  );
  assert.ok(isAllowedOrigin("https://huggingface.co/models/bert-base/model.json"));
});

test("Origin Allowlist: rejects untrusted, spoofed, and insecure origins", () => {
  assert.equal(isAllowedOrigin("http://cdn.jsdelivr.net/script.js"), false);
  assert.equal(isAllowedOrigin("https://evil-jsdelivr.net/script.js"), false);
  assert.equal(isAllowedOrigin("https://unpkg.com.attacker.com/script.js"), false);
  assert.equal(isAllowedOrigin("https://malicious.org/script.js"), false);
  assert.equal(isAllowedOrigin("javascript:alert(1)"), false);
  assert.equal(isAllowedOrigin("data:text/javascript,alert(1)"), false);
  assert.equal(isAllowedOrigin("vbscript:MsgBox"), false);
  assert.equal(isAllowedOrigin(""), false);
  assert.equal(isAllowedOrigin(null), false);
  assert.equal(isAllowedOrigin(undefined), false);
});

test("validateScriptUrl: parses valid trusted URLs and rejects disallowed protocols", () => {
  const valid = validateScriptUrl(
    "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs"
  );
  assert.equal(valid.hostname, "cdn.jsdelivr.net");
  assert.equal(valid.protocol, "https:");

  assert.throws(
    () => validateScriptUrl("http://cdn.jsdelivr.net/npm/@tensorflow/tfjs"),
    /Insecure protocol/i
  );
  assert.throws(
    () => validateScriptUrl("javascript:console.log(1)"),
    /Disallowed pseudo-protocol/i
  );
  assert.throws(
    () => validateScriptUrl("data:text/javascript,console.log(1)"),
    /Disallowed pseudo-protocol/i
  );
  assert.throws(
    () => validateScriptUrl("https://untrusted-origin.com/model.js"),
    /Untrusted script origin/i
  );
  assert.throws(() => validateScriptUrl(""), /Script source must be/i);
  assert.throws(() => validateScriptUrl(null), /Script source must be/i);
});

test("validateScriptUrl: supports custom allowed origins when explicitly configured", () => {
  const customUrl = "https://trusted-partner.org/model.js";
  assert.throws(
    () => validateScriptUrl(customUrl),
    /Untrusted script origin/i
  );

  const allowed = validateScriptUrl(customUrl, {
    customAllowedOrigins: ["trusted-partner.org"],
  });
  assert.equal(allowed.hostname, "trusted-partner.org");
});

test("Integrity Verification: validates SRI hash syntax correctly", () => {
  assert.ok(
    isValidSriHash(
      "sha384-vE8hbVJ4lezako5rlvE7bY0BVzWlFhZncPlckrqNwcUQpVtgbENTgZ8TBbnPjZre"
    )
  );
  assert.ok(isValidSriHash("sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU="));
  assert.ok(isValidSriHash("sha512-AA=="));

  assert.equal(isValidSriHash("md5-invalid"), false);
  assert.equal(isValidSriHash("sha1-invalid"), false);
  assert.equal(isValidSriHash("not-a-hash"), false);
  assert.equal(isValidSriHash(""), false);
  assert.equal(isValidSriHash(null), false);
});

test("Integrity Registry: resolves pre-registered and dynamic model hashes", () => {
  _resetLoaderState();

  const tfjsHash = getRegisteredIntegrity(
    "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0"
  );
  assert.equal(
    tfjsHash,
    "sha384-vE8hbVJ4lezako5rlvE7bY0BVzWlFhZncPlckrqNwcUQpVtgbENTgZ8TBbnPjZre"
  );

  const mobilenetHash = getRegisteredIntegrity(
    "https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.1"
  );
  assert.equal(
    mobilenetHash,
    "sha384-oBAqwJ0tv9zzKlbIZyBhhXlEvU/PMrSMqDyOHlEZVC8xWHx4yPySuS7vRikRcYFq"
  );

  const customUrl = "https://cdn.jsdelivr.net/npm/my-custom-model@1.0.0/model.js";
  assert.equal(getRegisteredIntegrity(customUrl), null);

  const customHash =
    "sha384-vE8hbVJ4lezako5rlvE7bY0BVzWlFhZncPlckrqNwcUQpVtgbENTgZ8TBbnPjZre";
  registerModelIntegrity(customUrl, customHash);
  assert.equal(getRegisteredIntegrity(customUrl), customHash);

  assert.throws(
    () => registerModelIntegrity(customUrl, "invalid-hash"),
    /Invalid SRI hash/i
  );
});

test("Controlled Loading: enforces SRI hash requirement on remote scripts", async () => {
  _resetLoaderState();
  const unknownRemote = "https://unpkg.com/unknown-pkg@1.0.0/index.js";

  await assert.rejects(
    async () => {
      await loadScriptAsync(unknownRemote, { requireIntegrity: true });
    },
    /Subresource Integrity \(SRI\) hash is required/i
  );
});

test("Controlled Loading: attaches integrity and crossorigin attributes", async () => {
  _resetLoaderState();
  const { mockDoc, mockHead, scripts } = createMockDom();
  const originalDoc = globalThis.document;
  globalThis.document = mockDoc;

  try {
    const knownUrl = "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0";
    const loadPromise = loadScriptAsync(knownUrl);

    // Verify injected script node
    assert.equal(scripts.length, 1);
    const injected = scripts[0];
    assert.equal(injected.src, knownUrl);
    assert.equal(
      injected.integrity,
      KNOWN_MODEL_INTEGRITY[knownUrl]
    );
    assert.equal(injected.crossOrigin, "anonymous");

    // Simulate successful load
    injected.onload();
    const result = await loadPromise;
    assert.equal(result.src, knownUrl);
    assert.equal(result.integrity, KNOWN_MODEL_INTEGRITY[knownUrl]);
  } finally {
    globalThis.document = originalDoc;
  }
});

test("Controlled Loading: in-flight request deduplication prevents duplicate injection", async () => {
  _resetLoaderState();
  const { mockDoc, scripts } = createMockDom();
  const originalDoc = globalThis.document;
  globalThis.document = mockDoc;

  try {
    const targetUrl = "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0";

    const promise1 = loadScriptAsync(targetUrl);
    const promise2 = loadScriptAsync(targetUrl);

    // Only one script tag should have been appended to the DOM
    assert.equal(scripts.length, 1);

    scripts[0].onload();

    const [res1, res2] = await Promise.all([promise1, promise2]);
    assert.equal(res1.src, targetUrl);
    assert.equal(res2.src, targetUrl);
  } finally {
    globalThis.document = originalDoc;
  }
});

test("Controlled Loading: cleans up DOM and rejects on script load failure", async () => {
  _resetLoaderState();
  const { mockDoc, scripts, elements } = createMockDom();
  const originalDoc = globalThis.document;
  globalThis.document = mockDoc;

  try {
    const targetUrl = "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0";
    const loadPromise = loadScriptAsync(targetUrl);

    assert.equal(scripts.length, 1);
    scripts[0].onerror(new Error("Network connection lost"));

    await assert.rejects(async () => {
      await loadPromise;
    }, /Failed to load script/i);

    // The failing script tag must be removed from the DOM
    assert.equal(elements.length, 0);
  } finally {
    globalThis.document = originalDoc;
  }
});

test("Controlled Loading: handles timeout by cleaning up DOM and throwing TimeoutError", async () => {
  _resetLoaderState();
  const { mockDoc, scripts, elements } = createMockDom();
  const originalDoc = globalThis.document;
  globalThis.document = mockDoc;

  try {
    const targetUrl = "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0";
    const loadPromise = loadScriptAsync(targetUrl, { timeoutMs: 50 });

    assert.equal(scripts.length, 1);

    await assert.rejects(async () => {
      await loadPromise;
    }, err => err.name === "TimeoutError" && /exceeded 50ms/i.test(err.message));

    // Element must have been removed from DOM on timeout
    assert.equal(elements.length, 0);
  } finally {
    globalThis.document = originalDoc;
  }
});

test("loadScriptsSequentially: loads multiple scripts in strict deterministic order", async () => {
  _resetLoaderState();
  const { mockDoc, scripts } = createMockDom();
  const originalDoc = globalThis.document;
  globalThis.document = mockDoc;

  try {
    const tfjs = "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0";
    const mobilenet =
      "https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.1";

    const seqPromise = loadScriptsSequentially([tfjs, mobilenet]);

    // First script is injected
    assert.equal(scripts.length, 1);
    assert.equal(scripts[0].src, tfjs);

    // Trigger load of first script
    scripts[0].onload();

    // Small delay to allow microtask to queue second script
    await new Promise(r => setTimeout(r, 10));

    // Second script is injected
    assert.equal(scripts.length, 2);
    assert.equal(scripts[1].src, mobilenet);

    scripts[1].onload();

    const results = await seqPromise;
    assert.equal(results.length, 2);
    assert.equal(results[0].src, tfjs);
    assert.equal(results[1].src, mobilenet);
  } finally {
    globalThis.document = originalDoc;
  }
});

test("Isolation Strategy: creates sandboxed iframe omitting allow-same-origin", () => {
  const { mockDoc, elements } = createMockDom();
  const originalDoc = globalThis.document;
  globalThis.document = mockDoc;

  try {
    const frameHandle = createSandboxedExecutionFrame({
      title: "Isolated AI Test",
    });

    assert.ok(frameHandle.iframe);
    assert.equal(
      frameHandle.iframe.getAttribute("sandbox"),
      "allow-scripts"
    );
    assert.equal(
      frameHandle.iframe.getAttribute("aria-hidden"),
      "true"
    );
    assert.equal(elements.length, 1);

    frameHandle.destroy();
    assert.equal(elements.length, 0);
  } finally {
    globalThis.document = originalDoc;
  }
});

test("Isolation Strategy: detects global namespace pollution", () => {
  const mockGlobal = {
    existingA: 1,
    existingB: "hello",
  };

  const snapshot = snapshotGlobalKeys(mockGlobal);
  assert.equal(detectGlobalPollution(snapshot, mockGlobal).length, 0);

  // Script executes and introduces untrusted globals
  mockGlobal.untrustedInjectedGlobal = true;
  mockGlobal.leakedModelVariable = { weights: [1, 2, 3] };

  const pollution = detectGlobalPollution(snapshot, mockGlobal);
  assert.deepEqual(pollution.sort(), [
    "leakedModelVariable",
    "untrustedInjectedGlobal",
  ]);
});
