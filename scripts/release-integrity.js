#!/usr/bin/env node

/**
 * Cradle — Release Asset Integrity Verification Tool
 * ──────────────────────────────────────────────────
 * Generates and verifies cryptographic checksums (SHA-256 and SHA-512) for
 * distributed release artifacts, archives, and build bundles so consumers
 * can authenticate that downloaded assets match the published release.
 *
 * CLI Usage:
 *   Generate checksums:
 *     node scripts/release-integrity.js --generate [files...]
 *     node scripts/release-integrity.js --generate --out dist/
 *
 *   Verify checksums:
 *     node scripts/release-integrity.js --verify SHA256SUMS
 *     node scripts/release-integrity.js --verify release-integrity.json --dir ./downloads
 *
 *   Check single file:
 *     node scripts/release-integrity.js --check-file <file> <expected-hash>
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const DEFAULT_ALGORITHMS = ["sha256", "sha512"];

/**
 * Computes cryptographic hash for a file.
 * Uses binary buffer streams so all binary assets (tar.gz, zip, png, wasm)
 * and text files are hashed accurately.
 *
 * @param {string} filePath - Absolute or relative path to the file.
 * @param {string} [algorithm='sha256'] - Hash algorithm ('sha256', 'sha512', 'sha384').
 * @returns {{ file: string, hash: string, sizeBytes: number, algorithm: string }}
 */
function computeFileHash(filePath, algorithm = "sha256") {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`File not found: "${filePath}"`);
  }

  const stat = fs.statSync(resolved);
  if (!stat.isFile()) {
    throw new Error(`Path is not a regular file: "${filePath}"`);
  }

  const content = fs.readFileSync(resolved);
  const hash = crypto.createHash(algorithm).update(content).digest("hex");

  return {
    file: resolved,
    hash,
    sizeBytes: stat.size,
    algorithm: algorithm.toLowerCase(),
  };
}

/**
 * Generates GNU/BSD coreutils-compatible checksum lines (<hash>  <filename>).
 *
 * @param {Array<string>} filePaths - List of file paths to hash.
 * @param {string} [baseDir=process.cwd()] - Base directory for relative path outputs.
 * @param {string} [algorithm='sha256'] - Hash algorithm.
 * @returns {string} - Formatted checksum file content.
 */
function generateChecksumList(filePaths, baseDir = process.cwd(), algorithm = "sha256") {
  if (!Array.isArray(filePaths)) {
    throw new TypeError("filePaths must be an array of paths.");
  }

  const lines = [];
  for (const fp of filePaths) {
    const resolved = path.resolve(baseDir, fp);
    const { hash } = computeFileHash(resolved, algorithm);
    const relName = path.relative(baseDir, resolved).replace(/\\/g, "/");
    lines.push(`${hash}  ${relName}`);
  }

  return lines.join("\n") + (lines.length > 0 ? "\n" : "");
}

/**
 * Generates a structured JSON release manifest containing multi-algorithm
 * checksums, file sizes, and metadata.
 *
 * @param {Array<string>} filePaths - Files to include in the release.
 * @param {string} [baseDir=process.cwd()] - Base directory.
 * @param {Object} [meta={}] - Optional metadata (release name, version, repository).
 * @returns {Object} - Release integrity manifest object.
 */
function generateReleaseManifest(filePaths, baseDir = process.cwd(), meta = {}) {
  let pkgVersion = "1.0.0";
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8")
    );
    pkgVersion = pkg.version || pkgVersion;
  } catch {
    // fallback
  }

  const files = [];
  for (const fp of filePaths) {
    const resolved = path.resolve(baseDir, fp);
    const stat = fs.statSync(resolved);
    const content = fs.readFileSync(resolved);

    const sha256 = crypto.createHash("sha256").update(content).digest("hex");
    const sha512 = crypto.createHash("sha512").update(content).digest("hex");
    const relName = path.relative(baseDir, resolved).replace(/\\/g, "/");

    files.push({
      path: relName,
      sizeBytes: stat.size,
      sha256,
      sha512,
    });
  }

  return {
    release: meta.release || `cradle@${pkgVersion}`,
    version: meta.version || pkgVersion,
    generatedAt: meta.timestamp || new Date().toISOString(),
    primaryAlgorithm: "sha256",
    files,
  };
}

/**
 * Parses GNU/BSD format checksum file content into structured records.
 *
 * @param {string} content - Raw checksum file text.
 * @returns {Array<{ hash: string, file: string }>}
 */
function parseChecksumFile(content) {
  if (typeof content !== "string") return [];

  const records = [];
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Pattern: <hex-hash> <mode><filename> where mode is space or *
    const match = trimmed.match(/^([a-fA-F0-9]{64}|[a-fA-F0-9]{128})\s+[* ]?(.+)$/);
    if (match) {
      records.push({
        hash: match[1].toLowerCase(),
        file: match[2].trim(),
      });
    }
  }

  return records;
}

