'use strict';

// ---------- Constants ----------
// SUITS, SUIT_COLOR, RANKS, ROWS and the rules themselves come from race.js.
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
const victoryTitleEl = document.getElementById('victory-title');
const victorySubtitleEl = document.getElementById('victory-subtitle');
const pauseBtn = document.getElementById('pause-btn');
const chipsEl = document.getElementById('chips');
const blindClockEl = document.getElementById('blindclock');
const victoryChipsEl = document.getElementById('victory-chips');
const holeEl = document.getElementById('hole-cards');
const betlogEl = document.getElementById('betlog');

// ---------- Pausable delay ----------
// ponytail: --spd in style.css is the single pacing knob -- it scales every CSS
// duration via calc() and every sleep below, so the two can never drift apart.
// Turn it up to slow the race down, down to speed it up.
const SPEED = +getComputedStyle(document.documentElement).getPropertyValue('--spd') || 1;
let paused = false, pauseResolve = null;
async function sleep(ms) {
  await new Promise(r => setTimeout(r, ms * SPEED));
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
const SEAT_NAME = { you: 'You', a1: 'Dmitri', a2: 'Sasha', a3: 'Kolya' };
const SEAT_TAG = { you: 'YOU', a1: 'DMITRI', a2: 'SASHA', a3: 'KOLYA' };
let seatSuit = {}, suitSeat = {}, holes = {}, seated = [], live = [], pot = 0, street = 0;
// The draw position the last betting round closed at, so a street can be timed off the
// deck as well as off a bonus card.
let lastBet = 0;
let epoch = 0;   // bumped per race, so a replay can't leave the previous loop still stepping

function newGame() {
  race = newRaceState();
  epoch++;
  gameOver = false;
  paused = false;
  seated = []; live = []; holes = {}; pot = 0; street = 0; lastBet = 0;
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
  while (!gameOver && epoch === mine) {
    // A street every STREET_GAP cards, not only when a bonus card turns: keyed to the
    // reveals alone the betting was hostage to a mechanic that fires twice a race, and
    // one hand in seven never got a second round at all. bets.js holds the spacing.
    // Priced off the live board -- no bonus card is pending here, so there is nothing a
    // snapshot would hide.
    if (mode === 'computer' && street && street < 4 && race.deckIdx - lastBet >= STREET_GAP) {
      await bettingRound(street + 1);
      if (gameOver || epoch !== mine) return;
    }
    // The table as it stood before this card. A street opens with the bonus card still
    // face down, so that snapshot -- not the mutated state -- is what the round is priced
    // off, or the AI would be betting on a card nobody has seen yet.
    // ponytail: taken before the draw, so it is one advance stale -- the very card on
    // screen. Replaying the batch event by event to close that gap costs more than the
    // one row of drift is worth.
    const preDraw = structuredClone(race);
    for (const e of stepRace(race)) {
      if (gameOver || epoch !== mine) return;
      // `race.winner` guards a batch that revealed a bonus card and won on it in one
      // step: the race is already decided, so there is nothing left to bet on.
      // A bonus card landing right after a timed street would bet the same board twice
      // in a row; the cadence picks that round up a few cards later instead.
      if (e.type === 'reveal' && !race.winner && mode === 'computer' && street && street < 4
          && race.deckIdx - lastBet >= 2) {
        betView = preDraw;
        await bettingRound(street + 1);
        betView = null;
        if (gameOver || epoch !== mine) return;
      }
      await renderEvent(e);
    }
    await sleep(250);
  }
}

async function win(suit, photoFinish, uncontested) {
  gameOver = true;
  pauseBtn.disabled = true;
  kingEls[suit].classList.add('winner');
  await sleep(1000);
  showVictory(suit, photoFinish, uncontested);
}

function showVictory(suit, photoFinish, uncontested) {
  kingEls[suit].classList.remove('winner');
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
  victoryChipsEl.textContent = settlePot(suit, uncontested);
  if (uncontested) {
    victorySubtitleEl.textContent = suit === playerSuit
      ? 'Everyone else folded. The pot is yours without a race.'
      : `Everyone else folded \u2014 ${SEAT_NAME[suitSeat[suit]]} takes it without a race.`;
  }
  if (photoFinish) {
    victorySubtitleEl.textContent =
      `The deck ran out \u2014 the ${SUIT_NAME[suit]} King was furthest ahead. Photo finish!`;
  }
  endRun();
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
    el.innerHTML = '<i class="chips"></i><b class="tag"></b><i class="stack"></i><i class="stake"></i><i class="said"></i>';
    el.querySelector('.tag').textContent = label;   // friends-mode names are user input
    el.classList.toggle('you', mode === 'computer' && suit === playerSuit);
  });
  window.paintSeatFaces?.();   // faces.js stamps each seat's character back onto its plaque
  renderStakes();
}

