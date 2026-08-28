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

  // A later street deals mid-race: the cards already played stay played, and the next
  // card off the deck is still the one that was next before the deal.
  stepRace(s); stepRace(s);
  const next = s.mainDeck[s.deckIdx + 4];
  const later = dealHoles(s, 4, 1);
  console.assert(s.deckIdx === 2 && s.mainDeck.length === 32, 'street deal cut the wrong end of the deck');
  console.assert(s.mainDeck[s.deckIdx] === next, 'street deal skipped cards from the race');
  console.assert(new Set(hands.flat().concat(later.flat(), s.mainDeck)).size === 44,
    'a card was duplicated or lost by a street deal');
  s.deckIdx = s.mainDeck.length - 3;   // three cards left, four seats on one each: nobody gets one
  console.assert(dealHoles(s, 4, 1).every(h => h.length === 0), 'a short deck dealt some seats and not others');
  console.assert(s.mainDeck.length === 32, 'a short deck was dealt from anyway');

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
const { BUYIN, BLINDS, LEVEL_MS, bigBlind, levelLeft, CAP, SEATS, STAKE, loadPurse, purseBlob, alive, openPot, newRound, actor, legal, act, aiAction, awardPot }
  = require('./bets.js');

const BB = BLINDS[0], SB = BB / 2;
const newPurse = (stack = BUYIN) => ({ carry: 0, ms: 0, bb: BB, ...Object.fromEntries(SEATS.map(s => [s, stack])) });
const total = (purse, pot = 0) => SEATS.reduce((a, s) => a + purse[s], 0) + purse.carry + pot;

// A fresh table stakes all four seats identically, and a stored purse comes back whole
// or not at all -- a blob that is missing a seat, or that no longer adds up to the stake,
// must not put three seats on their old stacks and one on a full buy-in.
{
  const fresh = loadPurse(null);
  console.assert(new Set(SEATS.map(s => fresh[s])).size === 1, 'seats did not start level');
  console.assert(total(fresh) === STAKE, 'a fresh table is not staked at ' + STAKE);

  const mid = { ...fresh, you: 40, a1: 120, a2: 100, a3: 100, carry: 40, hand: 7 };
  console.assert(total(loadPurse(mid)) === STAKE && loadPurse(mid).hand === 7, 'a good purse did not restore');

  // The shapes that used to leak through: an older two-seat blob, and a tampered total.
  [{ you: 40, ai: 160, carry: 0 }, { ...mid, a1: 999 }, { ...mid, you: -5 }, { ...mid, you: 40.5 }, 'junk', null]
    .forEach(bad => {
      const p = loadPurse(bad);
      console.assert(new Set(SEATS.map(s => p[s])).size === 1 && total(p) === STAKE,
        'a bad purse opened the table unequal: ' + JSON.stringify(bad));
    });
}

// Chips are conserved from blinds to payout, whoever takes it.
for (const winner of [...SEATS, null]) {
  const purse = newPurse();
  purse.carry = 30;
  const before = total(purse);
  const { pot, blinds } = openPot(purse, SEATS, 0);
  console.assert(pot === 30 + SB + BB, 'pot is wrong: ' + pot);
  // Only two seats pay, and they are the two on the button's left, in that order.
  console.assert(blinds.a1 === SB && blinds.a2 === BB && Object.keys(blinds).length === 2,
    'wrong blinds posted: ' + JSON.stringify(blinds));
  console.assert(purse.you === BUYIN && purse.a3 === BUYIN, 'a seat paid a blind it did not owe');
  console.assert(purse.carry === 0, 'carry not swept into the pot');
  console.assert(total(purse, pot) === before, 'chips vanished at the blinds');
  awardPot(purse, pot, winner ? [winner] : [], blinds);
  console.assert(total(purse) === before, 'chips vanished at payout');
}

// Close the tab mid-hand and that hand never happened: only a boundary purse is ever
// stored, so the seats come back on the stacks they sat down with and the blind clock
// carries on. Storing the live purse instead is not restorable at all -- the stacks are
// down, the pot is in flight, the total no longer matches the stake, and loadPurse wipes
// the run back to fresh buy-ins.
{
  const boundary = { ...newPurse(), hand: 3 };
  const live = { ...boundary, ms: 5 * LEVEL_MS };
  const { pot, blinds } = openPot(live, SEATS, live.hand);
  const r = newRound(live, SEATS, 1, pot, live.hand, blinds);
  act(live, r, actor(r), 'raise', 40);            // mid-street: chips out, pot still in flight

  const back = loadPurse(purseBlob(boundary, live));
  console.assert(total(back) === STAKE, 'a boundary save did not restore the table');
  console.assert(SEATS.every(s => back[s] === boundary[s]), 'an abandoned hand still cost chips');
  console.assert(back.ms === live.ms && back.hand === live.hand, 'the blind clock did not survive the close');

  const wiped = loadPurse({ ...live });
  console.assert(wiped.you === BUYIN && total(wiped) === STAKE,
    'a mid-street blob was accepted as a real purse');
}

