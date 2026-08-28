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


// ---------- race.js rules ----------
const { SUITS, newRaceState, stepRace, odds } = require('./race.js');

const runRace = state => { let ev; while (!state.winner) ev = stepRace(state); return ev; };

for (let i = 0; i < 500; i++) {
  const s = newRaceState();
  const last = runRace(s);
  console.assert(SUITS.includes(s.winner), 'no winner');
  console.assert(last.at(-1).type === 'win', 'race did not end on a win event');
  console.assert(s.kingPos[s.winner] === 0, 'winner is not on the finish row');
  console.assert(SUITS.every(x => s.kingPos[x] >= 0 && s.kingPos[x] <= 7), 'King off the board');
  console.assert(stepRace(s).length === 0, 'stepping a finished race did something');
}

// Deck exhaustion must still declare a winner (photo finish), not exit silently.
const short = newRaceState();
short.mainDeck = short.mainDeck.slice(0, 3); // nobody can get home in 3 draws
const ev = runRace(short);
console.assert(ev.at(-1).photoFinish === true, 'exhausted deck did not photo-finish');
console.assert(short.kingPos[short.winner] === Math.min(...SUITS.map(s => short.kingPos[s])),
  'photo finish did not pick the furthest King');

// Odds: a probability distribution, and a fresh race is roughly even.
const p = odds(newRaceState(), 2000);
console.assert(Math.abs(SUITS.reduce((a, s) => a + p[s], 0) - 1) < 1e-9, 'odds do not sum to 1');
console.assert(SUITS.every(s => Math.abs(p[s] - 0.25) < 0.05), 'fresh race is not near-even: ' + JSON.stringify(p));

// A King one row from home should be the heavy favourite.
const nearly = newRaceState();
nearly.kingPos.H = 1;
console.assert(odds(nearly, 2000).H > 0.6, 'leader is not favoured');

console.log('ok');
