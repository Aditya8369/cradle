const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const racer = require("../projects/games/typing-speed-racer/script.js");

test("Typing Speed Racer - recalculateStreak", () => {
  const targetWords = ["the", "quick", "brown", "fox", "jumps"];

  assert.equal(racer.recalculateStreak([], targetWords), 0);
  assert.equal(racer.recalculateStreak(null, targetWords), 0);
  assert.equal(racer.recalculateStreak(["the"], targetWords), 1);
  assert.equal(racer.recalculateStreak(["the", "quick"], targetWords), 2);
  assert.equal(racer.recalculateStreak(["the", "wrong"], targetWords), 0);
  assert.equal(
    racer.recalculateStreak(["the", "wrong", "brown"], targetWords),
    1
  );
  assert.equal(
    racer.recalculateStreak(["the", "wrong", "brown", "fox"], targetWords),
    2
  );
});

test("Typing Speed Racer - stepBackWord guards", () => {
  // Not running
  const idleState = {
    running: false,
    words: ["one", "two"],
    currentIndex: 1,
    typedWords: ["one"],
    correctWords: 1,
    wrongWords: 0,
    streak: 1,
  };
  assert.equal(racer.stepBackWord(idleState), null);

  // currentIndex is 0
  const startState = {
    running: true,
    words: ["one", "two"],
    currentIndex: 0,
    typedWords: [],
    correctWords: 0,
    wrongWords: 0,
    streak: 0,
  };
  assert.equal(racer.stepBackWord(startState), null);

  // typedWords empty
  const emptyTypedState = {
    running: true,
    words: ["one", "two"],
    currentIndex: 1,
    typedWords: [],
    correctWords: 1,
    wrongWords: 0,
    streak: 1,
  };
  assert.equal(racer.stepBackWord(emptyTypedState), null);
});

test("Typing Speed Racer - stepBackWord decrements correctWords and restores previous word", () => {
  const gameState = {
    running: true,
    words: ["apple", "banana", "cherry"],
    currentIndex: 1,
    typedWords: ["apple"],
    correctWords: 1,
    wrongWords: 0,
    streak: 1,
  };

  const restored = racer.stepBackWord(gameState);

  assert.equal(restored, "apple");
  assert.equal(gameState.currentIndex, 0);
  assert.equal(gameState.correctWords, 0);
  assert.equal(gameState.wrongWords, 0);
  assert.equal(gameState.streak, 0);
  assert.deepEqual(gameState.typedWords, []);
});

test("Typing Speed Racer - stepBackWord decrements wrongWords when stepping back across an error", () => {
  const gameState = {
    running: true,
    words: ["apple", "banana", "cherry"],
    currentIndex: 1,
    typedWords: ["aple"],
    correctWords: 0,
    wrongWords: 1,
    streak: 0,
  };

  const restored = racer.stepBackWord(gameState);

  assert.equal(restored, "aple");
  assert.equal(gameState.currentIndex, 0);
  assert.equal(gameState.correctWords, 0);
  assert.equal(gameState.wrongWords, 0);
  assert.equal(gameState.streak, 0);
  assert.deepEqual(gameState.typedWords, []);
});

test("Typing Speed Racer - stepBackWord maintains correct streak across multiple words", () => {
  const gameState = {
    running: true,
    words: ["apple", "banana", "cherry", "date"],
    currentIndex: 3,
    typedWords: ["apple", "banana", "cherry"],
    correctWords: 3,
    wrongWords: 0,
    streak: 3,
  };

  const restored = racer.stepBackWord(gameState);

  assert.equal(restored, "cherry");
  assert.equal(gameState.currentIndex, 2);
  assert.equal(gameState.correctWords, 2);
  assert.equal(gameState.streak, 2);
  assert.deepEqual(gameState.typedWords, ["apple", "banana"]);
});

test("Typing Speed Racer - backspacing across word boundary prevents WPM inflation upon retyping", () => {
  const startTime = Date.now() - 30000; // 30 seconds ago (0.5 minute)
  const gameState = {
    running: true,
    words: ["cat", "dog", "bird"],
    currentIndex: 1,
    typedWords: ["cat"],
    correctWords: 1,
    wrongWords: 0,
    streak: 1,
    startTime,
  };

  // Initially: 1 word in 0.5 min = 2 WPM
  assert.equal(racer.calculateWpm(gameState), 2);

  // User presses backspace on empty input at word boundary
  const restored = racer.stepBackWord(gameState);
  assert.equal(restored, "cat");
  assert.equal(gameState.correctWords, 0);
  assert.equal(racer.calculateWpm(gameState), 0);

  // User retypes the first word and submits space again
  gameState.typedWords.push("cat");
  gameState.correctWords++;
  gameState.currentIndex++;

  // Completed words is 1 (not 2!), WPM is 2 (not 4!)
  assert.equal(gameState.correctWords, 1);
  assert.equal(gameState.currentIndex, 1);
  assert.equal(racer.calculateWpm(gameState), 2);
});
