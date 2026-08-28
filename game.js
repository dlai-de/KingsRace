'use strict';

// ---------- Constants ----------
// SUITS, SUIT_COLOR, RANKS, ROWS and the rules themselves come from race.js.
const SUIT_SYMBOL = { S: '♠', D: '♦', C: '♣', H: '♥' };
const SUIT_GLYPH = { S: '}', D: '[', C: ']', H: '{' }; // pip glyphs in the "Card Characters" font
const SUIT_NAME = { S: 'Spades', D: 'Diamonds', C: 'Clubs', H: 'Hearts' };
const SUIT_COL = { S: 0, D: 1, C: 2, H: 3 };
const COLS = 5;
const COLW = 100 / COLS, ROWH = 100 / ROWS, PAD = 0.6;
const ROWSTEP = ROWH / (ROWH - 2 * PAD) * 100; // one row, in % of a token's own height

// ---------- DOM references ----------
const screenMode = document.getElementById('screen-mode');
const screenSelect = document.getElementById('screen-select');
const screenRace = document.getElementById('screen-race');
const screenVictory = document.getElementById('screen-victory');
const selectSubtitleEl = document.getElementById('select-subtitle');
const startFriendsBtn = document.getElementById('start-friends-btn');
const setupWarningEl = document.getElementById('setup-warning');
const cellsLayer = document.getElementById('cells');
const tokensLayer = document.getElementById('tokens');
const deckCounterEl = document.getElementById('deck-counter');
const deckStackEl = document.getElementById('deck-stack');
const discardStackEl = document.getElementById('discard-stack');
const currentCardEl = document.getElementById('current-card');
const countdownEl = document.getElementById('countdown');
const countdownNumberEl = document.getElementById('countdown-number');
const victoryWinnerEl = document.getElementById('victory-winner');
const victoryTitleEl = document.getElementById('victory-title');
const victorySubtitleEl = document.getElementById('victory-subtitle');
const pauseBtn = document.getElementById('pause-btn');
const oddsBtn = document.getElementById('odds-btn');
const chipsEl = document.getElementById('chips');
const victoryChipsEl = document.getElementById('victory-chips');
const holeEl = document.getElementById('hole-cards');

// ---------- Pausable delay ----------
// ponytail: --spd in style.css is the single pacing knob -- it scales every CSS
// duration via calc() and every sleep below, so the two can never drift apart.
// Turn it up to slow the race down, down to speed it up.
const SPEED = +getComputedStyle(document.documentElement).getPropertyValue('--spd') || 1;
let paused = false, pauseResolve = null;
// Everyone but one seat folded: the pot is decided, so run the rest of the race at a
// gallop just to show who the King would have been.
let fastForward = false;
async function sleep(ms) {
  await new Promise(r => setTimeout(r, ms * SPEED * (fastForward ? 0.06 : 1)));
  if (paused) await new Promise(res => { pauseResolve = res; });
}
function pauseGame(showOverlay = true) {
  if (gameOver || paused) return;
  paused = true;
  if (!showOverlay) return;
  const ov = document.createElement('div');
  ov.className = 'paused-overlay';
  ov.id = 'paused-overlay';
  ov.innerHTML = `<div class="paused-box"><span class="paused-title">Paused</span>` +
    `<div class="btn-row"><button id="resume-btn">Resume</button><button id="pause-change-mode-btn" class="btn-ghost">Change Mode</button></div></div>`;
  screenRace.appendChild(ov);
  document.getElementById('resume-btn').addEventListener('click', resumeGame);
  document.getElementById('pause-change-mode-btn').addEventListener('click', () => location.reload());
}
function resumeGame() {
  if (!paused) return;
  paused = false;
  document.getElementById('paused-overlay')?.remove();
  if (pauseResolve) { pauseResolve(); pauseResolve = null; }
}
pauseBtn.addEventListener('click', pauseGame);

// ---------- Game state ----------
let race;                                 // the pure race state from race.js
let mode, playerSuit, riderNames = {}, gameOver;
let kingEls = {}, bonusEls = {};
// Vs Computer is a 4-handed table: you plus three AI seats, one King each.
const SEAT_NAME = { you: 'You', a1: 'AI 1', a2: 'AI 2', a3: 'AI 3' };
const SEAT_TAG = { you: 'YOU', a1: 'AI 1', a2: 'AI 2', a3: 'AI 3' };
let seatSuit = {}, suitSeat = {}, holes = {}, live = [], pot = 0, street = 0;
let epoch = 0;   // bumped per race, so a replay can't leave the previous loop still stepping

