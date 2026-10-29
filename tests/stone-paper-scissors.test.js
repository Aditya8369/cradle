const test = require("node:test");
const assert = require("node:assert/strict");
const {
  determineWinner,
} = require("../projects/games/stone-paper-scissors-game/game-engine");

test("RPS classic rules evaluate correctly", () => {
  // Rock beats scissors
  assert.deepStrictEqual(determineWinner("rock", "scissors"), {
    outcome: "player",
    message: "Rock crushes Scissors! You win!",
  });

  // Paper loses to scissors
  assert.deepStrictEqual(determineWinner("paper", "scissors"), {
    outcome: "computer",
    message: "Scissors cuts Paper! Computer wins!",
  });

  // Rock ties with rock
  assert.deepStrictEqual(determineWinner("rock", "rock"), {
    outcome: "tie",
    message: "It's a tie!",
  });
});

test("RPS Lizard Spock rules evaluate correctly", () => {
  // Spock vaporizes Rock
  assert.deepStrictEqual(determineWinner("spock", "rock"), {
    outcome: "player",
    message: "Spock vaporizes Rock! You win!",
  });

  // Lizard poisons Spock
  assert.deepStrictEqual(determineWinner("lizard", "spock"), {
    outcome: "player",
    message: "Lizard poisons Spock! You win!",
  });

  // Spock loses to Paper
  assert.deepStrictEqual(determineWinner("spock", "paper"), {
    outcome: "computer",
    message: "Paper disproves Spock! Computer wins!",
  });
});

test("rpsStorage bounds counters and sanitizes corrupted state", () => {
  const rpsStorage = require("../projects/games/stone-paper-scissors-game/rpsStorage");

  const corrupted = {
    wins: -5,
    losses: NaN,
    ties: "invalid",
    currentStreak: -2,
    bestStreak: -10,
    moveCounts: { rock: -1, paper: 1e30, scissors: NaN },
  };

  const sanitized = rpsStorage.sanitizeStats(corrupted);
  assert.equal(sanitized.wins, 0);
  assert.equal(sanitized.losses, 0);
  assert.equal(sanitized.ties, 0);
  assert.equal(sanitized.currentStreak, 0);
  assert.equal(sanitized.bestStreak, 0);
  assert.equal(sanitized.moveCounts.rock, 0);
  assert.equal(sanitized.moveCounts.scissors, 0);
  assert.ok(sanitized.moveCounts.paper <= Number.MAX_SAFE_INTEGER);

  // When currentStreak is higher than bestStreak, bestStreak is normalized
  const streakMismatch = {
    currentStreak: 15,
    bestStreak: 5,
  };
  const sanitizedStreak = rpsStorage.sanitizeStats(streakMismatch);
  assert.equal(sanitizedStreak.currentStreak, 15);
  assert.equal(sanitizedStreak.bestStreak, 15);
});

