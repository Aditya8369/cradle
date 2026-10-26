const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseAuditReport,
  evaluatePolicy,
  generateStepSummary,
  SEVERITY_LEVELS,
} = require("../scripts/audit-dependencies.js");

test("SEVERITY_LEVELS defines proper numeric hierarchy", () => {
  assert.ok(SEVERITY_LEVELS.critical > SEVERITY_LEVELS.high);
  assert.ok(SEVERITY_LEVELS.high > SEVERITY_LEVELS.moderate);
  assert.ok(SEVERITY_LEVELS.moderate > SEVERITY_LEVELS.low);
  assert.ok(SEVERITY_LEVELS.low > SEVERITY_LEVELS.info);
});

test("parseAuditReport handles empty or 0-vulnerability audit output", () => {
  const mockCleanOutput = {
    auditReportVersion: 2,
    vulnerabilities: {},
    metadata: {
      vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 },
      dependencies: { prod: 5, dev: 10, optional: 0, peer: 0, total: 15 },
    },
  };

  const report = parseAuditReport(mockCleanOutput);
  assert.equal(report.findings.length, 0);
  assert.equal(report.metadata.vulnerabilities.total, 0);
  assert.equal(report.metadata.dependencies.prod, 5);
});

test("parseAuditReport extracts direct and transitive advisories", () => {
  const mockVulnOutput = {
    auditReportVersion: 2,
    vulnerabilities: {
      express: {
        name: "express",
        severity: "high",
        isDirect: true,
        range: "<4.19.2",
        via: [
          {
            source: 12345,
            name: "express",
            dependency: "express",
            title: "Open Redirect in Express",
            url: "https://github.com/advisories/GHSA-1234",
            severity: "high",
            range: "<4.19.2",
          },
        ],
      },
      cookie: {
        name: "cookie",
        severity: "low",
        isDirect: false,
        range: "<0.4.0",
        via: ["other-dep"],
      },
    },
    metadata: {
      vulnerabilities: { info: 0, low: 1, moderate: 0, high: 1, critical: 0, total: 2 },
      dependencies: { prod: 2, dev: 0, optional: 0, peer: 0, total: 2 },
    },
  };

  const report = parseAuditReport(mockVulnOutput);
  assert.equal(report.findings.length, 2);

  const expressFinding = report.findings.find(f => f.package === "express");
  assert.ok(expressFinding);
  assert.equal(expressFinding.severity, "high");
  assert.equal(expressFinding.title, "Open Redirect in Express");
  assert.equal(expressFinding.url, "https://github.com/advisories/GHSA-1234");
  assert.equal(expressFinding.isDirect, true);

  const cookieFinding = report.findings.find(f => f.package === "cookie");
  assert.ok(cookieFinding);
  assert.equal(cookieFinding.severity, "low");
  assert.equal(cookieFinding.isDirect, false);
});

test("evaluatePolicy passes when all findings are below auditLevel threshold", () => {
  const findings = [
    { package: "pkg-a", severity: "low", title: "Low bug" },
    { package: "pkg-b", severity: "moderate", title: "Moderate issue" },
  ];

  const evaluation = evaluatePolicy(findings, { auditLevel: "high" });
  assert.equal(evaluation.passed, true);
  assert.equal(evaluation.violations.length, 0);
  assert.equal(evaluation.threshold, "high");
});

test("evaluatePolicy fails when finding meets high severity threshold", () => {
  const findings = [
    { package: "pkg-a", severity: "low", title: "Low bug" },
    { package: "pkg-b", severity: "high", title: "High security flaw", url: "https://example.com/advisory" },
  ];

  const evaluation = evaluatePolicy(findings, { auditLevel: "high" });
  assert.equal(evaluation.passed, false);
  assert.equal(evaluation.violations.length, 1);
  assert.equal(evaluation.violations[0].package, "pkg-b");
  assert.equal(evaluation.violations[0].severity, "high");
});

test("evaluatePolicy fails when finding is critical severity", () => {
  const findings = [
    { package: "crypto-lib", severity: "critical", title: "Remote Code Execution", url: "https://example.com/rce" },
  ];

  const evaluation = evaluatePolicy(findings, { auditLevel: "high" });
  assert.equal(evaluation.passed, false);
  assert.equal(evaluation.violations.length, 1);
  assert.equal(evaluation.violations[0].package, "crypto-lib");
  assert.equal(evaluation.violations[0].severity, "critical");
});

test("generateStepSummary formats markdown report with status and remediation", () => {
  const mockReport = {
    metadata: {
      vulnerabilities: { info: 0, low: 0, moderate: 0, high: 1, critical: 0, total: 1 },
      dependencies: { prod: 1, dev: 0, optional: 0, peer: 0, total: 1 },
    },
    findings: [],
  };

  const mockEvaluation = {
    passed: false,
    threshold: "high",
    violations: [
      {
        package: "test-pkg",
        severity: "high",
        title: "Test High Vulnerability",
        url: "https://github.com/advisories/test",
        range: "<1.0.0",
      },
    ],
  };

  const summary = generateStepSummary(mockReport, mockEvaluation, { omitDev: true });

  assert.ok(summary.includes("Dependency Vulnerability Audit: FAILED"));
  assert.ok(summary.includes("Production Dependencies"));
  assert.ok(summary.includes("test-pkg"));
  assert.ok(summary.includes("HIGH"));
  assert.ok(summary.includes("Remediation Steps"));
  assert.ok(summary.includes("npm audit fix"));
});

test("generateStepSummary formats clean success message on zero policy violations", () => {
  const mockReport = {
    metadata: {
      vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 },
      dependencies: { prod: 5, dev: 0, optional: 0, peer: 0, total: 5 },
    },
    findings: [],
  };

  const mockEvaluation = {
    passed: true,
    threshold: "high",
    violations: [],
  };

  const summary = generateStepSummary(mockReport, mockEvaluation, { omitDev: true });

  assert.ok(summary.includes("Dependency Vulnerability Audit: PASSED"));
  assert.ok(summary.includes("Policy Satisfied"));
  assert.ok(!summary.includes("Policy Violations"));
});
