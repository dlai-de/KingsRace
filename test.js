// Row offsets moved from `top` (layout) to translateY (compositor). translateY % is
// relative to the token's own height, so verify the new math lands on the same pixels.
const ROWS = 8, PAD = 0.6;
const ROWH = 100 / ROWS;
const ROWSTEP = ROWH / (ROWH - 2 * PAD) * 100;
const H = ROWH - 2 * PAD;

for (let row = 0; row < ROWS; row++) {
  const oldTop = row * ROWH + PAD;                       // board %
  const newTop = PAD + (row * ROWSTEP / 100) * H;        // top:PAD% + translateY(row*ROWSTEP%)
  console.assert(Math.abs(oldTop - newTop) < 1e-9, `row ${row}: ${oldTop} != ${newTop}`);
}
// last row must still sit inside the board
console.assert(PAD + ((ROWS - 1) * ROWSTEP / 100) * H + H <= 100, 'bottom row overflows');
console.log('ok');