// Nobody left in leaves the pot riding, not refunded.
{
  const purse = newPurse();
  awardPot(purse, 40);
  console.assert(purse.carry === 40, 'unclaimed pot did not ride over');
}

// Nobody is re-staked: a seat that cannot cover the big blind is out, human or AI, and
// the blinds skip it. This is what game.js reads as elimination.
{
  const purse = newPurse();
  purse.a2 = 0;
  purse.a3 = BB - 1;
  console.assert(alive(purse).join() === 'you,a1', 'wrong seats survived: ' + alive(purse));
  const seats = alive(purse);
  const before = total(purse);
  const { pot } = openPot(purse, seats, 0);
  console.assert(pot === SB + BB, 'a short table posted for the dead seats: ' + pot);
  console.assert(purse.a2 === 0 && purse.a3 === BB - 1, 'an eliminated seat was made to post');
  console.assert(total(purse, pot) === before, 'chips vanished at a short-table blind');
}

// ---------- the blind timer ----------
// The level is what makes a stack run out of time as well as out of chips: the ladder
// climbs on real playing time, tops out, and drags the survival threshold up with it.
{
  console.assert(bigBlind(0) === BLINDS[0], 'a fresh clock is not on the first level');
  console.assert(bigBlind(LEVEL_MS - 1) === BLINDS[0], 'the blinds went up early');
  console.assert(bigBlind(LEVEL_MS) === BLINDS[1], 'the blinds did not go up on time');
  console.assert(bigBlind(999 * LEVEL_MS) === BLINDS.at(-1), 'the ladder did not top out');
  console.assert(levelLeft(LEVEL_MS * 1.5) === LEVEL_MS / 2, 'wrong time to the next level');
  console.assert(levelLeft(999 * LEVEL_MS) === Infinity, 'a topped-out ladder still counts down');

  // A stack that sits out a level can be blinded off the table without losing a hand.
  const purse = newPurse(BLINDS[0]);
  purse.a1 = BUYIN;
  console.assert(alive(purse).length === SEATS.length, 'a full big blind could not sit down');
  purse.ms = LEVEL_MS;
  console.assert(alive(purse).join() === 'a1', 'the rising blinds did not empty the table');

  // The level is frozen for the whole hand: the clock ticking over mid-race must not
  // move the stakes under a street that is already being bet.
  const deep = newPurse();
  openPot(deep, SEATS, 0);
  const bb = deep.bb;
  deep.ms += 9 * LEVEL_MS;
  console.assert(newRound(deep, SEATS, 1, 0).bb === bb, 'the blinds moved mid-hand');
}

// ---------- fold on the entry street ----------
// The blinds put a live bet up before a card is drawn, so the first seat to speak can
// give the hand up. Under the old ante everyone was level and street 1 checked around.
{
  const purse = newPurse();
  const { pot, blinds } = openPot(purse, SEATS, 0);
  const r = newRound(purse, SEATS, 1, pot, 0, blinds);
  const first = actor(r);
  console.assert(first === 'a3', 'the entry street did not open left of the big blind: ' + first);
  console.assert(legal(r, purse, first).includes('fold'), 'cannot fold on the entry street');
  console.assert(r.bet === BB && r.in.a1 === SB && r.in.a2 === BB, 'the blinds are not a live bet');

  // The big blind still has its option once the bets come back level -- and its only
  // aggressive move is a raise of its own blind, never a fresh bet on top of it.
  act(purse, r, 'a3', 'call');
  act(purse, r, 'you', 'call');
  act(purse, r, 'a1', 'call');
  console.assert(actor(r) === 'a2', 'the big blind was skipped: ' + actor(r));
  console.assert(legal(r, purse, 'a2').join() === 'check,raise', 'wrong big-blind option: ' + legal(r, purse, 'a2'));
  act(purse, r, 'a2', 'check');
  console.assert(actor(r) === null, 'a checked option did not close the street');
  console.assert(SEATS.every(s => r.in[s] === BB), 'seats not level after the entry street');
}

