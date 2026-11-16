import Phaser from 'phaser';

const WALK_SPEED = 30; // slower than player
const PURSUE_SPEED = 45; // faster when chasing
const PURSUE_RANGE = 220; // horizontal detection distance

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
    this.y += 4.0; // push sprite down so feet touch tile (player reference)

    this.direction = -1; // start walking left
    this.isSquashed = false;
    this.isDead = false;

    // Play walk animation if available
    if (this.scene.anims.exists('zombie-walk')) {
      this.play('zombie-walk');
    }
  }

  preUpdate(time, delta) {
    super.preUpdate(time, delta);

    if (this.isSquashed || this.isDead) return;

    // Sleep when far off-camera
    const cam = this.scene.cameras.main;
    if (Math.abs(this.x - (cam.scrollX + cam.width / 2)) > 1100) {
      this.setVelocityX(0);
      return;
    }

    const player = this.scene.player;
    const pursuing = player && !player.isDead;

    // Turn at walls
    if (this.body.blocked.left || this.body.touching.left) {
      this.direction = 1;
    } else if (this.body.blocked.right || this.body.touching.right) {
      this.direction = -1;
    }

    // Turn at platform edges — ALWAYS check edges, even when pursuing.
    // Don't chase the player off a ledge.
    if (this.body.onFloor()) {
      const aheadX = this.direction > 0 ? this.body.right + 2 : this.body.left - 3;
      const ground = this.scene.physics.overlapRect(
        aheadX, this.body.bottom + 2, 2, 4,
        false, true
      );
      if (ground.length === 0) {
        this.direction *= -1;
      }
    }

    // Pursuit: detect player and move toward them
    let targetDir = this.direction;
    if (pursuing) {
      const distX = player.x - this.x;
      const distY = Math.abs(player.y - this.y);
      // Only pursue if player is on same general level (not far above/below)
      // AND if there's ground ahead in that direction
      if (Math.abs(distX) < PURSUE_RANGE && distY < 80) {
        const towardPlayer = distX > 0 ? 1 : -1;
        // Only pursue toward player if there's ground in that direction
        if (this.body.onFloor()) {
          const checkX = towardPlayer > 0 ? this.body.right + 2 : this.body.left - 3;
          const ground = this.scene.physics.overlapRect(
            checkX, this.body.bottom + 2, 2, 4,
            false, true
          );
          if (ground.length > 0) {
            targetDir = towardPlayer;
          }
        }
      }
    }

    if (targetDir !== this.direction) {
      this.direction = targetDir;
    }

    const speed = pursuing ? PURSUE_SPEED : WALK_SPEED;
    this.setVelocityX(speed * this.direction);

    // Artwork faces RIGHT. When moving LEFT (direction < 0), flip to face left.
    // When moving RIGHT (direction > 0), no flip (faces right).
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