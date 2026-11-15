// Game-wide tuning constants. Phase 2: closer gameplay perspective.
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
// Title/Intro/HUD/Pause scenes run on their own cameras and stay at the
// baseline framing, so menus and UI remain exactly as verified.
export const GAME_ZOOM = 1.67;
