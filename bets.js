'use strict';

// Pure chip math: bankrolls, the ante, and one fixed-limit betting round. No DOM, no
// storage, no odds -- game.js does the IO and race.js does the probability.

const ANTE = 5;
const BUYIN = 100;
const SMALL = 10;          // small bet, streets 1-2; big bet is 2x on streets 3-4
const CAP = 3;             // raises per street
const SEATS = ['you', 'a1', 'a2', 'a3'];

// Busted AI seats get re-staked at the buy-in, so the table never dead-ends. The human
// seat is deliberately left broke -- that's the losing condition.
const restake = purse => SEATS.forEach(s => { if (s !== 'you' && purse[s] < ANTE) purse[s] = BUYIN; });

// Everyone antes, and whatever rode over from the last race is raked in.
function openPot(purse) {
  SEATS.forEach(s => { purse[s] -= ANTE; });
  const pot = purse.carry + SEATS.length * ANTE;
  purse.carry = 0;
  return pot;
}

// ponytail: the bet size is clamped so that even a capped street cannot outrun the
// shortest live stack. That one line IS the "no side pots, ever" rule -- no all-in
// math, no split pots, no stack balancing. Cost: a short stack shrinks the whole
// table's limits. Lift it by writing real side pots, if that ever matters.
function newRound(purse, live, street, pot) {
  const shortest = Math.min(...live.map(s => purse[s]));
  const size = Math.min(street < 3 ? SMALL : 2 * SMALL, (shortest / (CAP + 1)) | 0);
  return {
    order: [...live], live: [...live], size, pot, street,
    bet: 0, raises: 0, i: 0,
    in: Object.fromEntries(live.map(s => [s, 0])),
    pending: new Set(size > 0 && live.length > 1 ? live : []),
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
  const aggro = r.raises < CAP && purse[seat] > owe;
  return owe > 0 ? ['fold', 'call', ...(aggro ? ['raise'] : [])]
                 : ['check', ...(aggro ? ['bet'] : [])];
}

function act(purse, r, seat, action) {
  const owe = r.bet - r.in[seat];
  const pay = n => {
    const amt = Math.min(n, purse[seat]);
    purse[seat] -= amt; r.in[seat] += amt; r.pot += amt;
    return amt;
  };
  let amount = 0;
  if (action === 'fold') r.live = r.live.filter(s => s !== seat);
  else if (action === 'call') amount = pay(owe);
  else if (action === 'bet' || action === 'raise') {
    amount = pay(owe + r.size);
    r.bet += r.size;
    r.raises++;
    r.pending = new Set(r.live);            // everyone else owes a response
  }
  r.pending.delete(seat);
  r.i = (r.i + 1) % r.order.length;
  return { seat, action, amount, to: r.bet };
}

// The AI: pot odds, plus one bluff in ten so it isn't a readable machine.
// `p` is this seat's own win probability, computed from its own hole cards.
function aiAction(p, r, purse, seat, bluff = 0.1) {
  const opts = legal(r, purse, seat);
  const owe = r.bet - r.in[seat];
  const cost = owe || r.size;
  const breakeven = cost / (r.pot + cost);
  const aggro = opts.includes('raise') ? 'raise' : opts.includes('bet') ? 'bet' : null;
  if (aggro && (Math.random() < bluff || p > 1.5 * breakeven)) return aggro;
  if (owe === 0) return 'check';
  return p > breakeven ? 'call' : 'fold';
}

// seat is the winner, or null when nobody is left to claim it -- then it's dead money
// and rides on the next race instead of being refunded.
function awardPot(purse, pot, seat) {
  if (seat) purse[seat] += pot;
  else purse.carry = pot;
}

if (typeof module !== 'undefined') {
  module.exports = { ANTE, BUYIN, SMALL, CAP, SEATS, restake, openPot, newRound, actor, legal, act, aiAction, awardPot };
}
