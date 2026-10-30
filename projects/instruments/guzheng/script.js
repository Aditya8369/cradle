const strings = document.querySelectorAll(".string");
const status = document.getElementById("status");

let isPointerDown = false;
let lastPluckedNote = null;
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


if (typeof GuzhengEngine.onSampleError === "function") {
  GuzhengEngine.onSampleError(err => {
    showAudioBlocked();
    if (status) {
      status.textContent = `Sample Error: ${err.message}`;
    }
  });
}

if (typeof GuzhengEngine.setOnBlockedCallback === "function") {
  GuzhengEngine.setOnBlockedCallback(blocked => {
    if (blocked) showAudioBlocked();
    else clearAudioBlocked();
  });
}

if (status) {
  status.addEventListener("click", () => {
    if (audioBlocked && typeof GuzhengEngine.resumeAudio === "function") {
      GuzhengEngine.resumeAudio();
    }
  });
}

function getStringElement(note) {
  return [...strings].find(s => s.dataset.note === note);
}

function setStringPlucked(stringEl) {
  if (!stringEl) {
    return;
  }

  stringEl.classList.add("active");

  window.setTimeout(() => {
    stringEl.classList.remove("active");
  }, 220);
}

function pluck(stringEl) {
  if (!stringEl) {
    return;
  }

  const note = stringEl.dataset.note;

  if (!GuzhengEngine.pluckString(note)) {
    return;
  }

  setStringPlucked(stringEl);

  if (status) {
    status.textContent = `Playing ${note.replace("#", "♯")}`;

    window.clearTimeout(pluck._resetTimer);
    pluck._resetTimer = window.setTimeout(() => {
      status.textContent = "Ready";
    }, 600);
  }
}

function pluckAtPoint(clientX, clientY) {
  const el = document.elementFromPoint(clientX, clientY);
  const stringEl = el ? el.closest(".string") : null;

  if (!stringEl) {
    return;
  }

  const note = stringEl.dataset.note;

  if (note === lastPluckedNote) {
    return;
  }

  lastPluckedNote = note;
  pluck(stringEl);
}

strings.forEach(stringEl => {
  stringEl.addEventListener("pointerdown", event => {
    event.preventDefault();
    isPointerDown = true;
    lastPluckedNote = null;
    pluckAtPoint(event.clientX, event.clientY);
  });
});

document.addEventListener("pointermove", event => {
  if (!isPointerDown) {
    return;
  }

  pluckAtPoint(event.clientX, event.clientY);
});

document.addEventListener("pointerup", () => {
  isPointerDown = false;
  lastPluckedNote = null;
});

document.addEventListener("pointercancel", () => {
  isPointerDown = false;
  lastPluckedNote = null;
});

document.addEventListener("keydown", event => {
  const note = GuzhengEngine.getNoteFromKey(event.key);

  if (!note || pressedKeyboardKeys.has(event.code)) {
    return;
  }

  event.preventDefault();

  pressedKeyboardKeys.add(event.code);

  pluck(getStringElement(note));
});

document.addEventListener("keyup", event => {
  pressedKeyboardKeys.delete(event.code);
});

window.addEventListener("blur", () => {
  pressedKeyboardKeys.clear();
  isPointerDown = false;
  lastPluckedNote = null;
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    return;
  }

  pressedKeyboardKeys.clear();
  isPointerDown = false;
  lastPluckedNote = null;
});
