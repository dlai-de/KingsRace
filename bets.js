'use strict';

// Pure chip math: bankrolls, the blinds, and one fixed-limit betting round. No DOM, no
// storage, no odds -- game.js does the IO and race.js does the probability.

const BUYIN = 100;
// Blind ladder: the big blind at each level, small blind is half. The big blind is also
// the fixed-limit small bet (streets 1-2; the big bet is 2x on streets 3-4), so raising
// the blinds raises the whole betting structure with it.
const BLINDS = [10, 20, 40, 80];
const LEVEL_MS = 120000;   // real playing time per blind level
const CAP = 3;             // raises per street, on top of the opening bet
const SEATS = ['you', 'a1', 'a2', 'a3'];

const blindLevel = ms => Math.min(Math.floor(ms / LEVEL_MS), BLINDS.length - 1);
const bigBlind = ms => BLINDS[blindLevel(ms)];
// Time until the blinds go up, or Infinity once the ladder has topped out.
const levelLeft = ms => blindLevel(ms) === BLINDS.length - 1 ? Infinity : LEVEL_MS - ms % LEVEL_MS;

// Every chip at this table came from a buy-in, so a stored purse must still add up to
// exactly that -- the blinds move chips to the pot, the pot parks in `carry`, and the
// winner takes it, but the four stacks plus `carry` are always the full stake.
//
// All or nothing: game.js used to restore key by key, which silently mixed a stale blob
// with fresh stacks. An older two-seat purse put `you` back and left a1-a3 sitting on
// the untouched buy-in, so the table opened with unequal chips -- and no JSON error to
// catch, because a wrong shape parses fine.
// `ms` is the blind clock and `bb` the level frozen for the hand in progress; neither is
// a chip, so neither counts towards the stake. `bb` is not restored -- the next hand
// stamps it fresh from the clock.
const STAKE = SEATS.length * BUYIN;
function loadPurse(saved) {
  const fresh = { carry: 0, hand: 0, ms: 0, bb: BLINDS[0], ...Object.fromEntries(SEATS.map(s => [s, BUYIN])) };
  const chips = k => Number.isInteger(saved?.[k]) && saved[k] >= 0;
  if (![...SEATS, 'carry'].every(chips)) return fresh;
  const p = { ...fresh };
  ['hand', 'ms'].forEach(k => { if (chips(k)) p[k] = saved[k]; });
  [...SEATS, 'carry'].forEach(k => { p[k] = saved[k]; });
  return SEATS.reduce((a, s) => a + p[s], 0) + p.carry === STAKE ? p : fresh;
}

// What actually goes to storage: chips from a hand boundary, the clock from right now.
// Half a played hand is never a valid purse -- the stacks are already down while the pot
// is still in flight -- so a blob taken mid-street cannot add back up to the stake, and
// loadPurse rightly throws the whole run away when it sees one.
const purseBlob = (commit, live) => ({ ...commit, ms: live.ms, hand: live.hand });

// Seats that can still cover the big blind. Nobody is re-staked and nobody rebuys: a
// seat that cannot post is out for good, and the table shrinks until one seat holds the
// lot. The blinds climb on a timer, so a stack can be left behind by the clock as well
// as by the cards -- that is what the timer is for.
const alive = purse => SEATS.filter(s => purse[s] >= bigBlind(purse.ms || 0));

// The button acts last, so the seat on its left speaks first. Rotating SEATS rather than
// `live` keeps one order for the whole hand: a fold must not reshuffle who opens the next
// street. Without this `you` opened every street of every hand -- permanently the worst
// seat at the table.
function seatOrder(live, button) {
  const k = (button + 1) % SEATS.length;
  return [...SEATS.slice(k), ...SEATS.slice(0, k)].filter(s => live.includes(s));
}

