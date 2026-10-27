const doc = typeof document !== "undefined" ? document : null;
const win = typeof window !== "undefined" ? window : null;

const inputText = doc ? doc.getElementById("inputText") : null;
const outputText = doc ? doc.getElementById("outputText") : null;
const decodeBtn = doc ? doc.getElementById("decodeBtn") : null;
const encodeBtn = doc ? doc.getElementById("encodeBtn") : null;
const clearBtn = doc ? doc.getElementById("clearBtn") : null;
const copyBtn = doc ? doc.getElementById("copyBtn") : null;
const playBtn = doc ? doc.getElementById("playBtn") : null;
const speedSlider = doc ? doc.getElementById("speedSlider") : null;
const speedValue = doc ? doc.getElementById("speedValue") : null;

const engine =
  typeof MorseEngine !== "undefined"
    ? MorseEngine
    : typeof require === "function"
      ? require("./morseEngine.js")
      : null;

let audioContext = null;
let isPlaying = false;
let activeOscillator = null;
let activeGain = null;
let waitTimeoutId = null;
let playbackSessionId = 0;
let resolveActiveTone = null;
let resolveActiveWait = null;

function getWpm() {
  if (!speedSlider) return 20;
  const value = Number(speedSlider.value);
  return Math.max(5, Math.min(60, value || 20));
}

function updateSpeed() {
  if (speedValue) {
    speedValue.textContent = `${getWpm()} WPM`;
  }
}

function encodeText() {
  if (!inputText || !outputText) return;
  const text = inputText.value.trim();

  if (!text) {
    outputText.value = "";
    return;
  }

  outputText.value = engine ? engine.textToMorse(text) : "";
}

function decodeText() {
  if (!inputText || !outputText) return;
  const morse = inputText.value.trim();

  if (!morse) {
    outputText.value = "";
    return;
  }

  outputText.value = engine ? engine.morseToText(morse) : "";
}

function clearFields() {
  stopAudio();
  if (inputText) inputText.value = "";
  if (outputText) outputText.value = "";
  updateCopyButton("📋 Copy");
}

async function copyOutput() {
  if (!outputText) return;
  const value = outputText.value.trim();

  if (!value) return;

  try {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(value);
      updateCopyButton("✓ Copied!");

      setTimeout(() => {
        updateCopyButton("📋 Copy");
      }, 1200);
    }
  } catch {
    updateCopyButton("Copy failed");

    setTimeout(() => {
      updateCopyButton("📋 Copy");
    }, 1200);
  }
}

function updateCopyButton(text) {
  if (copyBtn) {
    copyBtn.textContent = text;
  }
}

function stopAudio() {
  isPlaying = false;
  playbackSessionId++;

  if (activeOscillator) {
    try {
      activeOscillator.stop();
    } catch {
      // Ignored if oscillator already stopped
    }
    try {
      activeOscillator.disconnect();
    } catch {
      // Ignored if already disconnected
    }
    activeOscillator = null;
  }

  if (activeGain) {
    try {
      if (
        audioContext &&
        activeGain.gain &&
        typeof activeGain.gain.cancelScheduledValues === "function"
      ) {
        activeGain.gain.cancelScheduledValues(audioContext.currentTime);
        activeGain.gain.setValueAtTime(0, audioContext.currentTime);
      }
    } catch {
      // Ignored if context closed or scheduled values cannot be cancelled
    }
    try {
      activeGain.disconnect();
    } catch {
      // Ignored if already disconnected
    }
    activeGain = null;
  }

  if (waitTimeoutId) {
    clearTimeout(waitTimeoutId);
    waitTimeoutId = null;
  }

  if (resolveActiveTone) {
    const res = resolveActiveTone;
    resolveActiveTone = null;
    res();
  }

  if (resolveActiveWait) {
    const res = resolveActiveWait;
    resolveActiveWait = null;
    res();
  }

  if (audioContext && audioContext.state !== "closed") {
    try {
      audioContext.suspend().catch(() => {});
    } catch {
      // Ignored if suspend throws synchronously
    }
  }

  if (playBtn) {
    playBtn.disabled = false;
    playBtn.textContent = "▶ Play";
  }
}

