import Phaser from 'phaser';

const WALK_SPEED = 30; // slower than player
const PURSUE_SPEED = 45; // faster when chasing
const PURSUE_RANGE = 220; // horizontal detection distance

// Zombie enemy using supplied custom artwork (8 frames, 332x503 each).
// walk = frames 0-7 (8-frame cycle).
// Scale 0.104 matches player height (~50px visible).
// Artwork faces RIGHT by default.
export default class Zombie extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, gridKey = null) {
    // Custom zombie atlas: 8 frames @ 332x503 (4x2 grid), facing right.
    super(scene, x, y, 'zombie', 'frame_0');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.gridKey = gridKey;

    // Collision body sized to the scaled sprite.
    // Sprite scale 0.104 scales body AND offset.
    // Size is pre-scale (divided by 0.104 so effective = 16x20).
    // Offset is pre-scale too (NOT divided by scale — Phaser multiplies by scale).
    // Visual feet: frame bottom=492px of 503px → 11px padding → sprite.y + 25.0
    // displayHeight = 503 * 0.104 = 52.3. Frame bottom = sprite.y + 26.15.
    // Visual feet = frame bottom - 11*0.104 = sprite.y + 26.15 - 1.14 = sprite.y + 25.01.
    // Body height 20: body.bottom = sprite.topLeft.y + offsetY_eff + 20
    // sprite.topLeft.y = sprite.y - 26.15
    // body.bottom = sprite.y - 26.15 + offsetY*0.104 + 20 = sprite.y + 25.0
    // offsetY*0.104 = 31.15 → offsetY = 300
    // Center body horizontally: visual center at sprite.x (frame center fills width)
    // displayWidth = 332 * 0.104 = 34.5. displayOriginX = 17.25.
    // body.x + 8 = sprite.x → body.x = sprite.x - 8
    // body.x = sprite.x - 17.25 + offsetX*0.104
    // offsetX*0.104 = 9.25 → offsetX = 89
    this.body.setSize(16 / 0.104, 20 / 0.104);
    this.body.setOffset(89, 300);
    this.setDepth(1);
    this.setCollideWorldBounds(true);
    this.setScale(0.104);

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

    // Turn at platform edges
    if (this.body.onFloor()) {
      const aheadX = this.direction > 0 ? this.body.right + 2 : this.body.left - 3;
      const ground = this.scene.physics.overlapRect(
        aheadX, this.body.bottom + 2, 2, 4,
        false, true
      );
      if (ground.length === 0) this.direction *= -1;
    }

    // Pursuit: detect player and move toward them
    let targetDir = this.direction;
    if (pursuing) {
      const distX = player.x - this.x;
      const distY = Math.abs(player.y - this.y);
      if (Math.abs(distX) < PURSUE_RANGE && distY < 80) {
        targetDir = distX > 0 ? 1 : -1;
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