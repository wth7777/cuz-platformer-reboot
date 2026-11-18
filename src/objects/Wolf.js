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

    // DEBUG: Store spawn info globally for inspection
    if (!window.__wolfDebug) window.__wolfDebug = [];
    window.__wolfDebug.push({ event: 'constructor', x, y, gridKey, texture: this.texture?.key, frame: this.frame?.name, time: Date.now() });
    console.log('[Wolf] Constructor called:', { x, y, gridKey, texture: this.texture?.key, frame: this.frame?.name });

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
    // PURSUE_RANGE removed — detection is now camera-relative (see preUpdate)
    this.ATTACK_RANGE = 40; // attack when close
    this.ATTACK_DAMAGE = 25;
    this.ATTACK_COOLDOWN = 1500; // ms between attacks
    this.HEALTH = 3;

    // Patrol boundaries around spawn location (±120px)
    this.patrolStartX = x - 120;
    this.patrolEndX = x + 120;
    this.isChasing = false; // start in patrol mode
    this.chaseStartTime = 0; // timestamp when chase began

    // World-space detection parameters (fixed, independent of camera/zoom)
    this.detectRadius = 180;   // horizontal aggro distance
    this.loseRadius = 300;     // disengagement distance (hysteresis)
    this.attackRadius = 40;    // attack range
    this.verticalTolerance = 80; // vertical distance tolerance for detection

    // Play walk animation if available
    if (this.scene.anims.exists('wolf-walk')) {
      this.play('wolf-walk');
      console.log('[Wolf] Playing wolf-walk animation');
    } else {
      console.warn('[Wolf] wolf-walk animation NOT found');
      if (!window.__wolfDebug) window.__wolfDebug = [];
      window.__wolfDebug.push({ error: 'wolf-walk animation NOT found', time: Date.now() });
    }
  }

  preUpdate(time, delta) {
    // DEBUG: Log state at first few updates
    if (!this._debugLogged) {
      this._debugLogged = true;
      console.log('[Wolf] preUpdate START:', {
        x: this.x, y: this.y,
        body: this.body ? { x: this.body.x, y: this.body.y, w: this.body.width, h: this.body.height, onFloor: this.body.onFloor(), blocked: { down: this.body.blocked.down, left: this.body.blocked.left, right: this.body.blocked.right } } : null,
        active: this.active, visible: this.visible, alpha: this.alpha,
        scene: this.scene ? this.scene.scene.key : 'no scene'
      });
    }

    super.preUpdate(time, delta);

    // DEBUG: Check if destroyed/disabled
    if (!this.active || !this.visible || this.alpha === 0) {
      console.warn('[Wolf] DISABLED/DESTROYED:', { active: this.active, visible: this.visible, alpha: this.alpha, isDead: this.isDead, isSquashed: this.isSquashed });
      if (!window.__wolfDebug) window.__wolfDebug = [];
      window.__wolfDebug.push({ event: 'disabled', active: this.active, visible: this.visible, alpha: this.alpha, isDead: this.isDead, isSquashed: this.isSquashed, time: Date.now() });
    }

    if (this.isSquashed || this.isDead) return;

    // Attack cooldown
    if (this.attackCooldown > 0) {
      this.attackCooldown -= delta;
    }

    // Activation region: camera bounds + modest margin (world coordinates)
    // Only run detection logic for enemies near the active gameplay area
    const cam = this.scene.cameras.main;
    const camWidthWorld = cam.width / cam.zoom;
    const camCenter = cam.scrollX + camWidthWorld / 2;
    const ACTIVATION_MARGIN = 300; // world px beyond camera edge (~0.6x camera width)
    const activationLeft = camCenter - camWidthWorld / 2 - ACTIVATION_MARGIN;
    const activationRight = camCenter + camWidthWorld / 2 + ACTIVATION_MARGIN;
    const isActive = this.x >= activationLeft && this.x <= activationRight;

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

    // State machine: patrol <-> chase (world-space detection, no camera gating)
    if (this.isChasing) {
      const distX = player ? Math.abs(player.x - this.x) : 9999;
      const distY = player ? Math.abs(player.y - this.y) : 9999;

      // Disengage: player dead (immediate) OR distance exceeded (with minimum chase duration)
      if (!playerAlive) {
        this.isChasing = false; // immediate disengage on player death
      } else if (distX > this.loseRadius || distY > this.verticalTolerance) {
        // Require minimum chase duration to prevent rapid state flickering
        if (time - this.chaseStartTime > 1500) {
          this.isChasing = false;
        }
      } else {
        // Attack check when close enough
        if (!this.isAttacking && this.attackCooldown <= 0) {
          const atkDistX = Math.abs(player.x - this.x);
          const atkDistY = Math.abs(player.y - this.y);
          if (atkDistX < this.ATTACK_RANGE && atkDistY < 20) {
            this.startAttack();
            return;
          }
        }
        // Continue pursuing
        this.pursuePlayer(player);
        return;
      }
    } else {
      // Patrol mode: check for player detection (only if active)
      if (playerAlive && isActive) {
        const distX = Math.abs(player.x - this.x);
        const distY = Math.abs(player.y - this.y);
        if (distX < this.detectRadius && distY < this.verticalTolerance) {
          this.isChasing = true;
          this.chaseStartTime = time; // record when chase began
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