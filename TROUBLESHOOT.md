# Troubleshooting Guide

Welcome to the Cradle troubleshooting guide. This document covers the most common issues contributors run into during setup, development, and contribution, along with step-by-step fixes for each one.

If your issue is not listed here, please check the [GitHub Issues page](https://github.com/Facelessism/cradle/issues) before opening a new one — it may already be resolved.

---

## Table of Contents

- [Repository Setup Issues](#repository-setup-issues)
- [Development Issues](#development-issues)
- [Build & Runtime Issues](#build--runtime-issues)
- [Git & GitHub Issues](#git--github-issues)
- [Documentation Issues](#documentation-issues)
- [Browser Compatibility Tips](#browser-compatibility-tips)
- [HTTPS and HSTS Deployment Guidance](#https-and-hsts-deployment-guidance)
- [Best Practices Before Opening an Issue](#best-practices-before-opening-an-issue)
- [Quick Troubleshooting Checklist](#quick-troubleshooting-checklist)
- [Useful Commands](#useful-commands)
- [Helpful Links](#helpful-links)

---

## Repository Setup Issues

### Git clone fails or times out

**Symptom:** `git clone` hangs or returns a network error.

**Fixes:**

- Check your internet connection.
- Make sure you are cloning your **fork**, not the upstream repo directly.
- Use HTTPS if SSH is blocked on your network:

```bash
git clone https://github.com/<your-username>/cradle.git
```

- If you have 2FA enabled, use a Personal Access Token (PAT) instead of your password. See [Authentication / PAT problems](#authentication--pat-problems).

---

### Incorrect project structure after cloning

**Symptom:** Folders like `projects/` or `data/` are missing after cloning.

**Fixes:**

- Make sure you cloned the correct repository URL.
- Run `ls` (macOS/Linux) or `dir` (Windows) inside the cloned folder to confirm you are in the right directory.
- Re-clone if needed:

```bash
rm -rf cradle
git clone https://github.com/<your-username>/cradle.git
```

---

### Missing dependencies

**Symptom:** A project fails to load or a script throws an error about a missing module.

**Fixes:**

- Most Cradle projects are dependency-free and run directly in the browser.
- If a project includes a `package.json`, install dependencies with:

```bash
npm install
```

- If a project includes a `requirements.txt`, install with:

```bash
pip install -r requirements.txt
```

- Check the project's own `ARCHITECTURE.md` for specific setup instructions.

---

### Local server not starting

**Symptom:** `python -m http.server` command not found or fails immediately.

**Fixes:**

- Make sure Python is installed:

```bash
python --version
# or
python3 --version
```

- On some systems the command is `python3`:

```bash
python3 -m http.server 8000
```

- If port 8000 is already in use, use a different port:

```bash
python3 -m http.server 9000
```

- Then visit `http://localhost:9000` in your browser.

---

## Development Issues

### `index.html` not loading correctly

**Symptom:** The page opens but looks broken, or nothing renders at all.

**Fixes:**

- Open the browser developer console (`F12` → Console tab) and check for errors.
- Make sure you opened the file through a local server (`http://localhost:8000`), not by double-clicking the file (`file://`). Some browser security rules block scripts loaded via `file://`.
- Verify you opened the correct `index.html`. The root `index.html` is the landing page. Each project has its own `index.html` inside its folder.

---

### CSS or JavaScript changes not reflecting

**Symptom:** You edited a file but the browser still shows the old version.

**Fixes:**

- Hard-refresh the browser:
  - **Mac:** `Cmd + Shift + R`
  - **Windows/Linux:** `Ctrl + Shift + R`
- Open DevTools → Network tab → check **Disable cache** → reload.
- Try opening the page in a private/incognito window.

---

### Browser cache problems

**Symptom:** Old styles or scripts keep appearing even after changes.

**Fix:** Clear the browser cache entirely:

- **Chrome/Edge:** Settings → Privacy → Clear browsing data → Cached images and files
- **Firefox:** Settings → Privacy → Clear Data → Cached Web Content
- Or use DevTools → Application → Storage → Clear site data.

---

### Relative path issues

**Symptom:** Images, stylesheets, or scripts return 404 errors in the console.

**Fixes:**

- Always run the project from the **repository root** using a local server, not from inside a project subfolder.
- Check that asset paths in HTML files use paths relative to that file's location, not to the root.

```html
<!-- Correct — relative to the project folder -->
<link rel="stylesheet" href="style.css" />
<script src="script.js"></script>

<!-- Incorrect — absolute path that breaks on different machines -->
<link
  rel="stylesheet"
  href="/Users/yourname/cradle/projects/games/chess/style.css"
/>
```

- The shared `back-to-home.js` script uses a path like `../../../projects/back-to-home.js` — make sure you haven't moved any files.

---

## Build & Runtime Issues

### Python HTTP server errors

| Error                       | Cause                                 | Fix                                                                       |
| --------------------------- | ------------------------------------- | ------------------------------------------------------------------------- |
| `command not found: python` | Python not installed or not on PATH   | Install Python from [python.org](https://www.python.org) or use `python3` |
| `Address already in use`    | Port is occupied by another process   | Use a different port: `python3 -m http.server 9000`                       |
| `Permission denied`         | Port below 1024 requires admin rights | Use a port above 1024 (e.g. 8000, 9000)                                   |

---

### Port already in use

**Symptom:** `OSError: [Errno 98] Address already in use`

**Fix — find and stop the process using the port:**

```bash
# macOS / Linux
lsof -i :8000
kill -9 <PID>

# Windows
netstat -ano | findstr :8000
taskkill /PID <PID> /F
```

Or simply use a different port:

```bash
python3 -m http.server 8080
```

---

### Permission denied errors

**Symptom:** Script or server fails with `Permission denied`.

**Fixes:**

- Do **not** use `sudo` to run a development server. Use a port above 1024 instead.
- On macOS/Linux, check file permissions:

```bash
ls -la
chmod 644 index.html
```

---

### Missing assets / images / icons

**Symptom:** Images or icons are broken (show as blank or 404 in the console).

**Fixes:**

- Confirm the asset file actually exists in the expected folder.
- Check the file name casing — `Logo.png` and `logo.png` are different files on Linux/macOS.
- Some projects load assets from external CDN URLs. These require an active internet connection.

---

### Broken project links on the landing page

**Symptom:** Clicking a project card on `index.html` goes to a 404 page.

**Fixes:**

- Make sure you are running the server from the **repository root**, not from inside a subfolder.
- Check `data/projects.json` — the `path` value for each project must point to the correct `index.html` relative to the root.
- Verify the project folder name matches exactly what is listed in `projects.json`.

---

## Git & GitHub Issues

### Merge conflicts

**Symptom:** `git pull` or `git merge` reports conflicts.

**Fix:**

1. Open the conflicting file(s) — Git marks conflicts with `<<<<<<<`, `=======`, `>>>>>>>`.
2. Manually keep the correct version and remove the conflict markers.
3. Stage the resolved file and commit:

```bash
git add <file>
git commit -m "fix: resolve merge conflict in <file>"
```

---

### Push rejected

**Symptom:** `git push` fails with `rejected — non-fast-forward`.

**Fix:** Your local branch is behind the remote. Pull first, then push:

```bash
git pull origin main --rebase
git push
```

> Never force-push to shared branches.

---

### Fork out of sync

**Symptom:** Your fork is several commits behind `Facelessism/cradle:main`.

**Fix:** Sync your fork with the upstream repository:

```bash
# Add upstream remote (only needed once)
git remote add upstream https://github.com/Facelessism/cradle.git

# Fetch and merge upstream changes
git fetch upstream
git checkout main
git merge upstream/main

# Push the updated main to your fork
git push origin main
```

---

### Authentication / PAT problems

**Symptom:** `git push` asks for a password and then fails, or returns `403 Forbidden`.

**Fixes:**

- GitHub no longer accepts account passwords for Git operations. Use a **Personal Access Token (PAT)**.
- Generate one at: GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token.
- Select the `repo` scope, set an expiry, and copy the token.
- Use the token as your password when Git prompts you, or update your remote URL:

```bash
git remote set-url origin https://<your-token>@github.com/<your-username>/cradle.git
```

---

## Documentation Issues

### README links not working

**Symptom:** Links inside `README.md` go to a 404 page on GitHub.

**Fixes:**

- Use **relative paths** for links within the repository:

```markdown
<!-- Correct -->

[Contributing Guide](CONTRIBUTING.md)

<!-- Incorrect -->

[Contributing Guide](https://github.com/Facelessism/cradle/blob/main/CONTRIBUTING.md)
```

- Heading anchor links must exactly match the heading text (lowercase, spaces replaced with hyphens):

```markdown
[Setup Issues](#repository-setup-issues)
```

---

### Markdown preview differences

**Symptom:** A Markdown file looks fine in your editor but renders differently on GitHub.

**Fixes:**

- GitHub Markdown does not support all extended Markdown syntax (e.g. some custom containers or highlight blocks).
- Stick to standard Markdown: headings, bold, italic, code blocks, tables, and lists.
- Preview your Markdown on GitHub directly by pushing the branch and viewing the file there.

---

## Browser Compatibility Tips

All Cradle projects are designed to run in modern browsers. If something looks broken:

| Issue                  | Likely Cause                                      | Fix                                                              |
| ---------------------- | ------------------------------------------------- | ---------------------------------------------------------------- |
| Styles missing         | Old browser not supporting CSS variables or Grid  | Update to the latest version of Chrome, Firefox, Edge, or Safari |
| Canvas not rendering   | Browser does not support HTML5 Canvas             | Use a modern browser                                             |
| Web Worker not working | `file://` protocol blocks workers                 | Run via a local server (`http://localhost:8000`)                 |
| Clipboard API fails    | `navigator.clipboard` requires HTTPS or localhost | Run via a local server                                           |
| Fonts not loading      | External font CDN blocked                         | Check your internet connection or network settings               |

**Recommended browsers for development:** Chrome (latest), Firefox (latest), Edge (latest).

---

## HTTPS and HSTS Deployment Guidance

Production deployments of Cradle and its web applications must enforce secure communication using HTTPS and HTTP Strict Transport Security (HSTS). This ensures that browsers interact with the application exclusively over encrypted TLS connections and prevents protocol downgrade attacks.

### Why HTTPS & HSTS Are Required

- **Prevent SSL-Stripping and Downgrade Attacks:** In a standard setup, the first user request to `http://` is redirected via HTTP 301/302 to `https://`. Attackers performing a man-in-the-middle (MITM) attack on an untrusted network (e.g., public Wi-Fi) can intercept this initial request and downgrade communication to plain HTTP (`sslstrip`). HSTS tells the browser to automatically convert all requests to `https://` internally before sending any network packet.
- **Secure Context Web APIs:** Many modern web APIs utilized across Cradle projects (such as the Clipboard API `navigator.clipboard`, Web Cryptography `crypto.subtle`, Service Workers, and Geolocation) require a [Secure Context](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts) (HTTPS or `localhost`).
- **Eliminate Mixed-Content Insecurities:** Assets like scripts, stylesheets, fonts, and API requests must be served securely. Browsers block insecure active content (`http://` scripts) on HTTPS pages.
- **Enforce Strict Certificate Validation:** When HSTS is active on a domain, modern browsers strictly prohibit users from bypassing SSL/TLS certificate warnings, preventing users from inadvertently accepting fraudulent or expired certificates.

### HSTS Production Requirements

When deploying Cradle to a production web server, reverse proxy, or custom domain:

1. **Serve All Content Over HTTPS:** Ensure all web assets and HTML entry points are accessible via TLS with a trusted, CA-signed certificate (e.g., Let's Encrypt).
2. **Redirect HTTP to HTTPS:** Permanently redirect all incoming HTTP (port 80) traffic to HTTPS (port 443) using HTTP status code 301 or 308.
3. **Send the `Strict-Transport-Security` Header:** Include the header on all HTTPS responses (including error pages). Do not serve this header over unencrypted HTTP.
4. **Use a Long `max-age`:** Set `max-age` to at least 1 year (`31536000` seconds), with a recommended production duration of 2 years (`63072000` seconds).
5. **Protect All Subdomains:** Include `includeSubDomains` if all subdomains (such as `api.`, `assets.`, `www.`) support HTTPS.
6. **Enable HSTS Preloading:** Use the `preload` directive once verified and register your domain with the global browser [HSTS Preload List](https://hstspreload.org/).

### Recommended HSTS Header

For production domains with full HTTPS coverage:

```http
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

#### Directive Reference

| Directive | Description | Recommended Production Value |
| --- | --- | --- |
| `max-age=<seconds>` | Time (in seconds) the browser caches the policy and forces HTTPS. | `63072000` (2 years) or `31536000` (1 year) |
| `includeSubDomains` | Applies the HSTS policy to all existing and future subdomains. | Enabled (ensure all subdomains support HTTPS first) |
| `preload` | Signals consent to include the domain in browser-bundled preload lists. | Enabled when permanently committed to HTTPS |

> [!WARNING]
> Do not enable `preload` or long `max-age` values until you have confirmed that your domain and all subdomains serve valid TLS certificates. Once preloaded into browsers, removing the policy can take months.

### Staged Rollout Strategy

To prevent accidental lockouts during initial deployment, adopt a phased rollout:

1. **Stage 1 (Initial Validation):** Test basic HTTPS redirect and short-lived caching:
   ```http
   Strict-Transport-Security: max-age=300
   ```
2. **Stage 2 (Subdomain Testing):** Expand to subdomains for 1 day:
   ```http
   Strict-Transport-Security: max-age=86400; includeSubDomains
   ```
3. **Stage 3 (Production Staging):** Increase cache duration to 1 year:
   ```http
   Strict-Transport-Security: max-age=31536000; includeSubDomains
   ```
4. **Stage 4 (Full Preload Eligibility):** Set 2 years, add `preload`, and submit to [hstspreload.org](https://hstspreload.org/):
   ```http
   Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
   ```

### Recommended Production Server Configurations

#### 1. Nginx

In your Nginx configuration (e.g., `/etc/nginx/sites-available/cradle.conf`):

```nginx
# Redirect all HTTP requests to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name example.com www.example.com;
    return 301 https://$host$request_uri;
}

# Production HTTPS server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name example.com www.example.com;

    ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Enforce HSTS (use 'always' so the header is sent even on error responses)
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;

    # Additional security headers
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    root /var/www/cradle;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }
}
```

#### 2. Apache HTTP Server (`.htaccess` or VirtualHost)

Ensure `mod_headers` and `mod_rewrite` are active in your Apache configuration:

```apache
# Redirect HTTP to HTTPS
<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteCond %{HTTPS} off
    RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
</IfModule>

# Enforce HSTS header on HTTPS
<IfModule mod_headers.c>
    Header always set Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-Frame-Options "DENY"
</IfModule>
```

#### 3. Caddy Server

Caddy provisions automatic HTTPS by default. Add the HSTS header to your `Caddyfile`:

```caddy
example.com, www.example.com {
    root * /var/www/cradle
    file_server

    header {
        Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
    }
}
```

#### 4. GitHub Pages (Custom Domains)

For repositories hosted on GitHub Pages:

- Open **Repository Settings** → **Pages**.
- Ensure your custom domain is configured and DNS records (`CNAME` / `A`) are verified.
- Check the **Enforce HTTPS** checkbox. GitHub Pages automatically provisions a TLS certificate and redirects HTTP to HTTPS.
- *Note:* If using a custom apex domain behind Cloudflare CDN in front of GitHub Pages, configure HSTS directly on Cloudflare.

#### 5. Cloudflare (CDN / Reverse Proxy)

When routing traffic through Cloudflare:

1. Navigate to **SSL/TLS** → **Edge Certificates**.
2. Turn on **Always Use HTTPS** to automatically redirect HTTP traffic.
3. Under **HTTP Strict Transport Security (HSTS)**, click **Change HSTS settings**.
4. Configure the parameters:
   - **Enable HSTS:** Yes
   - **Max-Age Header:** 12 months (or 24 months)
   - **Apply HSTS policy to subdomains (`includeSubDomains`):** Yes
   - **Preload:** Yes
5. Save the configuration.

#### 6. Static Hosting Providers (Vercel & Netlify)

- **Netlify (`_headers` file in repo root):**
  ```text
  /*
    Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
    X-Content-Type-Options: nosniff
  ```
- **Vercel (`vercel.json` in repo root):**
  ```json
  {
    "headers": [
      {
        "source": "/(.*)",
        "headers": [
          {
            "key": "Strict-Transport-Security",
            "value": "max-age=63072000; includeSubDomains; preload"
          },
          {
            "key": "X-Content-Type-Options",
            "value": "nosniff"
          }
        ]
      }
    ]
  }
  ```

### Troubleshooting HSTS Issues

#### Browser certificate warning cannot be bypassed
- **Symptom:** The browser displays `NET::ERR_CERT_COMMON_NAME_INVALID`, `SEC_ERROR_EXPIRED_CERTIFICATE`, or `SSL_ERROR_BAD_CERT_DOMAIN`, and the "Advanced → Proceed" button is absent.
- **Cause:** HSTS disallows manual certificate bypasses by design to protect users from spoofing.
- **Fix:**
  - Verify that the server's TLS certificate is valid, not expired, and matches the domain name.
  - For local development, test using `localhost` or standard HTTP local servers. Do not emit HSTS headers during development.
  - To clear a cached HSTS policy during testing:
    - **Chrome / Edge / Chromium:** Navigate to `chrome://net-internals/#hsts`, go to **Delete domain security policies**, enter the domain, and click **Delete**.
    - **Firefox:** Clear history and cookies for the domain (or remove the domain entry in `SiteSecurityServiceState.txt` within the Firefox profile directory).
    - **Safari:** Close Safari, clear cache, and remove `~/Library/Cookies/HSTS.plist` if necessary.

#### Mixed content blocked in projects
- **Symptom:** Console displays `Mixed Content: The page at 'https://...' was loaded over HTTPS, but requested an insecure resource 'http://...'`. Scripts or stylesheets fail to load.
- **Cause:** Project files reference dependencies, external fonts, or APIs using insecure `http://` URLs.
- **Fix:** Update all external asset URLs to `https://` (e.g., `https://fonts.googleapis.com`, `https://cdnjs.cloudflare.com`) and use relative paths for local assets.

#### Subdomain lockout
- **Symptom:** An auxiliary or internal subdomain (e.g., `staging.example.com` or `dev.example.com`) becomes unreachable with SSL errors.
- **Cause:** `includeSubDomains` was set on the apex domain before all subdomains were configured with valid TLS certificates.
- **Fix:** Either provision valid TLS certificates on all subdomains or remove `includeSubDomains` from the header during testing until all subdomains are HTTPS-ready.

---

## Best Practices Before Opening an Issue

Before filing a new issue, please go through these steps:

1. **Search existing issues** — your problem may already have a fix: [GitHub Issues](https://github.com/Facelessism/cradle/issues).
2. **Read the relevant documentation** — both the root `README.md` and the project-level `ARCHITECTURE.md`.
3. **Check the browser console** — press `F12`, open the Console tab, and look for error messages.
4. **Hard-refresh the browser** — `Cmd/Ctrl + Shift + R` to rule out caching.
5. **Test with a local server** — open via `http://localhost:8000`, not `file://`.
6. **Confirm your branch is up to date** — run `git pull` before reporting a bug.
7. **Reproduce on a clean clone** — clone the repo fresh to rule out local environment issues.

If the issue persists after all the above, open a new issue and include:

- A clear description of the problem
- Steps to reproduce
- Expected vs actual behaviour
- Browser name and version
- Any console errors or screenshots

---

## Quick Troubleshooting Checklist

Use this checklist when something is not working:

- [ ] I cloned my fork, not the upstream repo directly
- [ ] I am running the project from the repository root via a local server
- [ ] I visited `http://localhost:8000`, not opened the file directly
- [ ] I hard-refreshed the browser (`Cmd/Ctrl + Shift + R`)
- [ ] I checked the browser console for errors (`F12`)
- [ ] I ran `npm install` or `pip install -r requirements.txt` if a manifest file exists
- [ ] My branch is up to date with `main`
- [ ] I searched existing GitHub issues before opening a new one

---

## Useful Commands

### Git

```bash
# Clone your fork
git clone https://github.com/<your-username>/cradle.git

# Create a new branch
git checkout -b docs/my-change

# Check current status
git status

# Stage specific files
git add <file>

# Commit with a message
git commit -m "docs: update troubleshooting guide"

# Push branch to your fork
git push -u origin docs/my-change

# Sync fork with upstream
git fetch upstream
git checkout main
git merge upstream/main
git push origin main
```

### Python local server

```bash
# Start server on default port 8000
python3 -m http.server 8000

# Start server on a different port
python3 -m http.server 9000

# Visit in browser
# http://localhost:8000
```

### npm (if applicable)

```bash
# Install dependencies
npm install

# Run a project's dev server (if configured)
npm run dev

# Run tests (if configured)
npm test
```

---

## Helpful Links

- [README.md](README.md) — project overview and getting started guide
- [CONTRIBUTING.md](CONTRIBUTING.md) — contribution workflow, branch naming, and PR guidelines
- [GitHub Issues](https://github.com/Facelessism/cradle/issues) — report bugs or request features
- [MDN Web Docs: Strict-Transport-Security](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security) — official HSTS documentation and directives
- [HSTS Preload Submission](https://hstspreload.org/) — automated Chrome, Firefox, and Safari preload list submission
