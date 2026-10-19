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