function newGame() {
  race = newRaceState();
  epoch++;
  gameOver = false;
  paused = false;
  fastForward = false;
  live = []; holes = {}; pot = 0; street = 0;
  holeEl.innerHTML = '';
  pauseBtn.disabled = false;
}

// ---------- Bicycle-style card markup ----------
const FACE_RANKS = { K: 'king', Q: 'queen', J: 'jack' };
function cardInnerHTML(rank, sym, color) {
  const faceName = FACE_RANKS[rank];
  const figure = faceName ? `<img class="figure-img" src="assets/images/${color}_${faceName}.webp" alt="">` : '';
  const centerClass = faceName ? 'pc-center has-figure' : 'pc-center';
  return `<span class="pc-corner tl">${rank}<br>${sym}</span>` +
    `<div class="${centerClass}">${figure}<span class="big-pip">${sym}</span></div>` +
    `<span class="pc-corner br">${rank}<br>${sym}</span>`;
}
const STAR_SVG = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>';
function jokerInnerHTML(color) {
  return `<span class="pc-corner tl joker-star">${STAR_SVG}</span>` +
    `<div class="pc-center"><img class="figure-img joker-img" src="assets/images/${color}_joker.webp" alt=""></div>` +
    `<span class="pc-corner br joker-star">${STAR_SVG}</span>`;
}

// ---------- Board construction ----------
function buildCells() {
  cellsLayer.innerHTML = '';
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      if (r === 0) cell.classList.add('finish-row');
      if (r === ROWS - 1) cell.classList.add('start-row');
      if (c === COLS - 1) cell.classList.add('bonus-col');
      cellsLayer.appendChild(cell);
    }
  }
}

function setRow(el, row) {
  el.style.setProperty('--ty', (row * ROWSTEP) + '%');
}

function positionToken(el, row, col) {
  el.style.left = (col * COLW + PAD) + '%';
  el.style.top = PAD + '%';
  el.style.width = (COLW - 2 * PAD) + '%';
  el.style.height = (ROWH - 2 * PAD) + '%';
  setRow(el, row);
}

function renderTokens() {
  tokensLayer.innerHTML = '';
  kingEls = {}; bonusEls = {};

  SUITS.forEach((suit, i) => {
    const el = document.createElement('div');
    el.className = `token king pc-front ${SUIT_COLOR[suit]} enter`;
    if (mode === 'computer') {
      el.classList.add(suit === playerSuit ? 'player' : 'computer');
    } else if (riderNames[suit]) {
      el.classList.add('player');
    }
    el.innerHTML = cardInnerHTML('K', SUIT_GLYPH[suit], SUIT_COLOR[suit]);
    positionToken(el, race.kingPos[suit], SUIT_COL[suit]);
    el.style.animationDelay = (i * 120) + 'ms';
    tokensLayer.appendChild(el);
    kingEls[suit] = el;
  });

  for (let r = 1; r <= 6; r++) {
    const el = document.createElement('div');
    el.className = 'token bonus-card enter';
    el.innerHTML = `<div class="flipper"><div class="face pc-back"></div><div class="face pc-front"></div></div>`;
    positionToken(el, r, COLS - 1);
    el.style.animationDelay = (500 + r * 90) + 'ms';
    tokensLayer.appendChild(el);
    bonusEls[r] = el;
  }

  // dealIn is animation-fill-mode:both -- while it lingers it overrides the transform
  // transition, so drop the class once it has played.
  tokensLayer.querySelectorAll('.enter').forEach(el =>
    el.addEventListener('animationend', () => el.classList.remove('enter'), { once: true }));
}

function moveKing(suit, row) {
  setRow(kingEls[suit], row);   // race.js already moved the King; this just draws it
}

function revealBonusCard(row, card) {
  const el = bonusEls[row];
  const front = el.querySelector('.pc-front');
  if (card.type === 'ace') {
    front.classList.add(SUIT_COLOR[card.suit]);
    front.innerHTML = cardInnerHTML('A', SUIT_GLYPH[card.suit], SUIT_COLOR[card.suit]);
  } else {
    front.classList.add(card.color);
    front.innerHTML = jokerInnerHTML(card.color);
  }
  el.classList.add('flipped');
}