// ---------- Chips, hole cards and the betting rounds ----------
// Bankroll survives reloads. Chips only ever reach storage at a hand boundary: the
// stacks as they were before the blinds went in, or as they are once the pot is paid.
// `commit` is that boundary; the blind clock rides along live, since it is not a chip.
//
// Mid-hand is not a state worth keeping. The stacks are already down while the pot is
// still in flight, so a blob written then does not add back up to the stake and loadPurse
// throws the entire run away -- close the tab during a betting round and the table came
// back either wiped to fresh buy-ins or stuck on the half-played stacks.
// ponytail: so a tab closed mid-hand voids that hand instead of burning the chips into a
// dead pot. That is refundable-by-quitting, which is only cheatable against yourself;
// move `commit` to just after the blinds if a real opponent ever shows up.
const PURSE_KEY = 'kr-purse';
let saved = null;
try { saved = JSON.parse(localStorage.getItem(PURSE_KEY)); } catch { /* corrupt blob, or no storage */ }
const purse = loadPurse(saved);   // bets.js decides: a purse restores whole or not at all
let commit = { ...purse };

function savePurse() {
  try { localStorage.setItem(PURSE_KEY, JSON.stringify(purseBlob(commit, purse))); } catch { /* private mode */ }
}

// What the table has learned about you, kept for the whole match rather than one race --
// bets.js reads it, this only stores it. Its own key on purpose: it is not chips, it must
// not have to add up to the stake, and a garbled read must never cost anybody a bankroll.
// It is written every time you act, not at a hand boundary: a read is true the moment it
// is taken, so half a hand of it is still worth keeping.
const READ_KEY = 'kr-read';
let readSaved = null;
try { readSaved = JSON.parse(localStorage.getItem(READ_KEY)); } catch { /* corrupt blob, or no storage */ }
let read = loadRead(readSaved);
function saveRead() {
  try { localStorage.setItem(READ_KEY, JSON.stringify(read)); } catch { /* private mode */ }
}
// Drop the run. Next load has nothing to restore, so loadPurse deals a fresh table.
function dropPurse() {
  try { localStorage.removeItem(PURSE_KEY); } catch { /* private mode */ }
}
// The read belongs to the match the chips belong to. A new table is a new opponent as far
// as the seats are concerned, so it is forgotten wherever the stacks are.
function dropRead() {
  read = newRead();
  try { localStorage.removeItem(READ_KEY); } catch { /* private mode */ }
}
// A run only carries on through Continue. Coming in off the mode screen is a new table:
// level stacks, blinds back to level 1, clock back to zero -- a reload mid-hand used to
// restore the old purse and then start the "new" game on it.
// ponytail: clockStarted is deliberately left alone -- it only guards against a second
// setInterval, and the one already running reads purse.ms, which is now zero again.
function resetPurse() {
  Object.assign(purse, loadPurse(null));
  commit = { ...purse };
  handStart = {};
  dropRead();
  savePurse();
}
// The blind timer runs on real playing time only: it stops for the pause overlay, the
// rules panel and the victory screen, so the blinds cannot climb while nobody is racing.
// ponytail: one interval reading its own elapsed time -- setInterval drifts, and over a
// few levels that drift is worth more than the two lines it costs to not have it.
let clockStarted = 0;
function startClock() {
  if (clockStarted) return;
  clockStarted = performance.now();
  let last = clockStarted;
  setInterval(() => {
    const now = performance.now();
    const dt = Math.round(now - last);
    last = now;
    if (paused || gameOver || mode !== 'computer' || screenRace.classList.contains('hidden')) return;
    purse.ms += dt;
    savePurse();
    renderChips();
  }, 1000);
}

