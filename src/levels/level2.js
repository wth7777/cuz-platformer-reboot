import { sparse, ground, gap } from './builder.js';

// WORLD 1-2 — underground: cave ceiling, darker palette, more vertical
// platforming. Full 25 rows (the ceiling needs the top of the world).

const W = 200;

export default {
  name: 'WORLD 1-2',
  theme: 'underground',
  musicKind: 'overworld',
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
    // r17 — breakaway platform between bridge (r19) and four-coin platform (r16)
    sparse(W, [61, 'PPPP']),
    // r18 — P2c bridge over G2 (94-99), P2e bridge over G3 (145-156)
    sparse(W, [58, 'cccc'], [94, 'P', 12], [145, 'P', 12]),
    // r19 — existing 44-48 + P2a bridge G1 (49-60), P2d mid route (106-131)
    sparse(W, [38, 'B?BB'], [44, 'PPPPP'], [49, 'P', 12], [88, 'B?B'], [106, 'P', 26], [130, 'PPPPP'], [168, '?B?'], [182, 'XX']),
    // r20 — P2b low route (61-86)
    sparse(W, [12, 'PPPPP'], [61, 'P', 26], [70, 'XX'], [115, 'PPP']),
    // r21 — entry coins; wall; stairs (Astrohop castle/door removed)
    sparse(W, [8, 'cccc'], [70, 'XX'], [178, 'XXXXXX']),
    // r21 — spawn; enemies; wall; stairs
    sparse(W, [3, 'p'], [30, 'w'], [43, 'e'], [70, 'XX'], [80, 'w'], [92, 'e'], [100, 'e'], [108, 'e'],
      [130, 'w'], [158, 'e'], [164, 'e'], [170, 'w'], [176, ground(8)]),
    // r22/r23 — ground with gaps at 44-49, 94-99, 144-149
    ground(44) + gap(6) + ground(44) + gap(6) + ground(44) + gap(6) + ground(50),
    ground(44) + gap(6) + ground(44) + gap(6) + ground(44) + gap(6) + ground(50),
  ],
};