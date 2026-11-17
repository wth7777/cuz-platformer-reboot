import Phaser from 'phaser';

// Lava Creature enemy using supplied custom artwork (20 frames, 307x256 each).
// Idle: frames 0-3 (4-frame subtle idle)
// Walk: frames 4-11 (8-frame walk cycle)
// Claw attack: frames 12-15 (4-frame claw swipe)
// Lava eruption: frames 16-18 (3-frame eruption)
// Death: frame 19 (death pose)
// Scale 0.22 (adjusted to match other enemies).
// Artwork faces RIGHT by default.
export default class LavaCreature extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, gridKey = null) {
    // Custom lava atlas: 20 frames @ 307x256 (2x10 grid), facing right.
    super(scene, x, y, 'lava', 'frame_0');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.gridKey = gridKey;

    // DEBUG: Store spawn info globally for inspection
    if (!window.__lavaDebug) window.__lavaDebug = [];
    window.__lavaDebug.push({ event: 'constructor', x, y, gridKey, texture: this.texture?.key, frame: this.frame?.name, time: Date.now() });
    console.log('[LavaCreature] Constructor called:', { x, y, gridKey, texture: this.texture?.key, frame: this.frame?.name });

    // Lava Creature scale: 0.22 (similar to wolf/zombie)
    // Frame: 307x256. At 0.22 → display ~67.5 x 56.3px
    // Body: effective 24x20, centered horizontally, feet aligned with visual feet
    this.body.setSize(24 / 0.22, 20 / 0.22); // effective 24x20
    this.body.setOffset(120, 120); // center horizontally, align feet
    this.setDepth(1);
    this.setCollideWorldBounds(true);
    this.setScale(0.22);
    this.setOrigin(0.5, 0.5);

    this.direction = -1; // start walking left
    this.isSquashed = false;
    this.isDead = false;
    this.isAttacking = false;
    this.attackCooldown = 0;
    this.eruptionCooldown = 0;

    // Lava Creature constants
    this.WALK_SPEED = 20; // slowest - lumbering
    this.PURSUE_SPEED = 30;
    this.PURSUE_RANGE = 150;
    this.CLAW_ATTACK_RANGE = 45;
    this.ERUPTION_RANGE = 100;
    this.ATTACK_DAMAGE = 30;
    this.ATTACK_COOLDOWN = 2000; // ms between attacks
    this.ERUPTION_COOLDOWN = 3000; // ms between eruptions
    this.HEALTH = 8;

    // Play idle animation if available
    if (this.scene.anims.exists('lava-idle')) {
      this.play('lava-idle');
      console.log('[LavaCreature] Playing lava-idle animation');
    } else {
      console.warn('[LavaCreature] lava-idle animation NOT found');
      if (!window.__lavaDebug) window.__lavaDebug = [];
      window.__lavaDebug.push({ error: 'lava-idle animation NOT found', time: Date.now() });
    }
  }

  preUpdate(time, delta) {
    // DEBUG: Log state at first few updates
    if (!this._debugLogged) {
      this._debugLogged = true;
      console.log('[LavaCreature] preUpdate START:', { 
        x: this.x, y: this.y, 
        body: this.body ? { x: this.body.x, y: this.body.y, w: this.body.width, h: this.body.height, onFloor: this.body.onFloor(), blocked: { down: this.body.blocked.down, left: this.body.blocked.left, right: this.body.blocked.right } } : null,
        active: this.active, visible: this.visible, alpha: this.alpha,
        scene: this.scene ? this.scene.scene.key : 'no scene'
      });
    }

    super.preUpdate(time, delta);

    // DEBUG: Check if destroyed
    if (!this.active || !this.visible || this.alpha === 0) {
      console.warn('[LavaCreature] DISABLED/DESTROYED:', { active: this.active, visible: this.visible, alpha: this.alpha, isDead: this.isDead, isSquashed: this.isSquashed });
      if (!window.__lavaDebug) window.__lavaDebug = [];
      window.__lavaDebug.push({ event: 'disabled', active: this.active, visible: this.visible, alpha: this.alpha, isDead: this.isDead, isSquashed: this.isSquashed, time: Date.now() });
    }

    if (this.isSquashed || this.isDead) return;

    // Attack cooldowns
    if (this.attackCooldown > 0) {
      this.attackCooldown -= delta;
    }
    if (this.eruptionCooldown > 0) {
      this.eruptionCooldown -= delta;
    }

    // Sleep when far off-camera
    const cam = this.scene.cameras.main;
    if (cam && Math.abs(this.x - (cam.scrollX + cam.width / 2)) > 1100) {
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
      if (pursuing && ground.length === 0) {
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
      
      // Claw attack when close
      if (distX < this.CLAW_ATTACK_RANGE && distY < 25 && this.attackCooldown <= 0) {
        this.startClawAttack();
      }
      // Lava eruption when at medium range
      else if (distX < this.ERUPTION_RANGE && distY < 40 && this.eruptionCooldown <= 0) {
        this.startEruption();
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

  startClawAttack() {
    this.isAttacking = true;
    this.attackCooldown = this.ATTACK_COOLDOWN;
    this.setVelocityX(0);
    if (this.scene.anims.exists('lava-claw-attack')) {
      this.play('lava-claw-attack');
    }
    // Attack hitbox check after a short delay
    this.scene.time.delayedCall(250, () => {
      if (this.isDead || this.isSquashed) return;
      const player = this.scene.player;
      if (player && !player.isDead) {
        const distX = Math.abs(player.x - this.x);
        const distY = Math.abs(player.y - this.y);
        if (distX < this.CLAW_ATTACK_RANGE + 10 && distY < 35) {
          this.scene.hurtPlayer();
        }
      }
      // Return to walk after attack animation
      this.scene.time.delayedCall(600, () => {
        if (!this.isDead && !this.isSquashed) {
          this.isAttacking = false;
          if (this.scene.anims.exists('lava-walk')) {
            this.play('lava-walk');
          }
        }
      });
    });
  }

  startEruption() {
    this.isAttacking = true;
    this.eruptionCooldown = this.ERUPTION_COOLDOWN;
    this.setVelocityX(0);
    if (this.scene.anims.exists('lava-eruption')) {
      this.play('lava-eruption');
    }
    // Eruption creates a hazard zone - for now just damage player if close
    this.scene.time.delayedCall(400, () => {
      if (this.isDead || this.isSquashed) return;
      const player = this.scene.player;
      if (player && !player.isDead) {
        const distX = Math.abs(player.x - this.x);
        const distY = Math.abs(player.y - this.y);
        if (distX < this.ERUPTION_RANGE + 20 && distY < 50) {
          this.scene.hurtPlayer();
        }
      }
      // Return to walk after eruption animation
      this.scene.time.delayedCall(800, () => {
        if (!this.isDead && !this.isSquashed) {
          this.isAttacking = false;
          if (this.scene.anims.exists('lava-walk')) {
            this.play('lava-walk');
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
    this.body.setVelocity(dir * 100, -250);
    this.body.setAngularVelocity(dir * 200);
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