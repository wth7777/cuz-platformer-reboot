import Phaser from 'phaser';

const WALK_SPEED = 30; // slower than player
const PURSUE_SPEED = 45; // faster when chasing
// PURSUE_RANGE removed — detection is now camera-relative (see preUpdate)

// Zombie enemy using supplied custom artwork (8 frames, 332x503 each).
// walk = frames 0-7 (8-frame cycle).
// Scale 0.1144 (~10% larger than 0.104) — slightly bigger than player.
// Artwork faces RIGHT by default.
export default class Zombie extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, gridKey = null) {
    // Custom zombie atlas: 8 frames @ 332x503 (4x2 grid), facing right.
    super(scene, x, y, 'zombie', 'frame_0');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.gridKey = gridKey;

    // Collision body sized to the scaled sprite.
    // Sprite scale 0.1144 scales body AND offset.
    // Size is pre-scale (divided by 0.1144 so effective = 16x20).
    // Offset is pre-scale too (NOT divided by scale — Phaser multiplies by scale).
    // Visual feet: frame bottom=492px of 503px → 11px padding
    // displayHeight = 503 * 0.1144 = 57.54. Frame bottom = sprite.y + 28.77.
    // Visual feet = frame bottom - 11*0.1144 = sprite.y + 28.77 - 1.26 = sprite.y + 27.51.
    // Body height 20: body.bottom = sprite.topLeft.y + offsetY_eff + 20
    // sprite.topLeft.y = sprite.y - 28.77
    // body.bottom = sprite.y - 28.77 + offsetY*0.1144 + 20 = sprite.y + 27.51
    // offsetY*0.1144 = 36.28 → offsetY = 317 (exact match: body.bottom = visual feet)
    // Center body horizontally: visual center at sprite.x (frame center fills width)
    // displayWidth = 332 * 0.1144 = 38.0. displayOriginX = 19.0.
    // body.x + 8 = sprite.x → body.x = sprite.x - 8
    // body.x = sprite.x - 19.0 + offsetX*0.1144
    // offsetX*0.1144 = 11.0 → offsetX = 96
    this.body.setSize(16 / 0.1144, 20 / 0.1144);
    this.body.setOffset(96, 317);
    this.setDepth(1);
    this.setCollideWorldBounds(true);
    this.setScale(0.1144);
    this.setOrigin(0.5, 0.5); // lock origin to center so visual/body math is consistent

    // Visual feet alignment: body is correct at offsetY=317, but sprite renders slightly high.
    // Apply ONCE in constructor as a render-only adjustment.
    this.y += 2.5; // push sprite down so feet touch tile (player reference)

    this.direction = -1; // start walking left
    this.isSquashed = false;
    this.isDead = false;
    this.isChasing = false; // start in patrol mode

    // Patrol boundaries around spawn location (±120px)
    this.patrolStartX = x - 120;
    this.patrolEndX = x + 120;

