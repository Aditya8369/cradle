const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const IGNORED_DIRS = new Set(["node_modules", ".git", ".vscode"]);
const TARGET_EXTS = new Set([".md", ".html"]);
const EXTERNAL_PREFIXES = [
  "http://",
  "https://",
  "mailto:",
  "javascript:",
  "data:",
  "tel:",
  "#",
];

function getFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of list) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      results = results.concat(getFiles(fullPath));
    } else if (
      entry.isFile() &&
      TARGET_EXTS.has(path.extname(entry.name).toLowerCase())
    ) {
      results.push(fullPath);
    }
  }

  return results;
}

function parseMarkdownLinks(content) {
  const links = [];
  const lines = content.split("\n");
  // Matches [text](target) and ![alt](target)
  const mdLinkRegex = /!?\[.*?\]\(([^)\s]+)(?:\s+".*?")?\)/g;

  lines.forEach((line, index) => {
    let match;
    while ((match = mdLinkRegex.exec(line)) !== null) {
      links.push({ target: match[1], lineNumber: index + 1 });
    }
  });

  return links;
}

function parseHtmlLinks(content) {
  const links = [];
  const lines = content.split("\n");
  // Matches href="target" and src="target"
  const htmlLinkRegex = /(?:href|src)=["']([^"']+)["']/gi;

  lines.forEach((line, index) => {
    let match;
    while ((match = htmlLinkRegex.exec(line)) !== null) {
      links.push({ target: match[1], lineNumber: index + 1 });
    }
  });

  return links;
}

function isExternal(link) {
  const trimmed = link.trim().toLowerCase();
  return EXTERNAL_PREFIXES.some(prefix => trimmed.startsWith(prefix));
}

function sanitizePath(link) {
  let cleaned = link.split("#")[0].split("?")[0];
  try {
    cleaned = decodeURIComponent(cleaned);
  } catch (e) {
    // Keep un-decoded if URI decode fails
  }
  return cleaned;
}

function validateLinks() {
  const files = getFiles(REPO_ROOT);
  const brokenLinks = [];

  for (const filePath of files) {
    const ext = path.extname(filePath).toLowerCase();
    const content = fs.readFileSync(filePath, "utf-8");
    const rawLinks =
      ext === ".md" ? parseMarkdownLinks(content) : parseHtmlLinks(content);

    for (const { target, lineNumber } of rawLinks) {
      if (!target || isExternal(target)) continue;

      const cleanLink = sanitizePath(target);
      if (!cleanLink) continue; // Pure fragment link e.g. #heading

      let resolvedPath;
      if (cleanLink.startsWith("/")) {
        resolvedPath = path.join(REPO_ROOT, cleanLink);
      } else {
        resolvedPath = path.join(path.dirname(filePath), cleanLink);
      }

      if (!fs.existsSync(resolvedPath)) {
        const relSource = path.relative(REPO_ROOT, filePath);
        brokenLinks.push({
          source: relSource,
          line: lineNumber,
          target,
          resolvedPath: path.relative(REPO_ROOT, resolvedPath),
        });
      }
    }
  }

  return brokenLinks;
}

function main() {
  console.log(
    "Scanning repository for broken internal links in documentation and project pages..."
  );
  const broken = validateLinks();

  if (broken.length > 0) {
    console.error(`\n❌ Found ${broken.length} broken internal link(s):\n`);
    broken.forEach(({ source, line, target, resolvedPath }) => {
      console.error(
        `  - ${source}:${line} -> "${target}" (Resolved: ${resolvedPath})`
      );
    });
    console.error("\nPlease fix all broken internal links.");
    process.exit(1);
  } else {
    console.log(
      "\n✅ All internal links in documentation and project pages are valid!"
    );
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  getFiles,
  parseMarkdownLinks,
  parseHtmlLinks,
  isExternal,
  sanitizePath,
  validateLinks,
};
