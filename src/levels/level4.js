import { sparse, ground, gap } from './builder.js';

// WORLD 1-4 — lava: volcanic chamber with wider pits, fewer safe platforms,
// and darker rock terrain. Lava Creatures patrol here.

const W = 240;

export default {
  name: 'WORLD 1-4',
  theme: 'lava',
  next: 'level5',
  width: W,
  rows: [
    // r13 — star above the upper brick deck (removed)
    sparse(W),
    // r14 — coins; tattoo shop
    sparse(W, [70, 'cccc'], [221, 'K']),
    // r15 — upper brick deck
    sparse(W, [112, 'BBBB']),
    // r16 — coins above the platforms
    sparse(W, [21, 'ccc'], [61, 'ccc'], [121, 'ccc'], [166, 'ccc']),
    // r17 — existing platform line + P4c bridge G3 (133-150) + P4e optional high route (50-59)
    sparse(W, [20, 'PPPPP'], [50, 'P', 10], [60, 'PPPPP'], [120, 'PPPPP'], [133, 'P', 18], [165, 'PPPPP']),
    // r18 — coin arcs over the pits + P4a bridge G1 (30-41) + P4d bridge G4 (169-179)
    sparse(W, [30, 'P', 12], [90, 'cccccc'], [169, 'P', 11], [180, 'cccccc']),
    // r19 — blocks, gap platforms, stairs top (Astrohop castle removed)
    sparse(W, [32, 'B?B'], [40, 'PPPPP'], [52, 'BMB'], [76, 'T'], [108, 'B?BB'],
      [140, 'PPPPP'], [190, '?']),
    // r20 — stairs (Astrohop castle removed)
    sparse(W),
    // r21 — walking coins; stairs (Astrohop castle walls removed)
    sparse(W, [8, 'cccc'], [150, 'ccc']),
    // r22 — spawn, decorations, enemies, stairs base
    sparse(W, [3, 'p'], [6, '>'], [20, 'w'], [29, 'e'], [40, 'l'], [58, 'e'], [70, 'w'], [75, 'l'], [86, 'P', 7], [100, 'e'],
      [112, 'e'], [120, 'l'], [130, 'w'], [132, 'e'], [168, 'e'], [180, 'l'], [187, 'w'], [196, 'e'], [204, 'e'],
      [206, '^'], [208, ground(8)]),
    // r23/r24 — four pits between volcanic drifts
    ground(30) + gap(6) + ground(50) + gap(7) + ground(40) + gap(6) + ground(30) + gap(7) + ground(64),
    ground(30) + gap(6) + ground(50) + gap(7) + ground(40) + gap(6) + ground(30) + gap(7) + ground(64),
  ],
};