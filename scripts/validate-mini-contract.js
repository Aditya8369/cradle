const fs = require("fs");
const path = require("path");
const { discoverProjects } = require("./project-discovery");
const {
  isExternal,
  sanitizePath,
  parseHtmlAssetLinks,
  validateStandardProjectFiles,
  validateProjectNavigation,
  validateProjectFavicons,
} = require("./validate-mini-projects");
const { validateSvgThumbnail } = require("../src/components/ui/sanitizeSvg.js");

// Checks every mini against the contract in docs/MINI_CONTRACT.md and prints
// the problems found per mini.
//
//   node scripts/validate-mini-contract.js            warning mode, exit 0
//   node scripts/validate-mini-contract.js --strict   exit 1 on any "error"
//   node scripts/validate-mini-contract.js --root <dir>   check another tree
//
// Two severities exist. "error" is a rule the contract states as MUST and that
// can be checked reliably. "warning" is a SHOULD rule or a source-level
// heuristic (lifecycle, storage) that can produce false positives; warnings
// never fail --strict.

const REPO_ROOT = path.resolve(__dirname, "..");

const FOLDER_NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ALLOWED_CDN_HOSTS = [
  "unpkg.com",
  "cdn.jsdelivr.net",
  "jsdelivr.net",
  "cdnjs.cloudflare.com",
  "huggingface.co",
];
const UNBUILT_SOURCE_EXTENSIONS = new Set([
  ".jsx",
  ".ts",
  ".tsx",
  ".scss",
  ".sass",
  ".less",
  ".vue",
  ".svelte",
]);
const SKIPPED_DIRS = new Set(["node_modules", ".git"]);

function issue(severity, rule, message) {
  return { severity, rule, message };
}

function listFiles(dir, prefix = "") {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIPPED_DIRS.has(entry.name)) continue;
      files.push(
        ...listFiles(path.join(dir, entry.name), `${prefix}${entry.name}/`)
      );
    } else {
      files.push(`${prefix}${entry.name}`);
    }
  }
  return files;
}

function stripComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
}

function hostOf(url) {
  try {
    return new URL(url.startsWith("//") ? `https:${url}` : url).hostname;
  } catch {
    return "";
  }
}

function checkFiles(project, files) {
  const issues = [];
  const archPath = path.join(project.absPath, "ARCHITECTURE.md");

  // index.html, style.css, script.js, thumbnail.svg: reuse the repo rule.
  for (const found of validateStandardProjectFiles([project])) {
    issues.push(issue("error", "missing-file", found.message));
  }

  if (!fs.existsSync(archPath)) {
    issues.push(
      issue("error", "missing-file", 'Missing required file "ARCHITECTURE.md".')
    );
  } else if (fs.readFileSync(archPath, "utf8").trim() === "") {
    issues.push(issue("error", "empty-file", '"ARCHITECTURE.md" is empty.'));
  }

  const indexPath = path.join(project.absPath, "index.html");
  if (fs.existsSync(indexPath) && fs.statSync(indexPath).size === 0) {
    issues.push(issue("error", "empty-file", '"index.html" is empty.'));
  }

  const thumbPath = path.join(project.absPath, "thumbnail.svg");
  if (fs.existsSync(thumbPath)) {
    const thumbContent = fs.readFileSync(thumbPath, "utf8");
    if (thumbContent.trim() !== "") {
      const check = validateSvgThumbnail(thumbContent);
      if (!check.safe) {
        issues.push(
          issue(
            "error",
            "unsafe-svg-thumbnail",
            `"thumbnail.svg" contains unsafe constructs: ${check.violations.join("; ")}`
          )
        );
      }
    }
  }

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (UNBUILT_SOURCE_EXTENSIONS.has(ext)) {
      issues.push(
        issue(
          "warning",
          "build-step-source",
          `"${file}" needs a build step; minis must run as-is in the browser.`
        )
      );
    }
    const base = path.basename(file);
    if (base === "package.json") {
      issues.push(
        issue(
          "warning",
          "build-manifest",
          `"${file}" suggests a build or install step.`
        )
      );
    }
    if (base === ".env" || base.startsWith(".env.")) {
      issues.push(
        issue(
          "error",
          "secret-file",
          `"${file}" must not be committed (see CREDENTIALS_AND_SECRETS.md).`
        )
      );
    }
  }

  return issues;
}

