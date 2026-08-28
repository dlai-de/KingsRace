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
const { SUITS, newRaceState, dealHoles, rankSuits, stepRace, odds } = require('./race.js');

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

// ---------- hole cards ----------
// Eight dead cards leave the deck, and the odds a seat computes must still be a
// distribution -- the six it can't see go back in the pool, then six get dealt away.
{
  const s = newRaceState();
  const hands = dealHoles(s, 4);
  console.assert(hands.length === 4 && hands.every(h => h.length === 2), 'wrong hole card deal');
  console.assert(s.mainDeck.length === 36, 'hole cards not removed from the deck: ' + s.mainDeck.length);
  const seen = new Set(hands.flat().concat(s.mainDeck).map(c => c.suit + c.rank));
  console.assert(seen.size === 44, 'a card was duplicated or lost in the deal');

  const hidden = hands.slice(1).flat();
  const p = odds({ ...s, hidden }, 800);
  console.assert(Math.abs(SUITS.reduce((a, x) => a + p[x], 0) - 1) < 1e-9, 'hole-card odds do not sum to 1');
}

// Two dead cards in one suit have to cost that suit -- that is the whole reason hole
// cards are private information and not decoration.
{
  const base = newRaceState();
  base.mainDeck = base.mainDeck.filter(c => !(c.suit === 'H' && (c.rank === '2' || c.rank === '3')));
  const dead = odds({ ...base, hidden: [] }, 4000);          // the observer knows they're gone
  const blind = odds({ ...base, hidden: [{ suit: 'H', rank: '2' }, { suit: 'H', rank: '3' }] }, 4000);
  console.assert(dead.H < blind.H - 0.01, `dead Hearts not priced in: ${dead.H} vs ${blind.H}`);
}

// ---------- folded Kings keep racing but can't win ----------
// Only a suit still in `contenders` can end the race. A folded King parks on the finish
// row, still clears rows for the bonus cards, and the race runs on without it.
{
  const s = newRaceState();
  s.contenders = ['H'];
  s.mainDeck = [...Array(7)].map(() => ({ suit: 'S', rank: '2' }))   // Spades walks home
    .concat([...Array(7)].map(() => ({ suit: 'H', rank: '3' })));
  const ev = [];
  while (!s.winner && s.deckIdx < s.mainDeck.length) ev.push(...stepRace(s));
  console.assert(s.winner === 'H', 'a folded King ended the race: ' + s.winner);
  console.assert(s.kingPos.S === 0, 'the folded King should have parked on the finish row');
  console.assert(ev.some(e => e.type === 'home' && e.suit === 'S'), 'no home event for the parked King');
  console.assert(ev.filter(e => e.type === 'win').length === 1, 'more than one win event');
}

// A photo finish also has to skip the folded riders.
{
  const s = newRaceState();
  s.contenders = ['D', 'C'];
  Object.assign(s.kingPos, { S: 1, D: 4, C: 6, H: 2 });
  s.mainDeck = [];
  const ev = stepRace(s);
  console.assert(s.winner === 'D', 'photo finish paid a folded rider: ' + s.winner);
  console.assert(ev.at(-1).photoFinish === true, 'no photo finish on an empty deck');
}

// Folding also has to move the odds: a King out of the pot wins it 0% of the time.
{
  const s = newRaceState();
  s.contenders = ['S', 'D'];
  const p = odds(s, 600);
  console.assert(p.C === 0 && p.H === 0, 'folded Kings still show a win chance');
  console.assert(Math.abs(p.S + p.D - 1) < 1e-9, 'contender odds do not sum to 1');
}

// rankSuits: furthest up first, earliest arrival breaks a tie.
{
  const s = newRaceState();
  Object.assign(s.kingPos, { S: 3, D: 1, C: 1, H: 5 });
  Object.assign(s.arrival, { S: 1, D: 9, C: 4, H: 2 });
  console.assert(rankSuits(s).join('') === 'CDSH', 'rankSuits is wrong: ' + rankSuits(s).join(''));
}

// ---------- bets.js fixed-limit betting ----------
const { ANTE, BUYIN, SMALL, CAP, SEATS, restake, openPot, newRound, actor, legal, act, aiAction, awardPot }
  = require('./bets.js');

