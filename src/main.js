/**
 * TRIS GAME LOGIC
 * - Hard Drop Removed
 * - Piece Names Added
 * - New Color Scheme Applied
 */

const COLS = 10;
const ROWS = 20;

// UPDATED COLOR SCHEME
const COLORS = {
  I: "#a04800", // Orange
  J: "#8a2a2e", // Red/Pink
  L: "#2a7000", // Green
  O: "#5030a0", // Purple
  S: "#1048a0", // Blue
  T: "#3080a0", // Cyan
  Z: "#a08000", // Yellow
};

const SHAPES = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
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
const SHAPE_KEYS = Object.keys(SHAPES);

// Map internal IDs to User Friendly Names
const PIECE_NAMES = {
  I: "I-BLOCK",
  J: "J-BLOCK",
  L: "L-BLOCK",
  O: "O-BLOCK",
  S: "S-BLOCK",
  T: "T-BLOCK",
  Z: "Z-BLOCK",
};

// --- Utils ---
function lightenColor(color, percent) {
  const num = parseInt(color.replace("#", ""), 16),
    amt = Math.round(2.55 * percent),
    R = (num >> 16) + amt,
    B = ((num >> 8) & 0x00ff) + amt,
    G = (num & 0x0000ff) + amt;
  return (
    "#" +
    (
      0x1000000 +
      (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
      (B < 255 ? (B < 1 ? 0 : B) : 255) * 0x100 +
      (G < 255 ? (G < 1 ? 0 : G) : 255)
    )
      .toString(16)
      .slice(1)
  );
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawBlock(ctx, x, y, color, size, offsetX = 0, offsetY = 0) {
  const pad = 1;
  const drawX = x * size + pad + offsetX;
  const drawY = y * size + pad + offsetY;
  const drawSize = size - pad * 2;

  const grad = ctx.createRadialGradient(
    drawX + drawSize / 2,
    drawY + drawSize / 2,
    2,
    drawX + drawSize / 2,
    drawY + drawSize / 2,
    drawSize
  );
  grad.addColorStop(0, lightenColor(color, 40));
  grad.addColorStop(1, color);

  ctx.fillStyle = grad;
  drawRoundedRect(ctx, drawX, drawY, drawSize, drawSize, drawSize * 0.15);
  ctx.fill();

  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.beginPath();
  ctx.moveTo(drawX + drawSize, drawY);
  ctx.lineTo(drawX, drawY);
  ctx.lineTo(drawX, drawY + drawSize);
  ctx.stroke();

  ctx.strokeStyle = "rgba(0,0,0,0.2)";
  ctx.beginPath();
  ctx.moveTo(drawX + drawSize, drawY);
  ctx.lineTo(drawX + drawSize, drawY + drawSize);
  ctx.lineTo(drawX, drawY + drawSize);
  ctx.stroke();
}

// --- Classes ---

class Piece {
  constructor(type) {
    this.type = type;
    this.name = PIECE_NAMES[type];
    this.color = COLORS[type];
    this.matrix = SHAPES[type];
    this.x = Math.floor(COLS / 2) - Math.floor(this.matrix[0].length / 2);
    this.y = 0;
  }

  rotate(board) {
    const N = this.matrix.length;
    const rotated = this.matrix.map((row, i) =>
      row.map((val, j) => this.matrix[N - 1 - j][i])
    );

    const prevMatrix = this.matrix;
    this.matrix = rotated;

    if (board.collide(this)) {
      if (
        !this.tryKick(board, 1, 0) &&
        !this.tryKick(board, -1, 0) &&
        !this.tryKick(board, 0, -1) &&
        !this.tryKick(board, 2, 0) &&
        !this.tryKick(board, -2, 0)
      ) {
        this.matrix = prevMatrix;
      }
    }
  }

  tryKick(board, dx, dy) {
    this.x += dx;
    this.y += dy;
    if (board.collide(this)) {
      this.x -= dx;
      this.y -= dy;
      return false;
    }
    return true;
  }
}

class Board {
  constructor(ctx) {
    this.ctx = ctx;
    this.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  }

  collide(piece) {
    for (let r = 0; r < piece.matrix.length; r++) {
      for (let c = 0; c < piece.matrix[r].length; c++) {
        if (piece.matrix[r][c] !== 0) {
          const newX = piece.x + c;
          const newY = piece.y + r;
          if (newX < 0 || newX >= COLS || newY >= ROWS) return true;
          if (newY >= 0 && this.grid[newY][newX] !== 0) return true;
        }
      }
    }
    return false;
  }

  merge(piece) {
    piece.matrix.forEach((row, r) => {
      row.forEach((val, c) => {
        if (val !== 0 && piece.y + r >= 0) {
          this.grid[piece.y + r][piece.x + c] = piece.color;
        }
      });
    });
  }

  sweep() {
    let linesCleared = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (this.grid[r].every((val) => val !== 0)) {
        this.grid.splice(r, 1);
        this.grid.unshift(Array(COLS).fill(0));
        linesCleared++;
        r++;
      }
    }
    return linesCleared;
  }

  draw(blockSize) {
    this.grid.forEach((row, y) => {
      row.forEach((color, x) => {
        if (color !== 0) {
          drawBlock(this.ctx, x, y, color, blockSize);
        }
      });
    });
  }
}

class Game {
  constructor() {
    this.canvas = document.getElementById("tris-canvas");
    this.ctx = this.canvas.getContext("2d");
    this.nextCanvas = document.getElementById("next-canvas");
    this.nextCtx = this.nextCanvas.getContext("2d");

    this.resize();
    window.addEventListener("resize", () => this.resize());

    this.board = new Board(this.ctx);
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.gameOver = false;
    this.isPaused = false;

    this.dropCounter = 0;
    this.dropInterval = 1000;
    this.lastTime = 0;

    this.piece = null;
    this.nextPiece = new Piece(this.randomType());

    this.bindControls();
    this.reset();
    this.loop();
  }

  resize() {
    const container = document.getElementById("game-container");
    const rect = container.getBoundingClientRect();
    const availableWidth = rect.width * 0.7;
    const availableHeight = rect.height;
    this.blockSize = Math.floor(
      Math.min(availableWidth / COLS, availableHeight / ROWS)
    );
    this.canvas.width = this.blockSize * COLS;
    this.canvas.height = this.blockSize * ROWS;
    if (this.board) this.draw();
  }

  randomType() {
    return SHAPE_KEYS[Math.floor(Math.random() * SHAPE_KEYS.length)];
  }

  reset() {
    this.board = new Board(this.ctx);
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.gameOver = false;
    this.dropInterval = 1000;
    this.piece = null;

    document.getElementById("game-over-overlay").classList.add("hidden");
    this.spawnPiece();
    this.updateUI();
    this.lastTime = performance.now();
  }

  spawnPiece() {
    this.piece = this.nextPiece;
    this.nextPiece = new Piece(this.randomType());

    this.drawNext();

    if (this.board.collide(this.piece)) {
      this.endGame();
    }
  }

  drawNext() {
    this.nextCtx.clearRect(0, 0, this.nextCanvas.width, this.nextCanvas.height);
    const p = this.nextPiece;
    const size = 18;
    const w = p.matrix[0].length * size;
    const h = p.matrix.length * size;
    const dx = (this.nextCanvas.width - w) / 2;
    const dy = (this.nextCanvas.height - h) / 2;

    const grayColor = "#888888";

    p.matrix.forEach((row, r) => {
      row.forEach((val, c) => {
        if (val) drawBlock(this.nextCtx, c, r, grayColor, size, dx, dy);
      });
    });
  }

  updateUI() {
    document.getElementById("score-box").innerText = this.score;
    document.getElementById("level-box").innerText = this.level;
  }

  pause() {
    this.isPaused = true;
    document.getElementById("pause-overlay").classList.remove("hidden");
  }

  resume() {
    document.getElementById("pause-overlay").classList.add("hidden");
    this.isPaused = false;
    this.lastTime = performance.now();
    this.loop();
  }

  endGame() {
    this.gameOver = true;
    document.getElementById("final-score").innerText = this.score;
    document.getElementById("game-over-overlay").classList.remove("hidden");
  }

  move(dir) {
    this.piece.x += dir;
    if (this.board.collide(this.piece)) this.piece.x -= dir;
  }

  rotate() {
    this.piece.rotate(this.board);
  }

  drop() {
    this.piece.y++;
    if (this.board.collide(this.piece)) {
      this.piece.y--;
      this.lock();
      return false;
    }
    this.dropCounter = 0;
    return true;
  }

  // Removed hardDrop usage for keys/swipes, but kept method logic just in case
  hardDrop() {
    // Disabled for this version as requested
    // while(this.drop()) { this.score += 2; }
    // this.updateUI();
  }

  lock() {
    this.board.merge(this.piece);
    const cleared = this.board.sweep();
    if (cleared > 0) {
      const points = [0, 100, 300, 500, 800];
      this.score += points[cleared] * this.level;
      this.lines += cleared;
      this.level = Math.floor(this.lines / 10) + 1;
      this.dropInterval = Math.max(100, 1000 - (this.level - 1) * 100);
      this.updateUI();
    }
    this.spawnPiece();
  }

  loop(time = 0) {
    if (this.isPaused) return;
    const dt = time - this.lastTime;
    this.lastTime = time;

    if (!this.gameOver && this.piece) {
      this.dropCounter += dt;
      if (this.dropCounter > this.dropInterval) this.drop();
    }

    this.draw();
    requestAnimationFrame((t) => this.loop(t));
  }

  draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.board.draw(this.blockSize);
    if (this.piece) {
      this.piece.matrix.forEach((row, r) => {
        row.forEach((val, c) => {
          if (val)
            drawBlock(
              this.ctx,
              this.piece.x + c,
              this.piece.y + r,
              this.piece.color,
              this.blockSize
            );
        });
      });
    }
  }

  bindControls() {
    // --- Keyboard ---
    document.addEventListener("keydown", (e) => {
      if (this.gameOver) return;

      // Spacebar to pause/resume
      if (e.code === "Space") {
        e.preventDefault();
        if (this.isPaused) {
          this.resume();
        } else {
          this.pause();
        }
        return;
      }

      if (this.isPaused) return;
      if (e.code === "ArrowLeft") this.move(-1);
      if (e.code === "ArrowRight") this.move(1);
      if (e.code === "ArrowDown") this.drop();
      if (e.code === "ArrowUp" || e.code === "KeyX") this.rotate();
    });

    document.getElementById("menu-btn").addEventListener("click", () => {
      if (!this.gameOver) {
        this.pause();
      }
    });

    document.getElementById("resume-btn").addEventListener("click", () => {
      this.resume();
    });

    document
      .getElementById("pause-restart-btn")
      .addEventListener("click", () => {
        document.getElementById("pause-overlay").classList.add("hidden");
        this.isPaused = false;
        this.reset();
        this.loop();
      });

    document.getElementById("restart-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      this.reset();
    });

    // --- Touch ---
    let startX, startY, lastX, lastY, startTime;
    let isDragging = false;
    const touchArea = document.getElementById("tris-canvas");

    touchArea.addEventListener(
      "touchstart",
      (e) => {
        if (this.gameOver || this.isPaused) return;
        e.preventDefault();
        const t = e.touches[0];
        startX = t.clientX;
        startY = t.clientY;
        lastX = t.clientX;
        lastY = t.clientY;
        startTime = Date.now();
        isDragging = false;
      },
      { passive: false }
    );

    touchArea.addEventListener(
      "touchmove",
      (e) => {
        if (this.gameOver || this.isPaused) return;
        e.preventDefault();

        const t = e.touches[0];
        const dx = t.clientX - lastX;
        const dy = t.clientY - lastY;

        if (Math.abs(dx) > 20) {
          this.move(dx > 0 ? 1 : -1);
          lastX = t.clientX;
          isDragging = true;
        }
        if (dy > 30) {
          this.drop();
          lastY = t.clientY;
          isDragging = true;
        }
      },
      { passive: false }
    );

    touchArea.addEventListener(
      "touchend",
      (e) => {
        if (this.gameOver || this.isPaused) return;
        e.preventDefault();

        const dt = Date.now() - startTime;
        const totalDy = e.changedTouches[0].clientY - startY;
        const totalDx = Math.abs(e.changedTouches[0].clientX - startX);

        if (dt < 300 && totalDx < 10 && totalDy < 10 && !isDragging) {
          this.rotate();
        }
        // SWIPE DOWN (HARD DROP) REMOVED
        // No else if for hard drop here anymore
      },
      { passive: false }
    );
  }
}

window.onload = () => {
  new Game();
};
