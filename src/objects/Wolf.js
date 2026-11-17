import Phaser from 'phaser';

// Wolf enemy using supplied custom artwork (16 frames, 384x256 each).
// walk = frames 0-7 (8-frame cycle).
// attack = frames 8-15 (8-frame sequence).
// Scale 0.2125 (reduced 15% from 0.25).
// Artwork faces RIGHT by default.
export default class Wolf extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, gridKey = null) {
    // Custom wolf atlas: 16 frames @ 384x256 (2x8 grid), facing right.
    super(scene, x, y, 'wolf', 'frame_0');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.gridKey = gridKey;

    // Wolf scale: 0.2125 (reduced 15% from 0.25)
    // Frame: 384x256. At 0.2125 → display ~81.6 x 54.4px
    // Walk frames: feet ~31-43px from frame bottom → visual feet ~19-21px below sprite center
    // Body: effective 20x18, centered horizontally, feet aligned with visual paws
    this.body.setSize(20 / 0.2125, 18 / 0.2125); // effective 20x18
    this.body.setOffset(135, 135); // center horizontally, align feet
    this.setDepth(1);
    this.setCollideWorldBounds(true);
    this.setScale(0.2125);
    this.setOrigin(0.5, 0.5);

    this.direction = -1; // start walking left
    this.isSquashed = false;
    this.isDead = false;
    this.isAttacking = false;
    this.attackCooldown = 0;

    // Wolf constants
    this.WALK_SPEED = 60; // faster than zombie
    this.PURSUE_SPEED = 90;
    this.PURSUE_RANGE = 180; // detect player from further
    this.ATTACK_RANGE = 40; // attack when close
    this.ATTACK_DAMAGE = 25;
    this.ATTACK_COOLDOWN = 1500; // ms between attacks
    this.HEALTH = 3;

    // Play walk animation if available
    if (this.scene.anims.exists('wolf-walk')) {
      this.play('wolf-walk');
    }
  }

  preUpdate(time, delta) {
    super.preUpdate(time, delta);

    if (this.isSquashed || this.isDead) return;

    // Attack cooldown
    if (this.attackCooldown > 0) {
      this.attackCooldown -= delta;
    }

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

    // Platform edge detection and drop-down logic
    if (this.body.onFloor()) {
      const aheadX = this.direction > 0 ? this.body.right + 2 : this.body.left - 3;
      const ground = this.scene.physics.overlapRect(
        aheadX, this.body.bottom + 2, 2, 4,
        false, true
      );

      // If pursuing and no ground ahead, check if there's ground further down
      // (i.e., a lower platform or ground we can safely drop to)
      if (pursuing && ground.length === 0) {
        // Check if there's ground further below within a reasonable drop distance
        const dropCheck = this.scene.physics.overlapRect(
          aheadX, this.body.bottom + 2, 2, 120, // check up to 120px down
          false, true
        );
        if (dropCheck.length > 0) {
          // Safe to drop - walk off the edge
        } else {
          // No ground below either - turn around
          this.direction *= -1;
        }
      } else if (ground.length === 0) {
        // Not pursuing, just turn around at edges
        this.direction *= -1;
      }
    }

    // Pursuit: detect player and move toward them
    let targetDir = this.direction;
    if (pursuing) {
      const distX = player.x - this.x;
      const distY = Math.abs(player.y - this.y);
      // Only pursue if player is on same general level
      if (Math.abs(distX) < this.PURSUE_RANGE && distY < 80) {
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
          } else {
            // No ground directly ahead - check if we can drop down to reach player
            const dropCheck = this.scene.physics.overlapRect(
              checkX, this.body.bottom + 2, 2, 120,
              false, true
            );
            if (dropCheck.length > 0) {
              targetDir = towardPlayer;
            }
          }
        }
      }
    }

    if (targetDir !== this.direction) {
      this.direction = targetDir;
    }

    // Attack logic
    if (pursuing && !this.isAttacking) {
      const distX = Math.abs(player.x - this.x);
      const distY = Math.abs(player.y - this.y);
      if (distX < this.ATTACK_RANGE && distY < 20 && this.attackCooldown <= 0) {
        this.startAttack();
      }
    }

    // Movement
    if (!this.isAttacking) {
      const speed = pursuing ? this.PURSUE_SPEED : this.WALK_SPEED;
      this.setVelocityX(speed * this.direction);
    } else {
      this.setVelocityX(0);
    }

    // Artwork faces RIGHT. When moving LEFT (direction < 0), flip to face left.
    this.setFlipX(this.direction < 0);
  }

  startAttack() {
    this.isAttacking = true;
    this.attackCooldown = this.ATTACK_COOLDOWN;
    this.setVelocityX(0);
    if (this.scene.anims.exists('wolf-attack')) {
      this.play('wolf-attack');
    }
    // Attack hitbox check after a short delay
    this.scene.time.delayedCall(200, () => {
      if (this.isDead || this.isSquashed) return;
      const player = this.scene.player;
      if (player && !player.isDead) {
        const distX = Math.abs(player.x - this.x);
        const distY = Math.abs(player.y - this.y);
        if (distX < this.ATTACK_RANGE + 10 && distY < 30) {
          this.scene.hurtPlayer();
        }
      }
      // Return to walk after attack animation
      this.scene.time.delayedCall(500, () => {
        if (!this.isDead && !this.isSquashed) {
          this.isAttacking = false;
          if (this.scene.anims.exists('wolf-walk')) {
            this.play('wolf-walk');
          }
        }
      });
    });
  }

  /** Killed by blue fireball: flip and fall away, then destroy. */
  knockAway(fromX = this.x) {
    if (this.isDead) return;
    this.isDead = true;
    this.isSquashed = true;
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