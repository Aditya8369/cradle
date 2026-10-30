const test = require("node:test");
const assert = require("node:assert/strict");
const ResumeEngine = require("../projects/editor/markdown-resume-generator/resumeEngine");

test("ResumeEngine parseInlineMarkdown formats bold, italic, and links", () => {
  const input =
    "Check [GitHub](https://github.com) and **bold** text with *italic*.";
  const html = ResumeEngine.parseInlineMarkdown(input);
  assert.ok(html.includes('<a href="https://github.com"'));
  assert.ok(html.includes("<strong>bold</strong>"));
  assert.ok(html.includes("<em>italic</em>"));
});

test("ResumeEngine parseMarkdownToHTML converts headings and bullet points", () => {
  const md = `# John Doe\n## Experience\n- Developed web apps\n- Fixed security bugs`;
  const html = ResumeEngine.parseMarkdownToHTML(md);

  assert.ok(html.includes('<h1 class="resume-title">John Doe</h1>'));
  assert.ok(html.includes('<h2 class="section-title">Experience</h2>'));
  assert.ok(html.includes("<ul>"));
  assert.ok(html.includes("<li>Developed web apps</li>"));
  assert.ok(html.includes("<li>Fixed security bugs</li>"));
  assert.ok(html.includes("</ul>"));
});

test("ResumeEngine calculateWordCount computes words and characters", () => {
  const md = "Hello world this is a resume test";
  const stats = ResumeEngine.calculateWordCount(md);
  assert.equal(stats.words, 7);
  assert.equal(stats.characters, md.length);
});

test("ResumeEngine calculateATSScore scores complete resume headers", () => {
  const completeMd = `# Jane Smith\nemail@example.com\n## Summary\nGood engineer\n## Experience\nDev\n## Skills\nJS\n## Education\nCS Degree\n## Projects\nApp`;
  const res = ResumeEngine.calculateATSScore(completeMd);
  assert.equal(res.score, 100);

  const incompleteMd = `# Jane Smith`;
  const resInc = ResumeEngine.calculateATSScore(incompleteMd);
  assert.ok(resInc.score < 50);
});

test("ResumeEngine generateStandaloneHTML generates valid HTML page string", () => {
  const md = "# Test User\n## Skills\n- JavaScript";
  const fullHtml = ResumeEngine.generateStandaloneHTML(md, "classic", "slate");
  assert.ok(fullHtml.includes("<!DOCTYPE html>"));
  assert.ok(fullHtml.includes('<body class="template-classic theme-slate">'));
  assert.ok(fullHtml.includes('<h1 class="resume-title">Test User</h1>'));
});

test("ResumeEngine detectCircularReferences identifies self-referencing and nested circular objects", () => {
  const directCircular = { name: "Direct" };
  directCircular.self = directCircular;

  const resDirect = ResumeEngine.detectCircularReferences(directCircular);
  assert.equal(resDirect.hasCircular, true);
  assert.match(resDirect.path, /self/);
  assert.match(resDirect.error, /circular/i);

  const nestedCircular = { user: { profile: { title: "Dev" } } };
  nestedCircular.user.profile.root = nestedCircular;

  const resNested = ResumeEngine.detectCircularReferences(nestedCircular);
  assert.equal(resNested.hasCircular, true);
  assert.match(resNested.path, /root/);

  const circularArray = [{ id: 1 }];
  circularArray.push(circularArray);

  const resArray = ResumeEngine.detectCircularReferences(circularArray);
  assert.equal(resArray.hasCircular, true);

  // Acyclic / DAG (shared non-circular references) should be valid
  const shared = { name: "Shared" };
  const dag = { a: shared, b: shared };
  const resDag = ResumeEngine.detectCircularReferences(dag);
  assert.equal(resDag.hasCircular, false);
  assert.equal(resDag.path, null);
});

test("ResumeEngine hasCircularReference returns boolean correctly", () => {
  const circular = { a: 1 };
  circular.loop = circular;
  assert.equal(ResumeEngine.hasCircularReference(circular), true);

  const regular = { a: 1, b: { c: 2 } };
  assert.equal(ResumeEngine.hasCircularReference(regular), false);
});

test("ResumeEngine validateResumeData returns controlled validation error on circular input", () => {
  const circular = { markdown: "# Resume" };
  circular.self = circular;

  const res = ResumeEngine.validateResumeData(circular);
  assert.equal(res.isValid, false);
  assert.equal(res.success, false);
  assert.equal(res.hasCircular, true);
  assert.equal(res.code, "CIRCULAR_REFERENCE");
  assert.match(res.error, /circular/i);

  // When throwOnError is true, throws ResumeValidationError
  assert.throws(
    () => ResumeEngine.validateResumeData(circular, { throwOnError: true }),
    err => {
      assert.ok(err instanceof Error);
      assert.equal(err.name, "ResumeValidationError");
      assert.equal(err.code, "CIRCULAR_REFERENCE");
      assert.match(err.message, /circular/i);
      return true;
    }
  );
});

test("ResumeEngine serializeResume serializes valid data to JSON string", () => {
  const validData = {
    title: "Software Engineer",
    markdown: "# Jane Doe\n## Skills\n- JS",
    template: "classic",
    theme: "slate",
  };

  const jsonStr = ResumeEngine.serializeResume(validData);
  assert.equal(typeof jsonStr, "string");
  const parsed = JSON.parse(jsonStr);
  assert.equal(parsed.title, "Software Engineer");
});

test("ResumeEngine serializeResume produces controlled validation error on circular references without throwing uncaught TypeError", () => {
  const circular = { title: "Bad Resume" };
  circular.ref = circular;

  // Controlled failure result instead of uncaught exception
  const result = ResumeEngine.serializeResume(circular);
  assert.equal(result.success, false);
  assert.equal(result.isValid, false);
  assert.equal(result.code, "CIRCULAR_REFERENCE");
  assert.match(result.error, /circular/i);
  assert.equal(result.data, null);

  // Controlled validation error when throwOnError is requested
  assert.throws(
    () => ResumeEngine.serializeResume(circular, { throwOnError: true }),
    err => {
      assert.ok(err instanceof Error);
      assert.equal(err.name, "ResumeValidationError");
      assert.equal(err.code, "CIRCULAR_REFERENCE");
      return true;
    }
  );
});

test("ResumeEngine parseMarkdownToHTML, calculateWordCount, and calculateATSScore safely handle circular object input", () => {
  const circular = { content: "Sample" };
  circular.self = circular;

  const html = ResumeEngine.parseMarkdownToHTML(circular);
  assert.ok(html.includes("resume-error"));
  assert.match(html, /circular/i);

  const wordStats = ResumeEngine.calculateWordCount(circular);
  assert.equal(wordStats.words, 0);
  assert.ok(wordStats.error);

  const ats = ResumeEngine.calculateATSScore(circular);
  assert.equal(ats.score, 0);
  assert.ok(ats.error);
});
