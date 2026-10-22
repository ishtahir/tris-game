import { Tris, COLS, ROWS } from "./game.js";
import { Renderer, CELL } from "./render.js";

const STAGE_W = 320; // original iPhone width in points: 230 board + 90 sidebar
const MAX_ROWS = 40;
const SAVE_KEY = "tris.save";
const SCORES_KEY = "tris.highscores"; // classic; other modes get a suffix
const TAP_MS = 500;

const $ = (id) => document.getElementById(id);
const frame = $("frame");
const stage = $("stage");
const canvas = $("tris-canvas");
const renderer = new Renderer(canvas, $("next-canvas"));
const overlays = { menu: $("menu"), scores: $("scores"), over: $("game-over") };

let game = loadSave();
// "playing" | "menu" | "scores" | "over". Like the original, launch to the menu.
let screen = "menu";
let scoresReturn = "menu";
let latestScore = null;

// --- Layout ---
// The stage is the original 320pt-wide layout scaled to the screen width.
// Rather than stretch, taller screens get extra rows (never fewer than 20).

/** How many rows fit the screen when the board fills its width. */
function fitRows() {
  const { width, height } = frame.getBoundingClientRect();
  const rows = Math.floor(height / (width / STAGE_W) / CELL);
  return Math.min(MAX_ROWS, Math.max(ROWS, rows));
}

function layout() {
  // A game keeps the row count it started with, even if the screen changes.
  const rows = game ? game.rows : fitRows();
  const stageH = rows * CELL;
  const { width, height } = frame.getBoundingClientRect();
  const scale = Math.min(width / STAGE_W, height / stageH);
  stage.style.height = `${stageH}px`;
  stage.style.transform = `scale(${scale})`;
  renderer.resize(scale * (window.devicePixelRatio || 1), rows);
}

// --- Persistence ---

function loadSave() {
  try {
    const data = JSON.parse(localStorage.getItem(SAVE_KEY));
    return data ? Tris.fromJSON(data) : null;
  } catch {
    return null;
  }
}

function save() {
  if (!game) return;
  if (!game.over) localStorage.setItem(SAVE_KEY, JSON.stringify(game));
  else localStorage.removeItem(SAVE_KEY);
}

const scoresKey = (mode) => (mode === "classic" ? SCORES_KEY : `${SCORES_KEY}.${mode}`);

function loadScores(mode) {
  try {
    return JSON.parse(localStorage.getItem(scoresKey(mode))) || [];
  } catch {
    return [];
  }
}

/** Adds a score to the mode's top 10 and returns its rank (0-based), or -1. */
function recordScore(mode, score) {
  const entry = { score, date: Date.now() };
  const top = [...loadScores(mode), entry].sort((a, b) => b.score - a.score).slice(0, 10);
  localStorage.setItem(scoresKey(mode), JSON.stringify(top));
  latestScore = top.includes(entry) ? entry.date : null;
  return top.indexOf(entry);
}

// --- Screens ---

function show(name) {
  screen = name;
  for (const [key, el] of Object.entries(overlays)) {
    el.classList.toggle("hidden", key !== name);
  }
  $("resume-btn").classList.toggle("hidden", !game || game.over);
  if (name !== "playing") drag = null;
}

function play() {
  show("playing");
}

function pause() {
  if (screen !== "playing") return;
  save();
  show("menu");
}

function newGame(mode) {
  game = new Tris({ rows: fitRows(), mode });
  layout();
  save();
  play();
}

function showScores(from) {
  scoresReturn = from;
  renderScores(game ? game.mode : "classic");
  show("scores");
}

function renderScores(mode) {
  for (const tab of document.querySelectorAll(".tab")) {
    tab.classList.toggle("active", tab.dataset.mode === mode);
  }
  const list = $("scores-list");
  list.replaceChildren();
  const scores = loadScores(mode);
  if (!scores.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "NO SCORES YET";
    list.append(li);
  }
  for (const { score, date } of scores) {
    const li = document.createElement("li");
    li.textContent = score;
    if (date === latestScore) li.classList.add("latest");
    list.append(li);
  }
}

function gameOver() {
  save();
  const rank = game.score > 0 ? recordScore(game.mode, game.score) : -1;
  $("over-title").textContent = game.timeUp ? "TIME'S UP" : "GAME OVER";
  $("over-mode").textContent = game.mode === "classic" ? "" : game.mode.toUpperCase();
  $("final-score").textContent = game.score;
  $("final-rank").textContent =
    rank === 0 ? "NEW HIGH SCORE!" : rank > 0 ? `#${rank + 1} HIGH SCORE` : "";
  show("over");
}

$("resume-btn").addEventListener("click", play);
$("classic-btn").addEventListener("click", () => newGame("classic"));
$("blitz-btn").addEventListener("click", () => newGame("blitz"));
$("again-btn").addEventListener("click", () => newGame(game.mode));
for (const tab of document.querySelectorAll(".tab")) {
  tab.addEventListener("click", () => renderScores(tab.dataset.mode));
}
$("scores-btn").addEventListener("click", () => showScores("menu"));
$("over-scores-btn").addEventListener("click", () => showScores("over"));
$("scores-back-btn").addEventListener("click", () => show(scoresReturn));
$("menu-btn").addEventListener("click", () => {
  if (screen === "playing") pause();
  else if (screen === "menu" && game && !game.over) play();
  else show("menu");
});

