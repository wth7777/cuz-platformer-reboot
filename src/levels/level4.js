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
    // r17 — platform line
    sparse(W, [20, 'PPPPP'], [60, 'PPPPP'], [120, 'PPPPP'], [165, 'PPPPP']),
    // r18 — coin arcs over the pits (Astrohop castle top removed)
    sparse(W, [90, 'cccccc'], [180, 'cccccc']),
    // r19 — blocks, gap platforms, stairs top (Astrohop castle removed)
    sparse(W, [32, 'B?B'], [40, 'PPPPP'], [52, 'BMB'], [76, 'T'], [108, 'B?BB'],
      [140, 'PPPPP'], [190, '?']),
    // r20 — stairs (Astrohop castle removed)
    sparse(W),
    // r21 — walking coins; stairs (Astrohop castle walls removed)
    sparse(W, [8, 'cccc'], [150, 'ccc']),
    // r22 — spawn, decorations, enemies, stairs base
    sparse(W, [3, 'p'], [6, '>'], [20, 'w'], [30, 'e'], [40, 'l'], [58, 'e'], [70, 'w'], [75, 'l'], [100, 'e'],
      [112, 'e'], [120, 'l'], [130, 'w'], [135, 'e'], [170, 'e'], [180, 'l'], [187, 'w'], [196, 'e'], [204, 'e'],
      [206, '^'], [208, ground(8)]),
    // r23/r24 — four pits between volcanic drifts
    ground(30) + gap(6) + ground(50) + gap(7) + ground(40) + gap(6) + ground(30) + gap(7) + ground(64),
    ground(30) + gap(6) + ground(50) + gap(7) + ground(40) + gap(6) + ground(30) + gap(7) + ground(64),
  ],
};