import { test } from "node:test";
import assert from "node:assert/strict";
import { Tris, COLS, ROWS, cellsOf, POINTS_PER_LEVEL, CLEAR_DURATION, BLITZ_TIME } from "../src/game.js";

// Deterministic piece sequence: always returns the given type.
const always = (type) => {
  const index = ["I", "J", "L", "O", "S", "T", "Z"].indexOf(type);
  return () => (index + 0.5) / 7;
};

test("I spawns vertical, centred, at the top", () => {
  const game = new Tris({ random: always("I") });
  const cells = cellsOf(game.piece);
  assert.deepEqual(cells, [[4, 0], [4, 1], [4, 2], [4, 3]]);
});

test("shift stops at the walls", () => {
  const game = new Tris({ random: always("O") });
  for (let i = 0; i < 20; i++) game.shift(-1);
  assert.equal(Math.min(...cellsOf(game.piece).map(([x]) => x)), 0);
  for (let i = 0; i < 20; i++) game.shift(1);
  assert.equal(Math.max(...cellsOf(game.piece).map(([x]) => x)), COLS - 1);
});

test("lift moves up but never above the top row", () => {
  const game = new Tris({ random: always("T") });
  game.softDrop();
  game.softDrop();
  assert.equal(game.piece.y, 2);
  assert.ok(game.lift());
  assert.ok(game.lift());
  assert.ok(!game.lift());
  assert.equal(game.piece.y, 0);
});

test("soft drop scores one point per new row only", () => {
  const game = new Tris({ random: always("T") });
  game.softDrop();
  game.softDrop();
  assert.equal(game.score, 2);
  game.lift();
  game.softDrop();
  assert.equal(game.score, 2, "re-entering a row already reached earns nothing");
  game.softDrop();
  assert.equal(game.score, 3);
});

test("gravity drops one row per interval", () => {
  const game = new Tris({ random: always("T") });
  game.update(game.dropInterval - 1);
  assert.equal(game.piece.y, 0);
  game.update(1);
  assert.equal(game.piece.y, 1);
});

test("a landed piece can still slide until the lock delay runs out", () => {
  const fresh = new Tris({ random: always("O") });
  while (!fresh.collides(fresh.piece, 0, 1)) fresh.piece.y++;
  const id = fresh.piece.id;
  fresh.update(fresh.lockDelay - 1);
  assert.equal(fresh.piece.id, id);
  assert.ok(fresh.shift(-1), "can still slide");
  fresh.update(fresh.lockDelay - 1);
  assert.equal(fresh.piece.id, id, "sliding resets the lock timer");
  fresh.update(1);
  assert.notEqual(fresh.piece.id, id);
});

test("pushing down on a landed piece locks it immediately", () => {
  const game = new Tris({ random: always("O") });
  while (game.softDrop());
  assert.equal(game.grid[ROWS - 1][4], "O");
  assert.equal(game.piece.id, 2);
});

test("clearing a line scores, flashes, then collapses", () => {
  const game = new Tris({ random: always("I") });
  // Fill the bottom row except column 4, where the I will land.
  for (let x = 0; x < COLS; x++) if (x !== 4) game.grid[ROWS - 1][x] = "J";
  game.grid[ROWS - 2][0] = "J";
  while (game.softDrop());
  assert.deepEqual(game.clearing.rows, [ROWS - 1]);
  const before = game.score;
  assert.equal(before, 100 + (ROWS - 4));
  game.update(CLEAR_DURATION);
  assert.equal(game.clearing, null);
  // Row above shifted down, and the I's remaining 3 cells sit on top.
  assert.equal(game.grid[ROWS - 1][0], "J");
  assert.equal(game.grid[ROWS - 1][4], "I");
  assert.equal(game.grid[ROWS - 3][4], "I");
  assert.equal(game.grid[ROWS - 4][4], null);
});

test("level follows score and speeds up gravity", () => {
  const game = new Tris({ random: always("T") });
  const slow = game.dropInterval;
  game.addScore(POINTS_PER_LEVEL * 5);
  assert.equal(game.level, 6);
  assert.ok(game.dropInterval < slow);
});

test("rotation kicks off the wall", () => {
  const game = new Tris({ random: always("I") });
  for (let i = 0; i < 10; i++) game.shift(-1);
  assert.ok(game.rotate());
  assert.ok(cellsOf(game.piece).every(([x]) => x >= 0));
});

test("game over when the spawn point is blocked", () => {
  const game = new Tris({ random: always("O") });
  for (let y = 0; y < ROWS; y++) game.grid[y][4] = "J";
  game.piece = null;
  game.spawn();
  assert.ok(game.over);
});

test("a crowded top spawns the piece partly above the board", () => {
  const game = new Tris({ random: always("I") });
  game.grid[2][4] = "J";
  game.piece = null;
  game.spawn();
  assert.ok(!game.over);
  assert.equal(game.piece.y, -2);
  assert.ok(game.shift(-1), "can still be moved out of the way");
});

test("locking a piece that sticks out above the board ends the game", () => {
  const game = new Tris({ random: always("I") });
  game.grid[2][4] = "J";
  game.piece = null;
  game.spawn();
  game.update(game.lockDelay);
  assert.ok(game.over);
  assert.equal(game.grid[1][4], "I", "the visible part is still drawn");
});

test("taller boards use their own row count", () => {
  const game = new Tris({ random: always("O"), rows: 27 });
  assert.equal(game.grid.length, 27);
  while (game.softDrop());
  assert.equal(game.grid[26][4], "O");
  const restored = Tris.fromJSON(JSON.parse(JSON.stringify(game)));
  assert.equal(restored.rows, 27);
});

test("blitz ends when the clock runs out", () => {
  const game = new Tris({ random: always("O"), mode: "blitz" });
  assert.equal(game.timeLeft, BLITZ_TIME);
  for (let t = 0; t < BLITZ_TIME - 100; t += 100) {
    game.update(100);
    game.piece.y = 0; // hold the piece up so it never locks
  }
  assert.equal(game.timeLeft, 100);
  game.update(100);
  assert.ok(game.over);
  assert.ok(game.timeUp);
});

test("blitz levels up with time, not score", () => {
  const game = new Tris({ random: always("T"), mode: "blitz" });
  game.addScore(POINTS_PER_LEVEL * 3);
  assert.equal(game.level, 1);
  for (let i = 0; i < 30; i++) {
    game.update(1000);
    game.piece.y = 0; // hold the piece up so it never locks
  }
  assert.equal(game.level, 3);
});

test("classic has no clock", () => {
  const game = new Tris({ random: always("T") });
  assert.equal(game.timeLeft, null);
  game.update(BLITZ_TIME * 2);
  assert.ok(!game.timeUp);
});

test("blitz save keeps mode and remaining time", () => {
  const game = new Tris({ random: always("T"), mode: "blitz" });
  game.update(500);
  const restored = Tris.fromJSON(JSON.parse(JSON.stringify(game)));
  assert.equal(restored.mode, "blitz");
  assert.equal(restored.timeLeft, BLITZ_TIME - 500);
});

test("save and restore round-trips", () => {
  const game = new Tris({ random: always("L") });
  game.softDrop();
  game.shift(1);
  game.addScore(2000);
  const restored = Tris.fromJSON(JSON.parse(JSON.stringify(game)));
  assert.deepEqual(restored.piece, game.piece);
  assert.equal(restored.score, game.score);
  assert.equal(restored.level, 2);
  assert.equal(restored.next, game.next);
});
