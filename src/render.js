/**
 * Canvas drawing for TRIS. Everything is drawn in the original iPhone's
 * point grid (23pt cells, 230pt wide board) and scaled up to device pixels.
 */
import { COLS, CLEAR_DURATION, cellsOf, shapeOf } from "./game.js";

export const CELL = 23;
export const BOARD_W = COLS * CELL;

// Sampled from screenshots of the original: rim highlight, body top,
// body bottom, rim lowlight.
const PALETTE = {
  I: ["#ffc478", "#ffa64a", "#fa6141", "#ff8f6d"], // orange
  J: ["#f985aa", "#fd5c85", "#ae2b35", "#bd6466"], // red
  L: ["#b4f962", "#99fa4b", "#33a641", "#68bb73"], // green
  O: ["#d4afff", "#c396ff", "#621dc8", "#9060d8"], // purple
  S: ["#80c0fe", "#65aaf8", "#2a00cc", "#6d58db"], // blue
  T: ["#9ceafe", "#80e2fd", "#2488d4", "#4296ec"], // cyan
  Z: ["#f4ed57", "#ffe81c", "#e5a704", "#e5c647"], // yellow
};
const PREVIEW = ["#d2d2d2", "#b6b6b6", "#a4a4a4", "#b0b0b0"];

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function verticalGradient(ctx, y, h, top, bottom) {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  return g;
}

function drawBlock(ctx, x, y, size, colors) {
  const [rimTop, top, bottom, rimBottom] = colors;
  const r = size * 0.14;
  roundRect(ctx, x, y, size, size, r);
  ctx.fillStyle = verticalGradient(ctx, y, size, rimTop, rimBottom);
  ctx.fill();
  roundRect(ctx, x + 1, y + 1, size - 2, size - 2, r - 0.5);
  ctx.fillStyle = verticalGradient(ctx, y + 1, size - 2, top, bottom);
  ctx.fill();
}

function drawCell(ctx, col, row, colors) {
  drawBlock(ctx, col * CELL + 1, row * CELL + 1, CELL - 2, colors);
}

// Small deterministic PRNG so the texture is identical after every resize.
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Dark concrete texture with recessed grid cells, lighter towards the bottom. */
function makeBackground(scale, rows) {
  const height = rows * CELL;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(BOARD_W * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  const rand = mulberry32(1987);

  ctx.fillStyle = verticalGradient(ctx, 0, height, "#262626", "#474747");
  ctx.fillRect(0, 0, BOARD_W, height);

  // Soft blotches: tiny random images stretched with smoothing.
  for (const [w, h, alpha] of [
    [12, 24, 0.05],
    [46, 92, 0.04],
  ]) {
    const blot = document.createElement("canvas");
    blot.width = w;
    blot.height = h;
    const b = blot.getContext("2d");
    const img = b.createImageData(w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = rand() < 0.5 ? 0 : 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = rand() * 255;
    }
    b.putImageData(img, 0, 0);
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(blot, 0, 0, BOARD_W, height);
  }
  ctx.globalAlpha = 1;

  // Pale specks.
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.04 + rand() * 0.1})`;
    const s = 0.6 + rand() * 1.2;
    ctx.fillRect(rand() * BOARD_W, rand() * height, s, s);
  }

  // Grid lines sit in the 2pt gaps between blocks.
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  for (let c = 0; c <= COLS; c++) ctx.fillRect(c * CELL - 1, 0, 2, height);
  for (let r = 0; r <= rows; r++) ctx.fillRect(0, r * CELL - 1, BOARD_W, 2);

  return canvas;
}

export class Renderer {
  constructor(canvas, nextCanvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.nextCanvas = nextCanvas;
    this.nextCtx = nextCanvas.getContext("2d");
    this.nextSize = { w: nextCanvas.width, h: nextCanvas.height };
    this.nextType = null;
  }

  /** scale = device pixels per original iPhone point. */
  resize(scale, rows) {
    this.scale = scale;
    this.canvas.width = Math.round(BOARD_W * scale);
    this.canvas.height = Math.round(rows * CELL * scale);
    this.background = makeBackground(scale, rows);
    this.nextCanvas.width = Math.round(this.nextSize.w * scale);
    this.nextCanvas.height = Math.round(this.nextSize.h * scale);
    this.nextType = null;
  }

  /** Draws the board; with no game, just the empty well. */
  draw(game) {
    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.background, 0, 0);
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    if (!game) return;

    game.grid.forEach((row, y) =>
      row.forEach((type, x) => {
        if (type) drawCell(ctx, x, y, PALETTE[type]);
      })
    );

    if (game.clearing) {
      const t = game.clearing.elapsed / CLEAR_DURATION;
      ctx.fillStyle = `rgba(255,255,255,${0.85 * (1 - t)})`;
      for (const y of game.clearing.rows) {
        ctx.fillRect(0, y * CELL, BOARD_W, CELL);
      }
    }

    if (game.piece && !game.over) this.drawActive(game.piece);

    if (game.next !== this.nextType) this.drawNext(game.next);
  }

  /** The falling piece has bright white seams between its blocks. */
  drawActive(piece) {
    const { ctx } = this;
    const cells = cellsOf(piece);
    const has = (x, y) => cells.some(([cx, cy]) => cx === x && cy === y);
    ctx.fillStyle = "#ffffff";
    for (const [x, y] of cells) {
      if (has(x + 1, y)) ctx.fillRect((x + 1) * CELL - 1, y * CELL + 3, 2, CELL - 6);
      if (has(x, y + 1)) ctx.fillRect(x * CELL + 3, (y + 1) * CELL - 1, CELL - 6, 2);
    }
    for (const [x, y] of cells) drawCell(ctx, x, y, PALETTE[piece.type]);
  }

  drawNext(type) {
    this.nextType = type;
    const ctx = this.nextCtx;
    const { w, h } = this.nextSize;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.nextCanvas.width, this.nextCanvas.height);
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);

    // Trim empty rows and columns so the piece is centred in the box.
    const m = shapeOf(type);
    const rows = m.map((_, r) => r).filter((r) => m[r].some(Boolean));
    const cols = m[0].map((_, c) => c).filter((c) => m.some((row) => row[c]));
    const cell = 15;
    const ox = (w - cols.length * cell) / 2;
    const oy = (h - rows.length * cell) / 2;
    rows.forEach((r, i) =>
      cols.forEach((c, j) => {
        if (m[r][c]) drawBlock(ctx, ox + j * cell + 1, oy + i * cell + 1, cell - 2, PREVIEW);
      })
    );
  }
}
