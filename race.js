'use strict';

// Pure race rules: no DOM, no timers, no sleeps. `stepRace` returns the events one
// drawn card produced; game.js animates them, and the Monte Carlo below runs the
// same function thousands of times in a few ms. One source of truth for the rules.

const SUITS = ['S', 'D', 'C', 'H'];
const SUIT_COLOR = { S: 'black', D: 'red', C: 'black', H: 'red' };
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q'];
const ROWS = 8;
const LAST_ROW = ROWS - 1;
const BONUS_ROWS = 6;

const shuffle = arr => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

function newRaceState() {
  const bonusCards = shuffle([
    ...SUITS.map(suit => ({ type: 'ace', suit })),
    { type: 'joker', color: 'red' },
    { type: 'joker', color: 'black' },
  ]);
  const bonusRow = {};
  bonusCards.forEach((c, i) => { bonusRow[i + 1] = c; });
  return {
    mainDeck: shuffle(SUITS.flatMap(suit => RANKS.map(rank => ({ suit, rank })))),
    bonusRow,
    kingPos: { S: LAST_ROW, D: LAST_ROW, C: LAST_ROW, H: LAST_ROW },
    revealed: new Set(),
    deckIdx: 0,
    winner: null,
    // arrival[suit] = the move that put this King on its current row; lower means it
    // got there first, which breaks a photo finish.
    arrival: { S: 0, D: 0, C: 0, H: 0 },
    tick: 0,
    // Suits that can still win. A rider who folds leaves the pot but their King keeps
    // racing: it still clears rows for the bonus cards, it just can't end the race any
    // more. The race runs on until a King someone still has money on gets home.
    contenders: [...SUITS],
  };
}

// Two cards per seat, dealt off the top and never drawn again. That is the private
// information the whole betting game hangs on: every hole card is one advance its suit
// will never get, and only its holder knows it is gone.
function dealHoles(state, seats) {
  return Array.from({ length: seats }, () => state.mainDeck.splice(0, 2));
}

// Best-placed first: furthest up the board, earliest arrival breaks the tie.
function rankSuits(state, suits = SUITS) {
  return [...suits].sort((a, b) =>
    state.kingPos[a] - state.kingPos[b] || state.arrival[a] - state.arrival[b]);
}

function place(state, suit, row) {
  state.kingPos[suit] = row;
  state.arrival[suit] = ++state.tick;
}

function advance(state, suit, ev) {
  if (state.winner || state.kingPos[suit] === 0) return;
  place(state, suit, state.kingPos[suit] - 1);
  ev.push({ type: 'advance', suit, row: state.kingPos[suit] });
  if (state.kingPos[suit] === 0) {
    if (state.contenders.includes(suit)) {
      state.winner = suit;
      ev.push({ type: 'win', suit });
      return;
    }
    ev.push({ type: 'home', suit });   // home, but out of the pot: it parks and the race goes on
  }
  checkpoints(state, ev);
}

function checkpoints(state, ev) {
  for (let r = BONUS_ROWS; r >= 1; r--) {
    if (state.winner) return;
    if (state.revealed.has(r)) continue;
    if (!SUITS.every(s => state.kingPos[s] < r)) continue;
    state.revealed.add(r);
    const card = state.bonusRow[r];
    ev.push({ type: 'reveal', row: r, card });
    if (card.type === 'ace') {
      ev.push({ type: 'ace', suit: card.suit });
      advance(state, card.suit, ev);
    } else {
      const suits = SUITS.filter(s => SUIT_COLOR[s] === card.color);
      suits.forEach(s => place(state, s, Math.min(LAST_ROW, state.kingPos[s] + 1)));
      ev.push({ type: 'joker', color: card.color, suits, rows: suits.map(s => state.kingPos[s]) });
    }
  }
}

// Deck ran out with nobody home: the furthest King still in the pot wins, earliest
// arrival breaks the tie.
function photoFinish(state, ev) {
  state.winner = rankSuits(state, state.contenders)[0];
  ev.push({ type: 'win', suit: state.winner, photoFinish: true });
}

function stepRace(state) {
  const ev = [];
  if (state.winner) return ev;
  if (state.deckIdx >= state.mainDeck.length) { photoFinish(state, ev); return ev; }
  const card = state.mainDeck[state.deckIdx++];
  ev.push({ type: 'draw', card });
  advance(state, card.suit, ev);
  return ev;
}

// ---------- Monte Carlo odds ----------

// A playable copy of `state` with everything still unseen reshuffled. `state.hidden`
// holds cards the observer cannot see but knows are gone (other seats' hole cards):
// they go back in the pool, and the sim then draws that many fewer -- exactly the same
// thing as some random unknown cards being dead.
function simState(state) {
  const bonusRow = {};
  const hidden = [];
  for (let r = 1; r <= BONUS_ROWS; r++) {
    if (state.revealed.has(r)) bonusRow[r] = state.bonusRow[r];
    else hidden.push(state.bonusRow[r]);
  }
  shuffle(hidden);
  let i = 0;
  for (let r = 1; r <= BONUS_ROWS; r++) if (!bonusRow[r]) bonusRow[r] = hidden[i++];
  return {
    mainDeck: shuffle(state.mainDeck.slice(state.deckIdx).concat(state.hidden || []))
      .slice(0, state.mainDeck.length - state.deckIdx),
    bonusRow,
    kingPos: { ...state.kingPos },
    revealed: new Set(state.revealed),
    deckIdx: 0,
    winner: null,
    arrival: { ...state.arrival },
    tick: state.tick,
    contenders: [...state.contenders],
  };
}

function odds(state, runs = 1200) {
  const wins = { S: 0, D: 0, C: 0, H: 0 };
  if (state.winner) return { ...wins, [state.winner]: 1 };
  for (let i = 0; i < runs; i++) {
    const s = simState(state);
    while (!s.winner) stepRace(s);
    wins[s.winner]++;
  }
  SUITS.forEach(s => { wins[s] /= runs; });
  return wins;
}

if (typeof module !== 'undefined') {
  module.exports = { SUITS, SUIT_COLOR, RANKS, ROWS, shuffle, newRaceState, dealHoles, rankSuits, stepRace, odds };
}