    // Play walk animation if available
    if (this.scene.anims.exists('zombie-walk')) {
      this.play('zombie-walk');
    }
  }

  preUpdate(time, delta) {
    super.preUpdate(time, delta);

    if (this.isSquashed || this.isDead) return;

    // Camera-relative detection distances (scale with zoom/screen size)
    const cam = this.scene.cameras.main;
    const camHalfWidth = cam.width / 2; // center to edge in world pixels
    const detectionRange = camHalfWidth * 0.75;   // 75% of center-to-edge
    const disengageRange = camHalfWidth * 1.0;    // larger threshold for disengage

    // Is the enemy visible in the camera viewport?
    const camLeft = cam.scrollX - camHalfWidth;
    const camRight = cam.scrollX + camHalfWidth;
    const isVisible = this.x >= camLeft && this.x <= camRight;

    // Off-screen enemies keep patrolling but cannot detect/chase the player.
    const farOffCamera = Math.abs(this.x - (cam.scrollX + camHalfWidth)) > 1100;

    const player = this.scene.player;
    const playerAlive = player && !player.isDead;

    // Turn at walls
    if (this.body.blocked.left || this.body.touching.left) {
      this.direction = 1;
    } else if (this.body.blocked.right || this.body.touching.right) {
      this.direction = -1;
    }

    // Patrol boundaries: turn around when reaching either edge of spawn zone
    if (this.x <= this.patrolStartX) {
      this.direction = 1;
    } else if (this.x >= this.patrolEndX) {
      this.direction = -1;
    }

    // Platform edge detection and drop-down logic
    if (this.body.onFloor()) {
      const aheadX = this.direction > 0 ? this.body.right + 2 : this.body.left - 3;
      const ground = this.scene.physics.overlapRect(
        aheadX, this.body.bottom + 2, 2, 4,
        false, true
      );

      if (ground.length === 0) {
        // Not pursuing, just turn around at edges
        this.direction *= -1;
      }
    }

    // State machine: patrol ↔ chase
    if (this.isChasing) {
      // Disengage: player too far away OR enemy not visible in camera
      const distX = player ? Math.abs(player.x - this.x) : 9999;
      if (!playerAlive || distX > disengageRange || !isVisible || farOffCamera) {
        this.isChasing = false;
      } else {
        // Continue pursuing
        this.pursuePlayer(player);
        return;
      }
    } else {
      // Patrol mode: check for player detection (only when on-screen)
      if (playerAlive && !farOffCamera && isVisible) {
        const distX = Math.abs(player.x - this.x);
        if (distX < detectionRange) {
          this.isChasing = true;
          this.pursuePlayer(player);
          return;
        }
      }
    }

    // Patrol movement
    const speed = WALK_SPEED;
    this.setVelocityX(speed * this.direction);

    // Artwork faces RIGHT. When moving LEFT (direction < 0), flip to face left.
    // When moving RIGHT (direction > 0), no flip (faces right).
    this.setFlipX(this.direction < 0);
  }

  /** Shared pursuit logic: move toward the player. */
  pursuePlayer(player) {
    const distX = player.x - this.x;
    const distY = Math.abs(player.y - this.y);
    const towardPlayer = distX > 0 ? 1 : -1;

    // Only pursue toward player if there's ground in that direction
    if (this.body.onFloor()) {
      const checkX = towardPlayer > 0 ? this.body.right + 2 : this.body.left - 3;
      const ground = this.scene.physics.overlapRect(
        checkX, this.body.bottom + 2, 2, 4,
        false, true
      );
      if (ground.length > 0) {
        this.direction = towardPlayer;
      } else {
        // No ground directly ahead - check if we can drop down to reach player
        const dropCheck = this.scene.physics.overlapRect(
          checkX, this.body.bottom + 2, 2, 120,
          false, true
        );
        if (dropCheck.length > 0) {
          this.direction = towardPlayer;
        }
      }
    }

    const speed = PURSUE_SPEED;
    this.setVelocityX(speed * this.direction);

    // Artwork faces RIGHT. When moving LEFT (direction < 0), flip to face left.
    this.setFlipX(this.direction < 0);
  }

  /** Killed by blue fireball: flip and fall away, then destroy. */
  knockAway(fromX = this.x) {
    if (this.isDead) return;
    this.isDead = true;
    this.isSquashed = true; // stop AI and prevent contact callbacks
    this.scene.consume?.(this.gridKey);
    this.anims.stop();
    this.body.checkCollision.none = true;
    const dir = this.x < fromX ? -1 : 1;
    this.body.setVelocity(dir * 120, -280);
    this.body.setAngularVelocity(dir * 240);
    this.scene.time.delayedCall(900, () => {
      if (this.body && this.body.world) this.destroy();
    });
  }

  /** Stomped from above: flatten and vanish shortly after. */
  squash() {
    if (this.isDead) return;
    this.isDead = true;
    this.isSquashed = true;
    this.scene.consume?.(this.gridKey);
    this.anims.stop();
    this.body.checkCollision.none = true;
    this.body.setVelocity(0, 0);
    this.body.allowGravity = false;
    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      delay: 300,
      duration: 200,
      onComplete: () => {
        if (this.body && this.body.world) this.destroy();
      },
    });
  }
}