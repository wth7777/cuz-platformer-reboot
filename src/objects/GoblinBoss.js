import Phaser from 'phaser';

// Goblin Boss enemy using supplied custom artwork (20 frames, 308x268 each).
// Idle: frames 0-3 (4-frame subtle idle)
// Walk: frames 4-7 (4-frame walk cycle)
// Attack: frames 8-11 (4-frame attack)
// Super Attack: frames 12-15 (4-frame super/charged attack)
// Death: frames 16-19 (4-frame death)
// Scale 0.25 (adjusted to match other enemies).
// Artwork faces RIGHT by default.
export default class GoblinBoss extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, gridKey = null) {
    // Custom goblin atlas: 20 frames @ 308x268 (2x10 grid), facing right.
    super(scene, x, y, 'goblin', 'frame_0');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.gridKey = gridKey;

    // DEBUG: Store spawn info globally for inspection
    if (!window.__goblinDebug) window.__goblinDebug = [];
    window.__goblinDebug.push({ event: 'constructor', x, y, gridKey, texture: this.texture?.key, frame: this.frame?.name, time: Date.now() });
    console.log('[GoblinBoss] Constructor called:', { x, y, gridKey, texture: this.texture?.key, frame: this.frame?.name });

    // Goblin Boss scale: 0.25 (similar to wolf)
    // Frame: 308x268. At 0.25 → display ~77 x 67px
    // Body: effective 28x24, centered horizontally, feet aligned with visual feet
    // Visual feet alignment: match wolf/lava feet offset
    this.body.setSize(28 / 0.25, 24 / 0.25); // effective 28x24
    // Body offset Y: visual feet at 27.5px below center (110px from texture center * 0.25)
    // Body height 24px -> body bottom = center_y + 12. Want body bottom = 27.5.
    // offset_y * 0.25 + 12 = 27.5 => offset_y = 15.5 / 0.25 = 62
    this.body.setOffset(110, 62); // center horizontally, align feet to visual feet
    this.setDepth(1);
    this.setCollideWorldBounds(true);
    this.setScale(0.25);
    this.setOrigin(0.5, 0.5);

    this.direction = -1; // start walking left
    this.isSquashed = false;
    this.isDead = false;
    this.isAttacking = false;
    this.attackCooldown = 0;
    this.superAttackCooldown = 0;
    this.isSuperAttacking = false;

    // Health system: 4 fireball hits to die (boss), 1 stomp kills
    this.fireballHits = 0;
    this.maxFireballHits = 4;
    this.hasBeenDamaged = false; // enables super attack after first fireball hit

    // Goblin Boss constants
    this.WALK_SPEED = 30; // slightly faster than zombie
    this.PURSUE_SPEED = 45;
    this.PURSUE_RANGE = 200;
    this.ATTACK_RANGE = 55;
    this.SUPER_ATTACK_RANGE = 80;
    this.ATTACK_DAMAGE = 30;
    this.SUPER_ATTACK_DAMAGE = 40;
    this.ATTACK_COOLDOWN = 3000; // ms between attacks
    this.SUPER_ATTACK_COOLDOWN = 6000; // ms between super attacks
    this.HEALTH = 6; // contact damage health

    // Super attack timing
    this.SUPER_ATTACK_WARN_TIME = 800; // ms warning before projectile fires
    this.SUPER_ATTACK_PROJECTILE_SPEED = 350;
    this.SUPER_ATTACK_PROJECTILE_RANGE = this.SUPER_ATTACK_RANGE + 50;

