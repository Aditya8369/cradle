#!/usr/bin/env node

/**
 * Dependency Vulnerability Audit Script
 *
 * Scans dependencies (by default production dependencies: --omit=dev) using npm audit.
 * Evaluates findings against the repository's High-Severity Dependency Policy:
 * - High and Critical findings fail the check (exit code 1).
 * - Generates clear terminal reporting.
 * - In CI environments, publishes a detailed markdown table to $GITHUB_STEP_SUMMARY
 *   and emits GitHub Actions ::error annotations for PR visibility.
 */

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const SEVERITY_LEVELS = {
  info: 0,
  low: 1,
  moderate: 2,
  high: 3,
  critical: 4,
};

/**
 * Parses raw JSON output from `npm audit --json`.
 *
 * @param {string|object} rawData Raw JSON string or parsed object
 * @returns {object} Normalized report { metadata, findings, raw }
 */
function parseAuditReport(rawData) {
  let data = typeof rawData === "string" ? JSON.parse(rawData) : rawData;

  const metadata = data.metadata || {
    vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 },
    dependencies: { prod: 0, dev: 0, optional: 0, peer: 0, total: 0 },
  };

  const findings = [];
  const vulnerabilities = data.vulnerabilities || {};

  for (const [pkgName, vuln] of Object.entries(vulnerabilities)) {
    const severity = (vuln.severity || "unknown").toLowerCase();
    const range = vuln.range || "*";
    const isDirect = Boolean(vuln.isDirect);

    // Extract advisories from 'via'
    if (Array.isArray(vuln.via)) {
      for (const item of vuln.via) {
        if (typeof item === "object" && item !== null) {
          findings.push({
            package: pkgName,
            severity: (item.severity || severity).toLowerCase(),
            title: item.title || "Security Vulnerability",
            url: item.url || "",
            range: item.range || range,
            cwe: item.cwe || [],
            isDirect,
            fixAvailable: vuln.fixAvailable || null,
          });
        }
      }
    }

    // If no object items were in 'via' (e.g. all string dependencies)
    const hasViaObjects = Array.isArray(vuln.via) && vuln.via.some(i => typeof i === "object");
    if (!hasViaObjects) {
      findings.push({
        package: pkgName,
        severity,
        title: `Vulnerability in dependency tree for ${pkgName}`,
        url: "",
        range,
        cwe: [],
        isDirect,
        fixAvailable: vuln.fixAvailable || null,
      });
    }
  }

  return {
    metadata,
    findings,
    raw: data,
  };
}

/**
 * Evaluates findings against the security policy threshold.
 *
 * @param {Array} findings List of findings from parseAuditReport
 * @param {object} options Configuration options { auditLevel: 'high' }
 * @returns {object} { passed: boolean, threshold: string, violations: Array }
 */
function evaluatePolicy(findings, options = {}) {
  const auditLevel = (options.auditLevel || "high").toLowerCase();
  const thresholdScore = SEVERITY_LEVELS[auditLevel] ?? SEVERITY_LEVELS.high;

  const violations = findings.filter(f => {
    const score = SEVERITY_LEVELS[f.severity] ?? 0;
    return score >= thresholdScore;
  });

  return {
    passed: violations.length === 0,
    threshold: auditLevel,
    thresholdScore,
    violations,
    totalFindings: findings.length,
  };
}

/**
 * Generates Markdown summary suitable for GitHub Actions $GITHUB_STEP_SUMMARY.
 *
 * @param {object} report Output from parseAuditReport
 * @param {object} evaluation Output from evaluatePolicy
 * @param {object} options Options { omitDev: true, auditLevel: 'high' }
 * @returns {string} Markdown content
 */
