const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SOURCE_PATH = path.resolve(
  __dirname,
  "..",
  "src",
  "components",
  "themeToggle.js"
);

const SOURCE = fs
  .readFileSync(SOURCE_PATH, "utf-8")
  .replace(/\bexport\s+default\s+/g, "")
  .replace(/\bexport\s+/g, "");

class MockElement {
  constructor(tagName, ownerDocument = null) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.id = "";
    this.textContent = "";
    this.attributes = new Map();
    this.listeners = new Map();
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }

  dispatchEvent(event) {
    event.target = this;

    for (const handler of this.listeners.get(event.type) || []) {
      handler(event);
    }

    return !event.defaultPrevented;
  }

  click() {
    this.dispatchEvent({ type: "click", preventDefault() {} });
  }

  focus() {
    if (this.ownerDocument) this.ownerDocument.activeElement = this;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }
}

class MockDocument {
  constructor() {
    this.elements = new Map();
    this.listeners = new Map();
    this.documentElement = new MockElement("html", this);
    this.body = new MockElement("body", this);
    this.activeElement = null;
  }

  register(element) {
    this.elements.set(element.id, element);
    return element;
  }

  getElementById(id) {
    return this.elements.get(id) || null;
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }
}

class MockStorage {
  constructor(initial = {}) {
    this.values = new Map(Object.entries(initial));
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }

  clear() {
    this.values.clear();
  }
}

class MockKeyboardEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.key = init.key;
    this.bubbles = Boolean(init.bubbles);
    this.cancelable = Boolean(init.cancelable);
    this.defaultPrevented = false;
  }

  preventDefault() {
    this.defaultPrevented = true;
  }
}

function createEnvironment({ savedTheme = null } = {}) {
  const document = new MockDocument();
  const storage = new MockStorage(savedTheme ? { theme: savedTheme } : {});
  const button = new MockElement("button", document);
  button.id = "theme-toggle";
  button.setAttribute("aria-label", "Switch to dark theme");
  button.setAttribute("aria-pressed", "false");
  document.register(button);

  const context = vm.createContext({
    document,
    localStorage: storage,
    KeyboardEvent: MockKeyboardEvent,
  });

  const api = vm.runInContext(
    `${SOURCE}\n({ initThemeToggle, applyTheme });`,
    context,
    { filename: "themeToggle.js" }
  );

  return { ...api, document, storage, button };
}

function pressKey(button, key) {
  const event = new MockKeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  });

  button.dispatchEvent(event);
  return event;
}

test("theme toggle button receives focus when tabbed to", () => {
  const { document, button } = createEnvironment();

  button.focus();

  assert.equal(document.activeElement, button);
});

test("toggles theme state when pressing Enter", () => {
  const { initThemeToggle, document, button } = createEnvironment();

  initThemeToggle();
  button.focus();

  const event = pressKey(button, "Enter");

  assert.equal(event.defaultPrevented, true);
  assert.equal(document.documentElement.getAttribute("data-theme"), "dark");
  assert.equal(button.getAttribute("aria-pressed"), "true");
  assert.equal(button.getAttribute("aria-label"), "Switch to light theme");
});

test("toggles theme state when pressing Space without scrolling", () => {
  const { initThemeToggle, document, button } = createEnvironment();

  initThemeToggle();
  button.focus();

  const event = pressKey(button, " ");

  assert.equal(event.defaultPrevented, true);
  assert.equal(document.documentElement.getAttribute("data-theme"), "dark");
  assert.equal(button.getAttribute("aria-pressed"), "true");
});

test("updates ARIA attributes correctly after multiple keyboard toggles", () => {
  const { initThemeToggle, document, button } = createEnvironment();

  initThemeToggle();
  button.focus();

  pressKey(button, "Enter");
  assert.equal(document.documentElement.getAttribute("data-theme"), "dark");
  assert.equal(button.getAttribute("aria-label"), "Switch to light theme");
  assert.equal(button.getAttribute("aria-pressed"), "true");

  pressKey(button, " ");
  assert.equal(document.documentElement.getAttribute("data-theme"), "light");
  assert.equal(button.getAttribute("aria-label"), "Switch to dark theme");
  assert.equal(button.getAttribute("aria-pressed"), "false");
});

test("persists the user theme choice on keyboard toggle", () => {
  const { initThemeToggle, storage, button } = createEnvironment();

  initThemeToggle();

  pressKey(button, "Enter");
  assert.equal(storage.getItem("theme"), "dark");

  pressKey(button, "Enter");
  assert.equal(storage.getItem("theme"), "light");
});

test("loads the saved theme preference on initialization", () => {
  const { initThemeToggle, document, button } = createEnvironment({
    savedTheme: "dark",
  });

  initThemeToggle();

  assert.equal(document.documentElement.getAttribute("data-theme"), "dark");
  assert.equal(button.getAttribute("aria-pressed"), "true");
  assert.equal(button.getAttribute("aria-label"), "Switch to light theme");
});

test("toggles the theme and persists it when clicked", () => {
  const { initThemeToggle, document, storage, button } = createEnvironment();

  initThemeToggle();
  button.click();

  assert.equal(document.documentElement.getAttribute("data-theme"), "dark");
  assert.equal(storage.getItem("theme"), "dark");
  assert.equal(button.getAttribute("aria-pressed"), "true");
});

test("applyTheme updates the document and button attributes directly", () => {
  const { applyTheme, document, button } = createEnvironment();

  applyTheme("dark");
  assert.equal(document.documentElement.getAttribute("data-theme"), "dark");
  assert.equal(button.getAttribute("aria-pressed"), "true");
  assert.equal(button.getAttribute("aria-label"), "Switch to light theme");

  applyTheme("light");
  assert.equal(document.documentElement.getAttribute("data-theme"), "light");
  assert.equal(button.getAttribute("aria-pressed"), "false");
  assert.equal(button.getAttribute("aria-label"), "Switch to dark theme");
});
