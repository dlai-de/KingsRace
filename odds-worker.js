'use strict';
// The Monte Carlo, off the main thread. race.js is pure rules, so it runs here as-is.
importScripts('race.js');
onmessage = e => postMessage(odds(e.data));
