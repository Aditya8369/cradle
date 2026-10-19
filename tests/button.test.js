const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const BUTTON_SOURCE = fs.readFileSync(
  path.join(__dirname, "../src/components/ui/Button/Button.js"),
  "utf8"
);

function createElementFactory() {
  const elements = [];
  const listeners = new Map();

  function createElement(tagName = "div") {
    const attributes = new Map();
    const children = [];
    const elementListeners = new Map();

    const element = {
      tagName: String(tagName).toUpperCase(),
      nodeType: 1,
      id: "",
      className: "",
      innerHTML: "",
      textContent: "",
      type: "",
      href: "",
      target: "",
      rel: "",
      disabled: false,
      dataset: {},
      childNodes: children,
      children,
      style: {},
      classList: {
        add(...names) {
          const current = element.className.split(/\s+/).filter(Boolean);
          for (const name of names) {
            if (name && !current.includes(name)) current.push(name);
          }
          element.className = current.join(" ");
        },
        contains(name) {
          return element.className.split(/\s+/).includes(name);
        },
      },
      setAttribute(name, value) {
        attributes.set(name, String(value));
        if (name === "aria-label") element.ariaLabel = String(value);
        if (name === "aria-busy") element.ariaBusy = String(value);
      },
      getAttribute(name) {
        return attributes.has(name) ? attributes.get(name) : null;
      },
      hasAttribute(name) {
        return attributes.has(name);
      },
      appendChild(child) {
        children.push(child);
        return child;
      },
      insertBefore(child, before) {
        const index = children.indexOf(before);
        if (index === -1) children.unshift(child);
        else children.splice(index, 0, child);
        return child;
      },
      replaceChild(next, previous) {
        const index = children.indexOf(previous);
        if (index !== -1) children[index] = next;
        return previous;
      },
      addEventListener(type, handler) {
        if (!elementListeners.has(type)) elementListeners.set(type, []);
        elementListeners.get(type).push(handler);
      },
      dispatchEvent(event) {
        for (const handler of elementListeners.get(event.type) || []) {
          handler.call(element, event);
        }
        return true;
      },
      _listeners: elementListeners,
    };

    elements.push(element);
    return element;
  }

  function createTextNode(text) {
    return {
      nodeType: 3,
      textContent: String(text),
    };
  }

  return { elements, createElement, createTextNode };
}

function loadButton(autoUpgradeElements = []) {
  const factory = createElementFactory();
  const head = factory.createElement("head");
  const document = {
    readyState: "loading",
    head,
    createElement: factory.createElement,
    createTextNode: factory.createTextNode,
    getElementById(id) {
      return factory.elements.find(element => element.id === id) || null;
    },
    querySelectorAll(selector) {
      if (selector === "[data-cradle-btn]") return autoUpgradeElements;
      return [];
    },
    addEventListener(type, handler) {
      if (type === "DOMContentLoaded") this._domReady = handler;
    },
    _domReady: null,
  };

  const window = { document };
  const context = {
    window,
    document,
    Node: { TEXT_NODE: 3 },
    console,
  };

  vm.runInNewContext(BUTTON_SOURCE, context, {
    filename: "Button.js",
  });

  return { button: window.CradleButton, document, factory };
}

test("CradleButton.create creates the requested variant, size, label and button type", () => {
  const { button } = loadButton();
  const element = button.create({
    variant: "danger",
    size: "lg",
    children: "Delete",
    type: "submit",
  });

  assert.equal(element.tagName, "BUTTON");
  assert.ok(element.classList.contains("cradle-btn"));
  assert.ok(element.classList.contains("cradle-btn--danger"));
  assert.ok(element.classList.contains("cradle-btn--lg"));
  assert.equal(element.type, "submit");
  assert.equal(element.children.length, 1);
  assert.equal(element.children[0].textContent, "Delete");
});

test("create supports full-width, custom classes and all standard variants and sizes", () => {
  const { button } = loadButton();

  for (const variant of [
    "primary",
    "secondary",
    "outline",
    "ghost",
    "success",
    "danger",
    "icon",
  ]) {
    for (const size of ["sm", "md", "lg"]) {
      const element = button.create({
        variant,
        size,
        children: "Action",
        fullWidth: true,
        className: "custom-button",
      });

      assert.ok(element.classList.contains(`cradle-btn--${variant}`));
      assert.ok(element.classList.contains(`cradle-btn--${size}`));
      assert.ok(element.classList.contains("cradle-btn--full-width"));
      assert.ok(element.classList.contains("custom-button"));
    }
  }
});

test("create renders left and right icons as aria-hidden wrappers", () => {
  const { button } = loadButton();
  const element = button.create({
    children: "Next",
    leftIcon: "←",
    rightIcon: "→",
  });

  assert.equal(element.children.length, 3);
  assert.equal(
    element.children[0].className,
    "cradle-btn__icon cradle-btn__icon--left"
  );
  assert.equal(element.children[0].getAttribute("aria-hidden"), "true");
  assert.equal(element.children[0].innerHTML, "←");
  assert.equal(element.children[1].textContent, "Next");
  assert.equal(
    element.children[2].className,
    "cradle-btn__icon cradle-btn__icon--right"
  );
  assert.equal(element.children[2].getAttribute("aria-hidden"), "true");
});

