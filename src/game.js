/**
 * TRIS rules. Pure game state, no DOM, so it can be tested in Node.
 *
 * Behaviour modelled on the 2008 iPhone game:
 * - 10 columns, pieces step one cell at a time. The original was 20 rows;
 *   the row count is configurable so taller screens can show more.
 * - The player can push the active piece left, right, down and also up
 *   (up buys time, as in the original).
 * - Pieces only rotate one way (clockwise).
 * - Above the well is open space: a piece that can't fit at the top spawns
 *   partly above it, and the game only ends when nothing fits or a piece
 *   locks without being fully on the board.
 * - Level is driven by score, and gravity speeds up a little each level.
 */

export const COLS = 10;
export const ROWS = 20; // the original's height; taller screens get more rows

export const TYPES = ["I", "J", "L", "O", "S", "T", "Z"];

// Spawn orientation of each piece. The original showed the I vertically.
const SHAPES = {
  I: [
    [0, 1, 0, 0],
    [0, 1, 0, 0],
    [0, 1, 0, 0],
    [0, 1, 0, 0],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0],
  ],
  O: [
    [1, 1],
    [1, 1],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0],
  ],
};

export const LINE_POINTS = [0, 100, 300, 500, 800];
export const POINTS_PER_LEVEL = 1500;
const BASE_INTERVAL = 1000; // ms per row at level 1
const SPEEDUP = 0.85; // each level falls 15% faster
const MIN_INTERVAL = 70;
const MIN_LOCK_DELAY = 400; // a landed piece can always be slid for at least this long
export const CLEAR_DURATION = 100; // ms the cleared rows flash before collapsing

// Offsets tried, in order, when a rotation is blocked.
const KICKS = [
  [1, 0],
  [-1, 0],
  [0, -1],
  [2, 0],
  [-2, 0],
];

export function shapeOf(type) {
  return SHAPES[type].map((row) => [...row]);
}

export function rotateMatrix(m) {
  const n = m.length;
  return m.map((row, r) => row.map((_, c) => m[n - 1 - c][r]));
}

export function cellsOf(piece) {
  const cells = [];
  piece.matrix.forEach((row, r) =>
    row.forEach((v, c) => {
      if (v) cells.push([piece.x + c, piece.y + r]);
    })
  );
  return cells;
}

function createPiece(type, id) {
  const matrix = shapeOf(type);
  return {
    id,
    type,
    matrix,
    x: Math.floor((COLS - matrix[0].length) / 2),
    y: 0,
  };
}

const emptyRow = () => Array(COLS).fill(null);

export class Tris {
  constructor({ random = Math.random, rows = ROWS } = {}) {
    this.random = random;
    this.rows = rows;
    this.reset();
  }

  reset() {
    this.grid = Array.from({ length: this.rows }, emptyRow);
    this.score = 0;
    this.level = 1;
    this.lines = 0;
    this.over = false;
    this.piece = null;
    this.clearing = null;
    this.pieceCount = 0;
    this.next = this.randomType();
    this.spawn();
  }

  randomType() {
    return TYPES[Math.floor(this.random() * TYPES.length)];
  }

  get dropInterval() {
    return Math.max(MIN_INTERVAL, BASE_INTERVAL * SPEEDUP ** (this.level - 1));
  }

  get lockDelay() {
    return Math.max(this.dropInterval, MIN_LOCK_DELAY);
  }

  spawn() {
    const piece = createPiece(this.next, ++this.pieceCount);
    this.piece = piece;
    this.next = this.randomType();
    this.gravityTimer = 0;
    this.lockTimer = 0;

    // If the top is crowded, raise the piece until it fits, keeping at least
    // its bottom row on the board.
    const bottomRow = piece.matrix.findLastIndex((row) => row.some(Boolean));
    while (this.collides(piece) && piece.y > -bottomRow) piece.y--;
    this.deepest = piece.y;
    if (this.collides(piece)) this.over = true;
  }

