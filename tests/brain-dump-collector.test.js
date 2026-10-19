const test = require("node:test");
const assert = require("node:assert/strict");
const BrainDumpEngine = require("../projects/productivity/brain-dump-collector/brainDumpEngine");

test("BrainDumpEngine autoCategorize classifies Work keywords correctly", () => {
  const cat1 = BrainDumpEngine.autoCategorize(
    "Fix critical bug in client project"
  );
  assert.equal(cat1, "Work");

  const cat2 = BrainDumpEngine.autoCategorize("Schedule meeting with team");
  assert.equal(cat2, "Work");
});

test("BrainDumpEngine autoCategorize classifies Health & Finance keywords", () => {
  const catHealth = BrainDumpEngine.autoCategorize("Go to gym and drink water");
  assert.equal(catHealth, "Health");

  const catFinance = BrainDumpEngine.autoCategorize(
    "Pay electricity bill and check budget"
  );
  assert.equal(catFinance, "Finance");
});

test("BrainDumpEngine detectPriority identifies High and Low urgency", () => {
  const prioHigh = BrainDumpEngine.detectPriority(
    "Submit report today! urgent"
  );
  assert.equal(prioHigh, "high");

  const prioLow = BrainDumpEngine.detectPriority("Read book someday maybe");
  assert.equal(prioLow, "low");

  const prioMed = BrainDumpEngine.detectPriority("Buy groceries");
  assert.equal(prioMed, "medium");
});

test("BrainDumpEngine filterDumps filters by category and search query", () => {
  const dumps = [
    { text: "Fix bug", category: "Work", priority: "high", completed: false },
    { text: "Buy milk", category: "Errands", priority: "low", completed: true },
    {
      text: "Study JS",
      category: "Study",
      priority: "medium",
      completed: false,
    },
  ];

  const workOnly = BrainDumpEngine.filterDumps(dumps, "", "Work", "all");
  assert.equal(workOnly.length, 1);
  assert.equal(workOnly[0].text, "Fix bug");

  const searchMilk = BrainDumpEngine.filterDumps(dumps, "milk", "all", "all");
  assert.equal(searchMilk.length, 1);
  assert.equal(searchMilk[0].text, "Buy milk");
});

test("BrainDumpEngine calculateStats generates correct counters", () => {
  const dumps = [
    { text: "Task 1", category: "Work", priority: "high", completed: true },
    { text: "Task 2", category: "Work", priority: "low", completed: false },
  ];

  const stats = BrainDumpEngine.calculateStats(dumps);
  assert.equal(stats.total, 2);
  assert.equal(stats.completed, 1);
  assert.equal(stats.pending, 1);
  assert.equal(stats.categoryCounts.Work, 2);
});

test("BrainDumpEngine exportToMarkdown generates clean markdown string", () => {
  const dumps = [
    {
      text: "Deploy app",
      category: "Work",
      priority: "high",
      completed: false,
    },
  ];

  const md = BrainDumpEngine.exportToMarkdown(dumps);
  assert.ok(md.includes("# Brain Dump Notes Export"));
  assert.ok(md.includes("## Work"));
  assert.ok(md.includes("- [ ] Deploy app *(HIGH)*"));
});
