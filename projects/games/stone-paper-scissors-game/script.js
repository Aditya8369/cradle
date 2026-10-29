const emojis = {
  rock: "🪨",
  paper: "📄",
  scissors: "✂️",
  lizard: "🦎",
  spock: "🖖",
};
const choicesList = ["rock", "paper", "scissors"];

let playerScore = 0;
let computerScore = 0;
let streak = 0;
let gameMode = 1;
let targetWins = 1;
let playerTournamentWins = 0;
let computerTournamentWins = 0;

let currentRulesMode = "classic";
let gestureStats = { rock: 0, paper: 0, scissors: 0, lizard: 0, spock: 0 };
let totalRounds = 0;

let countdownInterval = null;
let nextRoundTimeout = null;

const choiceBtns = document.querySelectorAll(".choice-btn");
const playerPickEl = document.getElementById("playerPick");
const computerPickEl = document.getElementById("computerPick");
const resultText = document.getElementById("resultText");
const playerScoreEl = document.getElementById("playerScore");
const computerScoreEl = document.getElementById("computerScore");
const streakEl = document.getElementById("streakCount");
const resetBtn = document.getElementById("resetBtn");
const battleArena = document.getElementById("battleArena");
const confettiContainer = document.getElementById("confettiContainer");
const modeBtns = document.querySelectorAll(".mode-btn");
const playerTallyEl = document.getElementById("playerTally");
const computerTallyEl = document.getElementById("computerTally");
const victoryModal = document.getElementById("victoryModal");
const modalTitle = document.getElementById("modalTitle");
const modalMessage = document.getElementById("modalMessage");
const playAgainBtn = document.getElementById("playAgainBtn");

const rulesModeSelect = document.getElementById("rulesMode");
const aiDifficultySelect = document.getElementById("aiDifficulty");

let aiModel = null;
if (typeof RpsAiEngine !== "undefined" && RpsAiEngine.createAiModel) {
  aiModel = RpsAiEngine.createAiModel(choicesList);
}

if (rulesModeSelect) {
  rulesModeSelect.addEventListener("change", e => {
    currentRulesMode = e.target.value;
    updateModeUI();
  });
}

if (aiDifficultySelect) {
  aiDifficultySelect.addEventListener("change", () => {
    if (aiModel) {
      aiModel.reset();
    }
  });
}

function clearPendingTimers() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  if (nextRoundTimeout) {
    clearTimeout(nextRoundTimeout);
    nextRoundTimeout = null;
  }
}

function updateModeUI() {
  const isLizardSpock = currentRulesMode === "lizard-spock";
  choicesList.length = 0;

  const lizardBtn = document.getElementById("lizardBtn");
  const spockBtn = document.getElementById("spockBtn");

  if (isLizardSpock) {
    choicesList.push("rock", "paper", "scissors", "lizard", "spock");
    if (lizardBtn) lizardBtn.style.display = "inline-flex";
    if (spockBtn) spockBtn.style.display = "inline-flex";
    document
      .querySelectorAll(".lizard-stat")
      .forEach(el => (el.style.display = "block"));
    document
      .querySelectorAll(".spock-stat")
      .forEach(el => (el.style.display = "block"));
    document
      .querySelectorAll(".lizard-how")
      .forEach(el => (el.style.display = "block"));
    document
      .querySelectorAll(".spock-how")
      .forEach(el => (el.style.display = "block"));
  } else {
    choicesList.push("rock", "paper", "scissors");
    if (lizardBtn) lizardBtn.style.display = "none";
    if (spockBtn) spockBtn.style.display = "none";
    document
      .querySelectorAll(".lizard-stat")
      .forEach(el => (el.style.display = "none"));
    document
      .querySelectorAll(".spock-stat")
      .forEach(el => (el.style.display = "none"));
    document
      .querySelectorAll(".lizard-how")
      .forEach(el => (el.style.display = "none"));
    document
      .querySelectorAll(".spock-how")
      .forEach(el => (el.style.display = "none"));
  }

  if (aiModel) {
    aiModel.reset();
    if (typeof RpsAiEngine !== "undefined" && RpsAiEngine.createAiModel) {
      aiModel = RpsAiEngine.createAiModel(choicesList);
    }
  }

  resetTournament();
}

function recordGesture(choice) {
  if (gestureStats[choice] !== undefined) {
    gestureStats[choice]++;
    totalRounds++;
    updateStatsUI();
  }
}

function updateStatsUI() {
  if (totalRounds === 0) return;
  ["rock", "paper", "scissors", "lizard", "spock"].forEach(key => {
    const el = document.getElementById(key + "Pct");
    if (el) {
      const pct = ((gestureStats[key] / totalRounds) * 100).toFixed(0);
      el.textContent = `${pct}%`;
    }
  });
}

function resetStats() {
  gestureStats = { rock: 0, paper: 0, scissors: 0, lizard: 0, spock: 0 };
  totalRounds = 0;
  if (aiModel) {
    aiModel.reset();
  }
  ["rock", "paper", "scissors", "lizard", "spock"].forEach(key => {
    const el = document.getElementById(key + "Pct");
    if (el) el.textContent = "0%";
  });
}

modeBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    modeBtns.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    gameMode = parseInt(btn.getAttribute("data-mode"), 10);
    targetWins = Math.ceil(gameMode / 2);
    resetTournament();
  });
});

function renderTally() {
  if (gameMode === 1) {
    if (playerTallyEl) playerTallyEl.innerHTML = "";
    if (computerTallyEl) computerTallyEl.innerHTML = "";
    return;
  }

  if (playerTallyEl) playerTallyEl.innerHTML = "";
  if (computerTallyEl) computerTallyEl.innerHTML = "";

  for (let i = 0; i < targetWins; i++) {
    const pDot = document.createElement("div");
    pDot.classList.add("dot");
    if (i < playerTournamentWins) pDot.classList.add("won");
    if (playerTallyEl) playerTallyEl.appendChild(pDot);

    const cDot = document.createElement("div");
    cDot.classList.add("dot");
    if (i < computerTournamentWins) cDot.classList.add("won");
    if (computerTallyEl) computerTallyEl.appendChild(cDot);
  }
}

function resetTournament() {
  clearPendingTimers();
  playerTournamentWins = 0;
  computerTournamentWins = 0;
  renderTally();
  if (resetBtn) {
    resetBtn.click();
  }
}

choiceBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    const playerChoice = btn.getAttribute("data-choice");
    // Ensure the computer's choice is determined on the user-interaction event that locks in player choice
    const computerChoice = getComputerChoice();
    startCountdown(playerChoice, computerChoice);
  });
});

function triggerShake() {
  if (playerPickEl && computerPickEl) {
    playerPickEl.classList.remove("shake");
    computerPickEl.classList.remove("shake");
    void playerPickEl.offsetWidth; // trigger reflow
    playerPickEl.classList.add("shake");
    computerPickEl.classList.add("shake");
  }
}

function startCountdown(playerChoice, precomputedComputerChoice) {
  clearPendingTimers();
  toggleButtons(true);
  if (battleArena) battleArena.classList.remove("win-glow", "lose-glow");

  // Keep fighters in neutral thinking state with NO move data written to DOM
  if (playerPickEl) {
    playerPickEl.textContent = "🤔";
    playerPickEl.removeAttribute("data-choice");
    playerPickEl.removeAttribute("data-move");
    playerPickEl.className = "fighter";
  }
  if (computerPickEl) {
    computerPickEl.textContent = "🤔";
    computerPickEl.removeAttribute("data-choice");
    computerPickEl.removeAttribute("data-move");
    computerPickEl.className = "fighter";
  }

  const computerChoice = precomputedComputerChoice || getComputerChoice();
  const steps = ["ROCK...", "PAPER...", "SCISSORS...", "SHOOT!"];
  let i = 0;

  if (resultText) resultText.textContent = steps[i];
  triggerShake();

  countdownInterval = setInterval(() => {
    i++;
    if (i < steps.length) {
      if (resultText) resultText.textContent = steps[i];
      if (i < 3) triggerShake();
    } else {
      clearPendingTimers();
      if (playerPickEl) playerPickEl.classList.remove("shake");
      if (computerPickEl) computerPickEl.classList.remove("shake");
      playGame(playerChoice, computerChoice);
    }
  }, 400);
}

function getComputerChoice() {
  const isAdaptive =
    aiDifficultySelect && aiDifficultySelect.value === "adaptive";
  if (
    isAdaptive &&
    aiModel &&
    totalRounds >= 1 &&
    typeof RULES !== "undefined"
  ) {
    return aiModel.getOptimalCounter(RULES);
  }
  return choicesList[Math.floor(Math.random() * choicesList.length)];
}

function playGame(player, computer) {
  // Only write the choices to the DOM after player has submitted and countdown has resolved
  if (playerPickEl) {
    playerPickEl.textContent = emojis[player] || player;
    playerPickEl.setAttribute("data-choice", player);
    playerPickEl.classList.add("pop");
    setTimeout(() => {
      if (playerPickEl) playerPickEl.classList.remove("pop");
    }, 400);
  }
  if (computerPickEl) {
    computerPickEl.textContent = emojis[computer] || computer;
    computerPickEl.setAttribute("data-choice", computer);
    computerPickEl.classList.add("pop");
    setTimeout(() => {
      if (computerPickEl) computerPickEl.classList.remove("pop");
    }, 400);
  }

  recordGesture(player);
  if (aiModel) {
    aiModel.recordMove(player);
  }

  const result = determineWinner(player, computer);

  if (typeof RpsStorage !== "undefined" && RpsStorage.recordOutcome) {
    RpsStorage.recordOutcome(result.outcome, player);
  }

  if (result.outcome === "tie") {
    if (resultText) resultText.textContent = "🤝 " + result.message;
    streak = 0;
  } else if (result.outcome === "player") {
    if (resultText) resultText.textContent = "🎉 " + result.message;
    playerScore++;
    playerTournamentWins++;
    streak++;
    if (playerScoreEl) playerScoreEl.textContent = playerScore;
    if (battleArena) battleArena.classList.add("win-glow");
    if (gameMode === 1) launchConfetti();
  } else {
    if (resultText) resultText.textContent = "💥 " + result.message;
    computerScore++;
    computerTournamentWins++;
    streak = 0;
    if (computerScoreEl) computerScoreEl.textContent = computerScore;
    if (battleArena) battleArena.classList.add("lose-glow");
    document.body.classList.add("shake");
    setTimeout(() => document.body.classList.remove("shake"), 400);
  }

  if (streakEl) streakEl.textContent = streak;
  renderTally();

  if (gameMode > 1) {
    if (playerTournamentWins >= targetWins) {
      setTimeout(() => showVictoryModal("Player"), 500);
    } else if (computerTournamentWins >= targetWins) {
      setTimeout(() => showVictoryModal("Computer"), 500);
    } else {
      nextRoundTimeout = setTimeout(() => prepareNextRound(), 1200);
    }
  } else {
    nextRoundTimeout = setTimeout(() => prepareNextRound(), 1200);
  }
}

