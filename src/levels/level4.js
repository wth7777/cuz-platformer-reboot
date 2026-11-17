import { sparse, ground, gap } from './builder.js';

// WORLD 1-4 — snow: icy ground (low friction — watch your stops!),
// snowmen, and platform hops between drifts.

const W = 240;

export default {
  name: 'WORLD 1-4',
  theme: 'snow',
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
    // r22 — spawn, snowmen, enemies, stairs base (Astrohop castle/door removed)
    sparse(W, [3, 'p'], [6, '>'], [15, 'o'], [30, 'e'], [58, 'e'], [88, 'o'], [100, 'e'],
      [112, 'e'], [125, '^'], [135, 'e'], [155, 'o'], [170, 'e'], [196, 'e'], [204, 'e'],
      [206, '^'], [208, ground(8)]),
    // r23/r24 — four pits between snow drifts
    ground(40) + gap(5) + ground(45) + gap(6) + ground(44) + gap(5) + ground(35) + gap(6) +
      ground(54),
    ground(40) + gap(5) + ground(45) + gap(6) + ground(44) + gap(5) + ground(35) + gap(6) +
      ground(54),
  ],
};