function checkMetadata(project, html) {
  const issues = [];
  if (!FOLDER_NAME_PATTERN.test(project.name)) {
    issues.push(
      issue(
        "warning",
        "folder-name",
        `Folder name "${project.name}" should be lowercase words separated by hyphens.`
      )
    );
  }
  if (html !== null) {
    const strippedHtml = html.replace(/<!--[\s\S]*?-->/g, "");
    const titleMatch = strippedHtml.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
    if (!titleMatch) {
      issues.push(
        issue("warning", "missing-title", "index.html has no <title> tag.")
      );
    } else if (!titleMatch[1].trim()) {
      issues.push(
        issue("warning", "missing-title", "index.html has no non-empty <title>.")
      );
    } else if (
      /^(document|untitled|index|mini|project|app|default|test|placeholder)$/i.test(
        titleMatch[1].trim()
      )
    ) {
      issues.push(
        issue(
          "warning",
          "generic-title",
          `index.html has a generic placeholder <title> "${titleMatch[1].trim()}".`
        )
      );
    }
  }
  return issues;
}

function checkEntrypoint(project, html) {
  const issues = [];
  const scriptTags = html.match(/<script\b[^>]*>/gi) || [];

  for (const raw of parseHtmlAssetLinks(html)) {
    if (isExternal(raw)) continue;
    const target = sanitizePath(raw);
    if (!target) continue;
    if (target.startsWith("/")) {
      issues.push(
        issue(
          "error",
          "absolute-path",
          `index.html uses root-absolute path "${raw}"; use a relative path.`
        )
      );
      continue;
    }
    if (!fs.existsSync(path.resolve(project.absPath, target))) {
      issues.push(
        issue(
          "error",
          "broken-asset",
          `index.html references "${raw}" which does not exist.`
        )
      );
    }
  }

  for (const tag of scriptTags) {
    const src = (tag.match(/\bsrc=["']([^"']+)["']/i) || [])[1];
    if (!src || !/^(https?:)?\/\//i.test(src.trim())) continue;
    if (!/\bintegrity=/i.test(tag)) {
      issues.push(
        issue(
          "error",
          "external-script-no-sri",
          `Remote script "${src}" has no integrity (SRI) attribute (THIRD_PARTY_POLICY.md).`
        )
      );
    }
    const host = hostOf(src.trim());
    if (!ALLOWED_CDN_HOSTS.some(h => host === h || host.endsWith(`.${h}`))) {
      issues.push(
        issue(
          "warning",
          "untrusted-script-origin",
          `Remote script "${src}" is not on an allowed CDN (THIRD_PARTY_POLICY.md).`
        )
      );
    }
  }

  issues.push(
    ...validateProjectNavigation([project]).map(i =>
      issue("error", "missing-navigation", i.message)
    )
  );
  // A favicon that points at a missing file is already reported as broken-asset.
  issues.push(
    ...validateProjectFavicons([project])
      .filter(i => i.type !== "BROKEN_FAVICON")
      .map(i => issue("error", "favicon", i.message))
  );
  return issues;
}

// Source-level heuristics over every .js/.mjs file in the mini plus index.html.
function checkLifecycle(project, files, html) {
  const issues = [];
  const sources = files
    .filter(f => /\.(m?js)$/i.test(f))
    .map(f => fs.readFileSync(path.join(project.absPath, f), "utf8"));
  if (html) sources.push(html);
  const code = stripComments(sources.join("\n"));

  const pairs = [
    [
      "timer-not-cleared",
      /\bsetInterval\s*\(/,
      /\bclearInterval\s*\(/,
      "setInterval is used but clearInterval never is",
    ],
    [
      "object-url-not-revoked",
      /\bURL\.createObjectURL\s*\(/,
      /\bURL\.revokeObjectURL\s*\(/,
      "URL.createObjectURL is used but URL.revokeObjectURL never is",
    ],
    [
      "worker-not-terminated",
      /\bnew\s+Worker\s*\(/,
      /\.terminate\s*\(/,
      "a Worker is created but never terminated",
    ],
    [
      "media-stream-not-stopped",
      /\bgetUserMedia\s*\(/,
      /\.stop\s*\(/,
      "getUserMedia is used but no track is ever stopped",
    ],
  ];
  for (const [rule, used, released, text] of pairs) {
    if (used.test(code) && !released.test(code)) {
      issues.push(issue("warning", rule, `Lifecycle: ${text}.`));
    }
  }

  if (
    /\blocalStorage\b/.test(code) &&
    !/CradleStorage|cradle-storage/.test(code)
  ) {
    issues.push(
      issue(
        "warning",
        "direct-localstorage",
        "Uses localStorage directly; use CradleStorage (STORAGE_POLICY.md)."
      )
    );
  }
  return issues;
}

function validateMini(project) {
  if (!fs.existsSync(project.absPath)) {
    return [issue("error", "missing-dir", "Folder does not exist.")];
  }
  const files = listFiles(project.absPath);
  const indexPath = path.join(project.absPath, "index.html");
  const html = fs.existsSync(indexPath)
    ? fs.readFileSync(indexPath, "utf8")
    : null;

  const issues = [
    ...checkFiles(project, files),
    ...checkMetadata(project, html),
  ];
  if (html) {
    issues.push(...checkEntrypoint(project, html));
  }
  issues.push(...checkLifecycle(project, files, html));
  return issues;
}

function validateAll(root = REPO_ROOT) {
  const projects = discoverProjects(path.join(root, "projects"), root);
  const results = projects.map(project => ({
    project,
    issues: validateMini(project),
  }));
  const count = severity =>
    results.reduce(
      (n, r) => n + r.issues.filter(i => i.severity === severity).length,
      0
    );
  return {
    results,
    summary: {
      minis: results.length,
      minisWithProblems: results.filter(r => r.issues.length > 0).length,
      errors: count("error"),
      warnings: count("warning"),
    },
  };
}

function formatReport({ results, summary }) {
  const lines = [];
  for (const { project, issues } of results) {
    if (issues.length === 0) continue;
    lines.push(project.relPath);
    for (const i of issues) {
      lines.push(`  [${i.severity}] ${i.rule}: ${i.message}`);
    }
  }
  if (lines.length > 0) lines.push("");
  lines.push(
    `Checked ${summary.minis} minis: ${summary.minisWithProblems} with problems, ${summary.errors} error(s), ${summary.warnings} warning(s).`
  );
  return lines.join("\n");
}

function run(argv = process.argv.slice(2), log = console.log) {
  const strict = argv.includes("--strict");
  const rootIdx = argv.indexOf("--root");
  const root =
    rootIdx !== -1 && argv[rootIdx + 1]
      ? path.resolve(argv[rootIdx + 1])
      : REPO_ROOT;

  const report = validateAll(root);
  log(formatReport(report));

  if (strict && report.summary.errors > 0) {
    log("Strict mode: failing because of the error(s) above.");
    return 1;
  }
  if (!strict && report.summary.errors + report.summary.warnings > 0) {
    log("Warning mode: not failing. Use --strict to fail on errors.");
  }
  return 0;
}

if (require.main === module) {
  process.exit(run());
}

module.exports = {
  validateMini,
  validateAll,
  formatReport,
  run,
};
