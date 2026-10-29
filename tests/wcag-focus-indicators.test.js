const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const STYLESHEET_PATH = path.join(__dirname, "../src/styles/accessibility.css");

test("accessibility.css stylesheet exists and includes WCAG focus indicators", () => {
  assert.ok(
    fs.existsSync(STYLESHEET_PATH),
    "src/styles/accessibility.css must exist"
  );
  const cssContent = fs.readFileSync(STYLESHEET_PATH, "utf8");

  assert.match(
    cssContent,
    /:focus-visible/,
    "Includes :focus-visible rules for keyboard navigation"
  );
  assert.match(
    cssContent,
    /outline:\s*3px\s+solid\s+#F59E0B/i,
    "Includes dual-layer high-contrast boundary ring outline"
  );
  assert.match(
    cssContent,
    /forced-colors:\s*active/,
    "Includes Windows forced-colors high contrast mode media query"
  );
  assert.match(
    cssContent,
    /Highlight/,
    "Uses Highlight system color in forced-colors mode"
  );
});

test("shared Cradle components (Button, Card, Navbar) define consistent WCAG focus-visible indicators", () => {
  const buttonSource = fs.readFileSync(
    path.join(__dirname, "../src/components/ui/Button/Button.js"),
    "utf8"
  );
  const cardSource = fs.readFileSync(
    path.join(__dirname, "../src/components/ui/Card/Card.js"),
    "utf8"
  );
  const navbarSource = fs.readFileSync(
    path.join(__dirname, "../src/components/ui/Navbar/Navbar.js"),
    "utf8"
  );
  const tokensSource = fs.readFileSync(
    path.join(__dirname, "../src/components/ui/tokens.css"),
    "utf8"
  );
  const styleSource = fs.readFileSync(
    path.join(__dirname, "../style.css"),
    "utf8"
  );

  // Tokens must expose --color-accent
  assert.match(
    tokensSource,
    /--color-accent:\s*var\(--cradle-accent-hover/,
    "tokens.css must define --color-accent token"
  );
  assert.match(
    styleSource,
    /--color-accent:\s*var\(--accent-hover/,
    "style.css must define --color-accent token"
  );

  // Button component focus-visible outline
  assert.match(
    buttonSource,
    /\.cradle-btn:focus-visible\s*\{[^}]*outline:\s*2px\s+solid\s+var\(--color-accent[^}]*outline-offset:\s*2px[^}]*border-radius:\s*4px/s,
    "Button.js must define 2px solid var(--color-accent) outline, 2px outline-offset, and 4px border-radius"
  );

  // Card component focus-visible outline (including clickable variant)
  assert.match(
    cardSource,
    /\.cradle-card(?:--clickable)?:focus-visible[^}]*outline:\s*2px\s+solid\s+var\(--color-accent[^}]*outline-offset:\s*2px[^}]*border-radius:\s*4px/s,
    "Card.js must define 2px solid var(--color-accent) outline, 2px outline-offset, and 4px border-radius on focus-visible"
  );

  // Navbar component focus-visible outline (links and brand)
  assert.match(
    navbarSource,
    /\.cradle-navbar__link:focus-visible[^}]*outline:\s*2px\s+solid\s+var\(--color-accent[^}]*outline-offset:\s*2px[^}]*border-radius:\s*4px/s,
    "Navbar.js must define 2px solid var(--color-accent) outline, 2px outline-offset, and 4px border-radius on links"
  );
  assert.match(
    navbarSource,
    /\.cradle-navbar__brand:focus-visible/,
    "Navbar.js must include brand focus-visible outline"
  );

  // Landing page style.css focus-visible outline
  assert.match(
    styleSource,
    /:focus-visible\s*\{[^}]*outline:\s*2px\s+solid\s+var\(--color-accent[^}]*outline-offset:\s*2px[^}]*border-radius:\s*4px/s,
    "style.css must define consistent :focus-visible rules with 2px solid var(--color-accent) and 2px offset"
  );
});