async function playMorse() {
  if (!outputText) return;
  const morse = outputText.value.trim();

  if (!morse || isPlaying) return;

  isPlaying = true;
  if (playBtn) {
    playBtn.disabled = true;
    playBtn.textContent = "■ Playing...";
  }

  const currentSession = ++playbackSessionId;

  try {
    if (!audioContext) {
      const AudioCtx =
        (win && (win.AudioContext || win.webkitAudioContext)) ||
        (typeof globalThis !== "undefined" &&
          (globalThis.AudioContext || globalThis.webkitAudioContext));
      if (AudioCtx) {
        audioContext = new AudioCtx();
      }
    }

    if (audioContext && audioContext.state === "suspended") {
      await audioContext.resume();
    }

    if (!audioContext || !isPlaying || playbackSessionId !== currentSession) {
      return;
    }

    const sequence = engine
      ? engine.generateAudioSequence(morse, getWpm(), 650)
      : [];

    for (const item of sequence) {
      if (!isPlaying || playbackSessionId !== currentSession) break;

      if (item.type === "tone") {
        await beep(audioContext, item.durationMs, item.frequency);
      } else {
        await wait(item.durationMs);
      }

      if (!isPlaying || playbackSessionId !== currentSession) break;
    }
  } finally {
    if (playbackSessionId === currentSession) {
      isPlaying = false;
      if (playBtn) {
        playBtn.disabled = false;
        playBtn.textContent = "▶ Play";
      }
    }
  }
}

function beep(context, duration, frequency) {
  return new Promise(resolve => {
    if (!isPlaying) {
      resolve();
      return;
    }

    let oscillator = null;
    let gain = null;

    try {
      oscillator = context.createOscillator();
      gain = context.createGain();
    } catch {
      resolve();
      return;
    }

    activeOscillator = oscillator;
    activeGain = gain;
    resolveActiveTone = resolve;

    oscillator.type = "sine";
    oscillator.frequency.value = frequency;

    const now = context.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.15, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration / 1000);

    oscillator.connect(gain);
    gain.connect(context.destination);

    const onEnded = () => {
      if (activeOscillator === oscillator) {
        activeOscillator = null;
        activeGain = null;
      }
      if (resolveActiveTone === resolve) {
        resolveActiveTone = null;
      }
      resolve();
    };

    oscillator.addEventListener("ended", onEnded, { once: true });

    try {
      oscillator.start();
      oscillator.stop(now + duration / 1000);
    } catch {
      onEnded();
    }
  });
}

function wait(ms) {
  return new Promise(resolve => {
    if (!isPlaying) {
      resolve();
      return;
    }

    resolveActiveWait = resolve;
    waitTimeoutId = setTimeout(() => {
      waitTimeoutId = null;
      if (resolveActiveWait === resolve) {
        resolveActiveWait = null;
      }
      resolve();
    }, ms);
  });
}

if (speedSlider) speedSlider.addEventListener("input", updateSpeed);
if (encodeBtn) encodeBtn.addEventListener("click", encodeText);
if (decodeBtn) decodeBtn.addEventListener("click", decodeText);
if (clearBtn) clearBtn.addEventListener("click", clearFields);
if (copyBtn) copyBtn.addEventListener("click", copyOutput);
if (playBtn) playBtn.addEventListener("click", playMorse);

if (speedSlider && speedValue) {
  updateSpeed();
}

if (win) {
  win.addEventListener("pagehide", stopAudio);
  win.addEventListener("beforeunload", stopAudio);
  win.stopMorseAudio = stopAudio;
  win.MorseStudio = {
    stopAudio,
    playMorse,
    beep,
    wait,
    getAudioState: () => ({
      isPlaying,
      activeOscillator,
      activeGain,
      audioContext,
      waitTimeoutId,
      playbackSessionId,
    }),
    setAudioContext: ctx => {
      audioContext = ctx;
    },
    setIsPlaying: val => {
      isPlaying = val;
    },
    setActiveNodes: (osc, gain) => {
      activeOscillator = osc;
      activeGain = gain;
    },
  };
}

if (doc) {
  doc.addEventListener("visibilitychange", () => {
    if (doc.hidden) {
      stopAudio();
    }
  });

  doc.addEventListener("click", e => {
    const backBtn =
      e.target &&
      e.target.closest &&
      e.target.closest(
        ".cradle-back-home, [data-cradle-back-to-home], .back-home, #backHome"
      );
    if (backBtn) {
      stopAudio();
    }
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    stopAudio,
    playMorse,
    beep,
    wait,
    getAudioState: () => ({
      isPlaying,
      activeOscillator,
      activeGain,
      audioContext,
      waitTimeoutId,
      playbackSessionId,
    }),
    setAudioContext: ctx => {
      audioContext = ctx;
    },
    setIsPlaying: val => {
      isPlaying = val;
    },
    setActiveNodes: (osc, gain) => {
      activeOscillator = osc;
      activeGain = gain;
    },
  };
}