test("index.html ensures computerPick element has no pre-selected move in DOM", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const htmlPath = path.join(
    __dirname,
    "../projects/games/stone-paper-scissors-game/index.html"
  );
  const html = fs.readFileSync(htmlPath, "utf8");

  // Verify computerPick element in DOM starts neutral
  const computerPickMatch = html.match(
    /id=["']computerPick["'][^>]*>(.*?)<\/div>/s
  );
  assert.ok(computerPickMatch, "computerPick element exists in index.html");
  assert.strictEqual(computerPickMatch[1].trim(), "❓");

  // Verify no move attribute or choice class in computerPick
  const fullTagMatch = html.match(/<div[^>]*id=["']computerPick["'][^>]*>/);
  assert.ok(fullTagMatch);
  assert.strictEqual(
    /data-choice|data-move|data-computer/i.test(fullTagMatch[0]),
    false
  );
  assert.strictEqual(
    /class=["'][^"']*\b(rock|paper|scissors|lizard|spock)\b/i.test(
      fullTagMatch[0]
    ),
    false
  );
});

test("Computer move is only determined and written to DOM after player submission and resolved countdown", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const vm = require("node:vm");

  const scriptPath = path.join(
    __dirname,
    "../projects/games/stone-paper-scissors-game/script.js"
  );
  const scriptContent = fs.readFileSync(scriptPath, "utf8");

  class MockElement {
    constructor(id = "", className = "") {
      this.id = id;
      this.className = className;
      this.textContent = "❓";
      this.attributes = {};
      this.style = {};
      this.disabled = false;
      this.listeners = {};
      this.classList = {
        _classes: new Set(className ? className.split(/\s+/) : []),
        add: (...cls) => cls.forEach(c => this.classList._classes.add(c)),
        remove: (...cls) => cls.forEach(c => this.classList._classes.delete(c)),
        contains: c => this.classList._classes.has(c),
      };
    }
    setAttribute(key, val) {
      this.attributes[key] = String(val);
    }
    getAttribute(key) {
      return this.attributes[key] || null;
    }
    removeAttribute(key) {
      delete this.attributes[key];
    }
    appendChild(child) {
      this.children = this.children || [];
      this.children.push(child);
      return child;
    }
    remove() {
      // noop
    }
    addEventListener(evt, fn) {
      this.listeners[evt] = this.listeners[evt] || [];
      this.listeners[evt].push(fn);
    }
    dispatchEvent(evt) {
      if (this.listeners[evt]) {
        this.listeners[evt].forEach(fn => fn({ target: this }));
      }
    }
    click() {
      this.dispatchEvent("click");
    }
  }

  const elements = {
    playerPick: new MockElement("playerPick", "fighter"),
    computerPick: new MockElement("computerPick", "fighter"),
    resultText: new MockElement("resultText"),
    playerScore: new MockElement("playerScore"),
    computerScore: new MockElement("computerScore"),
    streakCount: new MockElement("streakCount"),
    resetBtn: new MockElement("resetBtn"),
    battleArena: new MockElement("battleArena"),
    confettiContainer: new MockElement("confettiContainer"),
    playerTally: new MockElement("playerTally"),
    computerTally: new MockElement("computerTally"),
    victoryModal: new MockElement("victoryModal"),
    modalTitle: new MockElement("modalTitle"),
    modalMessage: new MockElement("modalMessage"),
    playAgainBtn: new MockElement("playAgainBtn"),
    rulesMode: new MockElement("rulesMode"),
    aiDifficulty: new MockElement("aiDifficulty"),
    rockBtn: new MockElement("rockBtn", "choice-btn"),
    paperBtn: new MockElement("paperBtn", "choice-btn"),
    scissorsBtn: new MockElement("scissorsBtn", "choice-btn"),
  };
  elements.rockBtn.setAttribute("data-choice", "rock");
  elements.paperBtn.setAttribute("data-choice", "paper");
  elements.scissorsBtn.setAttribute("data-choice", "scissors");

  const choiceBtns = [
    elements.rockBtn,
    elements.paperBtn,
    elements.scissorsBtn,
  ];

  const mockDocument = {
    getElementById: id => elements[id] || null,
    querySelectorAll: sel => {
      if (sel === ".choice-btn") return choiceBtns;
      if (sel === ".mode-btn") return [];
      if (sel.includes("-stat") || sel.includes("-how")) return [];
      return [];
    },
    createElement: tag => new MockElement(tag),
    body: new MockElement("body"),
  };

  const sandbox = {
    document: mockDocument,
    console,
    setInterval,
    clearInterval,
    setTimeout,
    clearTimeout,
    module: { exports: {} },
    RpsAiEngine: require("../projects/games/stone-paper-scissors-game/rpsAiEngine.js"),
    RpsStorage: require("../projects/games/stone-paper-scissors-game/rpsStorage.js"),
    RULES: require("../projects/games/stone-paper-scissors-game/game-engine.js")
      .RULES,
    determineWinner:
      require("../projects/games/stone-paper-scissors-game/game-engine.js")
        .determineWinner,
  };

  vm.createContext(sandbox);
  vm.runInContext(scriptContent, sandbox);

  const exported = sandbox.module.exports;

  // 1. Before making any choice: computer pick is neutral ("❓") with no move attribute
  assert.strictEqual(elements.computerPick.textContent, "❓");
  assert.strictEqual(elements.computerPick.getAttribute("data-choice"), null);

  // 2. When player clicks 'rock', the interaction locks in move and triggers countdown
  elements.rockBtn.click();

  // During countdown: fighter shows thinking "🤔", NO move written to DOM
  assert.strictEqual(elements.computerPick.textContent, "🤔");
  assert.strictEqual(elements.computerPick.getAttribute("data-choice"), null);
  assert.strictEqual(elements.rockBtn.disabled, true);

  // 3. Complete round via playGame
  exported.playGame("rock", "scissors");

  // Now, computer pick is revealed and written to DOM
  assert.strictEqual(elements.computerPick.textContent, "✂️");
  assert.strictEqual(
    elements.computerPick.getAttribute("data-choice"),
    "scissors"
  );
  assert.strictEqual(elements.playerPick.textContent, "🪨");
  assert.strictEqual(elements.playerPick.getAttribute("data-choice"), "rock");

  // 4. Before player makes their next choice, prepareNextRound clears fighters back to "❓"
  exported.prepareNextRound();

  assert.strictEqual(elements.computerPick.textContent, "❓");
  assert.strictEqual(elements.computerPick.getAttribute("data-choice"), null);
  assert.strictEqual(elements.playerPick.textContent, "❓");
  assert.strictEqual(elements.playerPick.getAttribute("data-choice"), null);
  assert.strictEqual(elements.rockBtn.disabled, false);

  // 5. Test resetBtn restores neutral state
  exported.playGame("scissors", "rock");
  assert.strictEqual(elements.computerPick.textContent, "🪨");
  elements.resetBtn.click();
  assert.strictEqual(elements.computerPick.textContent, "❓");
  assert.strictEqual(elements.computerPick.getAttribute("data-choice"), null);
});
