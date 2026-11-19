import { sparse, ground, gap, groundDeco } from './builder.js';

// WORLD 1-1 — overworld, ~6.3 screens wide.
// Rows are bottom-anchored: the last row is the bottom of the world.
// See LEVELS.md for the character legend.

const W = 280;

export default {
  name: 'WORLD 1-1',
  theme: 'overworld',
  musicKind: 'overworld',
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
    // r17 — platform enemy, coins over pit 2, P1a entry bridge over G1
    sparse(W, [36, 'PPPPPPPP'], [53, 'e'], [65, 'PPPPP'], [96, 'cccc'], [147, 'cc']),
    // r18 — first blocks, platforms, bricks, P1b continuous route (44-86) + P1c + P1d
    sparse(W, [16, 'BMB'], [30, 'PPPPP'], [44, 'P'], [45, 'ccc'], [48, 'PPP'], [51, 'PPPPP'], [56, 'P', 22], [78, 'BMB'], [80, 'PPPP'], [84, 'P'], [85, 'BMB'], [108, 'PPPPP'], [119, 'P', 8], [194, 'P', 20], [212, 'BMB']),
    // r19 — pyramid top, stairs (Astrohop castle removed)
    sparse(W, [42, 'T'], [146, 'XXXX'], [168, 'T'], [244, 'XXXX']),
    // r20 — walking coins, pyramid, stairs (Astrohop castle removed)
    sparse(W, [8, 'ccccc'], [144, 'XXXXXXXX'], [170, 'cccc'], [242, 'XXXXXX']),
    // r21 — spawn, decorations, enemies, pyramid base, stairs
    sparse(W, [3, 'p'], [6, '>'], [20, '*'], [36, '^'], [44, 'w'], [64, 'e'], [85, 'e'], [88, 'e'], [105, 'e'], [118, 'e'], [130, '"'], [131, 'e'], [142, ground(12)],
      [156, '*'], [162, 'e'], [174, '^'], [185, 'e'], [195, 'e'], [203, 'e'], [222, 'e'],
      [226, 'e'], [232, '^'], [240, ground(8)], [250, '"']),
    // r22/r23 — ground with gaps at 40-43, 81-84, 120-123, 159-162, 198-201, 237-240
    ground(40) + gap(4) + ground(37) + gap(4) + ground(35) + gap(4) + ground(35) + gap(4) + ground(35) + gap(4) + ground(35) + gap(4) + ground(39),
    // Second ground row: decorative only (no collision) to avoid double-body issues
    groundDeco(40) + gap(4) + groundDeco(37) + gap(4) + groundDeco(35) + gap(4) + groundDeco(35) + gap(4) + groundDeco(35) + gap(4) + groundDeco(35) + gap(4) + groundDeco(39),
  ],
};