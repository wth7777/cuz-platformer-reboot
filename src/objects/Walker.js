import Phaser from 'phaser';

const WALK_SPEED = 40;
const PURSUE_SPEED = 60; // faster when chasing
const FRAME_WALK = 18; // blue slime: two walk frames (18, 19)...
const FRAME_SQUASHED = 20; // ...and a ready-made flattened frame

// A goomba-style patrolling enemy. Extending Arcade.Sprite means Phaser
// calls our preUpdate() automatically every frame — the enemy carries
// its own behaviour instead of GameScene micro-managing it.
export default class Walker extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, gridKey = null) {
    super(scene, x, y, 'chars', FRAME_WALK);
    scene.add.existing(this); // register for rendering + updates
    scene.physics.add.existing(this); // give it a dynamic body
    this.gridKey = gridKey; // identity for cross-pipe level state

    this.body.setSize(16, 14);
    this.body.setOffset(4, 10); // align body bottom with the feet
    this.setDepth(1); // same layer as items, above terrain
    this.setCollideWorldBounds(true);

    this.direction = -1; // start walking left
    this.isSquashed = false;

    // Patrol boundaries: turn around when reaching either edge of spawn zone
    this.patrolStartX = x - 120;
    this.patrolEndX = x + 120;
    this.isChasing = false; // start in patrol mode

    this.play('walker-walk');
  }

  preUpdate(time, delta) {
    super.preUpdate(time, delta); // keeps the animation running

    if (this.isSquashed) return;

    const cam = this.scene.cameras.main;

    // Camera visible world dimensions (account for zoom: cam.width is display px)
    const camWidthWorld = cam.width / cam.zoom;          // world pixels visible
    const camHalfWidthWorld = camWidthWorld / 2;         // center to edge in world px

    // Camera-relative detection distances (scale with zoom/screen size)
    const detectionRange = camHalfWidthWorld * 0.75;   // 75% of center-to-edge
    const disengageRange = camHalfWidthWorld * 1.0;    // larger threshold for disengage

    // Is the enemy visible in the camera viewport? (world coordinates)
    const camLeft = cam.scrollX;                           // left edge in world px
    const camRight = cam.scrollX + camWidthWorld;          // right edge in world px
    const isVisible = this.x >= camLeft && this.x <= camRight;

    // Off-screen enemies keep patrolling but cannot detect/chase the player.
    const farOffCamera = Math.abs(this.x - (cam.scrollX + camHalfWidthWorld)) > 1100;

    const player = this.scene.player;
    const playerAlive = player && !player.isDead;

    // Turn at patrol boundaries around spawn location
    if (this.x <= this.patrolStartX) {
      this.direction = 1;
    } else if (this.x >= this.patrolEndX) {
      this.direction = -1;
    }

    // Turn at walls (blocked = static obstacle, touching = another enemy)
    if (this.body.blocked.left || this.body.touching.left) {
      this.direction = 1;
    } else if (this.body.blocked.right || this.body.touching.right) {
      this.direction = -1;
    }

    // Turn at platform edges: probe a tiny rectangle just ahead of and
    // below the front foot — if no static body is there, it's a cliff.
    if (this.body.onFloor()) {
      const aheadX = this.direction > 0 ? this.body.right + 2 : this.body.left - 3;
      const ground = this.scene.physics.overlapRect(
        aheadX, this.body.bottom + 2, 2, 4,
        false, true // ignore dynamic bodies, include static ones
      );
      if (ground.length === 0) this.direction *= -1;
    }

    // TEMP DIAGNOSTIC: log detection state once per second (60 frames)
    if (!this._diagFrame) this._diagFrame = 0;
    this._diagFrame++;
    if (this._diagFrame % 60 === 0 && this.scene.player) {
      const p = this.scene.player;
      const dX = Math.abs(p.x - this.x);
      console.log('[Walker DIAG]', {
        enemyX: Math.round(this.x), enemyY: Math.round(this.y),
        playerX: Math.round(p.x), playerY: Math.round(p.y),
        distX: Math.round(dX), detectionRange: Math.round(detectionRange),
        isVisible, farOffCamera, isChasing: this.isChasing,
        camScrollX: Math.round(cam.scrollX), camLeft: Math.round(camLeft), camRight: Math.round(camRight)
      });
    }

    // State machine: patrol <-> chase (detection only when on-screen)
    if (this.isChasing) {
      const distX = player ? Math.abs(player.x - this.x) : 9999;
      if (!playerAlive || distX > disengageRange || !isVisible || farOffCamera) {
        this.isChasing = false;
      } else {
        this.pursuePlayer(player);
        return;
      }
    } else {
      // Patrol mode: check for player detection (only if on-screen)
      if (playerAlive && !farOffCamera && isVisible) {
        const distX = Math.abs(player.x - this.x);
        if (distX < detectionRange) {
          this.isChasing = true;
          this.pursuePlayer(player);
          return;
        }
      }
    }

    // Patrol movement (runs both on-screen and off-screen)
    this.setVelocityX(WALK_SPEED * this.direction);
    this.setFlipX(this.direction > 0);
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
        const dropCheck = this.scene.physics.overlapRect(
          checkX, this.body.bottom + 2, 2, 120,
          false, true
        );
        if (dropCheck.length > 0) {
          this.direction = towardPlayer;
        }
      }
    }

    const speed = PURSUE_SPEED;
    this.setVelocityX(speed * this.direction);
    this.setFlipX(this.direction > 0);
  }

  /** Killed by a fireball or a star-powered player: flip and fall away. */
  knockAway(fromX = this.x) {
    this.isSquashed = true; // reuse the flag: stops AI and contact checks
    this.scene.consume?.(this.gridKey);
    this.anims.stop();
    this.body.checkCollision.none = true;
    this.setFlipY(true);
    const dir = this.x < fromX ? -1 : 1;
    this.body.setVelocity(dir * 120, -280);
    this.body.setAngularVelocity(dir * 240);
    this.scene.time.delayedCall(900, () => this.destroy());
  }

  /** Stomped from above: flatten, stop interacting, vanish shortly after. */
  squash() {
    this.isSquashed = true;
    this.scene.consume?.(this.gridKey);
    this.anims.stop();
    this.setFrame(FRAME_SQUASHED);
    this.body.checkCollision.none = true;
    this.body.setVelocity(0, 0);
    this.body.allowGravity = false;
    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      delay: 300,
      duration: 200,
      onComplete: () => this.destroy(),
    });
  }
}
