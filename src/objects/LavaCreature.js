import Phaser from 'phaser';
import { sfx } from '../audio/sfx.js';

// Lava Creature enemy using supplied custom artwork (20 frames, 307x256 each).
// Idle: frames 0-3 (4-frame subtle idle)
// Walk: frames 4-11 (8-frame walk cycle)
// Claw attack: frames 12-15 (4-frame claw swipe)
// Lava eruption: frames 16-18 (3-frame eruption) - ONLY after taking fireball damage
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
    // Idle frame_0 feet at y=248 (7px padding), 120px from center * 0.22 = 26.4px
    // Body: effective 24x20, body height 20px -> body bottom = center_y + 10
    // Want body bottom = 26.4 => offset_y * 0.22 + 10 = 26.4 => offset_y = 16.4 / 0.22 = 75
    this.body.setSize(24 / 0.22, 20 / 0.22); // effective 24x20
    this.body.setOffset(120, 75); // center horizontally, align feet to visual feet
    this.setDepth(1);
    this.setCollideWorldBounds(true);
    this.setScale(0.22);
    this.setOrigin(0.5, 0.5);

    // Visual feet alignment handled by spawn Y calculation in GameScene:
    // groundY - 26.4 (idle frame_0: feet at y=248, 120px from center * 0.22 = 26.4px)
    // No constructor y-offset — avoids drift and keeps physics body in sync.

    this.direction = -1; // start walking left
    this.isSquashed = false;
    this.isDead = false;
    this.isAttacking = false;
    this.attackCooldown = 0;
    this.eruptionCooldown = 0;

    // Health system: 2 fireball hits to die, 1 stomp kills
    this.fireballHits = 0;
    this.maxFireballHits = 2;
    this.hasBeenDamaged = false; // enables eruption after first fireball hit

    // Lava Creature constants
    this.WALK_SPEED = 20; // slowest - lumbering
    this.PURSUE_SPEED = 30;
    this.PURSUE_RANGE = 150;
    this.CLAW_ATTACK_RANGE = 45;
    this.ERUPTION_RANGE = 100;
    this.ATTACK_DAMAGE = 30;
    this.ATTACK_COOLDOWN = 2000; // ms between attacks
    this.ERUPTION_COOLDOWN = 3000; // ms between eruptions
    this.HEALTH = 8; // contact damage health (not used for fireball kills)

    // Eruption timing
    this.ERUPTION_WARN_TIME = 1000; // ms warning before eruption
    this.ERUPTION_DURATION = 1500; // ms eruption active

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
      // Lava eruption ONLY after taking fireball damage (enraged), at medium range
      else if (this.hasBeenDamaged && distX < this.ERUPTION_RANGE && distY < 40 && this.eruptionCooldown <= 0) {
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
          this.scene.hurtPlayerWithKnockback(this.x);
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

    // Play eruption sound
    sfx.play('hurt');

    const player = this.scene.player;

    // 1. Show warning cracks on ground between lava and player (danger zone)
    const startX = this.x;
    const endX = player.x;
    const numCracks = Math.ceil(Math.abs(endX - startX) / 40) + 1;
    const cracks = [];
    
    for (let i = 0; i < numCracks; i++) {
      const t = i / (numCracks - 1);
      const crackX = Phaser.Math.Linear(startX, endX, t);
      const groundY = this.scene.findFloorRow(crackX / 18) * 18; // TILE = 18
      
      const crack = this.scene.add.sprite(crackX, groundY, 'lava-warning-crack')
        .setScale(0.5)
        .setDepth(4)
        .setTint(0xff6600);
      cracks.push(crack);
      
      // Animate warning crack
      this.scene.tweens.add({
        targets: crack,
        scale: 1.2,
        alpha: { from: 0.8, to: 0.3 },
        duration: 800,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    // 2. Play eruption sound
    sfx.play('break');

    // 3. After warning, create eruption splash
    this.scene.time.delayedCall(1000, () => {
      if (this.isDead || this.isSquashed) return;
      
      // Destroy warning cracks
      cracks.forEach(crack => crack.destroy());

      // Create eruption splash at lava creature position (source)
      const sourceSplash = this.scene.add.sprite(this.x, this.y - 20, 'lava-splash')
        .setScale(1.5)
        .setDepth(5);
      this.scene.tweens.add({
        targets: sourceSplash,
        scale: 2.5,
        alpha: 0,
        y: this.y - 60,
        duration: 800,
        ease: 'Power2',
        onComplete: () => sourceSplash.destroy(),
      });

      // 3. Create lava wave traveling toward player
      const towardPlayer = player.x > this.x ? 1 : -1;
      const waveDistance = Math.abs(player.x - this.x);
      const waveDuration = 800;
      
      // Create ground lava trail
      const trailSprites = [];
      const trailSegments = Math.ceil(waveDistance / 30);
      for (let i = 0; i <= trailSegments; i++) {
        const t = i / trailSegments;
        const trailX = Phaser.Math.Linear(this.x, player.x, t);
        const groundY = this.scene.findFloorRow(trailX / 18) * 18;
        
        const trail = this.scene.add.sprite(trailX, groundY - 10, 'lava-splash')
          .setScale(0.8)
          .setDepth(4)
          .setAlpha(0);
        trailSprites.push({ sprite: trail, x: trailX, groundY, delay: i * 50 });
      }

      // Animate lava trail spreading
      trailSprites.forEach(({ sprite, delay }) => {
        this.scene.time.delayedCall(delay, () => {
          if (this.isDead || this.isSquashed) {
            sprite.destroy();
            return;
          }
          this.scene.tweens.add({
            targets: sprite,
            alpha: 1,
            scale: 1.5,
            y: sprite.groundY - 30,
            duration: 400,
            ease: 'Power2',
            yoyo: true,
            onComplete: () => sprite.destroy(),
          });
        });
      });

      // 4. Create impact splash at player position
      this.scene.time.delayedCall(800, () => {
        if (this.isDead || this.isSquashed) return;
        
        const player = this.scene.player;
        if (player && !player.isDead) {
          const distX = Math.abs(player.x - this.x);
          const distY = Math.abs(player.y - this.y);
          if (distX < this.ERUPTION_RANGE + 30 && distY < 60) {
            this.onEruptionHit(player);
          }
        }
      });

      // Return to walk after eruption animation
      this.scene.time.delayedCall(this.ERUPTION_DURATION, () => {
        if (!this.isDead && !this.isSquashed) {
          this.isAttacking = false;
          if (this.scene.anims.exists('lava-walk')) {
            this.play('lava-walk');
          }
        }
      });
    });
  }

  onEruptionHit(player) {
    // Impact effect at player position
    const impact = this.scene.add.sprite(player.x, player.y - 20, 'lava-splash')
      .setScale(2)
      .setDepth(10)
      .setTint(0xff4400);
    this.scene.tweens.add({
      targets: impact,
      scale: 3,
      alpha: 0,
      duration: 400,
      ease: 'Power2',
      onComplete: () => impact.destroy(),
    });

    // Screen shake - stronger for eruption
    this.scene.cameras.main.shake(300, 0.015);

    // Damage player with knockback
    this.scene.hurtPlayerWithKnockback(this.x, true); // true = eruption

    // Return to walk after eruption animation
    this.scene.time.delayedCall(this.ERUPTION_DURATION, () => {
      if (!this.isDead && !this.isSquashed) {
        this.isAttacking = false;
        if (this.scene.anims.exists('lava-walk')) {
          this.play('lava-walk');
        }
      }
    });
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
          this.scene.hurtPlayerWithKnockback(this.x);
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

  /** Hit by blue fireball: first hit damages, second hit kills. */
  knockAway(fromX = this.x) {
    if (this.isDead) return;
    
    this.fireballHits++;
    console.log('[LavaCreature] Fireball hit:', { fireballHits: this.fireballHits, max: this.maxFireballHits });
    
    if (this.fireballHits >= this.maxFireballHits) {
      // Second hit - kill
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
    } else {
      // First hit - damage, show hurt reaction, enable eruption
      this.hasBeenDamaged = true; // enables eruption (enraged)
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
    this.scene.time.delayedCall(300, () => {
      if (!this.isDead && !this.isSquashed && !this.isAttacking) {
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