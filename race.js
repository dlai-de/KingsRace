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
  };
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
    state.winner = suit;
    ev.push({ type: 'win', suit });
    return;
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

// Deck ran out with nobody home: furthest King wins, earliest arrival breaks the tie.
function photoFinish(state, ev) {
  const best = Math.min(...SUITS.map(s => state.kingPos[s]));
  const suit = SUITS.filter(s => state.kingPos[s] === best)
    .reduce((a, b) => (state.arrival[a] <= state.arrival[b] ? a : b));
  state.winner = suit;
  ev.push({ type: 'win', suit, photoFinish: true });
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

// A playable copy of `state` with everything still unseen reshuffled.
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
    mainDeck: shuffle(state.mainDeck.slice(state.deckIdx)),
    bonusRow,
    kingPos: { ...state.kingPos },
    revealed: new Set(state.revealed),
    deckIdx: 0,
    winner: null,
    arrival: { ...state.arrival },
    tick: state.tick,
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
  module.exports = { SUITS, SUIT_COLOR, RANKS, ROWS, shuffle, newRaceState, stepRace, odds };
}