function prepareNextRound() {
  clearPendingTimers();
  // Neutralize fighter displays and clear move attributes before player makes their next choice
  if (playerPickEl) {
    playerPickEl.textContent = "❓";
    playerPickEl.removeAttribute("data-choice");
    playerPickEl.removeAttribute("data-move");
    playerPickEl.className = "fighter";
  }
  if (computerPickEl) {
    computerPickEl.textContent = "❓";
    computerPickEl.removeAttribute("data-choice");
    computerPickEl.removeAttribute("data-move");
    computerPickEl.className = "fighter";
  }
  if (battleArena) {
    battleArena.classList.remove("win-glow", "lose-glow");
  }
  if (resultText) {
    resultText.textContent = "Choose your weapon!";
  }
  toggleButtons(false);
}

function toggleButtons(disabled) {
  choiceBtns.forEach(btn => (btn.disabled = disabled));
}

if (resetBtn) {
  resetBtn.addEventListener("click", () => {
    clearPendingTimers();
    playerScore = 0;
    computerScore = 0;
    streak = 0;
    playerTournamentWins = 0;
    computerTournamentWins = 0;
    resetStats();
    if (typeof RpsStorage !== "undefined" && RpsStorage.resetStats) {
      RpsStorage.resetStats();
    }
    renderTally();
    if (playerScoreEl) playerScoreEl.textContent = 0;
    if (computerScoreEl) computerScoreEl.textContent = 0;
    if (streakEl) streakEl.textContent = 0;
    if (playerPickEl) {
      playerPickEl.textContent = "❓";
      playerPickEl.removeAttribute("data-choice");
      playerPickEl.removeAttribute("data-move");
      playerPickEl.className = "fighter";
    }
    if (computerPickEl) {
      computerPickEl.textContent = "❓";
      computerPickEl.removeAttribute("data-choice");
      computerPickEl.removeAttribute("data-move");
      computerPickEl.className = "fighter";
    }
    if (resultText) resultText.textContent = "Choose your weapon!";
    if (battleArena) battleArena.classList.remove("win-glow", "lose-glow");
    toggleButtons(false);
  });
}

function showVictoryModal(winner) {
  if (!victoryModal) return;
  victoryModal.classList.remove("hidden");
  if (winner === "Player") {
    if (modalTitle) {
      modalTitle.textContent = "Tournament Complete";
      modalTitle.style.color = "#00f5ff";
      modalTitle.style.textShadow = "0 0 10px rgba(0, 245, 255, 0.4)";
    }
    if (modalMessage) {
      modalMessage.textContent = "You defeated the machine!";
    }
    launchConfetti();
  } else {
    if (modalTitle) {
      modalTitle.textContent = "Defeat";
      modalTitle.style.color = "#ff2e88";
      modalTitle.style.textShadow = "0 0 10px rgba(255, 46, 136, 0.4)";
    }
    if (modalMessage) {
      modalMessage.textContent = "The machine wins this time.";
    }
  }
}

if (playAgainBtn) {
  playAgainBtn.addEventListener("click", () => {
    if (victoryModal) victoryModal.classList.add("hidden");
    resetTournament();
    toggleButtons(false);
  });
}

function launchConfetti() {
  if (!confettiContainer) return;
  const colors = ["#00f5ff", "#ff2e88", "#ffd23f"];
  for (let i = 0; i < 40; i++) {
    const piece = document.createElement("div");
    piece.classList.add("confetti-piece");
    piece.style.left = Math.random() * 100 + "vw";
    piece.style.width = piece.style.height = Math.random() * 6 + 6 + "px";
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDuration = Math.random() * 1.5 + 1.5 + "s";
    confettiContainer.appendChild(piece);
    setTimeout(() => piece.remove(), 3000);
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    emojis,
    choicesList,
    getComputerChoice,
    startCountdown,
    playGame,
    prepareNextRound,
    resetTournament,
    updateModeUI,
    clearPendingTimers,
  };
}
