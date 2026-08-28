'use strict';

// ---------- Constants ----------
const SUITS = ['S', 'D', 'C', 'H'];
const SUIT_SYMBOL = { S: '♠', D: '♦', C: '♣', H: '♥' };
const SUIT_GLYPH = { S: '}', D: '[', C: ']', H: '{' }; // pip glyphs in the "Card Characters" font
const SUIT_NAME = { S: 'Spades', D: 'Diamonds', C: 'Clubs', H: 'Hearts' };
const SUIT_COLOR = { S: 'black', D: 'red', C: 'black', H: 'red' };
const SUIT_COL = { S: 0, D: 1, C: 2, H: 3 };
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q'];
const ROWS = 8, COLS = 5;
const COLW = 100 / COLS, ROWH = 100 / ROWS, PAD = 0.6;
const ROWSTEP = ROWH / (ROWH - 2 * PAD) * 100; // one row, in % of a token's own height

const shuffle = arr => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

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
const timelineEl = document.getElementById('timeline');
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

// ---------- Pausable delay ----------
let paused = false, pauseResolve = null;
async function sleep(ms) {
  await new Promise(r => setTimeout(r, ms));
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
let mainDeck, bonusRow, kingPos, revealed, deckIdx;
let mode, playerSuit, computerSuit, riderNames = {}, gameOver;
let kingEls = {}, bonusEls = {};

function newGame() {
  mainDeck = shuffle(SUITS.flatMap(suit => RANKS.map(rank => ({ suit, rank }))));
  const bonusCards = shuffle([
    ...SUITS.map(suit => ({ type: 'ace', suit })),
    { type: 'joker', color: 'red' },
    { type: 'joker', color: 'black' },
  ]);
  bonusRow = {};
  bonusCards.forEach((c, i) => { bonusRow[i + 1] = c; });
  kingPos = { S: 7, D: 7, C: 7, H: 7 };
  revealed = new Set();
  deckIdx = 0;
  gameOver = false;
  paused = false;
  pauseBtn.disabled = false;
  timelineEl.innerHTML = '';
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
      if (suit === playerSuit) el.classList.add('player');
      if (suit === computerSuit) el.classList.add('computer');
    } else if (riderNames[suit]) {
      el.classList.add('player');
    }
    el.innerHTML = cardInnerHTML('K', SUIT_GLYPH[suit], SUIT_COLOR[suit]);
    positionToken(el, kingPos[suit], SUIT_COL[suit]);
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
  kingPos[suit] = row;
  setRow(kingEls[suit], row);
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

function logEvent(msg) {
  const li = document.createElement('li');
  li.className = 'tl-entry';
  li.textContent = msg;
  timelineEl.appendChild(li);
  while (timelineEl.children.length > 40) timelineEl.firstChild.remove();
  timelineEl.scrollTop = timelineEl.scrollHeight;
}
function updateDeckCounter() {
  deckCounterEl.textContent = `${mainDeck.length - deckIdx} cards left`;
  const remFrac = (mainDeck.length - deckIdx) / mainDeck.length;
  const playedFrac = deckIdx / mainDeck.length;
  deckStackEl.style.setProperty('--th', (1 + remFrac * 5) + 'px');
  deckStackEl.style.opacity = remFrac > 0 ? 1 : .3;
  discardStackEl.style.setProperty('--th', (1 + playedFrac * 5) + 'px');
  discardStackEl.style.opacity = playedFrac > 0 ? Math.min(1, .35 + playedFrac * .75) : 0;
}

// ---------- Game logic ----------
async function advanceKing(suit) {
  if (gameOver || kingPos[suit] === 0) return;
  const newRow = kingPos[suit] - 1;
  moveKing(suit, newRow);
  logEvent(`${SUIT_SYMBOL[suit]} ${SUIT_NAME[suit]} King advances!`);
  await sleep(680);
  if (newRow === 0) { await win(suit); return; }
  await checkCheckpoints();
}

async function checkCheckpoints() {
  for (let r = 6; r >= 1; r--) {
    if (gameOver) return;
    if (revealed.has(r)) continue;
    if (SUITS.every(s => kingPos[s] < r)) {
      revealed.add(r);
      const card = bonusRow[r];
      revealBonusCard(r, card);
      logEvent(`Row ${r} cleared — bonus revealed!`);
      await sleep(750);
      if (card.type === 'ace') {
        logEvent(`${SUIT_SYMBOL[card.suit]} Ace of ${SUIT_NAME[card.suit]}!`);
        await sleep(450);
        await advanceKing(card.suit);
      } else {
        const affected = SUITS.filter(s => SUIT_COLOR[s] === card.color);
        logEvent(`🃏 ${card.color === 'red' ? 'Red' : 'Black'} Joker!`);
        await sleep(450);
        logEvent(`${affected.map(s => SUIT_NAME[s]).join(' & ')} fall back.`);
        affected.forEach(s => moveKing(s, Math.min(7, kingPos[s] + 1)));
        await sleep(680);
      }
    }
  }
}

async function gameLoop() {
  while (!gameOver && deckIdx < mainDeck.length) {
    hideCurrentCard();
    await sleep(450);
    if (gameOver) break;
    const card = mainDeck[deckIdx++];
    updateDeckCounter();
    showCurrentCard(card);
    await sleep(600);
    logEvent(`🂠 ${card.rank} of ${SUIT_NAME[card.suit]} turned`);
    await sleep(650);
    if (gameOver) break;
    await advanceKing(card.suit);
    await sleep(250);
  }
}

async function win(suit) {
  gameOver = true;
  pauseBtn.disabled = true;
  kingEls[suit].classList.add('winner');
  logEvent(`${SUIT_NAME[suit]} King wins the race!`);
  await sleep(1000);
  showVictory(suit);
}

function showVictory(suit) {
  kingEls[suit].classList.remove('winner');
  victoryWinnerEl.innerHTML = `<div class="pc-front ${SUIT_COLOR[suit]}">${cardInnerHTML('K', SUIT_GLYPH[suit], SUIT_COLOR[suit])}</div>`;
  if (mode === 'computer') {
    if (suit === playerSuit) {
      victoryTitleEl.textContent = 'You Win!';
      victorySubtitleEl.textContent = `Your ${SUIT_NAME[suit]} King crossed the finish line first.`;
    } else if (suit === computerSuit) {
      victoryTitleEl.textContent = 'Computer Wins';
      victorySubtitleEl.textContent = `The computer's ${SUIT_NAME[suit]} King beat you to the finish line.`;
    } else {
      victoryTitleEl.textContent = 'Surprise Winner!';
      victorySubtitleEl.textContent = `The ${SUIT_NAME[suit]} King, chosen by neither racer, won the race!`;
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
    const label = mode === 'computer'
      ? (suit === playerSuit ? 'YOU' : suit === computerSuit ? 'PC' : '')
      : (riderNames[suit] || '');
    document.getElementById('label-' + suit).textContent = label;
  });
}

async function startRace() {
  screenSelect.classList.add('hidden');
  screenRace.classList.remove('hidden');
  setRiderLabels();
  buildCells();
  renderTokens();
  updateDeckCounter();

  logEvent('🂠 Shuffling the deck...');
  deckStackEl.classList.add('shuffling');
  await sleep(1400);
  deckStackEl.classList.remove('shuffling');

  logEvent('Riders, get ready...');
  await sleep(500);
  await countdown();
  gameLoop();
}

function chooseKing(suit) {
  playerSuit = suit;
  const rest = SUITS.filter(s => s !== suit);
  computerSuit = rest[(Math.random() * rest.length) | 0];
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
    selectSubtitleEl.textContent = 'Choose your King. The computer will pick another.';
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

document.getElementById('replay-btn').addEventListener('click', () => {
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
