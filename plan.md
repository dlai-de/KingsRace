# Plan: Poker Betting for The Kings' Race

## The one problem that decides the whole design

The race is **fully public**. Every King's position is visible, the deck order is fixed at
shuffle, nobody knows anything anyone else doesn't. Poker betting on public information
degenerates instantly: whoever's ahead bets, everyone else folds. No bluffs, no reads, no game.

So this plan is not "add a pot" — it's **add private information first**, then the pot has
something to price.

## The mechanic: hole cards are dead cards

Before the countdown, deal each seat **2 cards off `mainDeck`**, held privately,
**never drawn during the race**.

That single rule does everything Hold'em's hole cards do:

- It's genuinely private — only you see them.
- It **changes the real odds**: holding ♠5 ♠9 means Spades has 2 fewer advances left in the
  deck. The Spades King is measurably slower, and only you know it.
- It maps 1:1 onto poker's shape: private cards + a public board (the Aces/Jokers flipping in
  column 5) + streets.
- Bluffing is real: you bet hard on Hearts; are you holding two Hearts (bad for Hearts — you're
  bluffing) or two Clubs (Clubs is dead — you're value-betting)?

Card counting becomes hand reading. That's the game.

## Structure — fixed-limit, not no-limit

| | |
|---|---|
| **Streets (4)** | Keyed to `revealed.size` (`game.js:238`): pre-race (0 flipped), then at 2, 4, 6 flipped. Guaranteed monotonic, and exactly 2 public bonus cards drop between rounds. |
| **Limits** | Small bet on streets 1–2, big bet (2×) on streets 3–4, **cap 3 raises**. |
| **Actions** | check / bet / call / raise / fold. |
| **No side pots, ever** | Clamp any bet to the shortest live stack. |
| **Folding** | You're out of the pot; your King keeps racing (it still clears rows) but can no longer win — it parks on the finish row and the race runs on. |
| **Showdown** | Race finish. Only a King still in the pot can end the race, so the winner is always someone who paid to be there. All-but-one folds → the race fast-forwards to the finish for the reveal. |

Fixed-limit over no-limit deliberately: it kills side pots, all-in math, and stack-size
balancing — three subsystems you don't have to write. It's also the structure that survives a
bad odds model, because a mispriced bet costs one increment, not the stack.

**Vs-Computer mode change:** the computer plays **all three** other Kings as three separate
AI bettors. Before Phase 3 two Kings were unclaimed — with unclaimed Kings, ~50% of pots have no owner and
end in an awkward refund. Three AI seats cost nothing once the odds engine exists, and give you a
real 4-handed table.

## The enabling refactor (do this first, it's most of the work)

Right now race logic and animation are welded together — `advanceKing` (`game.js:223`),
`checkCheckpoints` (`:233`) and `gameLoop` (`:259`) are `async` and interleave `sleep()` calls
with state mutation. Nothing can simulate the race without watching it.

Split into:

- **`race.js`** — pure: `newRaceState()`, `stepRace(state)` → returns an events array
  (`{type:'draw'|'advance'|'reveal'|'joker'|'win', …}`). No DOM, no sleeps.
- **`game.js`** — renders that event array with the existing sleeps and CSS.

One source of truth for the rules, and `test.js` gets something worth testing.

Then the payoff: **Monte Carlo odds.** Run `stepRace` ~2000× from the current state (your hole
cards removed, everyone else's and the unflipped bonus cards randomized over what's unseen) →
live win% per King, in a few ms. The same function feeds:

- the human's optional **Handicapper** display (win% on each rider label),
- every AI's decision.

**AI, ~20 lines:** call when `p > cost / (pot + cost)`, raise when `p > 1.5 × breakeven`, bluff at
a fixed ~10% frequency so it isn't a readable machine. No heuristics table, no tuning spreadsheet.

## Bug you'll hit on the way

`gameLoop` (`game.js:260`) runs `while (deckIdx < mainDeck.length)` — if the deck runs out with no
King home, it exits silently and the victory screen never appears. Today that's rare; removing 8
cards for hole cards makes it likelier. Fix: reshuffle the discard, or declare a **photo finish**
(furthest King wins, tie → the one that got there first).

## Phasing — every phase ships on its own

| Phase | What | Ships? |
|---|---|---|
| **0** | Extract `race.js`; fix deck exhaustion | ✅ Done — invisible, but real test coverage |
| **1** | Monte Carlo + Handicapper win% toggle | ✅ Done |
| **2** | Bankroll (`localStorage`, 100 chips), ante, single pre-race bet, no streets | ✅ Done — `bets.js`; unclaimed pot rides over |
| **3** | Hole cards + 4 streets + fixed-limit actions + 3 AI seats | ✅ Done — the real thing |
| **4** | Friends hot-seat, bust-out tournament | Later |

**Friends mode:** private hole cards on one shared screen need pass-the-device peek gates — real
friction, real UI. Keep poker betting **vs-Computer only** through Phase 3. Friends mode gets a
simple pre-race pool (public info, everyone picks and bets before the gates) which needs none of it.

## UI, reusing what's there

Betting bar in the deck panel: pot, your stack, action buttons. Hole cards fanned bottom-left.
Win% chip on the rider labels. Betting rounds reuse `pauseGame(false)` — the rules panel already
pauses this way, so the plumbing exists. `cardInnerHTML`, `.pc-front`, `.flip-container`,
`.paused-overlay` cover every new element; **no new card CSS**.

## Considered and rejected

**Pari-mutuel / Camel Up-style descending payouts** (first to bet a camel gets the best ticket) is
an excellent mechanic and needs no hidden information — but it isn't poker, and it rewards speed
over reading. Good candidate for a Phase 4 *side pool* running alongside the pot, not as the main
system.

**Pacing risk:** the race is ~40s of animation; four pauses could kill it. Betting rounds are two
clicks, and the draw speed increases between rounds to compensate.

## Out of scope

No-limit, side pots, multi-race tournaments, online play. Add when a local 4-handed table is
actually fun.

## References

- [Horse Race card game rules (Pagat)](https://www.pagat.com/race/horse_race.html)
- [Horserace drinking game (Wikipedia)](https://en.wikipedia.org/wiki/Horserace_(drinking_game))
- [Poker betting structures (Pokerology)](https://www.pokerology.com/poker/strategy/betting-variations/)
- [Fixed-limit (Poker Wiki)](https://poker.fandom.com/wiki/Fixed-limit)
- [Camel Up, 2nd Edition (BoardGameGeek)](https://boardgamegeek.com/boardgame/260605/camel-up-second-edition)
- [Long Shot: The Dice Game (BoardGameGeek)](https://boardgamegeek.com/boardgame/295374/long-shot-the-dice-game)
- [Winner's Circle — hidden bets variant](https://gamesnightguru.com/game/winners-circle/)
