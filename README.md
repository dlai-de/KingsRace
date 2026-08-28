# The Kings' Race

A card-based horse race game, played entirely with a deck of playing cards on an 8×5 board. Four Kings — one per suit — race from the bottom row to the top, pushed forward by Aces and knocked back by Jokers. 

## How it works

- The board is 8 rows × 5 columns. The four Kings start on the bottom row, one per column (♠ ♦ ♣ ♥); the top row is the finish line.
- The last column holds the 4 Aces and the 2 Jokers, shuffled and dealt face-down, one per row in between.
- The rest of the deck (2–Q, all suits) is shuffled into the main deck. Cards are drawn one at a time: the suit drawn sends that King up one row.
- Whenever **all four Kings** have passed a given row, the hidden card in that row's column flips:
  - an **Ace** sends the matching King one row further;
  - a **Joker** sends both same-colored Kings one row back.
- First King to reach the top row wins.

## Modes

- **Vs Computer** — pick your King; three AI riders take the other three, and you play poker over the race.
- **Play with Friends** — name up to 4 riders, one per suit, and race together on the same screen (no betting).

From the victory screen, **Continue** deals the next hand with the stacks as they stand, and **Quit** throws the run away and starts over with everyone back on a full buy-in. Closing the tab in the middle of a hand voids that hand — the stacks come back exactly as they were when it was dealt, and the blind clock picks up where it left off.

## Features

- Fully automatic race with a shuffle animation and a countdown.
- **Vs Computer is a 4-handed poker table**: everyone gets 2 private hole cards to start and 1 more before each later betting round — dead cards that never race, so they quietly slow their own suit — and there is a round before every bonus card is turned over, up to four — you bet blind on what that card will be, and set your own size on a slider, from the minimum raise up to the street's limit or your whole stack. Fold and your King races on, but it can no longer win the pot. Go **all in** and you stay in the hand for what you could cover — you win from each rider only as much as you staked, and the rest of the pot goes to the next King home.
- **Blinds, not an ante**: the two seats left of a rotating button post a small and big blind, so the opening round already has a live bet — you can fold before a card is drawn. The blinds climb every 2 minutes of play (5/10 → 10/20 → 20/40 → 40/80, and the bet sizes climb with them); the clock stops while the game is paused. A seat that can no longer cover the big blind is out.
- Pause/Resume at any time; the in-game rules panel (bottom-right) pauses the race automatically while open.
- A deck pile that visibly thins out and a discard pile that grows as the game progresses.
- Bicycle-style playing cards throughout — face cards use custom King/Queen/Jack/Joker artwork.


## License

Code is released under the MIT License (see `LICENSE`). The bundled font is free to use per its own license (see `assets/fonts/Card Characters/Card-Characters_Read_Me.pdf`) but may not be redistributed as a standalone font file.
