# Release Asset Integrity & Checksum Verification Guide

To protect consumers and downstream deployments against man-in-the-middle tampering, truncated downloads, and supply-chain compromises, all Cradle release assets, archives, and distributed bundles are accompanied by cryptographic checksums.

This guide outlines how to generate, distribute, and verify release asset checksums.

---

## 1. Integrity Mechanisms Provided

Every official release includes:

| File | Purpose | Standard Format |
|---|---|---|
| `SHA256SUMS` | GNU coreutils-compatible SHA-256 checksums | `<hex-hash>  <filename>` |
| `SHA512SUMS` | High-security SHA-512 checksums | `<hex-hash>  <filename>` |
| `release-integrity.json` | Machine-readable manifest with multi-algorithm digests, byte sizes, and timestamps | Structured JSON manifest |

---

## 2. Consumer Verification Instructions

Before extracting or deploying release assets, verify the cryptographic digests against the published `SHA256SUMS` or `SHA512SUMS` file.

### Linux (GNU coreutils)

Download the release archive and `SHA256SUMS` into the same directory, then run:

```bash
sha256sum -c SHA256SUMS
```

To ignore missing optional files and verify only downloaded assets:

```bash
sha256sum -c --ignore-missing SHA256SUMS
```

Expected output:
```text
cradle-1.0.0.tar.gz: OK
cradle-1.0.0.zip: OK
```

### macOS

Using standard macOS `shasum`:

```bash
shasum -a 256 -c SHA256SUMS
```

For SHA-512:
```bash
shasum -a 512 -c SHA512SUMS
```

### Windows (PowerShell)

Compute the SHA-256 hash of a downloaded archive:

```powershell
Get-FileHash -Algorithm SHA256 .\cradle-1.0.0.tar.gz
```

Compare the resulting `Hash` string with the entry in `SHA256SUMS`.

### Using the Cradle Integrity Tool

If you have Node.js installed, verify all assets or single files directly using the Cradle CLI:

```bash
# Verify all files in the current folder against SHA256SUMS
npm run verify:release-integrity -- SHA256SUMS

# Verify assets in a custom directory against a JSON manifest
node scripts/release-integrity.js --verify release-integrity.json --dir ./dist

# Verify an individual file against an expected hash
node scripts/release-integrity.js --check-file cradle-1.0.0.zip <expected-hash>
```

---

## 3. Release Maintainer Workflow

Release managers must generate checksum manifests as part of the release packaging pipeline prior to publishing release tags on GitHub.

### Step 1: Package Distributable Assets

Build project metadata and create release archives:

```bash
npm run build
tar -czvf cradle-1.0.0.tar.gz --exclude='.git' --exclude='node_modules' .
zip -r cradle-1.0.0.zip . -x "*.git*" -x "*node_modules*"
```

### Step 2: Generate Checksum Manifests

Generate `SHA256SUMS`, `SHA512SUMS`, and `release-integrity.json`:

```bash
node scripts/release-integrity.js --generate cradle-1.0.0.tar.gz cradle-1.0.0.zip --out ./dist
```

### Step 3: Publish to GitHub Releases

Upload the following assets together to the GitHub Release:
1. Release packages (`cradle-1.0.0.tar.gz`, `cradle-1.0.0.zip`)
2. `SHA256SUMS`
3. `SHA512SUMS`
4. `release-integrity.json`

Paste the contents of `SHA256SUMS` into the release notes body so users can visually verify digests out-of-band without downloading external files.

---

## 4. Automation via GitHub Actions

Release asset generation and checksum generation are automated via `.github/workflows/release-integrity.yml`. When a release tag (`v*.*.*`) is published:

1. CI checks out code and runs pre-flight tests.
2. The release workflow packages the release assets.
3. `scripts/release-integrity.js` produces `SHA256SUMS` and `release-integrity.json`.
4. Artifacts and checksum manifests are attached automatically to the GitHub release.