function showCurrentCard(card) {
  const flipper = currentCardEl.querySelector('.flipper');
  const front = currentCardEl.querySelector('.pc-front');
  front.className = `face pc-front ${SUIT_COLOR[card.suit]}`;
  front.innerHTML = cardInnerHTML(card.rank, SUIT_GLYPH[card.suit], SUIT_COLOR[card.suit]);
  flipper.classList.add('flipped');
}
function hideCurrentCard() {
  currentCardEl.querySelector('.flipper').classList.remove('flipped');
}

function updateDeckCounter() {
  deckCounterEl.textContent = `${race.mainDeck.length - race.deckIdx} cards left`;
  const remFrac = (race.mainDeck.length - race.deckIdx) / race.mainDeck.length;
  const playedFrac = race.deckIdx / race.mainDeck.length;
  deckStackEl.style.setProperty('--th', (1 + remFrac * 5) + 'px');
  deckStackEl.style.opacity = remFrac > 0 ? 1 : .3;
  discardStackEl.style.setProperty('--th', (1 + playedFrac * 5) + 'px');
  discardStackEl.style.opacity = playedFrac > 0 ? Math.min(1, .35 + playedFrac * .75) : 0;
}

// ---------- Rendering the race ----------
// race.js decides what happens; everything below only shows it.
async function renderEvent(e) {
  switch (e.type) {
    case 'draw':
      hideCurrentCard();
      await sleep(450);
      updateDeckCounter();
      showCurrentCard(e.card);
      await sleep(1250);
      break;
    case 'advance':
      moveKing(e.suit, e.row);
      await sleep(680);
      break;
    case 'reveal':
      revealBonusCard(e.row, e.card);
      await sleep(750);
      break;
    case 'ace':
      await sleep(450);
      break;
    case 'joker':
      await sleep(450);
      e.suits.forEach((x, i) => moveKing(x, e.rows[i]));
      await sleep(680);
      break;
    case 'home':
      await sleep(600);
      break;
    case 'win':
      if (e.photoFinish) await sleep(650);
      await win(e.suit, e.photoFinish);
      break;
  }
}

async function gameLoop() {
  const mine = epoch;
  updateOdds();
  while (!gameOver && epoch === mine) {
    for (const e of stepRace(race)) {
      if (gameOver || epoch !== mine) return;
      await renderEvent(e);
    }
    if (!gameOver && mode === 'computer' && street && street < 4 && race.revealed.size >= STREET_AT[street]) {
      await bettingRound(street + 1);
      if (epoch !== mine) return;
    }
    updateOdds();
    await sleep(250);
  }
}

async function win(suit, photoFinish) {
  gameOver = true;
  pauseBtn.disabled = true;
  kingEls[suit].classList.add('winner');
  await sleep(1000);
  showVictory(suit, photoFinish);
}

function showVictory(suit, photoFinish) {
  kingEls[suit].classList.remove('winner');
  victoryWinnerEl.innerHTML = `<div class="pc-front ${SUIT_COLOR[suit]}">${cardInnerHTML('K', SUIT_GLYPH[suit], SUIT_COLOR[suit])}</div>`;
  if (mode === 'computer') {
    if (suit === playerSuit) {
      victoryTitleEl.textContent = 'You Win!';
      victorySubtitleEl.textContent = `Your ${SUIT_NAME[suit]} King crossed the finish line first.`;
    } else {
      victoryTitleEl.textContent = `${SEAT_NAME[suitSeat[suit]]} Wins`;
      victorySubtitleEl.textContent = `${SEAT_NAME[suitSeat[suit]]}'s ${SUIT_NAME[suit]} King beat you to the finish line.`;
    }
  } else {
    const name = riderNames[suit];
    if (name) {
      victoryTitleEl.textContent = `${name} Wins!`;
      victorySubtitleEl.textContent = `${name}'s ${SUIT_NAME[suit]} King crossed the finish line first.`;
    } else {
      victoryTitleEl.textContent = `${SUIT_NAME[suit]} King Wins!`;
      victorySubtitleEl.textContent = `No rider claimed this King, but it still won the race!`;
    }
  }
  victoryChipsEl.textContent = settlePot(suit);
  if (photoFinish) {
    victorySubtitleEl.textContent =
      `The deck ran out \u2014 the ${SUIT_NAME[suit]} King was furthest ahead. Photo finish!`;
  }
  bustCheck();
  screenVictory.classList.remove('hidden');
}

async function countdown() {
  countdownEl.classList.remove('hidden');
  for (const txt of ['3', '2', '1', 'GO!']) {
    countdownNumberEl.textContent = txt;
    countdownNumberEl.classList.remove('pulse');
    void countdownNumberEl.offsetWidth;
    countdownNumberEl.classList.add('pulse');
    await sleep(txt === 'GO!' ? 750 : 650);
  }
  countdownEl.classList.add('hidden');
}

