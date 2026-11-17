import { sparse, ground, gap } from './builder.js';

// WORLD 1-2 — underground: cave ceiling, darker palette, more vertical
// platforming. Full 25 rows (the ceiling needs the top of the world).

const W = 200;

export default {
  name: 'WORLD 1-2',
  theme: 'underground',
  next: 'level3',
  width: W,
  rows: [
    // r0/r1 — cave ceiling
    ground(W),
    ground(W),
    // r2 — stalactites + side walls
    sparse(W, [0, ground(8)], [40, 'XX'], [80, 'XX'], [120, 'XX'], [192, ground(8)]),
    sparse(W), // r3
    sparse(W), // r4
    sparse(W), // r5
    sparse(W), // r6
    sparse(W), // r6
    sparse(W), // r7
    sparse(W), // r8
    sparse(W), // r8
    sparse(W), // r9
    // r10 — coins over the upper gallery
    sparse(W, [40, 'ccccc']),
    // r11 — gallery enemy; coins over the final climb
    sparse(W, [42, 'e'], [147, 'ccc']),
    // r12 — long upper gallery + coins over the entry climb
    sparse(W, [29, 'ccc'], [36, 'PPPPPPPPPPPPP']),
    // r13 — final climb top platform
    sparse(W, [146, 'PPPPP']),
    // r14 — entry climb top; coins; upper bricks; tattoo shop
    sparse(W, [28, 'PPPPP'], [69, 'cccc'], [84, 'BBBB'], [188, 'K']),
    // r15 — coins over entry climb
    sparse(W, [21, 'ccc']),
    // r16 — entry climb mid; wall-top platform; final climb mid
    sparse(W, [20, 'PPPPP'], [68, 'PPPPPP'], [138, 'PPPPP']),
    // r17 — powerup block removed
    sparse(W),
    // r18 — coin arc over pit 1 (Astrohop castle top removed)
    sparse(W, [58, 'cccc']),
    // r19 — bricks; final climb base; stairs (Astrohop castle removed)
    sparse(W, [38, 'B?BB'], [88, 'B?B'], [130, 'PPPPP'], [168, '?B?'],
      [182, 'XX']),
    // r20 — entry platform; wall; pit island; stairs (Astrohop castle removed)
    sparse(W, [12, 'PPPPP'], [70, 'XX'], [115, 'PPP']),
    // r21 — entry coins; wall; stairs (Astrohop castle/door removed)
    sparse(W, [8, 'cccc'], [70, 'XX'], [178, 'XXXXXX']),
    // r21 — spawn; enemies; wall; stairs (Astrohop castle/door removed)
    sparse(W, [3, 'p'], [44, 'e'], [70, 'XX'], [92, 'e'], [100, 'e'], [108, 'e'],
      [158, 'e'], [164, 'e'], [176, ground(8)]),
    // r22/r23 — ground with two pits (58-61 and 114-118)
    ground(58) + gap(4) + ground(52) + gap(5) + ground(81),
    ground(58) + gap(4) + ground(52) + gap(5) + ground(81),
  ],
};