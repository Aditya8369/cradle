const test = require("node:test");
const assert = require("node:assert");
const plannerEngine = require("../projects/productivity/time-blocking-planner/plannerEngine.js");
const plannerStorage = require("../projects/productivity/time-blocking-planner/plannerStorage.js");

test("timeToMinutes and minutesToTime perform bi-directional conversion", () => {
  assert.strictEqual(plannerEngine.timeToMinutes("09:30"), 570);
  assert.strictEqual(plannerEngine.minutesToTime(570), "09:30");
  assert.strictEqual(plannerEngine.timeToMinutes("00:00"), 0);
  assert.strictEqual(plannerEngine.minutesToTime(0), "00:00");
});

test("findCollidingBlocks identifies overlapping schedule blocks", () => {
  const blocks = [
    { id: "b1", title: "Deep Work", start: "09:00", end: "10:30" },
    { id: "b2", title: "Meeting", start: "10:00", end: "11:00" }, // Overlaps with b1 (10:00-10:30)
    { id: "b3", title: "Lunch", start: "12:00", end: "13:00" }, // No overlap
  ];

  const colliding = plannerEngine.findCollidingBlocks(blocks);
  assert.strictEqual(colliding.length, 2);
  assert.ok(colliding.includes("b1"));
  assert.ok(colliding.includes("b2"));
  assert.ok(!colliding.includes("b3"));
});

test("calculateCategoryBreakdown sums category hours accurately", () => {
  const blocks = [
    { id: "b1", category: "deep-work", start: "09:00", end: "11:00" }, // 2 hrs
    { id: "b2", category: "meeting", start: "11:00", end: "12:00" }, // 1 hr
  ];

  const result = plannerEngine.calculateCategoryBreakdown(blocks);
  assert.strictEqual(result.totalHours, 3);
  assert.strictEqual(result.breakdown["deep-work"].hours, 2);
  assert.strictEqual(result.breakdown["meeting"].hours, 1);
});

test("generateICalendar produces valid VCALENDAR payload", () => {
  const blocks = [
    {
      id: "b1",
      title: "Team Standup",
      category: "meeting",
      start: "09:00",
      end: "09:30",
    },
  ];

  const ics = plannerEngine.generateICalendar(blocks, "2026-07-24");
  assert.ok(ics.includes("BEGIN:VCALENDAR"));
  assert.ok(ics.includes("SUMMARY:Team Standup"));
  assert.ok(ics.includes("DTSTART:20260724T090000"));
  assert.ok(ics.includes("END:VCALENDAR"));
});

test("plannerStorage sanitizes raw import data", () => {
  const rawData = [{ title: "Study", start: "14:00", end: "16:00" }];
  const sanitized = plannerStorage.sanitizeBlocks(rawData);
  assert.strictEqual(sanitized.length, 1);
  assert.strictEqual(sanitized[0].title, "Study");
  assert.strictEqual(sanitized[0].category, "work");
});