// The hand opens: the two seats left of the button post the blinds, and whatever rode
// over from the last race is raked in. The level is frozen here for the whole hand, so
// the clock ticking over mid-race cannot move the stakes under a street that is already
// being bet. A blind is clamped to the stack: `alive` seats every player on at least the
// big blind, so the shortest of them posts it and is all-in before a card is dealt.
function openPot(purse, seats, button = 0) {
  purse.bb = bigBlind(purse.ms || 0);
  const [sb, bb] = seatOrder(seats, button);
  const post = (s, n) => { const amt = Math.min(n, purse[s]); purse[s] -= amt; return amt; };
  const blinds = { [sb]: post(sb, purse.bb / 2), [bb]: post(bb, purse.bb) };
  const pot = purse.carry + blinds[sb] + blinds[bb];
  purse.carry = 0;
  return { pot, blinds };
}

// All-in: nothing clamps a bet to the shortest stack any more. A seat that cannot cover
// one puts its last chips in, stays in the hand, and stops acting -- awardPot pays the
// pot back in layers so it can only win as much as it staked from each opponent.
function newRound(purse, live, street, pot, button = 0, blinds = {}) {
  const bb = purse.bb || BLINDS[0];
  const size = street < 3 ? bb : 2 * bb;
  const order = seatOrder(live, button);
  const paid = Object.fromEntries(live.map(s => [s, blinds[s] || 0]));
  const bet = Math.max(0, ...Object.values(paid));
  const acting = live.filter(s => purse[s] > 0);   // the all-in have nothing left to say
  return {
    order, live: [...live], size, pot, street, bb, bet, raises: 0,
    // The smallest legal raise: one small bet to open, then never less than the raise it
    // answers. Without it the slider let a 40-chip bet be re-raised by 10.
    min: size,
    // The most this street can be raised to: exactly the ceiling a fully capped
    // fixed-limit street already reached -- an opening bet plus CAP raises, or the
    // blind plus CAP raises. A chosen bet size moves inside that, so a street is never
    // worth more than plain fixed limit no matter what anyone slides the bet to.
    cap: bet ? bet + CAP * size : (CAP + 1) * size,
    // The blinds are a live bet, so the entry street opens left of the big blind -- which
    // is what makes fold a legal first word instead of a free check-around. The big blind
    // still has its option: it stays pending until the bets come back level to it.
    i: bet ? 2 % order.length : 0,
    in: paid,
    // Once a single seat still holds chips there is nothing to bet for. It can still be
    // asked to cover a blind or a bet already standing, but not open a new one.
    pending: new Set(acting.length > 1 ? acting : acting.filter(s => bet > paid[s])),
  };
}

// Whose turn it is, or null when the round is over.
function actor(r) {
  if (r.live.length < 2) return null;
  for (let k = 0; k < r.order.length; k++) {
    const s = r.order[(r.i + k) % r.order.length];
    if (r.pending.has(s) && r.live.includes(s)) { r.i = (r.i + k) % r.order.length; return s; }
  }
  return null;
}

function legal(r, purse, seat) {
  const owe = r.bet - r.in[seat];
  // Raising takes a full minimum raise behind the call and somebody left with chips to
  // answer it. Short of that the seat can still call, which puts it all in for less.
  const aggro = r.raises < CAP && purse[seat] >= owe + r.min && r.bet + r.min <= r.cap
    && r.live.some(s => s !== seat && purse[s] > 0);
  // Nothing owed but a bet already standing means this is the big blind's option: it can
  // only raise its own blind, never open a fresh bet on top of it.
  return owe > 0 ? ['fold', 'call', ...(aggro ? ['raise'] : [])]
                 : ['check', ...(aggro ? [r.bet ? 'raise' : 'bet'] : [])];
}

// `want` is how much to bet or raise BY -- the minimum if nothing is asked for, which is
// what the AI and the old fixed-limit table do. Anything else is clamped into
// [min, cap]: you pick the size, the table still decides the ceiling.
function act(purse, r, seat, action, want = r.min) {
  const owe = r.bet - r.in[seat];
  const pay = n => {
    const amt = Math.min(n, purse[seat]);
    purse[seat] -= amt; r.in[seat] += amt; r.pot += amt;
    return amt;
  };
  let amount = 0;
  if (action === 'fold') r.live = r.live.filter(s => s !== seat);
  else if (action === 'call') amount = pay(owe);        // short of the call is all-in for less
  else if (action === 'bet' || action === 'raise') {
    // Between the minimum and whichever ceiling comes first: the street cap or the stack.
    const n = Math.min(Math.max(Math.round(want) || 0, r.min), r.cap - r.bet, purse[seat] - owe);
    amount = pay(owe + n);
    r.bet += n;
    r.min = Math.max(r.min, n);             // the next raise cannot be smaller than this one
    if (action === 'raise') r.raises++;     // the opening bet is not one of the CAP raises
    r.pending = new Set(r.live.filter(s => purse[s] > 0));   // everyone with chips owes a response
  }
  r.pending.delete(seat);
  r.i = (r.i + 1) % r.order.length;
  return { seat, action, amount, to: r.bet, allin: purse[seat] === 0 };
}