// Everyone folding to the big blind hands it the pot without a card drawn.
{
  const purse = newPurse();
  const { pot, blinds } = openPot(purse, SEATS, 0);
  const r = newRound(purse, SEATS, 1, pot, 0, blinds);
  ['a3', 'you', 'a1'].forEach(s => act(purse, r, s, 'fold'));
  console.assert(actor(r) === null && r.live.join() === 'a2', 'a walk did not end the street');
  console.assert(r.pot === SB + BB, 'a walk collected the wrong pot: ' + r.pot);
}

// Short stacks play scared: the same hand and the same price, but a seat one blind from
// elimination folds what a deep stack calls, and bluffs less doing it.
{
  const purse = newPurse();
  purse.a1 = BB;                             // one big blind from the rail
  const r = newRound(purse, SEATS, 1, 100);
  act(purse, r, 'you', 'bet');
  const cost = r.bet - r.in.a1;
  const breakeven = cost / (r.pot + cost);
  const marginal = 1.2 * breakeven;          // a call for a deep stack, a fold for a short one
  // Bluffing off here -- this is about fear, and the bluff rate gets its own check below.
  console.assert(aiAction(marginal, r, purse, 'a2', 0) === 'call', 'deep stack did not call a priced-in hand');
  console.assert(aiAction(marginal, r, purse, 'a1', 0) === 'fold', 'short stack called off its last chips');
  // A lock is still a lock -- fear tightens the threshold, it does not freeze the seat.
  console.assert(aiAction(0.99, r, purse, 'a1') !== 'fold', 'short stack folded a lock');
  const rate = seat => Array.from({ length: 600 }, () => aiAction(0.0, r, purse, seat))
    .filter(a => a === 'raise').length / 600;
  console.assert(rate('a1') < rate('a2'), 'short stack bluffed as freely as a deep one');
}

// Small bet on streets 1-2, big bet on 3-4 -- and both scale with the blind level.
{
  const purse = newPurse();
  console.assert(newRound(purse, SEATS, 2, 0).size === BB, 'street 2 is not the small bet');
  console.assert(newRound(purse, SEATS, 3, 0).size === 2 * BB, 'street 3 is not the big bet');
  const deep = newPurse(BLINDS.at(-1) * (CAP + 2));   // deep enough that the clamp is not what bites
  deep.bb = BLINDS[2];
  console.assert(newRound(deep, SEATS, 2, 0).size === BLINDS[2], 'the bet did not follow the blinds up');
}

// The raise cap is a bet plus CAP raises, and a called bet ends the round level.
{
  const purse = newPurse();
  const r = newRound(purse, SEATS, 1, 20, 0);
  console.assert(actor(r) === 'a1', 'wrong first actor');
  act(purse, r, 'a1', 'bet');
  console.assert(actor(r) === 'a2', 'a bet did not pass the action on');
  act(purse, r, 'a2', 'raise');
  act(purse, r, 'a3', 'raise');
  console.assert(legal(r, purse, 'you').includes('raise'), 'raise cap bit one raise early');
  act(purse, r, 'you', 'raise');
  console.assert(!legal(r, purse, 'a1').includes('raise'), 'raise cap not enforced after CAP raises');
  ['a1', 'a2', 'a3'].forEach(s => act(purse, r, s, 'call'));
  console.assert(actor(r) === null, 'round did not close once everyone had called');
  console.assert(SEATS.every(s => r.in[s] === (CAP + 1) * BB), 'seats not level: ' + JSON.stringify(r.in));
  console.assert(r.pot === 20 + 4 * (CAP + 1) * BB, 'pot did not collect the bets: ' + r.pot);
}

// The button moves every hand, so no seat is stuck acting first -- and it stays put for
// the whole hand, so a fold mid-street cannot hand the next street to someone else.
{
  const purse = newPurse();
  const first = n => newRound(purse, SEATS, 1, 20, n).order[0];
  console.assert(new Set(SEATS.map((_, i) => first(i))).size === SEATS.length,
    'the button does not visit every seat');
  const r = newRound(purse, SEATS, 1, 20, 0);
  act(purse, r, 'a1', 'fold');
  console.assert(newRound(purse, r.live, 2, r.pot, 0).order[0] === 'a2',
    'a fold reshuffled the order instead of skipping the folder');
}

