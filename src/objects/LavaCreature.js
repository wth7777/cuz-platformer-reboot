import Phaser from 'phaser';

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
    // Match wolf's visual feet alignment (wolf: scale 0.2125, frame 384x256, feet offset 22.2)
    // Lava: scale 0.22, frame 307x256, same frame height, similar scale → use same feet offset
    this.body.setSize(24 / 0.22, 20 / 0.22); // effective 24x20
    this.body.setOffset(120, 120); // center horizontally, align feet
    this.setDepth(1);
    this.setCollideWorldBounds(true);
    this.setScale(0.22);
    this.setOrigin(0.5, 0.5);

    // Visual feet alignment handled by spawn Y calculation in GameScene:
    // groundY - 22.2 (matches wolf: same frame height 256, similar scale 0.2125 vs 0.22)
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
    // PURSUE_RANGE removed — detection is now camera-relative (see preUpdate)
    this.CLAW_ATTACK_RANGE = 45;
    this.ERUPTION_RANGE = 100;
    this.ATTACK_DAMAGE = 30;
    this.ATTACK_COOLDOWN = 2000; // ms between attacks
    this.ERUPTION_COOLDOWN = 3000; // ms between eruptions
    this.HEALTH = 8; // contact damage health (not used for fireball kills)

    // Patrol boundaries around spawn location (±120px)
    this.patrolStartX = x - 120;
    this.patrolEndX = x + 120;
    this.isChasing = false; // start in patrol mode

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

    // Camera visible world dimensions (account for zoom: cam.width is display px)
    const cam = this.scene.cameras.main;
    const camWidthWorld = cam.width / cam.zoom;          // world pixels visible

    // Camera-relative detection distances (scale with zoom/screen size)
    const detectionRange = camWidthWorld * 0.75;   // 75% of full visible width
    const disengageRange = camWidthWorld * 0.90;   // larger threshold for disengage

    // Is the enemy visible in the camera viewport? (world coordinates)
    const camLeft = cam.scrollX;                           // left edge in world px
    const camRight = cam.scrollX + camWidthWorld;          // right edge in world px
    const isVisible = this.x >= camLeft && this.x <= camRight;

    // Off-screen enemies keep patrolling but cannot detect/chase the player.
    const farOffCamera = Math.abs(this.x - (cam.scrollX + camWidthWorld / 2)) > 1100;

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
        // Attack check when close enough (claw attack)
        if (!this.isAttacking && this.attackCooldown <= 0) {
          const atkDistX = Math.abs(player.x - this.x);
          const atkDistY = Math.abs(player.y - this.y);
          if (atkDistX < this.CLAW_ATTACK_RANGE && atkDistY < 25) {
            this.startClawAttack();
            return;
          }
        }
        // Lava eruption ONLY after taking fireball damage (enraged), at medium range
        if (this.hasBeenDamaged && !this.isAttacking && this.eruptionCooldown <= 0) {
          const eruDistX = Math.abs(player.x - this.x);
          const eruDistY = Math.abs(player.y - this.y);
          if (eruDistX < this.ERUPTION_RANGE && eruDistY < 40) {
            this.startEruption();
            return;
          }
        }
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
    const speed = this.WALK_SPEED;
    this.setVelocityX(speed * this.direction);

    // Artwork faces RIGHT. When moving LEFT (direction < 0), flip to face left.
    this.setFlipX(this.direction < 0);
  }

  /** Shared pursuit logic: move toward the player. */
  pursuePlayer(player) {
    const distX = player.x - this.x;
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

    const speed = this.PURSUE_SPEED;
    this.setVelocityX(speed * this.direction);

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