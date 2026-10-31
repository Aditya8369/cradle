import { test } from "node:test";
import assert from "node:assert/strict";
import {
  stripMarkup,
  sanitizeProjectTitle,
  sanitizeProjectCategory,
  isSafeProjectPath,
  sanitizeProjectPath,
  sanitizeProjectThumbnailHash,
  sanitizeProjectDate,
  isValidProject,
  sanitizeProject,
  sanitizeProjectList,
} from "../src/utils/projectSanitizer.js";
import { getThumbnailUrl } from "../src/utils/assetUrl.js";

/* -----------------------------
   Markup Stripping
----------------------------- */

test("stripMarkup removes script tags and contents", () => {
  const result = stripMarkup(
    "<script>alert('xss')</script>Hello World"
  );
  assert.equal(result, "Hello World");
});

test("stripMarkup removes inline HTML tags", () => {
  const result = stripMarkup("<img src=x onerror=alert(1)><b>Bold</b>");
  assert.equal(result, "Bold");
});

test("stripMarkup strips control characters", () => {
  const result = stripMarkup("Clean\x00Text\x1fHere");
  assert.equal(result, "CleanTextHere");
});

test("stripMarkup handles non-string inputs safely", () => {
  assert.equal(stripMarkup(null), "");
  assert.equal(stripMarkup(undefined), "");
  assert.equal(stripMarkup(123), "");
  assert.equal(stripMarkup({}), "");
});

/* -----------------------------
   Title Sanitization
----------------------------- */

test("sanitizeProjectTitle accepts clean titles", () => {
  assert.equal(sanitizeProjectTitle("2048 Game"), "2048 Game");
  assert.equal(
    sanitizeProjectTitle("Periodic Table Explorer"),
    "Periodic Table Explorer"
  );
});

test("sanitizeProjectTitle strips malicious markup from titles", () => {
  assert.equal(
    sanitizeProjectTitle("<script>alert(1)</script>Safe Title"),
    "Safe Title"
  );
  assert.equal(
    sanitizeProjectTitle("<b onmouseover='alert(1)'>Hover Me</b>"),
    "Hover Me"
  );
});

test("sanitizeProjectTitle returns empty string for pure markup or empty input", () => {
  assert.equal(sanitizeProjectTitle("<img src=x onerror=alert(1)>"), "");
  assert.equal(sanitizeProjectTitle("   "), "");
  assert.equal(sanitizeProjectTitle(null), "");
});

/* -----------------------------
   Category Sanitization
----------------------------- */

test("sanitizeProjectCategory preserves valid categories", () => {
  assert.equal(sanitizeProjectCategory("games"), "games");
  assert.equal(sanitizeProjectCategory("dev-tools"), "dev-tools");
  assert.equal(sanitizeProjectCategory("aiml"), "aiml");
  assert.equal(sanitizeProjectCategory("instruments"), "instruments");
});

test("sanitizeProjectCategory normalizes case and trims whitespace", () => {
  assert.equal(sanitizeProjectCategory("  GAMES  "), "games");
  assert.equal(sanitizeProjectCategory("DEV-TOOLS"), "dev-tools");
});

test("sanitizeProjectCategory falls back to 'misc' for malicious or invalid input", () => {
  assert.equal(
    sanitizeProjectCategory("<script>alert(1)</script>"),
    "misc"
  );
  assert.equal(sanitizeProjectCategory("evil/category"), "misc");
  assert.equal(sanitizeProjectCategory(""), "misc");
  assert.equal(sanitizeProjectCategory(null), "misc");
});

/* -----------------------------
   Path Sanitization & Validation
----------------------------- */

test("isSafeProjectPath accepts valid relative project paths", () => {
  assert.equal(isSafeProjectPath("projects/games/2048/"), true);
  assert.equal(
    isSafeProjectPath("./projects/productivity/markdown-resume/"),
    true
  );
  assert.equal(
    isSafeProjectPath("projects/instruments/percussion/"),
    true
  );
});

test("isSafeProjectPath rejects dangerous pseudo-protocols", () => {
  assert.equal(isSafeProjectPath("javascript:alert(1)"), false);
  assert.equal(isSafeProjectPath("JAVASCRIPT:alert(document.cookie)"), false);
  assert.equal(
    isSafeProjectPath("data:text/html,<script>alert(1)</script>"),
    false
  );
  assert.equal(isSafeProjectPath("vbscript:msgbox(1)"), false);
  assert.equal(isSafeProjectPath("file:///etc/passwd"), false);
});

test("isSafeProjectPath rejects directory traversal and absolute schemes", () => {
  assert.equal(isSafeProjectPath("projects/games/../../secret/"), false);
  assert.equal(isSafeProjectPath("projects/games/..\\..\\secret/"), false);
  assert.equal(isSafeProjectPath("//evil.com/projects/games/"), false);
  assert.equal(isSafeProjectPath("https://evil.com/projects/games/"), false);
});

test("isSafeProjectPath rejects markup and quotes in path", () => {
  assert.equal(isSafeProjectPath("projects/<script>/test/"), false);
  assert.equal(isSafeProjectPath("projects/games/\"quote/"), false);
  assert.equal(isSafeProjectPath("projects/games/'quote/"), false);
});

test("sanitizeProjectPath normalizes safe paths with trailing slashes", () => {
  assert.equal(
    sanitizeProjectPath("projects/games/2048"),
    "projects/games/2048/"
  );
  assert.equal(
    sanitizeProjectPath("./projects/games/2048/"),
    "projects/games/2048/"
  );
});