// You pick the size, the table keeps the ceiling: a chosen bet is taken as-is inside
// [size, cap], and cap is exactly where a fully capped fixed-limit street already ended.
{
  const purse = newPurse();
  const r = newRound(purse, SEATS, 1, 0, 0);
  console.assert(r.cap === (CAP + 1) * r.size, 'the street cap moved off the fixed-limit ceiling');
  act(purse, r, 'a1', 'bet', r.size + 3);          // a size of your own, not a multiple of anything
  console.assert(r.bet === r.size + 3, 'a chosen bet was not taken: ' + r.bet);
  act(purse, r, 'a2', 'raise', 999);               // sliding past the cap does not get you past it
  console.assert(r.bet === r.cap, 'a raise ran past the street cap: ' + r.bet);
  console.assert(purse.a2 === BUYIN - r.cap, 'the raiser paid the wrong amount: ' + purse.a2);
  console.assert(!legal(r, purse, 'a3').includes('raise'), 'a capped street still offered a raise');

  // Under the minimum is floored to one small bet, so the AI and every default caller
  // still play plain fixed limit.
  const r2 = newRound(purse, SEATS, 1, 0, 0);
  act(purse, r2, 'a1', 'bet', 1);
  console.assert(r2.bet === r2.size, 'a bet under the minimum was allowed: ' + r2.bet);
  const r3 = newRound(purse, SEATS, 1, 0, 0);
  act(purse, r3, 'a1', 'bet');
  console.assert(r3.bet === r3.size, 'the default bet is no longer one small bet');

  // The blinds are already a bet, so the entry street is capped a blind higher up.
  const blinded = newPurse();
  const { pot, blinds } = openPot(blinded, SEATS, 0);
  const pre = newRound(blinded, SEATS, 1, pot, 0, blinds);
  console.assert(pre.cap === BB + CAP * pre.size, 'the blind street cap is wrong: ' + pre.cap);
}

// ---------- all in ----------
// Calling for less than the bet puts the last chips in and leaves the seat in the hand:
// it just stops being asked to act, and the bettor's excess goes unmatched.
{
  const purse = newPurse();
  purse.a2 = 5;
  const r = newRound(purse, SEATS, 3, 0, 0);          // big-bet street: 2 * BB to call
  act(purse, r, 'a1', 'bet');
  const m = act(purse, r, 'a2', 'call');
  console.assert(m.amount === 5 && m.allin && purse.a2 === 0, 'an all-in call paid the wrong amount: ' + m.amount);
  console.assert(r.live.includes('a2'), 'an all-in seat was dropped from the hand');
  console.assert(!legal(r, purse, 'a2').length || !r.pending.has('a2'), 'an all-in seat was asked to act again');
  ['a3', 'you'].forEach(x => act(purse, r, x, 'fold'));
  console.assert(actor(r) === null, 'the street did not close with a seat all in');
  console.assert(r.in.a2 < r.bet, 'the all-in call was somehow matched in full');
  // Nothing left to bet for: one seat with chips cannot bet into a seat that has none.
  const next = newRound(purse, r.live, 4, r.pot, 0);
  console.assert(actor(next) === null, 'a lone seat with chips got to bet into a dry pot');
  console.assert(!legal(next, purse, 'a1').includes('bet'), 'a dry pot was still bettable');
}

// ...but a bet already standing still has to be covered, even by the only seat with
// chips left: a blind posted by a seat that is all in on it is a live bet.
{
  const purse = newPurse();
  purse.a2 = BB;                                       // covers the big blind and nothing more
  const seats = ['a1', 'a2'];
  const { pot, blinds } = openPot(purse, seats, 0);
  console.assert(purse.a2 === 0 && blinds.a2 === BB, 'the short seat did not post all in');
  const r = newRound(purse, seats, 1, pot, 0, blinds);
  console.assert(actor(r) === 'a1', 'the seat owing the blind was not asked to cover it');
  console.assert(legal(r, purse, 'a1').join() === 'fold,call', 'wrong options against a dead pot: ' + legal(r, purse, 'a1'));
  act(purse, r, 'a1', 'call');
  console.assert(actor(r) === null && r.in.a1 === BB, 'covering the blind did not close the street');
}