// The AI: pot odds, plus one bluff in ten so it isn't a readable machine.
// `p` is this seat's own win probability, computed from its own hole cards.
//
// Short stacks play scared. `runway` is how many big blinds of survival a seat wants
// behind this bet; below that, `fear` scales the pot odds it demands and throttles the bluff
// rate, so a seat one blind from elimination folds hands it would call off a deep stack.
// ponytail: one multiplier, not an ICM model. Real tournament equity needs the payout
// structure and every stack at the table; this game has neither prizes nor a bubble.
// Priced on the chips actually at risk: calling all-in for less than the bet costs the
// stack, not the asking price, and the seat would otherwise fold hands it is getting a
// free look at. Measured in blinds, so what counts as short does not move with the
// street's bet size.
function aiAction(p, r, purse, seat, bluff = 0.1, runway = 2) {
  const opts = legal(r, purse, seat);
  const owe = r.bet - r.in[seat];
  const cost = Math.min(owe || r.min, purse[seat]);   // an all-in call risks the stack, not the price
  const breakeven = cost / (r.pot + cost);
  const life = (purse[seat] - cost) / r.bb;        // blinds left if this one is paid
  const fear = life < runway ? runway / Math.max(life, 0.25) : 1;
  const aggro = opts.includes('raise') ? 'raise' : opts.includes('bet') ? 'bet' : null;
  if (aggro && (Math.random() < bluff / fear || p > 1.5 * fear * breakeven)) return aggro;
  if (owe === 0) return 'check';
  return p > fear * breakeven ? 'call' : 'fold';
}

// The pot pays out in layers: a seat wins from each opponent only as much as it staked
// itself, so a short stack that shoved for 20 cannot take a 200-chip pot. `paid` is what
// every seat put in over the whole hand and `order` the finish order of the seats still
// in the pot, best first -- the race ranks every rider anyway, so what the winner cannot
// cover slides to whoever came in behind it.
// ponytail: this IS the side pot. No pot objects, no eligibility lists -- one pass down
// the finish order, peeling off one level of everyone's stake at a time.
// What nobody in the pot covers is dead money -- as is a pot nobody is left to claim at
// all -- and it rides on the next race rather than being refunded.
function awardPot(purse, pot, order = [], paid = {}) {
  const left = { ...paid };
  const rest = () => Object.values(left).reduce((a, n) => a + n, 0);
  let dead = pot - rest();   // carried over from an earlier hand: nobody staked it here
  for (const seat of order) {
    const lvl = left[seat] || 0;
    if (!lvl) continue;
    let won = dead;
    dead = 0;
    for (const s in left) { const take = Math.min(left[s], lvl); left[s] -= take; won += take; }
    purse[seat] += won;
  }
  purse.carry = dead + rest();
}

// A stake as chip discs, biggest denomination first. The 1s are not decoration: a short
// stack shrinks the bet size by integer division, so stakes are not always round fives.
const CHIPS = [25, 10, 5, 1];
const chipSplit = n => CHIPS.flatMap(v => {
  const k = Math.floor(n / v);
  n -= k * v;
  return Array(k).fill(v);
});

if (typeof module !== 'undefined') {
  module.exports = { BUYIN, BLINDS, LEVEL_MS, bigBlind, levelLeft, CAP, SEATS, STAKE, loadPurse, purseBlob, alive, openPot, newRound, actor, legal, act, aiAction, awardPot, chipSplit };
}
