import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { getThumbnailUrl } from "../src/utils/assetUrl.js";

const require = createRequire(import.meta.url);
const {
  hashContent,
  getThumbnailHash,
  generateSvgThumbnail,
  buildProjectsRegistry,
  validateProjectsSync,
} = require("../scripts/generate-projects");

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cradle-assets-test-"));
  const projectDir = path.join(root, "projects", "games", "sample-game");
  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(path.join(projectDir, "index.html"), "<html></html>");
  return { root, projectDir, outputFile: path.join(root, "projects.json") };
}

function build(root, outputFile) {
  return buildProjectsRegistry({
    projectsDir: path.join(root, "projects"),
    repoRoot: root,
    outputFile,
  });
}

test("hashContent is stable for the same bytes and 8 hex characters long", () => {
  const a = hashContent("<svg>one</svg>");
  assert.equal(a, hashContent(Buffer.from("<svg>one</svg>")));
  assert.match(a, /^[0-9a-f]{8}$/);
  // Known value so an accidental change of algorithm or length is caught.
  assert.equal(hashContent("hello"), "2cf24dba");
});

test("hashContent changes when the content changes", () => {
  assert.notEqual(hashContent("<svg>one</svg>"), hashContent("<svg>two</svg>"));
});

test("hashContent ignores CRLF vs LF checkouts of the same file", () => {
  assert.equal(hashContent("a\nb\nc\n"), hashContent("a\r\nb\r\nc\r\n"));
});

test("getThumbnailHash is null when the project has no thumbnail", () => {
  const { root, projectDir } = makeRoot();
  try {
    assert.equal(getThumbnailHash(projectDir), null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("registry thumbnailHash stays the same for the same file and changes with it", () => {
  const { root, projectDir, outputFile } = makeRoot();
  try {
    fs.writeFileSync(path.join(projectDir, "thumbnail.svg"), "<svg>v1</svg>");
    const first = build(root, outputFile).projects[0].thumbnailHash;
    const again = build(root, outputFile).projects[0].thumbnailHash;
    assert.equal(first, again);

    fs.writeFileSync(path.join(projectDir, "thumbnail.svg"), "<svg>v2</svg>");
    const changed = build(root, outputFile).projects[0].thumbnailHash;
    assert.notEqual(first, changed);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("registry omits thumbnailHash when there is no thumbnail", () => {
  const { root, outputFile } = makeRoot();
  try {
    const { projects } = build(root, outputFile);
    assert.equal("thumbnailHash" in projects[0], false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("generated thumbnail does not depend on file modification times", () => {
  const { root, projectDir } = makeRoot();
  try {
    const target = path.join(projectDir, "thumbnail.svg");
    generateSvgThumbnail("Sample Game", "games", projectDir);
    const first = getThumbnailHash(projectDir);

    // Make the thumbnail look much older than the folder, then much newer.
    const old = new Date("2001-01-01T00:00:00Z");
    fs.utimesSync(target, old, old);
    generateSvgThumbnail("Sample Game", "games", projectDir);
    assert.equal(getThumbnailHash(projectDir), first);

    const future = new Date("2090-01-01T00:00:00Z");
    fs.utimesSync(target, future, future);
    generateSvgThumbnail("Sample Game", "games", projectDir);
    assert.equal(getThumbnailHash(projectDir), first);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("validateProjectsSync reports a stale thumbnailHash", () => {
  const { root, projectDir, outputFile } = makeRoot();
  try {
    fs.writeFileSync(path.join(projectDir, "thumbnail.svg"), "<svg>v1</svg>");
    const { projects } = build(root, outputFile);
    fs.writeFileSync(outputFile, JSON.stringify(projects, null, 2));
    const opts = {
      projectsDir: path.join(root, "projects"),
      repoRoot: root,
      outputFile,
    };
    assert.equal(validateProjectsSync(opts).inSync, true);

    fs.writeFileSync(path.join(projectDir, "thumbnail.svg"), "<svg>v2</svg>");
    const result = validateProjectsSync(opts);
    assert.equal(result.inSync, false);
    assert.ok(result.issues.some(issue => issue.includes("thumbnailHash")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getThumbnailUrl appends the hash as a version query", () => {
  assert.equal(
    getThumbnailUrl({ path: "projects/games/a/", thumbnailHash: "abc12345" }),
    "projects/games/a/thumbnail.svg?v=abc12345"
  );
});

test("getThumbnailUrl falls back to the plain URL without a hash", () => {
  assert.equal(
    getThumbnailUrl({ path: "projects/games/a/" }),
    "projects/games/a/thumbnail.svg"
  );
});