/**
 * Verifies a single file against an expected checksum.
 *
 * @param {string} filePath - Path to file.
 * @param {string} expectedHash - Expected hex hash string.
 * @param {string} [algorithm] - Algorithm (defaults to sha256 or sha512 based on hash length).
 * @returns {{ valid: boolean, file: string, expectedHash: string, actualHash: string|null, error: string|null }}
 */
function verifyFileChecksum(filePath, expectedHash, algorithm) {
  const cleanExpected = String(expectedHash || "").trim().toLowerCase();
  const algo =
    algorithm ||
    (cleanExpected.length === 128
      ? "sha512"
      : cleanExpected.length === 64
        ? "sha256"
        : "sha256");

  try {
    const { hash } = computeFileHash(filePath, algo);
    const valid = hash.toLowerCase() === cleanExpected;
    return {
      valid,
      file: filePath,
      expectedHash: cleanExpected,
      actualHash: hash,
      error: valid ? null : `Checksum mismatch for ${filePath}`,
    };
  } catch (err) {
    return {
      valid: false,
      file: filePath,
      expectedHash: cleanExpected,
      actualHash: null,
      error: err.message,
    };
  }
}

/**
 * Verifies a set of files from a checksum file or JSON manifest.
 *
 * @param {string} manifestPath - Path to SHA256SUMS or release-integrity.json.
 * @param {string} [baseDir] - Base directory where assets reside.
 * @returns {{
 *   total: number,
 *   matched: number,
 *   failed: Array<{ file: string, reason: string, expected?: string, actual?: string }>,
 *   allPassed: boolean
 * }}
 */
function verifyReleaseChecksums(manifestPath, baseDir) {
  const resolvedManifest = path.resolve(manifestPath);
  if (!fs.existsSync(resolvedManifest)) {
    throw new Error(`Checksum manifest not found: "${manifestPath}"`);
  }

  const assetBaseDir = baseDir
    ? path.resolve(baseDir)
    : path.dirname(resolvedManifest);

  const raw = fs.readFileSync(resolvedManifest, "utf8");
  let records = [];

  if (resolvedManifest.endsWith(".json")) {
    try {
      const json = JSON.parse(raw);
      if (Array.isArray(json.files)) {
        records = json.files.map(f => ({
          file: f.path || f.file,
          hash: f.sha256 || f.hash,
        }));
      }
    } catch (err) {
      throw new Error(`Malformed JSON manifest: ${err.message}`);
    }
  } else {
    records = parseChecksumFile(raw);
  }

  if (records.length === 0) {
    return {
      total: 0,
      matched: 0,
      failed: [{ file: manifestPath, reason: "No valid checksum entries found." }],
      allPassed: false,
    };
  }

  const failed = [];
  let matched = 0;

  for (const entry of records) {
    const targetPath = path.resolve(assetBaseDir, entry.file);
    if (!fs.existsSync(targetPath)) {
      failed.push({
        file: entry.file,
        reason: "File does not exist on disk.",
        expected: entry.hash,
      });
      continue;
    }

    const check = verifyFileChecksum(targetPath, entry.hash);
    if (check.valid) {
      matched++;
    } else {
      failed.push({
        file: entry.file,
        reason: "Checksum digest mismatch.",
        expected: check.expectedHash,
        actual: check.actualHash,
      });
    }
  }

  return {
    total: records.length,
    matched,
    failed,
    allPassed: failed.length === 0,
  };
}

/**
 * Writes standard release integrity files: SHA256SUMS, SHA512SUMS, and release-integrity.json.
 *
 * @param {Array<string>} filePaths - List of release asset files.
 * @param {string} outputDir - Directory to write checksum artifacts.
 * @param {string} [baseDir=outputDir] - Base path for relative filenames.
 * @returns {{ sha256sumsPath: string, sha512sumsPath: string, jsonManifestPath: string }}
 */
function writeReleaseIntegrityFiles(filePaths, outputDir, baseDir = outputDir) {
  const resolvedOut = path.resolve(outputDir);
  if (!fs.existsSync(resolvedOut)) {
    fs.mkdirSync(resolvedOut, { recursive: true });
  }

  const sha256Content = generateChecksumList(filePaths, baseDir, "sha256");
  const sha512Content = generateChecksumList(filePaths, baseDir, "sha512");
  const manifest = generateReleaseManifest(filePaths, baseDir);

  const sha256sumsPath = path.join(resolvedOut, "SHA256SUMS");
  const sha512sumsPath = path.join(resolvedOut, "SHA512SUMS");
  const jsonManifestPath = path.join(resolvedOut, "release-integrity.json");

  fs.writeFileSync(sha256sumsPath, sha256Content, "utf8");
  fs.writeFileSync(sha512sumsPath, sha512Content, "utf8");
  fs.writeFileSync(jsonManifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  return {
    sha256sumsPath,
    sha512sumsPath,
    jsonManifestPath,
  };
}

// ─── CLI Entrypoint ──────────────────────────────────────────

function parseCliArgs(args) {
  const parsed = {
    command: null,
    files: [],
    outDir: null,
    baseDir: null,
    checksumFile: null,
    expectedHash: null,
    singleFile: null,
    algorithm: "sha256",
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "--generate" || arg === "-g") {
      parsed.command = "generate";
    } else if (arg === "--verify" || arg === "-v") {
      parsed.command = "verify";
    } else if (arg === "--check-file") {
      parsed.command = "check-file";
      parsed.singleFile = args[++i];
      parsed.expectedHash = args[++i];
    } else if (arg === "--out" || arg === "-o") {
      parsed.outDir = args[++i];
    } else if (arg === "--dir" || arg === "-d") {
      parsed.baseDir = args[++i];
    } else if (arg === "--algo" || arg === "-a") {
      parsed.algorithm = args[++i];
    } else if (!arg.startsWith("-")) {
      if (parsed.command === "verify" && !parsed.checksumFile) {
        parsed.checksumFile = arg;
      } else {
        parsed.files.push(arg);
      }
    }
    i++;
  }

  return parsed;
}

