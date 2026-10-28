# Security Policy

Cradle is a public portfolio of small prototypes and learning projects. It ships
plain static files with no build step, no user accounts, and no secrets, which
keeps the attack surface small. This document records the project's security
practices so contributors can keep it that way.

## Reporting a Vulnerability

This repository does not host production data or infrastructure, so there is no
dedicated security contact. If you find a real security problem (for example a
way to run unexpected code in a visitor's browser):

1. **Do not** create a public issue describing an exploitable bug in detail.
2. Open an issue titled `Security report: <short summary>` and briefly describe
   the impact and how to reproduce it.
3. Maintainers can audit site files directly in the repo, so a full
   reproduction outside the repository is not necessary.

Security-impacting fixes are applied through normal pull requests; PRs that
reduce risk are always welcome.

## Worker Integrity Policy

**Workers are only allowed from same-origin scripts committed to this
repository.**

- `Worker` / `SharedWorker` / `importScripts` URLs must be **string literals**
  pointing at files inside this repository. Dynamic worker URLs
  (`new Worker(someVariable)` or `new Worker(new URL(...))`) and remote URLs
  (`https://...`, `data:`, `blob:`, protocol-relative `//...`) are prohibited.
- Every worker script is registered in `data/worker-integrity.json` with a
  `sha256` of its content. The committed hash is checked against the working
  tree on every CI run by `npm run validate:worker-integrity`
  (`scripts/validate-worker-integrity.js`), so a modified or swapped worker
  script fails the build.
- Why this matters: a worker script is executed with full privileges of its
  origin. Integrity-checking the script itself removes the "trusted but
  replaced" risk class and keeps dependencies auditable in a single file.

### Adding a new worker

1. Create the worker script as a file in the repository (for example next to
   the page that uses it).
2. Construct it with a literal URL: `new Worker("./my-worker.js")` or
   `importScripts("helper.js")`.
3. Register it and compute the hash:

   ```sh
   npm run validate:worker-integrity -- --update
   ```

4. Commit the worker file, the updated `data/worker-integrity.json`, and any
   tests together.

### Removing or editing a worker

Edit the script and run `npm run validate:worker-integrity -- --update` to
refresh the committed hash. When a worker is removed from the code, also remove
its entry from `data/worker-integrity.json` (the validator reports stale
entries otherwise).

## postMessage Trust Model

Cradle uses dedicated, same-origin workers. Dedicated-worker message events
always report an empty `event.origin` and the worker URL is hardcoded, so the
browser already guarantees origin trust; the runtime hardening is validating
the **shape** of every message before acting on it. All inbound payloads on
both ends of the worker channel are validated (see the `src/utils`
`messageValidation` module and `tests/message-validation.test.js`). Do not add
cross-window (`window.addEventListener("message", ...)`) channels without a
matching `event.origin` check.

## External Dependencies

Where external resources are loaded over a CDN, pin the resource and use
Subresource Integrity (`integrity="sha384-..."`) attributes so a compromised
CDN cannot execute code in a visitor's browser.

## Dynamic Script & Model Execution Trust Model

**Third-party model scripts and external code must not be dynamically executed without strict trust boundaries.**

When code loads or injects external scripts at runtime (such as browser AI models or utility libraries via `loadScriptAsync`):

1. **Origin Allowlist:** Dynamic injection is restricted exclusively to trusted, vetted CDN endpoints (`cdn.jsdelivr.net`, `unpkg.com`, `cdnjs.cloudflare.com`, `huggingface.co`). Requests targeting unauthorized domains, insecure `http://`, or pseudo-protocols (`javascript:`, `data:`) fail closed and are blocked before DOM injection.
2. **Mandatory Integrity Verification (SRI):** External script tags must include cryptographic SRI hashes (`sha256`, `sha384`, `sha512`) and `crossorigin="anonymous"`. Known models (such as TensorFlow.js and MobileNet) maintain committed SRI hashes in `KNOWN_MODEL_INTEGRITY`.
3. **Controlled Lifecycle:** Scripts are tracked in an in-flight cache to prevent duplicate fetches. Injections enforce bounded timeouts (`DEFAULT_SCRIPT_TIMEOUT_MS = 15000`); on error or timeout, the injected `<script>` node is immediately purged from the DOM.
4. **Sandboxed Isolation Strategy:** Untrusted third-party code must execute within an isolated sandboxed iframe (`sandbox="allow-scripts"` without `allow-same-origin`) or Web Worker. This cuts off access to `window.parent`, `localStorage`, `document.cookie`, and top-level DOM nodes. In addition, `snapshotGlobalKeys` and `detectGlobalPollution` are provided to audit global namespace contamination.


## User-Gesture-Driven Audio Activation Policy

**Web Audio contexts and media playback must only be instantiated or resumed after an explicit user interaction (click, keypress, tap).**

To adhere to browser autoplay policies, respect user preferences, and avoid unexpected background noise or console warnings:

1. **Explicit Trigger Requirement:** Audio contexts (`new AudioContext()`) and audio graph resumption (`audioContext.resume()`) must be triggered by an explicit user gesture (e.g. clicking a "Play", "Record", piano key, or toggle button).
2. **No Eager or Auto-playing Audio:** Mini-projects and UI components must never initialize running audio graphs or call `.play()` during initial page load, `DOMContentLoaded`, or unprompted lifecycle events.
3. **Graceful State Handling:** Applications using Web Audio should check `audioContext.state === "suspended"` upon user gesture and call `audioContext.resume()`, with error handling in case the promise is rejected.
4. **Validation Guardrails:** Shipped code is guarded by repository tests ensuring audio initialization helpers conform to user-driven event handler pathways.

## Frame Embedding & Clickjacking Policy

**Cradle mini-pages and interactive demos are designed for direct standalone navigation and must not be embedded in untrusted external frames.**

To protect users against clickjacking (UI redressing) attacks, the following policy applies:

1. **Standalone Execution Model:** All mini-projects (`projects/*/*/index.html`), UI components, and the main landing page (`index.html`) run directly in top-level browser contexts. No project in this repository requires or expects embedding inside third-party frames or iframes.
2. **Clickjacking Defense via HTTP Headers:** Production hosting environments (such as GitHub Pages, Cloudflare, Netlify, or custom reverse proxies) should send HTTP response headers that restrict frame ancestry:
   - `Content-Security-Policy: frame-ancestors 'self';` (or `frame-ancestors 'none';` where framing by the same origin is also unneeded)
   - `X-Frame-Options: SAMEORIGIN` (or `DENY` for legacy browser fallback)
3. **Repository Guardrails:** Repository validation tooling (`scripts/validate-no-dynamic-eval.js` and `scripts/validate-demo-html.js`) ensures that:
   - Shipped pages do not dynamically construct unvalidated `<iframe>` elements or embed arbitrary external targets without security review.
   - If an `<iframe>` is ever introduced for an isolated sandbox or interactive preview, it must use explicit `sandbox` attributes (e.g. `sandbox="allow-scripts"`) and never embed `javascript:` or untrusted `data:` URIs.

## SVG Thumbnail Security Policy

**SVG thumbnails are treated as untrusted assets and must be hardened against script execution, event handlers, and unauthorized external resource fetches.**

Because Cradle displays interactive previews and cards for dozens of independently contributed mini-projects in the project gallery:

1. **Strictly Inert Thumbnails:** SVG thumbnails (`thumbnail.svg`) rendered in gallery cards and components must never execute code or initiate unauthorized network calls.
2. **Prohibited Constructs:**
   - `<script>` tags and CDATA script blocks are strictly forbidden.
   - Inline event handlers (`onload`, `onerror`, `onclick`, `onmouseover`, `onbegin`, `onend`, etc.) are forbidden on any element.
   - `<foreignObject>` tags and embedded HTML (e.g. `<iframe>`, `<embed>`, `<form>`, `<input>`) are forbidden.
   - Dangerous pseudo-protocols (`javascript:`, `vbscript:`, `data:text/html`) in `href` or `xlink:href` are forbidden.
   - Remote external references (`<use href="https://...">`, `<image href="https://...">`, `<feImage href="https://...">`, `@import`) that could cause tracking, credential leakage, or SSRF are stripped or blocked.
   - XML Entity Expansion (XXE) and `<!DOCTYPE>` declarations are prohibited.
3. **Card Rendering Isolation:**
   - Gallery cards render thumbnails via `<img>` elements with `loading="lazy"`, `decoding="async"`, and `referrerpolicy="no-referrer"`.
   - SVG data URIs passed to card components are decoded and validated with `isSvgSafe()` before rendering; unsafe payloads fall back gracefully to a non-executable initial-letter avatar.
4. **Contract Verification:**
   - Every project's `thumbnail.svg` is evaluated during CI by `scripts/validate-mini-contract.js` using `validateSvgThumbnail()`. Any file containing scripts, event handlers, or external references triggers an immediate `unsafe-svg-thumbnail` build failure.


## Production Dependency Vulnerability Policy

**Production dependencies must be free of known High and Critical security vulnerabilities.**

While Cradle's mini-projects are largely dependency-free, any dependencies specified for production runtime must adhere to strict supply chain security standards.

### 1. Centralized CI Scanning

Dependency scanning is centralized and enforced automatically on all pull requests and pushes to protected branches via GitHub Actions (`.github/workflows/dependency-scan.yml` and `.github/workflows/test.yml`).

- Scans focus specifically on production dependencies (`--omit=dev`).
- Automated checks execute `npm run audit:deps` (`scripts/audit-dependencies.js`).

### 2. Policy for High-Severity Findings

- **Zero Tolerance for High & Critical Findings:** Any finding with a Common Vulnerability Scoring System (CVSS) rating of **High** (CVSS 7.0–8.9) or **Critical** (CVSS 9.0–10.0) in production dependencies will immediately fail the CI check.
- **Mandatory PR Gate:** Pull requests introducing or containing High or Critical production dependency vulnerabilities cannot be merged.
- **Remediation SLAs:**
  - **Critical Vulnerabilities:** Immediate triage; patched, replaced, or removed within **48 hours**.
  - **High Vulnerabilities:** Remediated or mitigated within **7 days**.
  - **Moderate / Low Vulnerabilities:** Reviewed and addressed during regular dependency maintenance cycles.

### 3. Pull Request Visibility & Reporting

When a dependency check fails:

- A detailed markdown audit report is appended directly to the GitHub Actions **Step Summary** (`$GITHUB_STEP_SUMMARY`), presenting a structured breakdown of affected packages, severity ratings, advisory links, and vulnerable version ranges.
- GitHub Actions inline `::error` annotations are emitted, highlighting failing packages in the pull request conversation and checks tabs.

### 4. Contributor Remediation Workflow

Before submitting a pull request, contributors should verify dependencies locally:

```bash
npm run audit:deps
```

If vulnerabilities are flagged:

1. Attempt non-breaking automated fixes with `npm audit fix --omit=dev`.
2. For breaking updates or transitive issues, update the top-level package version in `package.json` to require a secure release.
3. If no upstream patch exists, replace the dependency with an actively maintained alternative.

## Distributed Release Asset Integrity Policy

**All official release assets, archives, and distributed packages must be published with cryptographic checksums.**

To guarantee that downloaded release artifacts have not been tampered with or corrupted:

1. **Mandatory Digest Manifests:** Every release bundle (`.tar.gz`, `.zip`, standalone distributions) must be accompanied by `SHA256SUMS`, `SHA512SUMS`, and a structured `release-integrity.json` manifest.
2. **Standard Format:** Checksums are formatted using standard GNU coreutils syntax (`<hash>  <filename>`), enabling verification via `sha256sum -c SHA256SUMS` or `shasum -a 256 -c SHA256SUMS`.
3. **Consumer Verification Support:** Consumers can verify downloads using the built-in CLI command:
   ```bash
   npm run verify:release-integrity -- SHA256SUMS
   ```
4. **Out-of-Band Verification:** Maintainers should include the SHA-256 digests directly in release notes so consumers can verify integrity without relying solely on the downloaded manifest file. See [RELEASE_INTEGRITY.md](RELEASE_INTEGRITY.md) for full instructions.

## Production Deployment Security Checklist

Before releasing Cradle or deploying to any public or staging host (GitHub Pages, Cloudflare, Netlify, Caddy, Nginx), verify all baseline security controls against the [Secure Deployment Checklist](SECURE_DEPLOYMENT_CHECKLIST.md). The checklist covers:

- **HTTPS & TLS configuration:** Strict redirect, TLS 1.2/1.3 enforcement, and zero mixed content.
- **HSTS:** Header setup, staged rollout, and preload list submission (`hstspreload.org`).
- **CSP (Content Security Policy):** Least-privilege directives matching Cradle's script, font, and model sources.
- **Subresource Integrity (SRI):** Mandatory cryptographic hashes on third-party CDN assets.
- **Security Headers:** `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy`.
- **Dependency & Worker Integrity:** CI audit gates, lockfile enforcement, and same-origin worker hash verification.
- **Pre-Flight Sign-Off:** Verification matrix and test commands before going live.

