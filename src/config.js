// Game-wide tuning constants.
//
// GAME_ZOOM zooms the GameScene camera in, so the player, enemies and
// tiles render larger on the same screen — a classic action-platformer
// framing. It is presentation-only: physics, collision, world coordinates,
// spawn position and the touch controls are completely unaffected.
//
//   1.0   = AstroHop baseline (800x450 view — the whole level, small chars)
//   1.67  = ~480x270 view — characters ~1.7x larger (current choice)
//   2.0   = 400x225 view — very close, NES-like
//
// Level geometry:
//   TILE = 18px (fixed by Kenney tileset)
//   ROWS = 30 (level1 has 30 rows of tile data)
//   GAME_HEIGHT = ROWS * TILE = 540px
//   GAME_WIDTH = 800px (unchanged)
//
// Title/Intro/HUD/Pause scenes run on their own cameras and stay at the
// baseline framing, so menus and UI remain exactly as verified.
export const GAME_ZOOM = 1.67;
export const TILE = 18;
export const ROWS = 30;
export const GAME_WIDTH = 800;
export const GAME_HEIGHT = ROWS * TILE; // 540