test("sanitizeProjectPath returns null for unsafe paths", () => {
  assert.equal(sanitizeProjectPath("javascript:alert(1)"), null);
  assert.equal(
    sanitizeProjectPath("data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=="),
    null
  );
  assert.equal(sanitizeProjectPath("/etc/passwd"), null);
  assert.equal(sanitizeProjectPath(""), null);
  assert.equal(sanitizeProjectPath(null), null);
});

/* -----------------------------
   Thumbnail Hash & Date Sanitization
----------------------------- */

test("sanitizeProjectThumbnailHash accepts valid 8-char hex hashes", () => {
  assert.equal(sanitizeProjectThumbnailHash("a1b2c3d4"), "a1b2c3d4");
  assert.equal(sanitizeProjectThumbnailHash("01234567"), "01234567");
  assert.equal(sanitizeProjectThumbnailHash("ABCDEF01"), "abcdef01");
});

test("sanitizeProjectThumbnailHash rejects invalid or malicious hashes", () => {
  assert.equal(
    sanitizeProjectThumbnailHash('"><script>alert(1)</script>'),
    null
  );
  assert.equal(sanitizeProjectThumbnailHash("12345"), null);
  assert.equal(sanitizeProjectThumbnailHash("ghijk123"), null);
  assert.equal(sanitizeProjectThumbnailHash(null), null);
});

test("sanitizeProjectDate accepts valid ISO date strings", () => {
  assert.equal(sanitizeProjectDate("2026-10-31"), "2026-10-31");
  assert.equal(
    sanitizeProjectDate("2026-08-09T10:30:00Z"),
    "2026-08-09T10:30:00Z"
  );
});

test("sanitizeProjectDate rejects invalid date strings", () => {
  assert.equal(
    sanitizeProjectDate("<script>alert(1)</script>"),
    null
  );
  assert.equal(sanitizeProjectDate("not-a-date"), null);
  assert.equal(sanitizeProjectDate(null), null);
});

/* -----------------------------
   Single Project Sanitization
----------------------------- */

test("sanitizeProject sanitizes a valid project record", () => {
  const raw = {
    title: "  2048 Game  ",
    category: "GAMES",
    path: "./projects/games/2048",
    dateAdded: "2026-01-15",
    thumbnailHash: "A1B2C3D4",
  };

  const sanitized = sanitizeProject(raw);
  assert.deepEqual(sanitized, {
    title: "2048 Game",
    category: "games",
    path: "projects/games/2048/",
    dateAdded: "2026-01-15",
    thumbnailHash: "a1b2c3d4",
  });
});

test("sanitizeProject rejects compromised projects with javascript: path", () => {
  const compromised = {
    title: "Harmful Project",
    category: "misc",
    path: "javascript:alert(document.domain)",
  };

  assert.equal(sanitizeProject(compromised), null);
});

test("sanitizeProject rejects projects with empty title after tag stripping", () => {
  const compromised = {
    title: "<script>alert(1)</script>",
    category: "games",
    path: "projects/games/test/",
  };

  assert.equal(sanitizeProject(compromised), null);
});

test("sanitizeProject strips prototype pollution properties", () => {
  const malicious = JSON.parse(
    '{"title":"Clean Title","category":"games","path":"projects/games/clean/","__proto__":{"polluted":true},"extraKey":"dropped"}'
  );

  const clean = sanitizeProject(malicious);
  assert.ok(clean);
  assert.equal(clean.title, "Clean Title");
  assert.equal("extraKey" in clean, false);
  assert.equal({}.polluted, undefined);
});

/* -----------------------------
   Project List Sanitization
----------------------------- */

test("sanitizeProjectList filters out corrupted or dangerous entries", () => {
  const untrustedList = [
    {
      title: "Valid Game",
      category: "games",
      path: "projects/games/valid/",
    },
    {
      title: "Malicious XSS Link",
      category: "games",
      path: "javascript:alert(1)",
    },
    null,
    "not-an-object",
    {
      title: "<img src=x onerror=alert(1)>",
      category: "misc",
      path: "projects/misc/empty-title/",
    },
    {
      title: "Valid Tool",
      category: "dev-tools",
      path: "projects/dev-tools/valid/",
      thumbnailHash: "12345678",
    },
  ];

  const sanitizedList = sanitizeProjectList(untrustedList);
  assert.equal(sanitizedList.length, 2);
  assert.equal(sanitizedList[0].title, "Valid Game");
  assert.equal(sanitizedList[1].title, "Valid Tool");
});

test("sanitizeProjectList handles empty and non-array inputs", () => {
  assert.deepEqual(sanitizeProjectList(null), []);
  assert.deepEqual(sanitizeProjectList(undefined), []);
  assert.deepEqual(sanitizeProjectList("invalid"), []);
});

/* -----------------------------
   Asset URL Security Integration
----------------------------- */

test("getThumbnailUrl rejects dangerous paths", () => {
  const malicious = {
    path: "javascript:alert(1)",
    thumbnailHash: "a1b2c3d4",
  };
  assert.equal(getThumbnailUrl(malicious), "");
});

test("getThumbnailUrl sanitizes malformed thumbnailHash parameters", () => {
  const project = {
    path: "projects/games/2048/",
    thumbnailHash: '"><script>alert(1)</script>',
  };
  assert.equal(getThumbnailUrl(project), "projects/games/2048/thumbnail.svg");
});