    // Play idle animation if available
    if (this.scene.anims.exists('goblin-idle')) {
      this.play('goblin-idle');
      console.log('[GoblinBoss] Playing goblin-idle animation');
    } else {
      console.warn('[GoblinBoss] goblin-idle animation NOT found');
      if (!window.__goblinDebug) window.__goblinDebug = [];
      window.__goblinDebug.push({ error: 'goblin-idle animation NOT found', time: Date.now() });
    }
  }

  preUpdate(time, delta) {
    // DEBUG: Log state at first few updates
    if (!this._debugLogged) {
      this._debugLogged = true;
      console.log('[GoblinBoss] preUpdate START:', { 
        x: this.x, y: this.y, 
        body: this.body ? { x: this.body.x, y: this.body.y, w: this.body.width, h: this.body.height, onFloor: this.body.onFloor(), blocked: { down: this.body.blocked.down, left: this.body.blocked.left, right: this.body.blocked.right } } : null,
        active: this.active, visible: this.visible, alpha: this.alpha,
        scene: this.scene ? this.scene.scene.key : 'no scene'
      });
    }

    super.preUpdate(time, delta);

    // DEBUG: Check if destroyed
    if (!this.active || !this.visible || this.alpha === 0) {
      console.warn('[GoblinBoss] DISABLED/DESTROYED:', { active: this.active, visible: this.visible, alpha: this.alpha, isDead: this.isDead, isSquashed: this.isSquashed });
      if (!window.__goblinDebug) window.__goblinDebug = [];
      window.__goblinDebug.push({ event: 'disabled', active: this.active, visible: this.visible, alpha: this.alpha, isDead: this.isDead, isSquashed: this.isSquashed, time: Date.now() });
    }

    if (this.isSquashed || this.isDead) return;

    // Attack cooldowns
    if (this.attackCooldown > 0) {
      this.attackCooldown -= delta;
    }
    if (this.superAttackCooldown > 0) {
      this.superAttackCooldown -= delta;
    }

    // Sleep when far off-camera
    const cam = this.scene.cameras.main;
    if (cam && Math.abs(this.x - (cam.scrollX + cam.width / 2)) > 1200) {
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
      if (Math.abs(distX) < this.PURSUE_RANGE && distY < 100) {
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
    if (pursuing && !this.isAttacking && !this.isSuperAttacking) {
      const distX = Math.abs(player.x - this.x);
      const distY = Math.abs(player.y - this.y);
      
      // Super attack when damaged and at medium range
      if (this.hasBeenDamaged && distX < this.SUPER_ATTACK_RANGE && distY < 50 && this.superAttackCooldown <= 0) {
        this.startSuperAttack();
      }
      // Regular attack when close
      else if (distX < this.ATTACK_RANGE && distY < 35 && this.attackCooldown <= 0) {
        this.startAttack();
      }
    }

    // Movement
    if (!this.isAttacking && !this.isSuperAttacking) {
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
    if (this.scene.anims.exists('goblin-attack')) {
      this.play('goblin-attack');
    }
    // Attack hitbox check after a short delay
    this.scene.time.delayedCall(300, () => {
      if (this.isDead || this.isSquashed) return;
      const player = this.scene.player;
      if (player && !player.isDead) {
        const distX = Math.abs(player.x - this.x);
        const distY = Math.abs(player.y - this.y);
        if (distX < this.ATTACK_RANGE + 15 && distY < 45) {
          this.scene.hurtPlayerWithKnockback(this.x);
        }
      }
      // Return to walk after attack animation
      this.scene.time.delayedCall(700, () => {
        if (!this.isDead && !this.isSquashed) {
          this.isAttacking = false;
          if (this.scene.anims.exists('goblin-walk')) {
            this.play('goblin-walk');
          }
        }
      });
    });
  }

  startSuperAttack() {
    this.isSuperAttacking = true;
    this.superAttackCooldown = this.SUPER_ATTACK_COOLDOWN;
    this.setVelocityX(0);
    
    if (this.scene.anims.exists('goblin-super-attack')) {
      this.play('goblin-super-attack');
    }

    // Play warning sound
    sfx.play('hurt');

    const player = this.scene.player;
    const towardPlayer = player.x > this.x ? 1 : -1;

    // 1. Show warning ring at goblin's position (charge-up)
    const warningRing = this.scene.add.sprite(this.x, this.y - 20, 'goblin-warning-ring')
      .setScale(0.5)
      .setDepth(5);
    this.scene.tweens.add({
      targets: warningRing,
      scale: 2.5,
      alpha: 0,
      duration: this.SUPER_ATTACK_WARN_TIME,
      ease: 'Power2',
      onComplete: () => warningRing.destroy(),
    });

    // 2. Show warning crack at player's position (target indicator)
    const targetX = player.x;
    const targetCrack = this.scene.add.sprite(targetX, player.y + 10, 'goblin-warning-ring')
      .setScale(0.3)
      .setDepth(5)
      .setTint(0xff8800);
    this.scene.tweens.add({
      targets: targetCrack,
      scale: 1.5,
      alpha: { from: 1, to: 0 },
      duration: this.SUPER_ATTACK_WARN_TIME,
      ease: 'Power2',
      onComplete: () => targetCrack.destroy(),
    });

    // 3. After warning, fire projectile
    this.scene.time.delayedCall(this.SUPER_ATTACK_WARN_TIME, () => {
      if (this.isDead || this.isSquashed) return;
      
      // Fire projectile toward player
      const projX = this.x + towardPlayer * 30;
      const projY = this.y - 10;
      const projectile = this.scene.add.sprite(projX, projY, 'goblin-projectile')
        .setScale(1.2)
        .setDepth(5);
      
      this.scene.physics.add.existing(projectile);
      projectile.body.setCircle(12);
      projectile.body.setAllowGravity(false);
      projectile.body.setVelocity(towardPlayer * this.SUPER_ATTACK_PROJECTILE_SPEED, 0);
      
      // Add rotation for visual effect
      this.scene.tweens.add({
        targets: projectile,
        angle: towardPlayer * 720,
        duration: 1000,
        repeat: -1,
        ease: 'Linear',
      });

      // Trail particles
      const trailEmitter = this.scene.add.particles(projX, projY, 'spark', {
        speed: 20,
        lifespan: 300,
        scale: { start: 0.8, end: 0 },
        tint: 0xff8800,
        emitting: false,
      });
      this.scene.time.addEvent({
        delay: 30,
        repeat: 20,
        callback: () => {
          if (projectile.active) {
            trailEmitter.emitParticleAt(projectile.x, projectile.y);
          } else {
            trailEmitter.destroy();
          }
        },
      });

      // Check collision with player
      const checkHit = () => {
        if (!projectile.active || this.isDead || this.isSquashed) {
          if (trailEmitter) trailEmitter.destroy();
          return;
        }
        const player = this.scene.player;
        if (player && !player.isDead) {
          const distX = Math.abs(player.x - projectile.x);
          const distY = Math.abs(player.y - projectile.y);
          if (distX < 30 && distY < 40) {
            this.onSuperAttackHit(player, projectile);
            return;
          }
        }
        // Check range
        if (Math.abs(projectile.x - this.x) > this.SUPER_ATTACK_PROJECTILE_RANGE) {
          projectile.destroy();
          if (trailEmitter) trailEmitter.destroy();
          return;
        }
        this.scene.time.delayedCall(50, checkHit);
      };
      checkHit();
    });
  }

  onSuperAttackHit(player, projectile) {
    // Destroy projectile
    projectile.destroy();
    
    // Impact effect at player position
    const impact = this.scene.add.sprite(player.x, player.y - 20, 'goblin-projectile')
      .setScale(2)
      .setDepth(10);
    this.scene.tweens.add({
      targets: impact,
      scale: 3,
      alpha: 0,
      duration: 300,
      ease: 'Power2',
      onComplete: () => impact.destroy(),
    });

    // Screen shake
    this.scene.cameras.main.shake(200, 0.01);

    // Damage player with knockback
    this.scene.hurtPlayerWithKnockback(this.x, true); // true = super attack

    // Return to walk after super attack animation
    this.scene.time.delayedCall(900, () => {
      if (!this.isDead && !this.isSquashed) {
        this.isSuperAttacking = false;
        if (this.scene.anims.exists('goblin-walk')) {
          this.play('goblin-walk');
        }
      }
    });
  }

  startAttack() {
    this.isAttacking = true;
    this.attackCooldown = this.ATTACK_COOLDOWN;
    this.setVelocityX(0);
    if (this.scene.anims.exists('goblin-attack')) {
      this.play('goblin-attack');
    }
    // Attack hitbox check after a short delay
    this.scene.time.delayedCall(300, () => {
      if (this.isDead || this.isSquashed) return;
      const player = this.scene.player;
      if (player && !player.isDead) {
        const distX = Math.abs(player.x - this.x);
        const distY = Math.abs(player.y - this.y);
        if (distX < this.ATTACK_RANGE + 15 && distY < 45) {
          this.scene.hurtPlayerWithKnockback(this.x);
        }
      }
      // Return to walk after attack animation
      this.scene.time.delayedCall(700, () => {
        if (!this.isDead && !this.isSquashed) {
          this.isAttacking = false;
          if (this.scene.anims.exists('goblin-walk')) {
            this.play('goblin-walk');
          }
        }
      });
    });
  }

  /** Hit by blue fireball: first 3 hits damage, 4th hit kills. */
  knockAway(fromX = this.x) {
    if (this.isDead) return;
    
    this.fireballHits++;
    console.log('[GoblinBoss] Fireball hit:', { fireballHits: this.fireballHits, max: this.maxFireballHits });
    
    if (this.fireballHits >= this.maxFireballHits) {
      // Fourth hit - kill
      this.isDead = true;
      this.isSquashed = true;
      this.scene.consume?.(this.gridKey);
      this.anims.stop();
      this.body.checkCollision.none = true;
      const dir = this.x < fromX ? -1 : 1;
      this.body.setVelocity(dir * 100, -250);
      this.body.setAngularVelocity(dir * 200);
      // Play death animation
      if (this.scene.anims.exists('goblin-death')) {
        this.play('goblin-death');
      }
      this.scene.time.delayedCall(1200, () => {
        if (this.body && this.body.world) this.destroy();
      });
    } else {
      // Hit - damage, show hurt reaction, enable super attack after first hit
      this.hasBeenDamaged = true; // enables super attack (enraged)
      this.showHurt();
    }
  }

  /** Show hurt reaction (flash red, brief pause) */
  showHurt() {
    // Flash red
    this.setTint(0xff0000);
    this.scene.time.delayedCall(150, () => {
      if (!this.isDead && !this.isSquashed) {
        this.clearTint();
      }
    });
    // Brief pause
    this.setVelocityX(0);
    this.scene.time.delayedCall(400, () => {
      if (!this.isDead && !this.isSquashed && !this.isAttacking && !this.isSuperAttacking) {
        // Resume movement
      }
    });
  }

  /** Stomped from above: instant kill (one stomp). */
  squash() {
    if (this.isDead) return;
    this.isDead = true;
    this.isSquashed = true;
    this.scene.consume?.(this.gridKey);
    this.anims.stop();
    this.body.checkCollision.none = true;
    this.body.setVelocity(0, 0);
    this.body.allowGravity = false;
    // Play death animation
    if (this.scene.anims.exists('goblin-death')) {
      this.play('goblin-death');
    }
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