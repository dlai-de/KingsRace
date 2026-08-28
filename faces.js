'use strict';

// Four cartoon regulars at the table. They are dealt to the four Kings at random, one
// each, when the page loads, and keep those seats for the session -- the picker screen
// shows the seating before a King is chosen, so it has to be the seating the race uses.
// Drawn as inline SVG rather than art files: 4 flat faces in the felt/gold palette are
// smaller than 4 PNGs and recolour themselves from the CSS variables' own values.

const SKIN = '#e8bb93', INK = '#2a1c12';
const svg = inner => `<svg viewBox="0 0 64 64" aria-hidden="true">${inner}</svg>`;
// neck, shoulders, ears, head -- in paint order, so the head covers the neck it sits on
const bust = coat =>
  `<rect x="28" y="37" width="8" height="10" rx="3" fill="${SKIN}"/>` +
  `<path d="M4 64 q7-17 28-17 t28 17 z" fill="${coat}"/>` +
  `<circle cx="19" cy="31" r="3.2" fill="${SKIN}"/><circle cx="45" cy="31" r="3.2" fill="${SKIN}"/>` +
  `<circle cx="32" cy="30" r="13" fill="${SKIN}"/>`;
const eyes = `<circle cx="27" cy="29" r="1.9" fill="${INK}"/><circle cx="37" cy="29" r="1.9" fill="${INK}"/>`;
const brows = c => `<path d="M23.5 24 q3.5-2.2 7 0 M33.5 24 q3.5-2.2 7 0" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/>`;
const smile = `<path d="M27.5 37.5 q4.5 4 9 0" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>`;
// the same star game.js stamps on the Jokers, dropped onto a cap badge
const STAR = '<path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>';

const CHARS = [
  { id: 'cowboy', name: 'Cowboy', art: svg(
      bust('#6b4423') + eyes + brows('#4a3420') + smile +
      `<path d="M24 49 L32 60 L40 49 Z" fill="#c0392b"/>` +
      `<ellipse cx="32" cy="18" rx="23" ry="4.6" fill="#8a5a30"/>` +
      `<path d="M21 18 C21 6 26 3 32 3 C38 3 43 6 43 18 Z" fill="#a06a38"/>` +
      `<rect x="21" y="14" width="22" height="3.6" fill="#4a2c14"/>`) },

  { id: 'magnate', name: 'Magnate', art: svg(
      bust('#1a1a1a') + eyes + brows('#e8e4d8') +
      `<path d="M26 48 L32 58 L38 48 Z" fill="#f4f1e8"/>` +
      `<path d="M29 55 l-6-3 v6 z M35 55 l6-3 v6 z" fill="#c0392b"/>` +
      `<path d="M28 41.5 q4 3 8 0" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>` +
      `<path d="M22.5 36.5 q4.5-4.5 9.5-1.5 q5-3 9.5 1.5" fill="none" stroke="#f4f1e8" stroke-width="3.2" stroke-linecap="round"/>` +
      `<circle cx="37" cy="29" r="5.6" fill="none" stroke="#d4af6a" stroke-width="1.4"/>` +
      `<path d="M41.5 33 q3.5 6 .5 11" fill="none" stroke="#d4af6a" stroke-width="1"/>` +
      `<ellipse cx="32" cy="17.5" rx="20" ry="3.6" fill="#1a1a1a"/>` +
      `<rect x="21" y="1" width="22" height="16" rx="1.5" fill="#1a1a1a"/>` +
      `<rect x="21" y="12" width="22" height="4.6" fill="#c0392b"/>`) },

  { id: 'general', name: 'General', art: svg(
      bust('#3a5a3f') + eyes + brows('#cfcfcf') +
      `<rect x="20" y="51" width="7" height="3" rx="1" fill="#c0392b"/>` +
      `<rect x="20" y="56" width="7" height="3" rx="1" fill="#d4af6a"/>` +
      `<path d="M25 36.5 h14" stroke="#cfcfcf" stroke-width="3.4" stroke-linecap="round"/>` +
      `<ellipse cx="32" cy="21.5" rx="19" ry="4" fill="#16231a"/>` +
      `<path d="M17 18 C17 8 23 4 32 4 C41 4 47 8 47 18 Z" fill="#3a5a3f"/>` +
      `<rect x="16" y="15.5" width="32" height="5" fill="#22392a"/>` +
      `<g transform="translate(32 10) scale(.5) translate(-12 -11.5)" fill="#d4af6a">${STAR}</g>`) },

  { id: 'cardinal', name: 'Cardinal', art: svg(
      bust('#b0271c') + eyes + brows('#d8d4c8') + smile +
      `<rect x="25" y="47" width="14" height="4" rx="1" fill="#f4f1e8"/>` +
      `<rect x="31" y="54" width="2" height="9" fill="#d4af6a"/>` +
      `<rect x="28" y="57" width="8" height="2" fill="#d4af6a"/>` +
      `<path d="M20.5 24 A13 13 0 0 1 43.5 24 Z" fill="#b0271c"/>` +
      `<circle cx="32" cy="17.4" r="1.7" fill="#8f1f16"/>`) },
];

// One character per King, dealt once so both screens agree. race.js owns the Fisher-Yates.
const SEAT_CHAR = Object.fromEntries(shuffle(CHARS.slice()).map((c, i) => [SUITS[i], c]));
// A function declaration, not a const: game.js reaches it as `window.seatFace?.()`,
// so the game still runs with faces.js absent.
function seatFace(suit) { return `<i class="seat-face" title="${SEAT_CHAR[suit].name}">${SEAT_CHAR[suit].art}</i>`; }

// game.js rewrites each plaque's innerHTML in setRiderLabels(), so this is called from
// the end of it to stamp the medallion back on.
function paintSeatFaces() {
  SUITS.forEach(suit => document.getElementById('label-' + suit)?.insertAdjacentHTML('afterbegin', seatFace(suit)));
}

// The picker cards are built once at load by game.js, and this script runs after it.
SUITS.forEach(suit =>
  document.querySelector(`.pick-card[data-suit="${suit}"]`)?.insertAdjacentHTML('afterbegin', seatFace(suit)));