// Side pots: a seat wins from each opponent only as much as it staked itself, and what
// it cannot cover slides to the rider that came in behind it.
{
  const purse = newPurse(0);
  const paid = { you: 20, a1: 100, a2: 100, a3: 40 };   // a3 folded after putting 40 in
  awardPot(purse, 260, ['you', 'a1', 'a2'], paid);      // you shoved 20 and won the race
  console.assert(purse.you === 80, 'the all-in seat did not win exactly its own layer: ' + purse.you);
  console.assert(purse.a1 === 180, 'the side pot did not go to the runner-up: ' + purse.a1);
  console.assert(purse.a2 === 0 && purse.carry === 0, 'the pot paid out past the side pot');
  console.assert(total(purse) === 260, 'chips leaked over a side pot');
  // Dead money nobody staked this hand goes with the first layer paid out.
  const rich = newPurse(0);
  awardPot(rich, 290, ['you', 'a1', 'a2'], paid);
  console.assert(rich.you === 110 && total(rich) === 290, 'carried-over dead money went missing');
}

// A raise is never smaller than the raise it answers -- the slider must not let a
// 20-chip bet be re-raised by 10.
{
  const purse = newPurse(500);
  const r = newRound(purse, SEATS, 1, 0, 0);
  act(purse, r, 'a1', 'bet', 2 * BB);
  console.assert(r.min === 2 * BB, 'the minimum raise did not follow the bet: ' + r.min);
  act(purse, r, 'a2', 'raise', BB);                    // asking for less than the bet
  console.assert(r.bet === 4 * BB, 'a re-raise came in under the bet it answered: ' + r.bet);
  console.assert(!legal(r, purse, 'a3').includes('raise'), 'the street cap did not hold at the bigger minimum');
}

// A short stack cannot make a raise it has no chips behind -- it calls all in instead.
{
  const purse = newPurse();
  purse.a2 = 3 * BB;
  const r = newRound(purse, SEATS, 1, 0, 0);
  act(purse, r, 'a1', 'bet', 2 * BB);
  console.assert(legal(r, purse, 'a2').join() === 'fold,call', 'a stack short of a full raise was offered one');
}

// Folding drops you from the round, and the last seat standing ends it.
{
  const purse = newPurse();
  const r = newRound(purse, SEATS, 1, 20);
  act(purse, r, 'a1', 'bet');
  ['a2', 'a3', 'you'].forEach(s => act(purse, r, s, 'fold'));
  console.assert(actor(r) === null && r.live.join() === 'a1', 'all-but-one fold did not end the round');
}

// Fuzz the whole street, short stacks included: no seat may ever go negative, chips are
// conserved, the cap holds, and the round closes with everyone either matched or all in.
for (let i = 0; i < 3000; i++) {
  const purse = newPurse(5 + ((Math.random() * 200) | 0));
  const before = total(purse);
  const r = newRound(purse, SEATS, 1 + ((Math.random() * 4) | 0), 20);
  let guard = 0;
  for (let seat; (seat = actor(r));) {
    const opts = legal(r, purse, seat);
    act(purse, r, seat, opts[(Math.random() * opts.length) | 0], (Math.random() * 300) | 0);
    console.assert(r.bet <= r.cap, 'a chosen bet size broke the street cap');
    console.assert(++guard < 100, 'betting round did not terminate');
  }
  console.assert(SEATS.every(s => purse[s] >= 0), 'a seat went negative: ' + JSON.stringify(purse));
  console.assert(total(purse, r.pot - 20) === before, 'chips leaked in a betting round');
  console.assert(r.live.length === 1 || r.live.every(s => r.in[s] === r.bet || purse[s] === 0),
    'round closed with a seat neither matched nor all in');
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
  act(purse, capped, 'a1', 'bet');
  act(purse, capped, 'a2', 'raise');
  act(purse, capped, 'a3', 'raise');
  act(purse, capped, 'you', 'raise');
  // 'a1' opened and got raised over: it is the seat with something left to answer.
  console.assert(aiAction(0.99, capped, purse, 'a1') === 'call', 'capped street: lock did not call');
  console.assert(aiAction(0.0, capped, purse, 'a1') === 'fold', 'capped street: dead hand did not fold');
}

