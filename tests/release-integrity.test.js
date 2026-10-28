const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const {
  computeFileHash,
  generateChecksumList,
  generateReleaseManifest,
  parseChecksumFile,
  verifyFileChecksum,
  verifyReleaseChecksums,
  writeReleaseIntegrityFiles,
  parseCliArgs,
} = require("../scripts/release-integrity.js");

function createTempDir(prefix = "release-test-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanupTempDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

test("computeFileHash computes accurate SHA-256 and SHA-512 digests", () => {
  const tmp = createTempDir();
  try {
    const filePath = path.join(tmp, "sample.tar.gz");
    const testData = Buffer.from("CRADLE_RELEASE_PAYLOAD_TEST_DATA_12345");
    fs.writeFileSync(filePath, testData);

    const expectedSha256 = crypto
      .createHash("sha256")
      .update(testData)
      .digest("hex");
    const expectedSha512 = crypto
      .createHash("sha512")
      .update(testData)
      .digest("hex");

    const sha256Res = computeFileHash(filePath, "sha256");
    assert.equal(sha256Res.hash, expectedSha256);
    assert.equal(sha256Res.sizeBytes, testData.length);
    assert.equal(sha256Res.algorithm, "sha256");

    const sha512Res = computeFileHash(filePath, "sha512");
    assert.equal(sha512Res.hash, expectedSha512);
    assert.equal(sha512Res.sizeBytes, testData.length);
    assert.equal(sha512Res.algorithm, "sha512");
  } finally {
    cleanupTempDir(tmp);
  }
});

test("computeFileHash throws on non-existent path or directory", () => {
  const tmp = createTempDir();
  try {
    assert.throws(
      () => computeFileHash(path.join(tmp, "non-existent.zip")),
      /File not found/i
    );
    assert.throws(() => computeFileHash(tmp), /not a regular file/i);
  } finally {
    cleanupTempDir(tmp);
  }
});

test("generateChecksumList formats GNU coreutils-compatible checksum files", () => {
  const tmp = createTempDir();
  try {
    const file1 = path.join(tmp, "cradle-1.0.0.tar.gz");
    const file2 = path.join(tmp, "cradle-1.0.0.zip");
    fs.writeFileSync(file1, "archive-1");
    fs.writeFileSync(file2, "archive-2");

    const content = generateChecksumList([file1, file2], tmp, "sha256");
    const lines = content.trim().split("\n");

    assert.equal(lines.length, 2);
    const hash1 = crypto.createHash("sha256").update("archive-1").digest("hex");
    const hash2 = crypto.createHash("sha256").update("archive-2").digest("hex");

    assert.equal(lines[0], `${hash1}  cradle-1.0.0.tar.gz`);
    assert.equal(lines[1], `${hash2}  cradle-1.0.0.zip`);
  } finally {
    cleanupTempDir(tmp);
  }
});

test("generateReleaseManifest builds comprehensive JSON metadata", () => {
  const tmp = createTempDir();
  try {
    const asset = path.join(tmp, "bundle.js");
    fs.writeFileSync(asset, "console.log('cradle');");

    const manifest = generateReleaseManifest([asset], tmp, {
      release: "cradle@2.0.0",
      version: "2.0.0",
      timestamp: "2026-10-27T12:00:00.000Z",
    });

    assert.equal(manifest.release, "cradle@2.0.0");
    assert.equal(manifest.version, "2.0.0");
    assert.equal(manifest.generatedAt, "2026-10-27T12:00:00.000Z");
    assert.equal(manifest.files.length, 1);
    assert.equal(manifest.files[0].path, "bundle.js");
    assert.equal(manifest.files[0].sizeBytes, 21);
    assert.ok(manifest.files[0].sha256);
    assert.ok(manifest.files[0].sha512);
  } finally {
    cleanupTempDir(tmp);
  }
});

test("parseChecksumFile parses standard, binary mode, and commented lines", () => {
  const text = `
# Release Checksums
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  empty.txt
ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad *archive.tar.gz

# Trailing comment
`;

  const records = parseChecksumFile(text);
  assert.equal(records.length, 2);
  assert.equal(records[0].file, "empty.txt");
  assert.equal(
    records[0].hash,
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  );
  assert.equal(records[1].file, "archive.tar.gz");
  assert.equal(
    records[1].hash,
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
  );
});

test("verifyFileChecksum accurately validates match and detects tampering", () => {
  const tmp = createTempDir();
  try {
    const file = path.join(tmp, "release.zip");
    fs.writeFileSync(file, "authentic-content");
    const validHash = crypto
      .createHash("sha256")
      .update("authentic-content")
      .digest("hex");

    // Match verification
    const validRes = verifyFileChecksum(file, validHash);
    assert.equal(validRes.valid, true);
    assert.equal(validRes.error, null);

    // Tampered content verification
    const tamperedRes = verifyFileChecksum(file, "0000000000000000000000000000000000000000000000000000000000000000");
    assert.equal(tamperedRes.valid, false);
    assert.ok(tamperedRes.error.includes("mismatch"));
  } finally {
    cleanupTempDir(tmp);
  }
});

test("verifyReleaseChecksums validates full manifest and flags missing/tampered files", () => {
  const tmp = createTempDir();
  try {
    const fileA = path.join(tmp, "good.txt");
    const fileB = path.join(tmp, "corrupt.txt");
    fs.writeFileSync(fileA, "good-data");
    fs.writeFileSync(fileB, "bad-data");

    const hashA = crypto.createHash("sha256").update("good-data").digest("hex");
    const forgedHashB = "1111111111111111111111111111111111111111111111111111111111111111";
    const missingHashC = "2222222222222222222222222222222222222222222222222222222222222222";

    const checksumContent = `
${hashA}  good.txt
${forgedHashB}  corrupt.txt
${missingHashC}  missing.txt
`;
    const manifestPath = path.join(tmp, "SHA256SUMS");
    fs.writeFileSync(manifestPath, checksumContent);

    const report = verifyReleaseChecksums(manifestPath, tmp);
    assert.equal(report.total, 3);
    assert.equal(report.matched, 1);
    assert.equal(report.allPassed, false);
    assert.equal(report.failed.length, 2);

    const corruptFail = report.failed.find(f => f.file === "corrupt.txt");
    assert.ok(corruptFail);
    assert.ok(corruptFail.reason.includes("mismatch"));

    const missingFail = report.failed.find(f => f.file === "missing.txt");
    assert.ok(missingFail);
    assert.ok(missingFail.reason.includes("does not exist"));
  } finally {
    cleanupTempDir(tmp);
  }
});

test("writeReleaseIntegrityFiles generates and re-verifies complete integrity suite", () => {
  const tmp = createTempDir();
  try {
    const asset1 = path.join(tmp, "app.js");
    const asset2 = path.join(tmp, "style.css");
    fs.writeFileSync(asset1, "const x = 42;");
    fs.writeFileSync(asset2, "body { color: red; }");

    const written = writeReleaseIntegrityFiles([asset1, asset2], tmp, tmp);
    assert.ok(fs.existsSync(written.sha256sumsPath));
    assert.ok(fs.existsSync(written.sha512sumsPath));
    assert.ok(fs.existsSync(written.jsonManifestPath));

    // Verify SHA-256
    const report256 = verifyReleaseChecksums(written.sha256sumsPath, tmp);
    assert.equal(report256.allPassed, true);
    assert.equal(report256.matched, 2);

    // Verify JSON manifest
    const reportJson = verifyReleaseChecksums(written.jsonManifestPath, tmp);
    assert.equal(reportJson.allPassed, true);
    assert.equal(reportJson.matched, 2);
  } finally {
    cleanupTempDir(tmp);
  }
});

test("parseCliArgs parses CLI flags correctly", () => {
  const genArgs = parseCliArgs(["--generate", "file1.zip", "file2.tar.gz", "--out", "dist/"]);
  assert.equal(genArgs.command, "generate");
  assert.deepEqual(genArgs.files, ["file1.zip", "file2.tar.gz"]);
  assert.equal(genArgs.outDir, "dist/");

  const verifyArgs = parseCliArgs(["--verify", "SHA256SUMS", "--dir", "release/"]);
  assert.equal(verifyArgs.command, "verify");
  assert.equal(verifyArgs.checksumFile, "SHA256SUMS");
  assert.equal(verifyArgs.baseDir, "release/");

  const checkFileArgs = parseCliArgs(["--check-file", "bundle.zip", "abcdef1234", "--algo", "sha512"]);
  assert.equal(checkFileArgs.command, "check-file");
  assert.equal(checkFileArgs.singleFile, "bundle.zip");
  assert.equal(checkFileArgs.expectedHash, "abcdef1234");
  assert.equal(checkFileArgs.algorithm, "sha512");
});
