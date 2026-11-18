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
    this.body.setOffset(110, 110); // center horizontally, align feet
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
    // PURSUE_RANGE removed — detection is now camera-relative (see preUpdate)
    this.ATTACK_RANGE = 55;
    this.SUPER_ATTACK_RANGE = 80;
    this.ATTACK_DAMAGE = 30;
    this.SUPER_ATTACK_DAMAGE = 40;
    this.ATTACK_COOLDOWN = 3000; // ms between attacks
    this.SUPER_ATTACK_COOLDOWN = 6000; // ms between super attacks
    this.HEALTH = 6; // contact damage health

    // Patrol boundaries around spawn location (±120px)
    this.patrolStartX = x - 120;
    this.patrolEndX = x + 120;
    this.isChasing = false; // start in patrol mode

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

    const cam = this.scene.cameras.main;

    // Camera visible world dimensions (account for zoom: cam.width is display px)
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
        // Attack logic retained
        if (!this.isAttacking && !this.isSuperAttacking) {
          const atkDistX = Math.abs(player.x - this.x);
          const atkDistY = Math.abs(player.y - this.y);
          // Super attack when damaged and at medium range
          if (this.hasBeenDamaged && atkDistX < this.SUPER_ATTACK_RANGE && atkDistY < 50 && this.superAttackCooldown <= 0) {
            this.startSuperAttack();
            return;
          }
          // Regular attack when close
          if (atkDistX < this.ATTACK_RANGE && atkDistY < 35 && this.attackCooldown <= 0) {
            this.startAttack();
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
          this.scene.hurtPlayer();
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
    // Super attack creates a larger hazard zone
    this.scene.time.delayedCall(400, () => {
      if (this.isDead || this.isSquashed) return;
      const player = this.scene.player;
      if (player && !player.isDead) {
        const distX = Math.abs(player.x - this.x);
        const distY = Math.abs(player.y - this.y);
        if (distX < this.SUPER_ATTACK_RANGE + 25 && distY < 60) {
          this.scene.hurtPlayer();
        }
      }
      // Return to walk after super attack animation
      this.scene.time.delayedCall(900, () => {
        if (!this.isDead && !this.isSquashed) {
          this.isSuperAttacking = false;
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