function runCli(args = process.argv.slice(2)) {
  const opts = parseCliArgs(args);

  if (opts.command === "check-file") {
    if (!opts.singleFile || !opts.expectedHash) {
      console.error("Error: --check-file requires <filePath> and <expectedHash>.");
      return 1;
    }
    const result = verifyFileChecksum(opts.singleFile, opts.expectedHash, opts.algorithm);
    if (result.valid) {
      console.log(`✅ OK: ${opts.singleFile}`);
      return 0;
    } else {
      console.error(`❌ FAILED: ${opts.singleFile}`);
      console.error(`  Expected: ${result.expectedHash}`);
      console.error(`  Actual:   ${result.actualHash || "ERROR (" + result.error + ")"}`);
      return 1;
    }
  }

  if (opts.command === "verify") {
    const file = opts.checksumFile || opts.files[0] || "SHA256SUMS";
    console.log(`🔍 Verifying release integrity using manifest: ${file}...`);
    try {
      const res = verifyReleaseChecksums(file, opts.baseDir);
      console.log(`Results: ${res.matched}/${res.total} files verified successfully.`);

      if (!res.allPassed) {
        console.error(`\n❌ Verification failed for ${res.failed.length} file(s):`);
        for (const f of res.failed) {
          console.error(`  - ${f.file}: ${f.reason}`);
          if (f.expected) console.error(`    Expected: ${f.expected}`);
          if (f.actual) console.error(`    Actual:   ${f.actual}`);
        }
        return 1;
      }

      console.log("✅ All release assets match expected cryptographic checksums.");
      return 0;
    } catch (err) {
      console.error(`❌ Verification error: ${err.message}`);
      return 1;
    }
  }

  if (opts.command === "generate") {
    const filesToHash = opts.files.length > 0 ? opts.files : [];

    // If no specific files passed, discover standard distributables or files in dist/
    if (filesToHash.length === 0) {
      const candidates = [
        path.join(REPO_ROOT, "data", "projects.json"),
        path.join(REPO_ROOT, "data", "worker-integrity.json"),
        path.join(REPO_ROOT, "src", "components", "ui", "index.js"),
        path.join(REPO_ROOT, "src", "components", "ui", "tokens.css"),
      ];
      for (const c of candidates) {
        if (fs.existsSync(c)) filesToHash.push(path.relative(REPO_ROOT, c));
      }
    }

    const outDir = opts.outDir ? path.resolve(opts.outDir) : REPO_ROOT;
    const baseDir = opts.baseDir ? path.resolve(opts.baseDir) : REPO_ROOT;

    console.log(`📦 Generating release checksums for ${filesToHash.length} file(s)...`);
    const written = writeReleaseIntegrityFiles(filesToHash, outDir, baseDir);

    console.log(`✅ Generated SHA-256 digests: ${path.relative(REPO_ROOT, written.sha256sumsPath)}`);
    console.log(`✅ Generated SHA-512 digests: ${path.relative(REPO_ROOT, written.sha512sumsPath)}`);
    console.log(`✅ Generated JSON manifest:  ${path.relative(REPO_ROOT, written.jsonManifestPath)}`);
    return 0;
  }

  console.log(`Cradle Release Integrity Tool
Usage:
  node scripts/release-integrity.js --generate [files...] [--out <dir>]
  node scripts/release-integrity.js --verify <checksum-file> [--dir <base-dir>]
  node scripts/release-integrity.js --check-file <file> <expected-hash> [--algo <sha256|sha512>]
`);
  return 0;
}

if (require.main === module) {
  const exitCode = runCli();
  process.exit(exitCode);
}

module.exports = {
  computeFileHash,
  generateChecksumList,
  generateReleaseManifest,
  parseChecksumFile,
  verifyFileChecksum,
  verifyReleaseChecksums,
  writeReleaseIntegrityFiles,
  parseCliArgs,
  runCli,
  DEFAULT_ALGORITHMS,
};
