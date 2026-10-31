/**
 * Pomodoro Timer — script.js
 * Implements timer loop with Page Visibility API & timestamp synchronization,
 * sound synthesis, state management, and UI events.
 */

/* ── Pure Timer Calculations (Exportable for Unit Testing) ── */

/**
 * Computes remaining seconds from a future target timestamp.
 * Clamps to 0 when endTime has elapsed.
 *
 * @param {number|null} endTime - Target end timestamp in milliseconds (Date.now())
 * @param {number} [now=Date.now()] - Current timestamp in milliseconds
 * @returns {number} Seconds remaining (0 or positive integer)
 */
function calculateRemainingSeconds(endTime, now = Date.now()) {
  if (!endTime || typeof endTime !== "number" || isNaN(endTime)) return 0;
  return Math.max(0, Math.ceil((endTime - now) / 1000));
}

/**
 * Computes the target end timestamp given remaining seconds.
 *
 * @param {number} timeRemainingSec - Remaining seconds
 * @param {number} [now=Date.now()] - Current timestamp in milliseconds
 * @returns {number} Target end timestamp in milliseconds
 */
function computeTargetEndTime(timeRemainingSec, now = Date.now()) {
  const safeSecs = Math.max(0, Number(timeRemainingSec) || 0);
  return now + safeSecs * 1000;
}

/**
 * Synchronizes remaining time when visibility changes or throttled interval wakes up.
 *
 * @param {Object} options
 * @param {number|null} options.endTime - Target end timestamp in ms
 * @param {number} [options.now=Date.now()] - Current timestamp in ms
 * @param {boolean} options.isRunning - Whether the timer is currently running
 * @returns {{ remaining: number|null, shouldComplete: boolean }}
 */
function syncTimerOnVisibilityChange({ endTime, now = Date.now(), isRunning }) {
  if (!isRunning || !endTime) {
    return { remaining: null, shouldComplete: false };
  }
  const remaining = calculateRemainingSeconds(endTime, now);
  return {
    remaining,
    shouldComplete: remaining <= 0,
  };
}

/**
 * Formats seconds into MM:SS string.
 *
 * @param {number} secs
 * @returns {string} Formatted MM:SS
 */