test("icon variant does not render a text label", () => {
  const { button } = loadButton();
  const element = button.create({
    variant: "icon",
    children: "Settings",
    leftIcon: "⚙",
    ariaLabel: "Settings",
  });

  assert.equal(element.children.length, 1);
  assert.equal(element.children[0].innerHTML, "⚙");
  assert.equal(element.getAttribute("aria-label"), "Settings");
});

test("disabled buttons are actually disabled and do not register click handlers", () => {
  const { button } = loadButton();
  let clicks = 0;
  const element = button.create({
    children: "Save",
    disabled: true,
    onClick: () => clicks++,
  });

  assert.equal(element.disabled, true);
  element.dispatchEvent({ type: "click" });
  assert.equal(clicks, 0);
});

test("loading buttons show a spinner, expose aria-busy and do not register click handlers", () => {
  const { button } = loadButton();
  let clicks = 0;
  const element = button.create({
    children: "Save",
    leftIcon: "✓",
    loading: true,
    onClick: () => clicks++,
  });

  assert.equal(element.disabled, true);
  assert.equal(element.getAttribute("aria-busy"), "true");
  assert.equal(element.children.length, 2);
  assert.equal(element.children[0].className, "cradle-btn__spinner");
  assert.equal(element.children[0].getAttribute("aria-hidden"), "true");
  element.dispatchEvent({ type: "click" });
  assert.equal(clicks, 0);
});

test("click handler fires for an enabled button", () => {
  const { button } = loadButton();
  let clicks = 0;
  const element = button.create({
    children: "Run",
    onClick: event => {
      clicks++;
      assert.equal(event.type, "click");
    },
  });

  element.dispatchEvent({ type: "click" });
  assert.equal(clicks, 1);
});

test("href creates an anchor and preserves link target and rel attributes", () => {
  const { button } = loadButton();
  const element = button.create({
    children: "Documentation",
    href: "/docs",
    target: "_blank",
    rel: "noopener noreferrer",
  });

  assert.equal(element.tagName, "A");
  assert.equal(element.href, "/docs");
  assert.equal(element.target, "_blank");
  assert.equal(element.rel, "noopener noreferrer");
  assert.equal(element.type, "");
});

test("anchor buttons expose disabled state through aria-disabled", () => {
  const { button } = loadButton();
  const element = button.create({
    children: "Unavailable",
    href: "/docs",
    disabled: true,
  });

  assert.equal(element.getAttribute("aria-disabled"), "true");
});

test("accessibility label is applied without replacing visible content", () => {
  const { button } = loadButton();
  const element = button.create({
    children: "Open menu",
    ariaLabel: "Open navigation menu",
  });

  assert.equal(element.getAttribute("aria-label"), "Open navigation menu");
  assert.equal(element.children[0].textContent, "Open menu");
});

test("HTML auto-upgrade applies variant, size, width and icons while preserving existing text", () => {
  const elementFactory = createElementFactory();
  const element = elementFactory.createElement("button");
  element.dataset.variant = "outline";
  element.dataset.size = "sm";
  element.dataset.fullWidth = "true";
  element.dataset.leftIcon = "★";
  element.dataset.rightIcon = "→";
  element.childNodes.push(elementFactory.createTextNode("Star this"));

  const { button } = loadButton([element]);
  button.upgradeAll();

  assert.ok(element.classList.contains("cradle-btn"));
  assert.ok(element.classList.contains("cradle-btn--outline"));
  assert.ok(element.classList.contains("cradle-btn--sm"));
  assert.ok(element.classList.contains("cradle-btn--full-width"));
  assert.equal(element.children.length, 3);
  assert.equal(
    element.children[0].className,
    "cradle-btn__icon cradle-btn__icon--left"
  );
  assert.equal(element.children[1].textContent, "Star this");
  assert.equal(
    element.children[2].className,
    "cradle-btn__icon cradle-btn__icon--right"
  );
});

test("HTML auto-upgrade preserves native accessibility attributes and disabled state", () => {
  const elementFactory = createElementFactory();
  const element = elementFactory.createElement("button");
  element.dataset.variant = "ghost";
  element.dataset.size = "md";
  element.setAttribute("aria-label", "Close dialog");
  element.disabled = true;

  const { button } = loadButton([element]);
  button.upgradeAll();

  assert.ok(element.classList.contains("cradle-btn"));
  assert.equal(element.getAttribute("aria-label"), "Close dialog");
  assert.equal(element.disabled, true);
});

test("HTML auto-upgrade is safe to call repeatedly without duplicating classes or icons", () => {
  const elementFactory = createElementFactory();
  const element = elementFactory.createElement("button");
  element.dataset.variant = "success";
  element.dataset.size = "md";

  const { button } = loadButton([element]);
  button.upgradeAll();
  button.upgradeAll();

  const classes = element.className.split(/\s+/).filter(Boolean);
  assert.equal(classes.filter(name => name === "cradle-btn").length, 1);
  assert.equal(
    classes.filter(name => name === "cradle-btn--success").length,
    1
  );
  assert.equal(classes.filter(name => name === "cradle-btn--md").length, 1);
});

test("styles are injected only once even when creating multiple buttons", () => {
  const { button, document } = loadButton();

  button.create({ children: "One" });
  button.create({ children: "Two" });

  const styleNodes = document.head.childNodes.filter(
    node => node.id === "cradle-btn-styles"
  );
  assert.equal(styleNodes.length, 1);
});