function setRiderLabels() {
  SUITS.forEach(suit => {
    const label = mode === 'computer' ? SEAT_TAG[suitSeat[suit]] : (riderNames[suit] || '');
    const el = document.getElementById('label-' + suit);
    el.textContent = label;
    el.appendChild(document.createElement('i')).className = 'odds';
    el.appendChild(document.createElement('i')).className = 'stake';
  });
  renderStakes();
}

// ---------- Chips, hole cards and the betting rounds ----------
// Bankroll survives reloads; so does the live pot, which is parked in `carry` for the
// duration of a race so quitting mid-hand rides it over instead of burning it.
const PURSE_KEY = 'kr-purse';
let purse = { carry: 0, ...Object.fromEntries(SEATS.map(s => [s, BUYIN])) };
try {
  const saved = JSON.parse(localStorage.getItem(PURSE_KEY));
  for (const k of [...SEATS, 'carry']) if (typeof saved?.[k] === 'number') purse[k] = saved[k];
} catch { /* corrupt blob, or an older two-seat purse: start fresh */ }

function savePurse() {
  try { localStorage.setItem(PURSE_KEY, JSON.stringify(purse)); } catch { /* private mode */ }
}
function renderChips() {
  chipsEl.classList.toggle('hidden', mode !== 'computer');
  chipsEl.textContent = `Bank ${purse.you} · Pot ${pot}`;
  renderStakes();
}

// Every seat's stack and what it has put in this hand, under its own column. Chips
// committed is just what the stack has lost since the hand opened -- no per-street
// bookkeeping to keep in sync.
let handStart = {};
function renderStakes() {
  if (mode !== 'computer' || !seatSuit.you) return;
  SEATS.forEach(s => {
    const el = document.querySelector('#label-' + seatSuit[s] + ' .stake');
    if (!el) return;
    el.textContent = live.length && !live.includes(s) ? 'folded'
      : `${purse[s]} · in ${Math.max(0, (handStart[s] ?? purse[s]) - purse[s])}`;
  });
}

function assignSeats() {
  const others = SUITS.filter(s => s !== playerSuit);
  seatSuit = { you: playerSuit, a1: others[0], a2: others[1], a3: others[2] };
  suitSeat = {};
  SEATS.forEach(s => { suitSeat[seatSuit[s]] = s; });
}

const cardText = c => `${c.rank}${SUIT_SYMBOL[c.suit]}`;
const handHTML = cards => cards.map(c =>
  `<div class="pc-front ${SUIT_COLOR[c.suit]}">${cardInnerHTML(c.rank, SUIT_GLYPH[c.suit], SUIT_COLOR[c.suit])}</div>`).join('');

// What a seat can see: the public race, plus the knowledge that six cards it cannot
// name are dead. race.js puts those back in the pool and deals that many fewer.
const seatView = seat => ({ ...race, hidden: SEATS.filter(s => s !== seat).flatMap(s => holes[s]) });

function markFolded() {
  SEATS.forEach(s => kingEls[seatSuit[s]]?.classList.toggle('folded', !live.includes(s)));
}

function askAction(r) {
  return new Promise(resolve => {
    const owe = r.bet - r.in.you;
    const label = { fold: 'Fold', check: 'Check', call: `Call ${owe}`,
                    bet: `Bet ${r.size}`, raise: `Raise to ${r.bet + r.size}` };
    // The Handicapper is opt-in, so only price the hand when it's switched on.
    const p = showOdds ? Math.round(odds(seatView('you'), 800)[playerSuit] * 100) + '% to win · ' : '';
    const ov = document.createElement('div');
    ov.className = 'paused-overlay';
    ov.innerHTML = `<div class="paused-box"><span class="paused-title">Street ${r.street}</span>` +
      `<div class="hole-cards">${handHTML(holes.you)}</div>` +
      `<p class="paused-sub">${p}pot ${r.pot} · your stack ${purse.you}` +
      `${owe ? ' · to call ' + owe : ''}</p>` +
      `<div class="btn-row">` +
      legal(r, purse, 'you').map(o => `<button class="btn-ghost" data-act="${o}">${label[o]}</button>`).join('') +
      `</div></div>`;
    screenRace.appendChild(ov);
    ov.addEventListener('click', e => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      ov.remove();
      resolve(act(purse, r, 'you', btn.dataset.act));
    });
  });
}

