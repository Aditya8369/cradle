import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const scriptContent = fs.readFileSync("script.js", "utf8");

// Extract the keyboard shortcut listener and helper functions from script.js
const shortcutCodeMatch = scriptContent.match(
  /\/\/ Keyboard Shortcuts Listeners[\s\S]*?(?=document\.addEventListener\("DOMContentLoaded")/
);

assert.ok(
  shortcutCodeMatch,
  "Must find keyboard shortcuts listener block in script.js"
);

function createEnvironment({ activeElement = null } = {}) {
  let themeToggled = false;
  let filtersCleared = false;
  let searchFocused = false;
  let searchSelected = false;
  let modalOpened = false;
  let modalClosed = false;
  let modalVisible = false;

  const searchInput = {
    tagName: "INPUT",
    focus() {
      searchFocused = true;
    },
    select() {
      searchSelected = true;
    },
  };

  const shortcutsModal = {
    classList: {
      contains(cls) {
        return cls === "visible" && modalVisible;
      },
    },
    getAttribute(attr) {
      if (attr === "aria-hidden") return modalVisible ? "false" : "true";
      return null;
    },
  };

  const themeToggleEl = {
    click() {
      themeToggled = true;
    },
  };

  const docListeners = {};
  const doc = {
    activeElement,
    getElementById(id) {
      if (id === "search") return searchInput;
      if (id === "shortcuts-modal") return shortcutsModal;
      if (id === "themeToggle") return themeToggleEl;
      return null;
    },
    addEventListener(type, fn) {
      docListeners[type] = docListeners[type] || [];
      docListeners[type].push(fn);
    },
  };

  const sandbox = {
    document: doc,
    window: {
      CradleThemeToggle: {
        toggleTheme() {
          themeToggled = true;
        },
      },
    },
    searchInput,
    shortcutsModal,
    openShortcutsModal() {
      modalOpened = true;
      modalVisible = true;
    },
    closeShortcutsModal() {
      modalClosed = true;
      modalVisible = false;
    },
    clearFilters() {
      filtersCleared = true;
    },
    Boolean,
  };

  vm.runInNewContext(shortcutCodeMatch[0], sandbox);

  function dispatchKeydown(eventProps) {
    const event = {
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      target: doc.activeElement,
      ...eventProps,
    };

    for (const listener of docListeners.keydown || []) {
      listener(event);
    }
    return event;
  }

  return {
    dispatchKeydown,
    setActiveElement(el) {
      doc.activeElement = el;
    },
    setModalVisible(v) {
      modalVisible = v;
    },
    getState: () => ({
      themeToggled,
      filtersCleared,
      searchFocused,
      searchSelected,
      modalOpened,
      modalClosed,
    }),
  };
}

test("ignores 't', '?', and 'Escape' when focus is inside an INPUT element", () => {
  const inputEl = { tagName: "INPUT" };
  const env = createEnvironment({ activeElement: inputEl });

  const tEvent = env.dispatchKeydown({ key: "t" });
  assert.equal(tEvent.defaultPrevented, false);
  assert.equal(env.getState().themeToggled, false);

  const questionEvent = env.dispatchKeydown({ key: "?" });
  assert.equal(questionEvent.defaultPrevented, false);
  assert.equal(env.getState().modalOpened, false);

  const escEvent = env.dispatchKeydown({ key: "Escape" });
  assert.equal(env.getState().filtersCleared, false);
});

test("ignores 't', '?', and 'Escape' when focus is inside a TEXTAREA or contenteditable element", () => {
  const textareaEl = { tagName: "TEXTAREA" };
  const envTextarea = createEnvironment({ activeElement: textareaEl });

  envTextarea.dispatchKeydown({ key: "t" });
  assert.equal(envTextarea.getState().themeToggled, false);

  const editableEl = { tagName: "DIV", isContentEditable: true };
  const envEditable = createEnvironment({ activeElement: editableEl });

  envEditable.dispatchKeydown({ key: "t" });
  assert.equal(envEditable.getState().themeToggled, false);
});

test("toggles theme when 't' is pressed outside interactive elements", () => {
  const env = createEnvironment({ activeElement: null });

  const tEvent = env.dispatchKeydown({ key: "t" });
  assert.equal(tEvent.defaultPrevented, true);
  assert.equal(env.getState().themeToggled, true);
});

test("does not toggle theme when modifier keys are held (e.g. Ctrl+T, Cmd+T, Alt+T)", () => {
  const env = createEnvironment({ activeElement: null });

  env.dispatchKeydown({ key: "t", ctrlKey: true });
  assert.equal(env.getState().themeToggled, false);

  env.dispatchKeydown({ key: "t", metaKey: true });
  assert.equal(env.getState().themeToggled, false);

  env.dispatchKeydown({ key: "t", altKey: true });
  assert.equal(env.getState().themeToggled, false);
});

test("toggles shortcuts modal when '?' is pressed outside interactive elements", () => {
  const env = createEnvironment({ activeElement: null });

  const qEvent = env.dispatchKeydown({ key: "?" });
  assert.equal(qEvent.defaultPrevented, true);
  assert.equal(env.getState().modalOpened, true);
});

test("closes shortcuts modal when 'Escape' is pressed even if an input was focused", () => {
  const inputEl = { tagName: "INPUT" };
  const env = createEnvironment({ activeElement: inputEl });
  env.setModalVisible(true);

  env.dispatchKeydown({ key: "Escape" });
  assert.equal(env.getState().modalClosed, true);
  assert.equal(env.getState().filtersCleared, false);
});

test("clears filters on 'Escape' when outside interactive elements", () => {
  const env = createEnvironment({ activeElement: null });

  env.dispatchKeydown({ key: "Escape" });
  assert.equal(env.getState().filtersCleared, true);
});

test("focuses search bar on Ctrl+K regardless of active element", () => {
  const inputEl = { tagName: "INPUT" };
  const env = createEnvironment({ activeElement: inputEl });

  const kEvent = env.dispatchKeydown({ key: "k", ctrlKey: true });
  assert.equal(kEvent.defaultPrevented, true);
  assert.equal(env.getState().searchFocused, true);
  assert.equal(env.getState().searchSelected, true);
});
