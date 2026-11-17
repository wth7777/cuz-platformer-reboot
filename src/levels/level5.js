import { sparse, ground, gap } from './builder.js';

// WORLD 1-5 — the finale: an enemy gauntlet, a second secret room,
// double-deck bricks, and a 5-step launch staircase before the flag.

const W = 300;

export default {
  name: 'WORLD 1-5',
  theme: 'overworld',
  next: 'end',
  time: 400,
  // secret removed - no pipes
  width: W,
  rows: [
    // r13 — star above the upper deck; high coins (removed)
    sparse(W, [194, 'cccc']),
    // r14 — coins; tattoo shop
    sparse(W, [38, 'ccc'], [262, 'K']),
    // r15 — upper brick deck; high route
    sparse(W, [84, 'BBBB'], [120, 'PPPPPP'], [180, 'PPPPP']),
    // r16 — coins on the high route
    sparse(W, [121, 'cccc'], [181, 'ccc']),
    // r17 — platforms
    sparse(W, [20, 'PPPPP'], [140, 'PPPPP'], [200, 'PPPPP']),
    // r18 — coin arcs over pits; aid platform over the wide gap; stairs top (Astrohop castle removed)
    sparse(W, [50, 'cccc'], [100, 'ccccc'], [160, 'cccccc'], [208, 'PPPPP']),
    // r19 — blocks galore, stairs, (Astrohop castle removed)
    sparse(W, [16, 'BMB'], [44, '?'], [80, 'B?B'], [86, 'BMB'], [110, 'T'],
      [130, '?'], [170, 'B?B'], [220, '?']),
    // r20 — stairs (Astrohop castle removed)
    sparse(W),
    // r21 — walking coins; stairs (Astrohop castle walls removed)
    sparse(W, [8, 'ccccc'], [234, 'ccc']),
    // r22 — spawn + the gauntlet (14 enemies), stairs base (Astrohop castle/door removed)
    sparse(W, [3, 'p'], [6, '>'], [24, 'e'], [40, 'e'], [48, '"'], [62, 'e'], [64, 'e'],
      [75, '*'], [94, 'e'], [118, 'e'], [122, 'e'], [133, '^'], [150, 'e'], [152, 'e'],
      [175, 'e'], [188, '*'], [198, 'e'], [218, 'e'], [226, 'e'], [240, 'e'], [244, '^'],
      [246, ground(10)]),
    // r23/r24 — four pits, the last one wide
    ground(50) + gap(4) + ground(46) + gap(5) + ground(55) + gap(6) + ground(42) + gap(7) +
      ground(85),
    ground(50) + gap(4) + ground(46) + gap(5) + ground(55) + gap(6) + ground(42) + gap(7) +
      ground(85),
  ],
};