// --- Touch / mouse: the piece follows your finger, a tap rotates ---

let drag = null;

canvas.addEventListener("pointerdown", (e) => {
  if (screen !== "playing" || !game.active) return;
  e.preventDefault();
  canvas.setPointerCapture(e.pointerId);
  drag = {
    id: e.pointerId,
    piece: game.piece.id,
    x: e.clientX,
    y: e.clientY,
    startX: e.clientX,
    startY: e.clientY,
    time: performance.now(),
    moved: false,
  };
});

canvas.addEventListener("pointermove", (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  // Once the dragged piece locks, ignore the rest of this drag.
  if (!game.active || game.piece.id !== drag.piece) return;
  const cell = canvas.getBoundingClientRect().width / COLS;

  // Every full cell the finger travels moves the piece one cell, so it
  // tracks the finger 1:1. Anchors advance even when blocked so the piece
  // responds as soon as you drag back.
  while (e.clientX - drag.x >= cell) {
    game.shift(1);
    drag.x += cell;
    drag.moved = true;
  }
  while (drag.x - e.clientX >= cell) {
    game.shift(-1);
    drag.x -= cell;
    drag.moved = true;
  }
  while (e.clientY - drag.y >= cell) {
    drag.y += cell;
    drag.moved = true;
    if (!game.softDrop()) break;
  }
  while (drag.y - e.clientY >= cell) {
    game.lift();
    drag.y -= cell;
    drag.moved = true;
  }
});

canvas.addEventListener("pointerup", (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const cell = canvas.getBoundingClientRect().width / COLS;
  const travel = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);
  const isTap = !drag.moved && travel < cell / 2 && performance.now() - drag.time < TAP_MS;
  if (isTap && game.active && game.piece.id === drag.piece) game.rotate();
  drag = null;
});

canvas.addEventListener("pointercancel", () => {
  drag = null;
});

// --- Stop iOS Safari zooming on rapid taps or pinches ---
// Safari ignores user-scalable=no, so cancel the gestures themselves. Pointer
// events still fire, so the controls above are unaffected.

for (const type of ["touchstart", "touchend"]) {
  canvas.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}
let lastTouchEnd = 0;
document.addEventListener(
  "touchend",
  (e) => {
    const now = performance.now();
    if (now - lastTouchEnd < 350) e.preventDefault(); // second tap of a double-tap
    lastTouchEnd = now;
  },
  { passive: false }
);
for (const type of ["gesturestart", "gesturechange", "dblclick"]) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}

// --- Keyboard ---

document.addEventListener("keydown", (e) => {
  if (["Escape", "KeyP", "Space"].includes(e.code)) {
    e.preventDefault();
    if (screen === "playing") pause();
    else if (screen === "menu" && game && !game.over) play();
    return;
  }
  if (screen !== "playing") return;
  const actions = {
    ArrowLeft: () => game.shift(-1),
    ArrowRight: () => game.shift(1),
    ArrowDown: () => game.softDrop(),
    ArrowUp: () => game.rotate(),
    KeyX: () => game.rotate(),
  };
  if (actions[e.code]) {
    e.preventDefault();
    actions[e.code]();
  }
});

// --- Pause and save when the app is backgrounded ---

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    pause();
    save();
  }
});
window.addEventListener("pagehide", save);

// --- Main loop ---

let last = performance.now();
let savedPiece = 0;
const hud = { level: $("level-box"), score: $("score-box"), time: $("time-box") };

/** 83500 ms -> "1:24" (rounded up, so the clock reads 0:00 only at the end). */
function formatTime(ms) {
  const secs = Math.ceil(ms / 1000);
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

function tick(now) {
  // Clamp so a long frame (e.g. after backgrounding) can't skip rows.
  const dt = Math.min(now - last, 100);
  last = now;

  if (game && screen === "playing") {
    game.update(dt);
    if (game.over) gameOver();
    else if (game.pieceCount !== savedPiece) {
      savedPiece = game.pieceCount;
      save();
    }
  }

  renderer.draw(game);
  const level = String(game ? game.level : 1);
  const score = String(game ? game.score : 0);
  if (hud.level.textContent !== level) hud.level.textContent = level;
  if (hud.score.textContent !== score) hud.score.textContent = score;

  const timed = game?.timeLeft != null;
  stage.classList.toggle("blitz", timed);
  if (timed) {
    const time = formatTime(game.timeLeft);
    if (hud.time.textContent !== time) hud.time.textContent = time;
    hud.time.classList.toggle("low", game.timeLeft <= 10_000);
  }

  requestAnimationFrame(tick);
}

window.addEventListener("resize", layout);
layout();
show("menu");
requestAnimationFrame(tick);

if ("serviceWorker" in navigator && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