function formatTime(secs) {
  const safeSecs = Math.max(0, Math.floor(Number(secs) || 0));
  const m = Math.floor(safeSecs / 60);
  const s = safeSecs % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/* ── Browser DOM Controller ── */
if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    /* ── DOM refs ── */
    const modeButtons = document.querySelectorAll(".btn-mode");
    const timerDigits = document.getElementById("timerDigits");
    const timerLabel = document.getElementById("timerLabel");
    const ringProgress = document.getElementById("ringProgress");
    const startBtn = document.getElementById("startBtn");
    const resetBtn = document.getElementById("resetBtn");
    const skipBtn = document.getElementById("skipBtn");
    const sessionCountEl = document.getElementById("sessionCount");
    const totalMinutesEl = document.getElementById("totalMinutes");
    const currentStreakEl = document.getElementById("currentStreak");
    const setPomodoro = document.getElementById("setPomodoro");
    const setShortBreak = document.getElementById("setShortBreak");
    const setLongBreak = document.getElementById("setLongBreak");
    const setAutoStart = document.getElementById("setAutoStart");
    const setSound = document.getElementById("setSound");
    const setLongBreakAfter = document.getElementById("setLongBreakAfter");
    const logList = document.getElementById("logList");
    const toast = document.getElementById("toast");

    /* ── Constants ── */
    const RING_CIRCUMFERENCE = 2 * Math.PI * 118; // 741.416

    /* ── State ── */
    let currentMode = "pomodoro"; // 'pomodoro' | 'shortBreak' | 'longBreak'
    let isRunning = false;
    let timeRemaining = 25 * 60; // seconds
    let totalTime = 25 * 60;
    let intervalId = null;
    let endTime = null; // target timestamp when running
    let sessionsCompleted = 0;
    let totalFocusMinutes = 0;
    let currentStreak = 0;
    let todayLog = [];

    /* ── Settings ── */
    function getSettings() {
      return {
        pomodoro: Math.max(1, Math.min(120, parseInt(setPomodoro.value) || 25)),
        shortBreak: Math.max(
          1,
          Math.min(30, parseInt(setShortBreak.value) || 5)
        ),
        longBreak: Math.max(
          1,
          Math.min(60, parseInt(setLongBreak.value) || 15)
        ),
        autoStart: setAutoStart.checked,
        sound: setSound.checked,
        longBreakAfter: Math.max(
          2,
          Math.min(10, parseInt(setLongBreakAfter.value) || 4)
        ),
      };
    }

    function getDuration(mode) {
      const s = getSettings();
      if (mode === "pomodoro") return s.pomodoro;
      if (mode === "shortBreak") return s.shortBreak;
      return s.longBreak;
    }

    /* ── Persistence ── */
    function saveState() {
      const today = new Date().toISOString().slice(0, 10);
      localStorage.setItem(
        "pomodoro-sessions",
        JSON.stringify(sessionsCompleted)
      );
      localStorage.setItem(
        "pomodoro-focus-min",
        JSON.stringify(totalFocusMinutes)
      );
      localStorage.setItem("pomodoro-streak", JSON.stringify(currentStreak));
      localStorage.setItem(
        "pomodoro-log",
        JSON.stringify({ date: today, entries: todayLog })
      );
      localStorage.setItem(
        "pomodoro-settings",
        JSON.stringify({
          pomodoro: setPomodoro.value,
          shortBreak: setShortBreak.value,
          longBreak: setLongBreak.value,
          autoStart: setAutoStart.checked,
          sound: setSound.checked,
          longBreakAfter: setLongBreakAfter.value,
        })
      );
    }

    function loadState() {
      try {
        const today = new Date().toISOString().slice(0, 10);
        sessionsCompleted =
          JSON.parse(localStorage.getItem("pomodoro-sessions")) || 0;
        totalFocusMinutes =
          JSON.parse(localStorage.getItem("pomodoro-focus-min")) || 0;
        currentStreak =
          JSON.parse(localStorage.getItem("pomodoro-streak")) || 0;
        const logData = JSON.parse(localStorage.getItem("pomodoro-log"));
        if (logData && logData.date === today) {
          todayLog = logData.entries || [];
        } else {
          todayLog = [];
          sessionsCompleted = 0;
          totalFocusMinutes = 0;
        }
        const saved = JSON.parse(localStorage.getItem("pomodoro-settings"));
        if (saved) {
          setPomodoro.value = saved.pomodoro;
          setShortBreak.value = saved.shortBreak;
          setLongBreak.value = saved.longBreak;
          setAutoStart.checked = saved.autoStart;
          setSound.checked = saved.sound;
          setLongBreakAfter.value = saved.longBreakAfter;
        }
      } catch {
        /* ignore corrupt data */
      }
    }

    /* ── Sound ── */
    function playBeep() {
      if (!getSettings().sound) return;
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const playTone = (freq, startTime, duration) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.3, startTime);
          gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
          osc.connect(gain).connect(ctx.destination);
          osc.start(startTime);
          osc.stop(startTime + duration);
        };
        const now = ctx.currentTime;
        playTone(880, now, 0.15);
        playTone(880, now + 0.2, 0.15);
        playTone(1175, now + 0.45, 0.3);
      } catch {
        /* audio not available */
      }
    }

    /* ── Toast ── */
    let toastTimer;
    function showToast(msg) {
      toast.textContent = msg;
      toast.classList.add("visible");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.remove("visible"), 2000);
    }

    /* ── Ring ── */
    function updateRing() {
      const progress = totalTime > 0 ? timeRemaining / totalTime : 1;
      const offset = RING_CIRCUMFERENCE * (1 - progress);
      ringProgress.style.strokeDasharray = RING_CIRCUMFERENCE;
      ringProgress.style.strokeDashoffset = offset;
    }

    /* ── Display ── */
    function updateDisplay() {
      timerDigits.textContent = formatTime(timeRemaining);
      const labels = {
        pomodoro: "Focus",
        shortBreak: "Short Break",
        longBreak: "Long Break",
      };
      timerLabel.textContent = labels[currentMode];
      document.body.className = `mode-${currentMode}`;
      updateRing();
      sessionCountEl.textContent = sessionsCompleted;
      totalMinutesEl.textContent = totalFocusMinutes;
      currentStreakEl.textContent = currentStreak;
      document.title = `${formatTime(timeRemaining)} — ${labels[currentMode]} | Pomodoro`;
    }

    /* ── Log ── */
    function renderLog() {
      if (todayLog.length === 0) {
        logList.innerHTML =
          '<p class="empty-state">No sessions yet today. Start focusing!</p>';
        return;
      }
      logList.innerHTML = todayLog
        .map(e => {
          const cls =
            e.type === "pomodoro"
              ? "focus"
              : e.type === "shortBreak"
                ? "short"
                : "long";
          const label =
            e.type === "pomodoro"
              ? "🍅 Focus"
              : e.type === "shortBreak"
                ? "☕ Short"
                : "🌙 Long";
          return `<div class="log-entry">
            <span class="log-type ${cls}">${label}</span>
            <span class="log-time">${e.duration}m · ${e.time}</span>
          </div>`;
        })
        .reverse()
        .join("");
    }

    function addLogEntry(mode, durationMin) {
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      todayLog.push({ type: mode, duration: durationMin, time: timeStr });
      renderLog();
    }

    /* ── Timer Engine ── */
    function tick() {
      if (!endTime) {
        endTime = computeTargetEndTime(timeRemaining);
      }
      timeRemaining = calculateRemainingSeconds(endTime);
      if (timeRemaining <= 0) {
        timeRemaining = 0;
        updateDisplay();
        onTimerComplete();
        return;
      }
      updateDisplay();
    }

    function startTimer() {
      if (isRunning) return;
      isRunning = true;
      endTime = computeTargetEndTime(timeRemaining);
      startBtn.textContent = "⏸";
      clearInterval(intervalId);
      intervalId = setInterval(tick, 1000);
    }

    function pauseTimer() {
      if (isRunning && endTime) {
        timeRemaining = calculateRemainingSeconds(endTime);
      }
      isRunning = false;
      endTime = null;
      startBtn.textContent = "▶";
      clearInterval(intervalId);
      intervalId = null;
      updateDisplay();
    }

    function resetTimer() {
      pauseTimer();
      endTime = null;
      timeRemaining = getDuration(currentMode) * 60;
      totalTime = timeRemaining;
      updateDisplay();
      showToast("Timer reset");
    }

    function switchMode(mode) {
      pauseTimer();
      endTime = null;
      currentMode = mode;
      timeRemaining = getDuration(mode) * 60;
      totalTime = timeRemaining;
      modeButtons.forEach(b =>
        b.classList.toggle("active", b.dataset.mode === mode)
      );
      updateDisplay();
    }

    function handleVisibilityChange() {
      if (document.hidden) return;
      const sync = syncTimerOnVisibilityChange({
        endTime,
        now: Date.now(),
        isRunning,
      });
      if (sync.remaining !== null) {
        timeRemaining = sync.remaining;
        updateDisplay();
        if (sync.shouldComplete) {
          timeRemaining = 0;
          onTimerComplete();
        }
      }
    }

    function onTimerComplete() {
      pauseTimer();
      playBeep();
      const durMin = getDuration(currentMode);

      if (currentMode === "pomodoro") {
        sessionsCompleted++;
        totalFocusMinutes += durMin;
        currentStreak++;
        addLogEntry("pomodoro", durMin);
        showToast(`Focus session complete! 🍅`);

        // Decide next mode
        const settings = getSettings();
        if (sessionsCompleted % settings.longBreakAfter === 0) {
          switchMode("longBreak");
        } else {
          switchMode("shortBreak");
        }
      } else {
        addLogEntry(currentMode, durMin);
        showToast("Break over — time to focus! 💪");
        switchMode("pomodoro");
      }

      if (getSettings().autoStart) {
        setTimeout(() => startTimer(), 800);
      }

      saveState();
    }

    /* ── Event bindings ── */
    startBtn.addEventListener("click", () => {
      if (isRunning) pauseTimer();
      else startTimer();
    });

    resetBtn.addEventListener("click", resetTimer);
    skipBtn.addEventListener("click", () => {
      pauseTimer();
      onTimerComplete();
    });

    modeButtons.forEach(btn => {
      btn.addEventListener("click", () => switchMode(btn.dataset.mode));
    });

    // Settings change handlers
    [setPomodoro, setShortBreak, setLongBreak, setLongBreakAfter].forEach(
      el => {
        el.addEventListener("change", () => {
          if (!isRunning) {
            endTime = null;
            timeRemaining = getDuration(currentMode) * 60;
            totalTime = timeRemaining;
            updateDisplay();
          }
          saveState();
        });
      }
    );

    [setAutoStart, setSound].forEach(el => {
      el.addEventListener("change", saveState);
    });

    // Page Visibility API — sync countdown when returning to tab
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Keyboard shortcuts
    document.addEventListener("keydown", e => {
      if (e.target.tagName === "INPUT") return;
      if (e.code === "Space") {
        e.preventDefault();
        if (isRunning) pauseTimer();
        else startTimer();
      } else if (e.key === "r" || e.key === "R") resetTimer();
      else if (e.key === "s" || e.key === "S") {
        pauseTimer();
        onTimerComplete();
      } else if (e.key === "1") switchMode("pomodoro");
      else if (e.key === "2") switchMode("shortBreak");
      else if (e.key === "3") switchMode("longBreak");
    });

    /* ── Init ── */
    loadState();
    timeRemaining = getDuration(currentMode) * 60;
    totalTime = timeRemaining;
    updateDisplay();
    renderLog();
  });
}

/* ── Node.js CommonJS Exports for Testing ── */
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    calculateRemainingSeconds,
    computeTargetEndTime,
    syncTimerOnVisibilityChange,
    formatTime,
  };
}