const mmss = ms => { const s = Math.ceil(ms / 1000); return `${(s / 60) | 0}:${String(s % 60).padStart(2, '0')}`; };

function renderChips() {
  chipsEl.classList.toggle('hidden', mode !== 'computer');
  // The hand is played at the level frozen when it opened, so once the clock has run past
  // that the countdown is over and the new blinds are waiting on the next deal.
  const bb = purse.bb || bigBlind(purse.ms);
  const left = bigBlind(purse.ms) !== bb ? 0 : levelLeft(purse.ms);
  // The pot as piles, same discs as the seats' stacks -- fixed-height row, so it never
  // shoves the deck panel around as the pot grows.
  chipsEl.innerHTML = `<i class="stack">${stackHTML(pot)}</i>` +
    `Bank ${purse.you} · Pot ${pot}`;
  blindClockEl.classList.toggle('hidden', mode !== 'computer');
  blindClockEl.textContent =
    `Blinds ${bb / 2}/${bb} · ${left === Infinity ? 'top level' : left ? 'up in ' + mmss(left) : 'up next hand'}`;
  renderStakes();
}

// Every seat's stack and what it has put in this hand, under its own column. Chips
// committed is just what the stack has lost since the hand opened -- no per-street
// bookkeeping to keep in sync.
let handStart = {};
// What a seat has put in this hand: just what its stack has lost since the hand opened.
const staked = s => Math.max(0, (handStart[s] ?? purse[s]) - purse[s]);
// ponytail: at most 6 discs in front of a seat -- the exact figure is spelled out
// underneath anyway, so a deep stake reads as "a lot" rather than sprawling sideways.
const chipsHTML = n => chipSplit(n).slice(0, 6).map(v => `<i class="chip c${v}"></i>`).join('');

// Any amount -- a seat's stack, the pot -- as little piles four discs tall, biggest
// denomination first. A deep pile spills into more piles rather than one skyscraper.
// ponytail: four piles wide is the whole visual budget, so anything past 400 reads the
// same. The exact figure is spelled out right underneath.
const stackHTML = n => chipSplit(n)
  .reduce((piles, v) => {
    const top = piles.at(-1);
    if (top && top.v === v && top.k < 4) top.k++; else piles.push({ v, k: 1 });
    return piles;
  }, [])
  .slice(0, 4)
  .map(({ v, k }) => `<span>${`<i class="chip c${v}"></i>`.repeat(k)}</span>`).join('');

function renderStakes() {
  if (mode !== 'computer' || !seatSuit.you) return;
  SEATS.forEach(s => {
    const el = document.getElementById('label-' + seatSuit[s]);
    if (!el) return;
    const out = seated.length && !seated.includes(s);
    const folded = !out && live.length && !live.includes(s);
    const committed = staked(s);
    // Folded chips have been pushed into the pot -- the seat's square is empty again.
    el.querySelector('.chips').innerHTML = out || folded ? '' : chipsHTML(committed);
    el.querySelector('.stack').innerHTML = out ? '' : stackHTML(purse[s]);
    el.querySelector('.stake').textContent =
      out ? 'out' : folded ? 'folded' : `${purse[s]} · in ${committed}`;
  });
}

function assignSeats() {
  const others = SUITS.filter(s => s !== playerSuit);
  seatSuit = { you: playerSuit, a1: others[0], a2: others[1], a3: others[2] };
  suitSeat = {};
  SEATS.forEach(s => { suitSeat[seatSuit[s]] = s; });
}

// --i is the card's offset from the middle of the hand: CSS fans the cards off it, so a
// new hole card slots into the fan instead of growing the panel and shoving the deck.
const handHTML = cards => cards.map((c, i) =>
  `<div class="pc-front ${SUIT_COLOR[c.suit]}" style="--i:${i - (cards.length - 1) / 2}">${cardInnerHTML(c.rank, SUIT_GLYPH[c.suit], SUIT_COLOR[c.suit])}</div>`).join('');

// What a seat can see: the public race, plus the knowledge that the other seats' hole
// cards -- two more each per street -- are dead without being able to name them. race.js
// puts those back in the pool and deals that many fewer.
// `betView` is set while a street is being bet ahead of a bonus card: everyone prices
// the hand off the board as it was before that card flipped.
let betView = null;
const seatView = seat => ({ ...(betView || race), hidden: seated.filter(s => s !== seat).flatMap(s => holes[s]) });

