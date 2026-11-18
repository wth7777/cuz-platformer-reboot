import { sparse, ground, gap } from './builder.js';

// WORLD 1-3 — lava: athletic island hopping over seven pits, high platform
// routes with coin trails, and one wide final gap with a platform aid.
// Lava Creatures appear for the first time here.

const W = 260;

export default {
  name: 'WORLD 1-3',
  theme: 'lava',
  next: 'level4',
  width: W,
  rows: [
    // r13 — star above the high route (removed)
    sparse(W),
    // r14 — tattoo shop
    sparse(W, [248, 'K']),
    // r15 — coins above the high platforms
    sparse(W, [63, 'ccc'], [97, 'ccc'], [181, 'cccc']),
    // r16
    sparse(W, [122, 'ccc']),
    // r17 — the high route (existing) + P3b bridge G4 (111-128) + P3e bridge G7 (209-226)
    sparse(W, [62, 'PPPPP'], [96, 'PPPPP'], [111, 'P', 18], [180, 'PPPPPP'], [209, 'P', 18]),
    // r18 — P3a bridge G2 (56-77), P3c bridge G5 (139-156)
    sparse(W, [211, 'PPPP'], [30, 'cccc'], [38, 'BBB'], [56, 'P', 22], [79, 'cccc'], [86, 'BMB'], [111, 'cccccc'], [139, 'P', 18], [152, '?']),
    // r19 — P3d low route (171-208, row 19 in 0-indexed = row 20 in 1-indexed? Wait, rows are 0-indexed from top)
    // Actually rows array is bottom-anchored. r19 is index 19 from top = row 4 from bottom (since ROWS=24).
    // Ground is at rows 22-23 (0-indexed). So row 20 = 4 rows above ground = 72px. Row 19 = 5 rows above = 90px.
    // Wait, the plan says P3d at row 20 (36px height = 2 rows above ground). Ground is row 22. Row 20 is 2 rows above = 36px.
    // Row 20 is index 20 from top? Let me check: rows array has 24 elements (0-23). Ground is at index 22 and 23.
    // So row 20 is 2 rows above ground = 36px. Row 19 is 3 rows above = 54px. Row 18 is 4 rows above = 72px. Row 17 is 5 rows above = 90px.
    // P3d should be at row 20 (index 20) for 36px height.
    // But the existing rows: r17 is index 17 (5 rows above = 90px), r18 is index 18 (4 rows above = 72px), r19 is index 19 (3 rows above = 54px), r20 is index 20 (2 rows above = 36px).
    // So P3d at row 20 (index 20) for 36px.
    sparse(W, [30, 'cccc'], [38, 'BBB'], [56, 'PPPPP'], [86, 'BMB'], [139, 'PPPPP'], [152, '?']),
    // r20 — P3d low route (171-208)
    sparse(W, [79, 'cccc'], [111, 'cccccc'], [139, 'PPPPP'], [171, 'P', 38]),
    // r21 — walking coins; stairs (Astrohop castle walls removed)
    sparse(W, [10, 'ccccc'], [171, 'cccc']),
    // r22 — spawn, decorations, enemies, stairs base
    sparse(W, [3, 'p'], [6, '>'], [10, 'w'], [20, 'e'], [40, 'l'], [44, 'e'], [50, '"'], [70, 'e'], [85, 'w'], [90, 'l'], [92, 'e'],
      [100, '^'], [120, 'w'], [126, 'e'], [130, 'l'], [150, '*'], [160, 'e'], [175, 'w'], [185, 'e'], [195, 'e'], [200, 'l'], [222, '^'],
      [234, ground(8)]),
    // r23/r24 — seven pits of rising width
    ground(30) + gap(4) + ground(22) + gap(5) + ground(18) + gap(4) + ground(28) + gap(6) +
      ground(22) + gap(5) + ground(27) + gap(4) + ground(34) + gap(8) + ground(43),
    ground(30) + gap(4) + ground(22) + gap(5) + ground(18) + gap(4) + ground(28) + gap(6) +
      ground(22) + gap(5) + ground(27) + gap(4) + ground(34) + gap(8) + ground(43),
  ],
};