// ---------- a whole run, end to end ----------
// Four AI seats playing hands until one of them owns the table. This is the money path:
// chips are conserved across every hand, the pot always finds an owner, and the table
// only ever shrinks -- nobody is re-staked back into a run that already dropped them.
{
  const streetsRun = {};
  const suitOf = Object.fromEntries(SEATS.map((s, i) => [s, SUITS[i]]));
  const seatOf = Object.fromEntries(SEATS.map((s, i) => [SUITS[i], s]));

  for (let run = 0; run < 20; run++) {
    const purse = newPurse(BUYIN);
    const before = total(purse);
    let hands = 0, seatedCount = SEATS.length;

    for (let seated; (seated = alive(purse)).length > 1;) {
      console.assert(seated.length <= seatedCount, 'an eliminated seat came back: ' + seated);
      seatedCount = seated.length;
      console.assert(++hands < 4000, 'a run never reached a single winner');

      const race = newRaceState();
      const holes = Object.fromEntries(seated.map(s => [s, []]));
      let betView = null;   // the board before the pending bonus card, mirrors game.js
      const view = seat => ({ ...(betView || race), hidden: seated.filter(s => s !== seat).flatMap(s => holes[s]) });

      let live = [...seated];
      const handStart = { ...purse };
      const { pot: opened, blinds } = openPot(purse, seated, hands);
      let pot = opened;
      race.contenders = live.map(s => suitOf[s]);
      const betRound = (street, posted = {}) => {
        if (live.length < 2) return;
        dealHoles(race, live.length, street === 1 ? 2 : 1).forEach((h, i) => holes[live[i]].push(...h));
        if (betView) betView.mainDeck = race.mainDeck;   // priced off the shortened deck
        const r = newRound(purse, live, street, pot, hands, posted);
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

      betRound(1, blinds);
      let street = 1;
      while (street < 4 && !race.winner) {          // mirrors gameLoop in game.js
        const preDraw = structuredClone(race);
        for (const e of stepRace(race)) {
          if (e.type !== 'reveal' || street >= 4 || race.winner) continue;   // decided races take no bets
          betView = preDraw;                        // bet before the card is shown
          betRound(++street);
          betView = null;
        }
      }
      streetsRun[street] = (streetsRun[street] || 0) + 1;
      while (!race.winner) stepRace(race);

      // Only a King still in the pot can win, so the race winner is always someone to pay.
      const winner = seatOf[race.winner];
      const paid = Object.fromEntries(SEATS.map(x => [x, handStart[x] - purse[x]]));
      awardPot(purse, pot, rankSuits(race, race.contenders).map(su => seatOf[su]), paid);
      console.assert(live.includes(winner), 'the pot went to a rider who had folded');
      console.assert(total(purse) === before, `chips leaked over a hand: ${total(purse)} vs ${before}`);
      console.assert(SEATS.every(x => purse[x] >= 0), 'a seat went negative over a hand');
      purse.ms += LEVEL_MS / 4;   // the clock runs, so a long run climbs the blind ladder
    }
    console.assert(total(purse) === before, 'chips leaked over a full run');
  }
  // One street per bonus card, so a hand plays as many as the race hands out. Over 20k
  // sims: 89% of races reach street 2, 65% street 3, 36% street 4. What must not happen
  // is a hand stuck on the opening street, or a fifth one past the fixed-limit ladder.
  console.assert(Object.keys(streetsRun).every(k => +k >= 1 && +k <= 4),
    'a hand ran off the four-street ladder: ' + JSON.stringify(streetsRun));
  const past = Object.entries(streetsRun).reduce((a, [k, n]) => a + (+k > 1 ? n : 0), 0);
  console.assert(past > (streetsRun[1] || 0),
    'most hands never got past the opening street: ' + JSON.stringify(streetsRun));
}


// Seat chips must add back up to the stake -- a short stack makes bet sizes that are
// not round fives, and a split that silently loses the remainder would mis-draw them.
{
  const { chipSplit } = require('./bets.js');
  for (let n = 0; n <= 200; n++) {
    const discs = chipSplit(n);
    console.assert(discs.reduce((a, v) => a + v, 0) === n, `chipSplit(${n}) does not sum back`);
    console.assert(discs.every((v, i) => i === 0 || v <= discs[i - 1]), `chipSplit(${n}) not biggest-first`);
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


// Everyone folds: the survivor takes the whole pot, stake or no stake, and nothing is
// carried over to the next hand -- there is no runner-up to hand an overflow to.
{
  const purse = { you: 0, a1: 0, a2: 0, a3: 0, carry: 0 };
  awardPot(purse, 260, ['you'], { you: 260 });   // how game.js pays an uncontested pot
  console.assert(purse.you === 260, `uncontested pot paid ${purse.you}, not 260`);
  console.assert(purse.carry === 0, `uncontested pot left ${purse.carry} behind`);
}