function markFolded() {
  SEATS.forEach(s => kingEls[seatSuit[s]]?.classList.toggle('folded', !live.includes(s)));
}

function askAction(r) {
  return new Promise(resolve => {
    const owe = r.bet - r.in.you;
    const opts = legal(r, purse, 'you');
    const label = (o, n) => ({ fold: 'Fold', check: 'Check',
                               call: `Call ${Math.min(owe, purse.you)}${owe >= purse.you ? ' all in' : ''}`,
                               bet: `Bet ${n}`, raise: `Raise to ${r.bet + n}` })[o];
    // How far you may slide it: never past the street's cap (bets.js keeps that where a
    // fully capped fixed-limit street already was) and never past your own stack -- the
    // top of the slider is your all-in.
    // ponytail: a native <input type="range"> -- no stepper, no chip-count buttons, and
    // it comes keyboard-accessible for free.
    const hi = Math.min(r.cap - r.bet, purse.you - owe);
    const sizeable = hi > r.min && (opts.includes('bet') || opts.includes('raise'));
    // ponytail: a dock on the free right rail, not a fullscreen overlay. The board, the
    // plaques and your hole cards in the deck panel all stay readable while you decide,
    // so the panel only carries what is not already on screen: the street and the ask.
    const ov = document.createElement('div');
    ov.className = 'bet-dock';
    ov.innerHTML = `<span class="bet-street">Street ${r.street}</span>` +
      `<p class="bet-ask">pot ${r.pot} · stack ${purse.you}` +
      `${owe ? ' · to call ' + owe : ''}</p>` +
      (sizeable ? `<label class="bet-size">Bet size <b class="bet-size-out">${r.min}</b>` +
        `<input type="range" min="${r.min}" max="${hi}" step="1" value="${r.min}" aria-label="Bet size">` +
        `</label>` : '') +
      `<div class="btn-row">` +
      opts.map(o => `<button class="btn-ghost" data-act="${o}">${label(o, r.min)}</button>`).join('') +
      `</div>`;
    screenRace.appendChild(ov);
    const slider = ov.querySelector('.bet-size input');
    slider?.addEventListener('input', () => {
      ov.querySelector('.bet-size-out').textContent = slider.value;
      ['bet', 'raise'].forEach(o => {
        const b = ov.querySelector(`[data-act="${o}"]`);
        if (b) b.textContent = label(o, +slider.value);
      });
    });
    ov.addEventListener('click', e => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      ov.remove();
      resolve(act(purse, r, 'you', btn.dataset.act, +(slider?.value ?? r.min)));
    });
  });
}

// An AI decides in a few ms, so the pacing is all sleeps: THINK is how long a seat
// deliberates, BEAT is how long its action holds the plaque before the next seat speaks.
// ponytail: two numbers, not a pacing engine -- --spd in style.css scales both along with
// every other sleep in the race, so the betting can never drift out of step with the cards.
const THINK = 600, BEAT = 550;

// ponytail: 500 runs on the main thread -- the race is stopped for the betting round
// anyway, so a few ms of blocking beats a worker and a request/reply protocol.
async function aiTurn(r, seat) {
  const p = odds(seatView(seat), 500)[seatSuit[seat]];
  const { action, want } = aiAction(p, r, purse, seat, read);
  await sleep(THINK);
  return act(purse, r, seat, action, want);
}

// Whose turn it is, and what the last seat did: without a marker and a line that
// lingers, the whole street is a silent flicker.
const said = suit => document.querySelector('#label-' + suit + ' .said');
function setTurn(seat) {
  SUITS.forEach(su => document.getElementById('label-' + su).classList.toggle('acting', seat && su === seatSuit[seat]));
}
const actionText = m => (m.action === 'bet' ? 'bets ' + m.to
  : m.action === 'raise' ? 'raises to ' + m.to
  : m.action === 'call' ? 'calls ' + m.amount
  : m.action) + (m.allin && m.action !== 'fold' ? ' all in' : '');
function showAction(m) {
  const el = said(seatSuit[m.seat]);
  if (!el) return;
  el.textContent = actionText(m);
  el.classList.toggle('fold', m.action === 'fold');
}