function generateStepSummary(report, evaluation, options = {}) {
  const scope = options.omitDev !== false ? "Production Dependencies" : "All Dependencies";
  const statusEmoji = evaluation.passed ? "✅" : "❌";
  const statusText = evaluation.passed ? "PASSED" : "FAILED";

  let md = `## ${statusEmoji} Dependency Vulnerability Audit: ${statusText}\n\n`;
  md += `**Scope:** \`${scope}\` | **Policy Threshold:** \`${evaluation.threshold.toUpperCase()}\` and above must be zero.\n\n`;

  const counts = report.metadata.vulnerabilities || {};
  md += `### Vulnerability Summary\n\n`;
  md += `| Critical | High | Moderate | Low | Total |\n`;
  md += `| :---: | :---: | :---: | :---: | :---: |\n`;
  md += `| ${counts.critical || 0} | ${counts.high || 0} | ${counts.moderate || 0} | ${counts.low || 0} | ${counts.total || 0} |\n\n`;

  if (evaluation.violations.length > 0) {
    md += `### ⚠️ Policy Violations (${evaluation.violations.length} finding(s) requiring remediation)\n\n`;
    md += `The repository policy strictly prohibits **High** and **Critical** vulnerabilities in production dependencies.\n\n`;
    md += `| Package | Severity | Title | Advisory | Vulnerable Range |\n`;
    md += `| :--- | :--- | :--- | :--- | :--- |\n`;

    for (const v of evaluation.violations) {
      const link = v.url ? `[Advisory Link](${v.url})` : "N/A";
      md += `| \`${v.package}\` | **${v.severity.toUpperCase()}** | ${v.title} | ${link} | \`${v.range}\` |\n`;
    }

    md += `\n### Remediation Steps\n\n`;
    md += `1. Run \`npm audit fix\` to apply non-breaking patches.\n`;
    md += `2. If breaking changes or transitive dependencies are involved, upgrade the affected package in \`package.json\`.\n`;
    md += `3. Re-run local verification: \`npm run audit:deps\`.\n`;
  } else {
    md += `> ✅ **Policy Satisfied:** No production dependency vulnerabilities at or above \`${evaluation.threshold}\` severity were detected.\n`;
  }

  return md;
}

/**
 * Runs the npm audit command and evaluates results.
 *
 * @param {object} options
 * @returns {number} Exit code (0 for pass, 1 for failure)
 */
function runAudit(options = {}) {
  const auditLevel = options.auditLevel || "high";
  const omitDev = options.omitDev !== false;

  console.log(`🔍 Running dependency vulnerability audit...`);
  console.log(`   Scope: ${omitDev ? "Production dependencies (--omit=dev)" : "All dependencies"}`);
  console.log(`   Policy Threshold: >= ${auditLevel.toUpperCase()}`);

  const args = ["audit", "--json"];
  if (omitDev) {
    args.push("--omit=dev");
  }

  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npmCmd, args, {
    encoding: "utf8",
    shell: true,
  });

  const stdout = result.stdout ? result.stdout.trim() : "";
  const stderr = result.stderr ? result.stderr.trim() : "";

  if (!stdout) {
    console.error("❌ Failed to obtain npm audit JSON output.");
    if (stderr) console.error(stderr);
    return 1;
  }

  let report;
  try {
    report = parseAuditReport(stdout);
  } catch (err) {
    console.error(`❌ Failed to parse npm audit JSON: ${err.message}`);
    if (stdout) console.error(stdout.slice(0, 500));
    return 1;
  }

  const evaluation = evaluatePolicy(report.findings, { auditLevel });
  const summaryMarkdown = generateStepSummary(report, evaluation, { omitDev, auditLevel });

  // Write to GitHub Step Summary if running in GitHub Actions
  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryMarkdown + "\n", "utf8");
    } catch (e) {
      console.warn(`Could not write to GITHUB_STEP_SUMMARY: ${e.message}`);
    }
  }

  // Terminal output
  if (!evaluation.passed) {
    console.error(`\n❌ Dependency Policy Violation: Found ${evaluation.violations.length} finding(s) with severity >= ${auditLevel.toUpperCase()}.\n`);

    for (const v of evaluation.violations) {
      console.error(`  - [${v.severity.toUpperCase()}] ${v.package}: ${v.title}`);
      if (v.url) console.error(`    Advisory: ${v.url}`);
      console.error(`    Vulnerable Range: ${v.range}`);

      // GitHub Actions inline error annotation
      if (process.env.GITHUB_ACTIONS) {
        console.error(`::error title=Production Dependency Vulnerability (${v.severity.toUpperCase()})::Package "${v.package}" has a ${v.severity.toUpperCase()} vulnerability: ${v.title} (${v.url || "no URL"})`);
      }
    }

    console.error(`\nRemediation required before merging. Run 'npm audit fix' or update dependencies.`);
    return 1;
  }

  console.log(`\n✅ Dependency vulnerability audit passed! No high-severity vulnerabilities found in production dependencies.`);
  return 0;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  let auditLevel = "high";
  let omitDev = true;

  for (const arg of args) {
    if (arg.startsWith("--audit-level=")) {
      auditLevel = arg.split("=")[1];
    } else if (arg === "--all") {
      omitDev = false;
    } else if (arg === "--omit=dev") {
      omitDev = true;
    }
  }

  const exitCode = runAudit({ auditLevel, omitDev });
  process.exit(exitCode);
}

module.exports = {
  parseAuditReport,
  evaluatePolicy,
  generateStepSummary,
  runAudit,
  SEVERITY_LEVELS,
};