// ponytail: 500 runs inline rather than through the worker -- the race is stopped for
// the betting round anyway, so a few ms of main thread beats a request/reply protocol.
async function aiTurn(r, seat) {
  const p = odds(seatView(seat), 500)[seatSuit[seat]];
  await sleep(450);
  return act(purse, r, seat, aiAction(p, r, purse, seat));
}

const STREET_AT = [0, 2, 4, 6];   // the revealed-row count that opens streets 1..4

async function bettingRound(n) {
  street = n;
  if (live.length < 2) return;
  const r = newRound(purse, live, n, pot);
  if (!r.size) return;            // nobody can cover a bet; the street checks around
  for (let seat; (seat = actor(r));) {
    if (seat === 'you') await askAction(r);
    else await aiTurn(r, seat);
    live = r.live;
    renderStakes();
    markFolded();
    if (gameOver) return;
  }
  live = r.live;
  race.contenders = live.map(s => seatSuit[s]);   // folded Kings race on, but can't win
  pot = r.pot;
  purse.carry = pot;
  savePurse();
  renderChips();
  markFolded();
  if (live.length === 1) {
    fastForward = true;
  }
}

async function openTable() {
  holeEl.classList.toggle('hidden', mode !== 'computer');
  if (mode !== 'computer') { renderChips(); return true; }
  restake(purse);
  if (purse.you < ANTE) {
    renderChips();
    victoryWinnerEl.innerHTML = '';
    victoryChipsEl.textContent = '';
    bustCheck();
    screenVictory.classList.remove('hidden');
    return false;
  }
  handStart = { ...purse };
  pot = openPot(purse);
  purse.carry = pot;
  live = [...SEATS];
  const hands = dealHoles(race, SEATS.length);
  SEATS.forEach((s, i) => { holes[s] = hands[i]; });
  holeEl.innerHTML = handHTML(holes.you);
  updateDeckCounter();
  savePurse();
  renderChips();
  await bettingRound(1);
  return true;
}

// Race over. Only a King still in the pot can end the race, so the winner is always
// someone who paid to be here.
function settlePot(winSuit) {
  if (mode !== 'computer') return '';
  const seat = suitSeat[winSuit];
  purse.carry = 0;   // unpark: awardPot decides whether it pays out or rides on
  awardPot(purse, pot, seat);
  const won = pot;
  pot = 0;
  savePurse();
  renderChips();
  const showdown = SEATS.map(s => `${SEAT_NAME[s]} ${holes[s].map(cardText).join(' ')}`).join(' \u00b7 ');
  return (seat === 'you' ? `You take the ${won}-chip pot.` : `${SEAT_NAME[seat]} takes the ${won}-chip pot.`) +
    ` Your bank: ${purse.you}. \u2014 Hole cards: ${showdown}`;
}

// Out of chips: the AI seats get re-staked, you don't. Nothing left to ante with is
// the end of the run -- there is no New Race from here, only Change Mode.
const replayBtn = document.getElementById('replay-btn');
function bustCheck() {
  if (mode !== 'computer' || purse.you >= ANTE) return false;
  gameOver = true;
  pauseBtn.disabled = true;
  victoryTitleEl.textContent = 'You Lose';
  victorySubtitleEl.textContent =
    `You are out of chips \u2014 you cannot cover the ${ANTE}-chip ante. The table plays on without you.`;
  if (!victoryChipsEl.textContent) victoryChipsEl.textContent = `Bank ${purse.you}.`;
  replayBtn.classList.add('hidden');
  return true;
}

// ---------- Handicapper ----------
// Monte Carlo win% under each rider, off by default.
let showOdds = false;
let oddsWorker = null;
try {
  oddsWorker = new Worker('odds-worker.js');
  oddsWorker.onmessage = e => { if (showOdds && !gameOver) paintOdds(e.data); };
} catch { /* ponytail: no Worker (file://) -- updateOdds runs it inline instead */ }

function paintOdds(p) {
  SUITS.forEach(suit => {
    const el = document.querySelector('#label-' + suit + ' .odds');
    if (el) el.textContent = p ? Math.round(p[suit] * 100) + '%' : '';
  });
}
// 1200 simulated races is ~10ms of blocked main thread on desktop and worse on a
// phone -- right where the tokens are sliding. The worker makes it free.
function updateOdds() {
  if (!showOdds || gameOver) return paintOdds(null);
  const view = mode === 'computer' && holes.you ? seatView('you') : race;
  if (oddsWorker) oddsWorker.postMessage(view);   // `revealed` is a Set; structured clone handles it
  else paintOdds(odds(view));
}
oddsBtn.addEventListener('click', () => {
  showOdds = !showOdds;
  oddsBtn.classList.toggle('on', showOdds);
  oddsBtn.textContent = showOdds ? 'Odds: On' : 'Odds';
  updateOdds();
});

