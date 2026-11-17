import { sparse, ground, gap, groundDeco } from './builder.js';

// WORLD 1-1 — overworld, ~6.3 screens wide.
// Rows are bottom-anchored: the last row is the bottom of the world.
// See LEVELS.md for the character legend.

const W = 280;

export default {
  name: 'WORLD 1-1',
  theme: 'overworld',
  next: 'level2',
  // the 't' pipe leads to the bonus room and its exit drops you at col 168
  // secret removed - no pipes
  width: W,
  rows: [
    // r13 — coins over platform
    sparse(W, [59, 'ccc'], [256, 'K']),
    // r14 — upper brick deck; coins; high-route platforms
    sparse(W, [24, 'ccc'], [82, 'BBBB'], [121, 'ccc'], [179, 'cccc'], [187, 'PPPPPP'], [197, 'cccc']),
    // r15
    sparse(W, [58, 'PPPPP'], [66, 'ccc']),
    // r16 — early platforms, mid platforms, high route
    sparse(W, [23, 'PPPPP'], [31, 'ccc'], [109, 'ccc'], [120, 'PPPPP'], [178, 'PPPPPP'], [196, 'PPPPPP']),
    // r17 — platform enemy, coins over pit 2
    sparse(W, [53, 'e'], [65, 'PPPPP'], [96, 'cccc'], [147, 'cc'], [264, 'xxx']),
    // r18 — first blocks, platforms, bricks, final blocks, castle
    sparse(W, [16, 'BMB'], [30, 'PPPPP'], [45, 'ccc'], [51, 'PPPPP'], [78, 'BMB'], [85, 'BMB'], [108, 'PPPPP'], [206, 'T'], [212, 'BMB'], [246, 'XX'], [262, 'xxxxxxx']),
    // r19 — pyramid top, stairs, castle
    sparse(W, [42, 'T'], [146, 'XXXX'], [168, 'T'], [244, 'XXXX'], [262, 'xxxxxxx']),
    // r20 — walking coins, pyramid, stairs, castle (door gap at 265)
    sparse(W, [8, 'ccccc'], [144, 'XXXXXXXX'], [170, 'cccc'], [242, 'XXXXXX'],
      [262, 'xxx'], [266, 'xxx']),
    // r21 — spawn, decorations, enemies, pyramid base, stairs, castle + door
    sparse(W, [3, 'p'], [6, '>'], [20, '*'], [36, '^'], [50, 'w'], [64, 'e'],
      [90, 'e'], [93, 'e'], [105, 'e'], [118, 'e'], [130, '"'], [131, 'e'], [142, ground(12)],
      [156, '*'], [162, 'e'], [174, '^'], [185, 'e'], [195, 'e'], [203, 'e'], [222, 'e'],
      [226, 'e'], [232, '^'], [240, ground(8)], [250, '"'], [262, 'xxx'], [265, 'd'], [266, 'xxx']),
    // r22/r23 — ground with two pits (45-47 and 96-99)
    ground(45) + gap(3) + ground(48) + gap(4) + ground(180),
    // Second ground row: decorative only (no collision) to avoid double-body issues
    groundDeco(45) + gap(3) + groundDeco(48) + gap(4) + groundDeco(180),
  ],
};