import Phaser from 'phaser';

const WALK_SPEED = 30; // slower than player
const PURSUE_SPEED = 45; // faster when chasing
const PURSUE_RANGE = 220; // horizontal detection distance

// Zombie enemy using Kenney characters tileset (same as Walker).
// Frames 18-19 = two-frame walk cycle.
// Built on the same Arcade.Sprite pattern as Walker.
export default class Zombie extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, gridKey = null) {
    // Kenney chars: 24x24 frames, frame 18 = walk frame 1
    super(scene, x, y, 'chars', 18);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.gridKey = gridKey;

    // Collision body - matches Walker proportions for ground alignment
    // Origin is top-left (0,0) for Kenney tileset
    this.body.setSize(16, 14);
    this.body.setOffset(4, 10); // body bottom = sprite.y + 10 + 14 = sprite.y + 24 = frame bottom
    this.setDepth(1);
    this.setCollideWorldBounds(true);
    this.setScale(1.5); // makes 24px frame ~60px on screen at zoom 1.67

    this.direction = -1; // start walking left
    this.isSquashed = false;
    this.isDead = false;

    // Zombie walk animation (reuses walker-walk frames 18-19)
    if (this.scene.anims.exists('zombie-walk')) {
      this.play('zombie-walk');
    } else if (this.scene.anims.exists('walker-walk')) {
      this.play('walker-walk');
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
    this.setFlipX(this.direction > 0);
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