const newPurse = (stack = BUYIN) => ({ carry: 0, ...Object.fromEntries(SEATS.map(s => [s, stack])) });
const total = (purse, pot = 0) => SEATS.reduce((a, s) => a + purse[s], 0) + purse.carry + pot;

// Chips are conserved from ante to payout, whoever takes it.
for (const winner of [...SEATS, null]) {
  const purse = newPurse();
  purse.carry = 30;
  const before = total(purse);
  const pot = openPot(purse);
  console.assert(pot === 30 + 4 * ANTE, 'pot is wrong: ' + pot);
  console.assert(purse.carry === 0, 'carry not swept into the pot');
  console.assert(total(purse, pot) === before, 'chips vanished at the ante');
  awardPot(purse, pot, winner);
  console.assert(total(purse) === before, 'chips vanished at payout');
}

// Nobody left in leaves the pot riding, not refunded.
{
  const purse = newPurse();
  awardPot(purse, 40, null);
  console.assert(purse.carry === 40, 'unclaimed pot did not ride over');
}

// AI seats are re-staked at the buy-in; the human seat is left broke, which is what
// game.js reads as "you lose".
{
  const purse = newPurse();
  purse.a2 = 0;
  purse.you = 0;
  restake(purse);
  console.assert(purse.a2 === BUYIN, 'busted AI seat not re-staked');
  console.assert(purse.you === 0, 'busted human seat was silently re-staked');
}

// Small bet on streets 1-2, big bet on 3-4.
{
  const purse = newPurse();
  console.assert(newRound(purse, SEATS, 2, 0).size === SMALL, 'street 2 is not the small bet');
  console.assert(newRound(purse, SEATS, 3, 0).size === 2 * SMALL, 'street 3 is not the big bet');
}

// The raise cap holds, and a called bet ends the round with everyone level.
{
  const purse = newPurse();
  const r = newRound(purse, SEATS, 1, 20);
  console.assert(actor(r) === 'you', 'wrong first actor');
  act(purse, r, 'you', 'bet');
  console.assert(actor(r) === 'a1', 'a bet did not pass the action on');
  act(purse, r, 'a1', 'raise');
  act(purse, r, 'a2', 'raise');
  console.assert(!legal(r, purse, 'a3').includes('raise'), 'raise cap not enforced after 3 raises');
  ['a3', 'you', 'a1'].forEach(s => act(purse, r, s, 'call'));
  console.assert(actor(r) === null, 'round did not close once everyone had called');
  console.assert(SEATS.every(s => r.in[s] === 3 * SMALL), 'seats not level: ' + JSON.stringify(r.in));
  console.assert(r.pot === 20 + 4 * 3 * SMALL, 'pot did not collect the bets: ' + r.pot);
}

// Folding drops you from the round, and the last seat standing ends it.
{
  const purse = newPurse();
  const r = newRound(purse, SEATS, 1, 20);
  act(purse, r, 'you', 'bet');
  ['a1', 'a2', 'a3'].forEach(s => act(purse, r, s, 'fold'));
  console.assert(actor(r) === null && r.live.join() === 'you', 'all-but-one fold did not end the round');
}

// ponytail's no-side-pots clamp: a short stack shrinks the limit so a capped street
// can never outrun it. Fuzz it -- no seat may ever go negative, and chips are conserved.
for (let i = 0; i < 3000; i++) {
  const purse = newPurse(5 + ((Math.random() * 200) | 0));
  const before = total(purse);
  const r = newRound(purse, SEATS, 1 + ((Math.random() * 4) | 0), 20);
  let guard = 0;
  for (let seat; (seat = actor(r));) {
    const opts = legal(r, purse, seat);
    act(purse, r, seat, opts[(Math.random() * opts.length) | 0]);
    console.assert(++guard < 100, 'betting round did not terminate');
  }
  console.assert(SEATS.every(s => purse[s] >= 0), 'a seat went negative: ' + JSON.stringify(purse));
  console.assert(total(purse, r.pot - 20) === before, 'chips leaked in a betting round');
  console.assert(r.live.length === 1 || r.live.every(s => r.in[s] === r.bet), 'round closed unmatched');
}