// How long the log stays up after the last chip moved. Scaled by SPEED like every
// other bit of pacing, so slowing the race down leaves it readable for just as long.
const LOG_QUIET = 5000;
let fadeTimer;

// The chip log: only moves that cost chips get a line. Checks and folds are on the
// rider plaques, and repeating them here would bury the money under the talk.
function logBet(seat, text) {
  const li = document.createElement('li');
  if (seat === 'you') li.className = 'you';
  // Every verb here is third person, and "You calls 20" reads like a typo: drop the s.
  li.textContent = `${SEAT_NAME[seat]} ${seat === 'you' ? text.replace(/^(\w+)s\b/, '$1') : text}`;
  betlogEl.append(li);
  // The log is only interesting while the chips are moving: it fades itself out once
  // the table goes quiet, and the next line brings it straight back.
  betlogEl.classList.remove('faded');
  clearTimeout(fadeTimer);
  fadeTimer = setTimeout(() => betlogEl.classList.add('faded'), LOG_QUIET * SPEED);
}

async function bettingRound(n, blinds = {}) {
  street = n;
  lastBet = race.deckIdx;   // both triggers time off the last round, whichever opened it
  if (live.length < 2) return;
  // Two private cards to open, then one more per live seat before every later street's
  // money goes in, so each round is bet on a fresh read. They come out of the race deck,
  // so every card dealt is one the race will not draw: two a street burned so much of it
  // that a third of the races died on an empty deck instead of at the finish line.
  dealHoles(race, live.length, n === 1 ? 2 : 1).forEach((h, i) => holes[live[i]].push(...h));
  holeEl.innerHTML = handHTML(holes.you);
  updateDeckCounter();
  // The snapshot this street is priced off was cloned before the deal, so hand it the
  // live deck: otherwise the sim would deal these same cards out a second time.
  if (betView) betView.mainDeck = race.mainDeck;
  const r = newRound(purse, live, n, pot, purse.hand, blinds);
  SUITS.forEach(su => { said(su).textContent = ''; });   // last street's talk is stale
  betlogEl.innerHTML = '';                                // and so are its chips
  Object.entries(blinds).forEach(([s, amt]) => {
    said(seatSuit[s]).textContent = 'blind ' + amt;
    logBet(s, `posts ${amt}`);
  });
  for (let seat; (seat = actor(r));) {
    setTurn(seat);
    // Taken before you act: `act` moves the chips, and the pressure that mattered was the
    // pressure you decided under.
    const stress = seat === 'you' ? stressIndex(r, purse, 'you') : 0;
    const m = seat === 'you' ? await askAction(r) : await aiTurn(r, seat);
    if (seat === 'you') { remember(read, stress, m.action); saveRead(); }
    showAction(m);
    if (m.amount) logBet(m.seat, actionText(m));
    live = r.live;
    pot = r.pot;                  // keep the pot readout honest between turns
    renderChips();
    markFolded();
    if (gameOver) return setTurn(null);
    await sleep(BEAT);            // your own chips have to land too, not just theirs
  }
  setTurn(null);
  live = r.live;
  race.contenders = live.map(s => seatSuit[s]);   // folded Kings race on, but can't win
  pot = r.pot;
  purse.carry = pot;
  savePurse();
  renderChips();
  markFolded();
  await sleep(BEAT);              // the closed street reads before the deck starts again
  // Everyone else folded: nobody is left to race for it, so the pot is paid here and now.
  if (live.length === 1) await win(seatSuit[live[0]], false, true);
}

async function openTable() {
  holeEl.classList.toggle('hidden', mode !== 'computer');
  betlogEl.classList.toggle('hidden', mode !== 'computer');
  betlogEl.innerHTML = '';
  if (mode !== 'computer') { renderChips(); return true; }
  seated = alive(purse);
  if (seated.length < 2 || !seated.includes('you')) {
    renderChips();
    victoryChipsEl.textContent = '';
    endRun();
    screenVictory.classList.remove('hidden');
    return false;
  }
  handStart = commit = { ...purse };   // the hand opens here, and this is what gets stored
  purse.hand++;                      // the button moves one seat; bettingRound deals the order
  const opened = openPot(purse, seated, purse.hand);
  pot = opened.pot;
  purse.carry = pot;
  live = [...seated];
  race.contenders = live.map(s => seatSuit[s]);   // eliminated Kings race, but can't win
  markFolded();
  seated.forEach(s => { holes[s] = []; });   // bettingRound deals the opening two
  savePurse();
  renderChips();
  startClock();
  await bettingRound(1, opened.blinds);
  return !gameOver;   // folded out pre-flop: the hand is already paid, skip the countdown
}