  collides(piece, dx = 0, dy = 0, matrix = piece.matrix) {
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        if (!matrix[r][c]) continue;
        const x = piece.x + c + dx;
        const y = piece.y + r + dy;
        if (x < 0 || x >= COLS || y >= this.rows) return true;
        if (y >= 0 && this.grid[y][x]) return true;
      }
    }
    return false;
  }

  get active() {
    return !this.over && !this.clearing && this.piece !== null;
  }

  get grounded() {
    return this.active && this.collides(this.piece, 0, 1);
  }

  /** Move the piece one column. Returns true if it moved. */
  shift(dx) {
    if (!this.active || this.collides(this.piece, dx, 0)) return false;
    this.piece.x += dx;
    this.lockTimer = 0;
    return true;
  }

  /**
   * Player pushes the piece down one row. Earns a point for each new row
   * reached. Pushing a piece that has already landed locks it.
   */
  softDrop() {
    if (!this.active) return false;
    if (this.collides(this.piece, 0, 1)) {
      this.lock();
      return false;
    }
    this.piece.y++;
    this.gravityTimer = 0;
    if (this.piece.y > this.deepest) {
      this.deepest = this.piece.y;
      this.addScore(1);
    }
    return true;
  }

  /** Player drags the piece back up one row, but not off the top. */
  lift() {
    if (!this.active || this.collides(this.piece, 0, -1)) return false;
    if (cellsOf(this.piece).some(([, y]) => y <= 0)) return false;
    this.piece.y--;
    this.gravityTimer = 0;
    this.lockTimer = 0;
    return true;
  }

  rotate() {
    if (!this.active || this.piece.type === "O") return false;
    const rotated = rotateMatrix(this.piece.matrix);
    for (const [dx, dy] of [[0, 0], ...KICKS]) {
      if (!this.collides(this.piece, dx, dy, rotated)) {
        this.piece.matrix = rotated;
        this.piece.x += dx;
        this.piece.y += dy;
        this.lockTimer = 0;
        return true;
      }
    }
    return false;
  }

  /** Advance time by dt milliseconds. */
  update(dt) {
    if (this.over) return;

    if (this.clearing) {
      this.clearing.elapsed += dt;
      if (this.clearing.elapsed >= CLEAR_DURATION) this.collapse();
      return;
    }

    if (this.collides(this.piece, 0, 1)) {
      this.gravityTimer = 0;
      this.lockTimer += dt;
      if (this.lockTimer >= this.lockDelay) this.lock();
      return;
    }

    this.lockTimer = 0;
    this.gravityTimer += dt;
    while (this.gravityTimer >= this.dropInterval) {
      this.gravityTimer -= this.dropInterval;
      if (this.collides(this.piece, 0, 1)) break;
      this.piece.y++;
      this.deepest = Math.max(this.deepest, this.piece.y);
    }
  }

  lock() {
    const cells = cellsOf(this.piece);
    for (const [x, y] of cells) {
      if (y >= 0) this.grid[y][x] = this.piece.type;
    }
    this.piece = null;

    if (cells.some(([, y]) => y < 0)) {
      this.over = true;
      return;
    }

    const rows = [];
    this.grid.forEach((row, y) => {
      if (row.every(Boolean)) rows.push(y);
    });

    if (rows.length) {
      this.lines += rows.length;
      this.addScore(LINE_POINTS[rows.length]);
      this.clearing = { rows, elapsed: 0 };
    } else {
      this.spawn();
    }
  }

  collapse() {
    const { rows } = this.clearing;
    this.grid = this.grid.filter((_, y) => !rows.includes(y));
    while (this.grid.length < this.rows) this.grid.unshift(emptyRow());
    this.clearing = null;
    this.spawn();
  }

  addScore(points) {
    this.score += points;
    this.level = Math.floor(this.score / POINTS_PER_LEVEL) + 1;
  }

  toJSON() {
    return {
      grid: this.grid,
      score: this.score,
      lines: this.lines,
      next: this.next,
      piece: this.piece,
      clearing: this.clearing,
      pieceCount: this.pieceCount,
    };
  }

  static fromJSON(data, options) {
    const game = new Tris({ ...options, rows: data.grid.length });
    game.grid = data.grid;
    game.lines = data.lines ?? 0;
    game.next = data.next;
    game.pieceCount = data.pieceCount ?? 0;
    game.addScore(data.score - game.score);
    if (data.clearing) {
      game.clearing = data.clearing;
      game.piece = null;
    } else {
      game.piece = data.piece;
      game.deepest = data.piece.y;
    }
    return game;
  }
}