// The AI prices the pot: a lock raises, a dead hand folds, and it never bluffs when
// bluffing isn't an option.
{
  const purse = newPurse();
  const r = newRound(purse, SEATS, 1, 100);
  act(purse, r, 'you', 'bet');
  const many = (p, seat) => Array.from({ length: 400 }, () => aiAction(p, r, purse, seat));
  console.assert(many(0.99, 'a1').every(a => a === 'raise'), 'a lock did not raise');
  const weak = many(0.0, 'a1');
  console.assert(weak.every(a => a === 'fold' || a === 'raise'), 'weak hand did something odd');
  const bluffs = weak.filter(a => a === 'raise').length / weak.length;
  console.assert(bluffs > 0.03 && bluffs < 0.2, 'bluff frequency is off: ' + bluffs);
  // No raise left: a hand priced in has to call, a hopeless one has to fold.
  const capped = newRound(purse, SEATS, 1, 100);
  act(purse, capped, 'you', 'bet');
  act(purse, capped, 'a1', 'raise');
  act(purse, capped, 'a2', 'raise');
  act(purse, capped, 'a3', 'raise');
  console.assert(aiAction(0.99, capped, purse, 'you') === 'call', 'capped street: lock did not call');
  console.assert(aiAction(0.0, capped, purse, 'you') === 'fold', 'capped street: dead hand did not fold');
}

// ---------- a whole hand, end to end ----------
// Four AI seats, hole cards, all four streets, settled on the finish. This is the money
// path: chips must be conserved across a full race and the pot must always find an owner.
{
  const STREET_AT = [0, 2, 4, 6];          // revealed-row count that opens streets 1..4
  const suitOf = Object.fromEntries(SEATS.map((s, i) => [s, SUITS[i]]));
  const seatOf = Object.fromEntries(SEATS.map((s, i) => [SUITS[i], s]));

  for (let hand = 0; hand < 200; hand++) {
    const purse = newPurse(BUYIN);
    const before = total(purse);
    const race = newRaceState();
    const holes = {};
    dealHoles(race, SEATS.length).forEach((h, i) => { holes[SEATS[i]] = h; });
    const view = seat => ({ ...race, hidden: SEATS.filter(s => s !== seat).flatMap(s => holes[s]) });

    let live = [...SEATS];
    let pot = openPot(purse);
    const betRound = street => {
      if (live.length < 2) return;
      const r = newRound(purse, live, street, pot);
      if (!r.size) return;
      let guard = 0;
      for (let seat; (seat = actor(r));) {
        const p = odds(view(seat), 60)[suitOf[seat]];
        act(purse, r, seat, aiAction(p, r, purse, seat));
        console.assert(++guard < 100, 'betting round did not terminate in a real hand');
      }
      live = r.live;
      race.contenders = live.map(s => suitOf[s]);
      pot = r.pot;
    };

    betRound(1);
    for (let street = 1; street < 4 && !race.winner; ) {
      stepRace(race);
      if (race.revealed.size >= STREET_AT[street]) betRound(++street);
    }
    while (!race.winner) stepRace(race);

    // Only a King still in the pot can win, so the race winner is always someone to pay.
    const winner = seatOf[race.winner];
    awardPot(purse, pot, winner);
    console.assert(live.includes(winner), 'the pot went to a rider who had folded');
    console.assert(total(purse) === before, `chips leaked over a full hand: ${total(purse)} vs ${before}`);
    console.assert(SEATS.every(x => purse[x] >= 0), 'a seat went negative over a full hand');
  }
}

console.log('ok');

// odds-worker.js posts the live race state across a structured clone (`revealed` is a
// Set). If that stops surviving the trip, the odds panel silently breaks.
{
  const s = newRaceState();
  for (let i = 0; i < 6; i++) stepRace(s);
  const p = odds(structuredClone(s), 200);
  const total = SUITS.reduce((a, x) => a + p[x], 0);
  console.assert(Math.abs(total - 1) < 1e-9, `cloned state odds sum to ${total}`);
  console.assert(SUITS.every(x => p[x] >= 0 && p[x] <= 1), 'cloned state gave a bad probability');
}
