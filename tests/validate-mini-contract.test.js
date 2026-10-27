const test = require("node:test");
const { after } = test;
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  validateAll,
  formatReport,
  run,
} = require("../scripts/validate-mini-contract");

const GOOD_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Fixture</title>
    <link rel="icon" type="image/svg+xml" href="favicon.svg" />
    <link rel="stylesheet" href="style.css" />
  </head>
  <body>
    <script src="../../../src/components/ui/BackToHome/BackToHome.js" defer></script>
    <script src="script.js"></script>
  </body>
</html>
`;

const tempRoots = [];
after(() => {
  for (const dir of tempRoots) fs.rmSync(dir, { recursive: true, force: true });
});

// Builds a throwaway repo root with projects/<category>/<name>/ folders.
function makeRoot(minis) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mini-contract-"));
  tempRoots.push(root);
  fs.mkdirSync(path.join(root, "src/components/ui/BackToHome"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(root, "src/components/ui/BackToHome/BackToHome.js"),
    ""
  );
  for (const [relDir, files] of Object.entries(minis)) {
    const dir = path.join(root, "projects", relDir);
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(dir, name), content);
    }
  }
  return root;
}

function goodMini(overrides = {}) {
  const files = {
    "index.html": GOOD_HTML,
    "style.css": "body{}",
    "script.js": "console.log('hi');",
    "thumbnail.svg": "<svg></svg>",
    "favicon.svg": "<svg></svg>",
    "ARCHITECTURE.md": "# Architecture\n",
    ...overrides,
  };
  for (const key of Object.keys(files)) {
    if (files[key] === null) delete files[key];
  }
  return files;
}

function rulesFor(root, name) {
  const { results } = validateAll(root);
  const entry = results.find(r => r.project.name === name);
  return entry.issues.map(i => i.rule);
}

test("a compliant mini produces no problems", () => {
  const root = makeRoot({ "games/good-mini": goodMini() });
  const { results, summary } = validateAll(root);
  assert.deepEqual(results[0].issues, []);
  assert.equal(summary.minis, 1);
  assert.equal(summary.errors + summary.warnings, 0);
});

test("missing required files are reported", () => {
  const root = makeRoot({
    "games/no-thumb": goodMini({ "thumbnail.svg": null }),
    "games/no-arch": goodMini({ "ARCHITECTURE.md": null }),
  });
  assert.ok(rulesFor(root, "no-thumb").includes("missing-file"));
  assert.ok(rulesFor(root, "no-arch").includes("missing-file"));
});

test("an empty ARCHITECTURE.md is reported", () => {
  const root = makeRoot({
    "games/empty-arch": goodMini({ "ARCHITECTURE.md": " \n" }),
  });
  assert.ok(rulesFor(root, "empty-arch").includes("empty-file"));
});

test("root-absolute and broken relative paths are reported", () => {
  const root = makeRoot({
    "games/abs-path": goodMini({
      "index.html": GOOD_HTML.replace('href="style.css"', 'href="/style.css"'),
    }),
    "games/broken-path": goodMini({
      "index.html": GOOD_HTML.replace('src="script.js"', 'src="missing.js"'),
    }),
  });
  assert.ok(rulesFor(root, "abs-path").includes("absolute-path"));
  assert.ok(rulesFor(root, "broken-path").includes("broken-asset"));
});

test("remote scripts need SRI and a trusted origin", () => {
  const remote = src =>
    GOOD_HTML.replace("</body>", `<script src="${src}"></script></body>`);
  const root = makeRoot({
    "games/no-sri": goodMini({
      "index.html": remote("https://unpkg.com/lib@1.0.0/lib.js"),
    }),
    "games/odd-origin": goodMini({
      "index.html": remote("https://example.com/lib.js"),
    }),
  });
  assert.ok(rulesFor(root, "no-sri").includes("external-script-no-sri"));
  assert.ok(!rulesFor(root, "no-sri").includes("untrusted-script-origin"));
  assert.ok(rulesFor(root, "odd-origin").includes("untrusted-script-origin"));
});

test("committed env files and unbuilt sources are reported", () => {
  const root = makeRoot({
    "games/has-env": goodMini({ ".env": "KEY=1" }),
    "games/has-jsx": goodMini({ "App.jsx": "export default 1;" }),
  });
  assert.ok(rulesFor(root, "has-env").includes("secret-file"));
  assert.ok(rulesFor(root, "has-jsx").includes("build-step-source"));
});

test("SVG thumbnails with scripts or external references are reported as errors", () => {
  const root = makeRoot({
    "games/script-thumb": goodMini({
      "thumbnail.svg": "<svg><script>alert(1)</script></svg>",
    }),
    "games/event-thumb": goodMini({
      "thumbnail.svg": '<svg onload="alert(1)"><circle r="10"/></svg>',
    }),
    "games/external-thumb": goodMini({
      "thumbnail.svg": '<svg><image href="https://evil.com/track.png"/></svg>',
    }),
  });
  assert.ok(rulesFor(root, "script-thumb").includes("unsafe-svg-thumbnail"));
  assert.ok(rulesFor(root, "event-thumb").includes("unsafe-svg-thumbnail"));
  assert.ok(rulesFor(root, "external-thumb").includes("unsafe-svg-thumbnail"));
});


test("lifecycle and storage heuristics are warnings", () => {
  const root = makeRoot({
    "games/leaky": goodMini({
      "script.js":
        "setInterval(tick, 1000); localStorage.setItem('a', '1'); " +
        "const u = URL.createObjectURL(blob); new Worker('w.js');",
    }),
    "games/tidy": goodMini({
      "script.js":
        "const t = setInterval(tick, 1000); clearInterval(t); " +
        "// localStorage in a comment is ignored\n" +
        "const u = URL.createObjectURL(blob); URL.revokeObjectURL(u);",
    }),
  });
  const leaky = validateAll(root).results.find(r => r.project.name === "leaky");
  assert.deepEqual(
    leaky.issues.map(i => i.rule).sort(),
    [
      "direct-localstorage",
      "object-url-not-revoked",
      "timer-not-cleared",
      "worker-not-terminated",
    ].sort()
  );
  assert.ok(leaky.issues.every(i => i.severity === "warning"));
  assert.deepEqual(rulesFor(root, "tidy"), []);
});

test("report lists problems per mini with a summary line", () => {
  const root = makeRoot({
    "games/good-mini": goodMini(),
    "games/no-thumb": goodMini({ "thumbnail.svg": null }),
  });
  const text = formatReport(validateAll(root));
  assert.match(text, /projects\/games\/no-thumb\//);
  assert.doesNotMatch(text, /projects\/games\/good-mini\//);
  assert.match(text, /Checked 2 minis: 1 with problems, 1 error\(s\)/);
});

test("warning mode exits 0 and --strict exits 1 on errors", () => {
  const root = makeRoot({
    "games/no-thumb": goodMini({ "thumbnail.svg": null }),
  });
  const quiet = () => {};
  assert.equal(run(["--root", root], quiet), 0);
  assert.equal(run(["--root", root, "--strict"], quiet), 1);
});

test("--strict ignores warnings and passes a compliant tree", () => {
  const warnOnly = makeRoot({
    "games/leaky": goodMini({ "script.js": "setInterval(tick, 1000);" }),
  });
  const clean = makeRoot({ "games/good-mini": goodMini() });
  const quiet = () => {};
  assert.equal(run(["--root", warnOnly, "--strict"], quiet), 0);
  assert.equal(run(["--root", clean, "--strict"], quiet), 0);
});