// Race over. Only a King still in the pot can end the race, so the winner is always
// someone who paid to be here.
function settlePot(winSuit, uncontested) {
  if (mode !== 'computer') return '';
  const seat = suitSeat[winSuit];
  // Everyone's stake this hand, and the finish order of the riders still in the pot:
  // awardPot needs both to know how much of it the winner actually covered.
  const paid = Object.fromEntries(SEATS.map(s => [s, staked(s)]));
  const order = rankSuits(race, race.contenders).map(su => suitSeat[su]);
  const before = { ...purse };
  const total = pot;
  // An uncontested pot has no runner-up to hand the overflow to: it all goes to the
  // one seat still in, stake or no stake.
  if (uncontested) awardPot(purse, pot, [seat], { [seat]: pot });
  else awardPot(purse, pot, order, paid);
  const won = s => purse[s] - before[s];
  pot = 0;
  commit = { ...purse };   // the pot is paid: a new boundary to store
  savePurse();
  renderChips();
  // ponytail: no showdown. Nobody's hole cards are ever revealed -- yours were the
  // only honest read on the race, and folded seats keep their bluffs.
  // With an all-in in the hand the pot pays out in more than one piece, so log every
  // seat that got a share -- the winner's line alone would not add up to the pot.
  order.filter(won).forEach(s => logBet(s, `takes ${won(s)} of the ${total}-chip pot`));
  const share = `${won(seat)} of the ${total}-chip pot`;
  return (seat === 'you' ? `You take ${share}.` : `${SEAT_NAME[seat]} takes ${share}.`) +
    ` Your bank: ${purse.you}.`;
}

// Nobody is re-staked, so a run ends one of two ways: you cannot post the big blind, or nobody else
// can. Either way it is over -- there is no Continue from here, only Quit.
const replayBtn = document.getElementById('replay-btn');
function endRun() {
  if (mode !== 'computer') return false;
  const left = alive(purse);
  const broke = !left.includes('you');
  if (!broke && left.length > 1) return false;
  gameOver = true;
  // The run is over: drop the dead purse so a reload deals a fresh table instead of
  // restoring the same busted stacks and showing this screen again forever.
  dropPurse();
  dropRead();
  pauseBtn.disabled = true;
  victoryTitleEl.textContent = broke ? 'You Lose' : 'You Win the Table';
  const gone = SEATS.filter(x => x !== 'you' && !left.includes(x)).map(x => SEAT_NAME[x]);
  victorySubtitleEl.textContent = broke
    ? `You are out of chips \u2014 you cannot cover the ${bigBlind(purse.ms)}-chip big blind. The table plays on without you.`
    : `${gone.join(', ')} are out of chips. Every chip on the table is yours.`;
  if (!victoryChipsEl.textContent) victoryChipsEl.textContent = `Bank ${purse.you}.`;
  replayBtn.classList.add('hidden');
  return true;
}

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
  resetPurse();   // both chooseKing and startFriendsRace are only reachable through here

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
    input.value = input.value.replace(/[^a-zA-Z]/g, '').toUpperCase();
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
document.getElementById('quit-btn').addEventListener('click', () => {
  dropPurse();          // Continue rides the same stacks; Quit is the only way to reset them
  dropRead();
  location.reload();
});

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
const rulesSlides = document.getElementById('rules-slides');
const slide = dir => rulesSlides.scrollBy({ left: dir * rulesSlides.clientWidth, behavior: 'smooth' });
document.getElementById('rules-prev').addEventListener('click', () => slide(-1));
document.getElementById('rules-next').addEventListener('click', () => slide(1));
document.getElementById('rules-close').addEventListener('click', () => {
  rulesPanel.classList.add('hidden');
  if (pausedByRules) { resumeGame(); pausedByRules = false; }
});

// sw.js was never registered, so nothing was ever precached.
if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