async function startRace() {
  screenSelect.classList.add('hidden');
  screenRace.classList.remove('hidden');
  setRiderLabels();
  buildCells();
  renderTokens();
  updateDeckCounter();

  deckStackEl.classList.add('shuffling');
  await sleep(1400);
  deckStackEl.classList.remove('shuffling');

  if (!await openTable()) return;
  await sleep(500);
  await countdown();
  gameLoop();
}

function chooseKing(suit) {
  playerSuit = suit;
  assignSeats();
  newGame();
  startRace();
}

function chooseMode(m) {
  mode = m;
  screenMode.classList.add('hidden');
  screenSelect.classList.remove('hidden');
  const nameInputs = document.querySelectorAll('.name-input');
  setupWarningEl.classList.add('hidden');
  if (m === 'computer') {
    selectSubtitleEl.textContent = 'Choose your King. Three AI riders take the other three.';
    nameInputs.forEach(i => { i.classList.add('hidden'); i.value = ''; });
    startFriendsBtn.classList.add('hidden');
  } else {
    selectSubtitleEl.textContent = 'Give up to 4 riders a name, then start the race.';
    nameInputs.forEach(i => i.classList.remove('hidden'));
    startFriendsBtn.classList.remove('hidden');
  }
}

function backToMode() {
  screenSelect.classList.add('hidden');
  screenMode.classList.remove('hidden');
}

function startFriendsRace() {
  const names = {};
  const seen = new Set();
  let dupe = false;
  SUITS.forEach(suit => {
    const val = document.querySelector(`.pick-card[data-suit="${suit}"] .name-input`).value.trim();
    if (!val) return;
    const key = val.toLowerCase();
    if (seen.has(key)) dupe = true;
    seen.add(key);
    names[suit] = val;
  });
  if (!Object.keys(names).length) {
    setupWarningEl.textContent = 'Enter at least one name to start.';
    setupWarningEl.classList.remove('hidden');
    return;
  }
  if (dupe) {
    setupWarningEl.textContent = 'Names must be different.';
    setupWarningEl.classList.remove('hidden');
    return;
  }
  riderNames = names;
  newGame();
  startRace();
}

// ---------- Events ----------
document.querySelectorAll('.name-input').forEach(input => {
  input.addEventListener('input', () => {
    input.value = input.value.replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase();
  });
});
document.querySelectorAll('.pick-card').forEach(card => {
  const suit = card.dataset.suit;
  const color = card.classList.contains('red') ? 'red' : 'black';
  const face = card.querySelector('.card-face');
  face.classList.add('pc-front', color);
  face.innerHTML = cardInnerHTML('K', SUIT_GLYPH[suit], color);
});
document.querySelector('.king-picker').addEventListener('click', e => {
  if (mode !== 'computer') return;
  const card = e.target.closest('.pick-card');
  if (card) chooseKing(card.dataset.suit);
});
document.querySelectorAll('.mode-card').forEach(btn => {
  btn.addEventListener('click', () => chooseMode(btn.dataset.mode));
});
startFriendsBtn.addEventListener('click', startFriendsRace);
document.getElementById('back-to-mode-btn').addEventListener('click', backToMode);
document.querySelector('.mini-title').addEventListener('click', () => location.reload());

replayBtn.addEventListener('click', () => {
  screenVictory.classList.add('hidden');
  newGame();
  startRace();
});
document.getElementById('change-mode-btn').addEventListener('click', () => location.reload());

const rulesBtn = document.getElementById('rules-btn');
const rulesPanel = document.getElementById('rules-panel');
let pausedByRules = false;
rulesBtn.addEventListener('click', () => {
  if (!screenRace.classList.contains('hidden') && !gameOver && !paused) {
    pauseGame(false);
    pausedByRules = true;
  }
  rulesPanel.classList.remove('hidden');
});
document.getElementById('rules-close').addEventListener('click', () => {
  rulesPanel.classList.add('hidden');
  if (pausedByRules) { resumeGame(); pausedByRules = false; }
});

// sw.js was never registered, so nothing was ever precached.
if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
