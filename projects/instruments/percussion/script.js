const pads = document.querySelectorAll(".pad");
const status = document.getElementById("status");

const activePointers = new Map();
const pressedKeyboardKeys = new Set();
let audioBlocked = false;

function showAudioBlocked() {
  audioBlocked = true;
  if (status) {
    status.classList.add("audio-blocked");
    status.textContent = "Audio blocked by browser. Click to enable sound.";
    status.style.cursor = "pointer";
    status.title = "Click to enable sound";
  }
}

function clearAudioBlocked() {
  if (!audioBlocked) return;
  audioBlocked = false;
  if (status) {
    status.classList.remove("audio-blocked");
    status.style.cursor = "";
    status.title = "";
    status.textContent = "Ready";
  }
}

function showSampleError(err) {
  if (status) {
    status.classList.add("audio-blocked");
    status.setAttribute("role", "alert");
    status.textContent = `Sample Error: ${err.message || err}`;
    status.style.cursor = "pointer";
    status.title = "Click to retry or dismiss error";
  }
}

if (typeof PercussionEngine.setOnBlockedCallback === "function") {
  PercussionEngine.setOnBlockedCallback(blocked => {
    if (blocked) showAudioBlocked();
    else clearAudioBlocked();
  });
}

if (typeof PercussionEngine.onSampleError === "function") {
  PercussionEngine.onSampleError(err => {
    showSampleError(err);
  });
}

if (status) {
  status.addEventListener("click", () => {
    if (audioBlocked && typeof PercussionEngine.resumeAudio === "function") {
      PercussionEngine.resumeAudio();
    }
  });
}

function getPadElement(padId) {
  return [...pads].find(pad => pad.dataset.pad === padId);
}

function setPadPressed(pad, pressed) {
  if (!pad) {
    return;
  }

  pad.classList.toggle("active", pressed);
  pad.setAttribute("aria-pressed", String(pressed));

  if (pressed) {
    window.setTimeout(() => {
      pad.classList.remove("active");
      pad.setAttribute("aria-pressed", "false");
    }, 120);
  }
}

function hitPad(pad) {
  if (!pad) {
    return;
  }

  const padId = pad.dataset.pad;

  if (!PercussionEngine.playPad(padId)) {
    return;
  }

  setPadPressed(pad, true);

  if (status) {
    status.textContent = `Playing ${PercussionEngine.getPadLabel(padId)}`;

    window.clearTimeout(hitPad._resetTimer);
    hitPad._resetTimer = window.setTimeout(() => {
      status.textContent = "Ready";
    }, 500);
  }
}

pads.forEach(pad => {
  setPadPressed(pad, false);

  pad.addEventListener("pointerdown", event => {
    event.preventDefault();

    activePointers.set(event.pointerId, pad);

    if (pad.setPointerCapture) {
      pad.setPointerCapture(event.pointerId);
    }

    hitPad(pad);
  });

  pad.addEventListener("pointerup", event => {
    activePointers.delete(event.pointerId);
  });

  pad.addEventListener("pointercancel", event => {
    activePointers.delete(event.pointerId);
  });
});

document.addEventListener("keydown", event => {
  const padId = PercussionEngine.getPadFromKey(event.key);

  if (!padId || pressedKeyboardKeys.has(event.code)) {
    return;
  }

  event.preventDefault();

  pressedKeyboardKeys.add(event.code);

  const pad = getPadElement(padId);

  hitPad(pad);
});

document.addEventListener("keyup", event => {
  pressedKeyboardKeys.delete(event.code);
});

window.addEventListener("blur", () => {
  pressedKeyboardKeys.clear();
  activePointers.clear();
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    return;
  }

  pressedKeyboardKeys.clear();
  activePointers.clear();
});
