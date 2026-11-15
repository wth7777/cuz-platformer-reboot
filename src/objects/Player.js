import Phaser from 'phaser';
import { sfx } from '../audio/sfx.js';

// ---- Movement tuning (the "game feel" numbers) ----
const ACCELERATION = 1600;
const DRAG = 1300;
const MAX_RUN_SPEED = 240;
const MAX_FALL_SPEED = 900;
const JUMP_VELOCITY = -480;
const JUMP_CUT_VELOCITY = -160;
const EXTRA_FALL_GRAVITY = 900;

// ---- Cousin visual/physical constants ----
const COUSIN_SCALE = 0.2;          // visual scale on 428x256 source frames
const COUSIN_BODY_W = 16;          // collision width (world units)
const COUSIN_BODY_H = 32;          // collision height (world units)
const COUSIN_ORIGIN_Y = 1;         // origin at feet (bottom center)
const COUSIN_BODY_OFFSET_X = 8;    // centered horizontally
const COUSIN_BODY_OFFSET_Y = 222;  // body top at frame y=222, bottom at visual feet (frame y=254)
const ATTACK_DURATION = 350;       // ms

/**
 * The cousin player — 16-frame atlas, no power-up states.
 * Animations (defined in PreloadScene):
 *   player-idle    (frame_0)
 *   player-run     (frame_1-4)
 *   player-jump    (frame_5-7)
 *   player-attack  (frame_8-10)  — includes blue fireball artwork
 *   player-crouch  (frame_11)
 *   player-hurt    (frame_12-14)
 *   player-die     (frame_15)
 */
export default class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y) {
    super(scene, x, y, 'player', 'frame_0');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setDepth(2);
    this.setCollideWorldBounds(true);
    this.setScale(COUSIN_SCALE);
    this.setOrigin(0.5, COUSIN_ORIGIN_Y);

    // Fixed collision body, anchored at feet
    this.body.setSize(COUSIN_BODY_W, COUSIN_BODY_H);
    this.body.setOffset(COUSIN_BODY_OFFSET_X, COUSIN_BODY_OFFSET_Y);
    this.body.setMaxVelocity(MAX_RUN_SPEED, MAX_FALL_SPEED);
    this.body.setDragX(DRAG);

    this.isAttacking = false;
    this.attackTimer = null;
    this.isDead = false;
    this.wasOnFloor = true;
  }

  /** Called by GameScene every frame with the merged input state. */
  handleInput({ left, right, jumpHeld, jumpPressed, attackPressed }) {
    if (this.isDead || this.isAttacking) return;

    const body = this.body;
    const onGround = body.onFloor();

    if (left && !right) {
      body.setAccelerationX(-ACCELERATION);
      this.setFlipX(true);
    } else if (right && !left) {
      body.setAccelerationX(ACCELERATION);
      this.setFlipX(false);
    } else {
      body.setAccelerationX(0);
    }

    if (jumpPressed && onGround) {
      body.setVelocityY(JUMP_VELOCITY);
      sfx.play('jump');
    }
    if (!jumpHeld && body.velocity.y < JUMP_CUT_VELOCITY) {
      body.setVelocityY(JUMP_CUT_VELOCITY);
    }
    body.setGravityY(body.velocity.y > 0 ? EXTRA_FALL_GRAVITY : 0);

    // Attack — play once, lock movement until frame 10 finishes
    if (attackPressed && onGround && !this.isAttacking) {
      this.startAttack();
    }

    // Animation selection (non-attack states)
    if (!this.isAttacking) {
      if (body.velocity.y < 0) {
        if (this.anims.currentAnim?.key !== 'player-jump') {
          this.anims.play('player-jump', true);
        }
      } else if (!onGround) {
        if (this.anims.currentAnim?.key !== 'player-jump') {
          this.anims.play('player-jump', true);
        }
      } else if (Math.abs(body.velocity.x) > 10) {
        if (this.anims.currentAnim?.key !== 'player-run') {
          this.anims.play('player-run', true);
        }
      } else {
        if (this.anims.currentAnim?.key !== 'player-idle') {
          this.anims.play('player-idle', true);
        }
      }
    }
  }

  startAttack() {
    this.isAttacking = true;
    this.body.setAccelerationX(0);
    this.body.setVelocityX(0);
    this.anims.play('player-attack', true);

    // Fire the blue fireball immediately — the visual fireball art is baked
    // into frames 8-10, this spawns the actual projectile that hits enemies.
    this.spawnProjectile();

    // Lock movement for the full attack animation
    this.attackTimer = this.scene.time.delayedCall(ATTACK_DURATION, () => {
      this.isAttacking = false;
      this.attackTimer = null;
    });
  }

  spawnProjectile() {
    if (!this.scene) return;
    const dir = this.flipX ? -1 : 1;
    const px = this.x + dir * (this.width * 0.6);
    const py = this.y - this.height * 0.35;

    // Create projectile and add to physics group — the group will enable physics
    const proj = this.scene.fireballs.create(px, py, 'fireball');
    proj.body.setAllowGravity(false);
    proj.body.setVelocityX(600 * dir);
    proj.setScale(0.8);
    proj.setDepth(3);
    proj.setData('fromPlayer', true);

    // Auto-cleanup after 800ms or when off-screen
    this.scene.time.delayedCall(800, () => {
      if (proj.active) proj.destroy();
    });
  }

  /** Death visuals: play die anim, freeze physics, scene handles restart. */
  die() {
    if (this.isDead) return;
    this.isDead = true;
    this.body.checkCollision.none = true;
    this.body.setAccelerationX(0);
    this.body.setDragX(0);
    this.body.setVelocity(0, 0);
    this.anims.play('player-die', true);
  }

  preUpdate(time, delta) {
    super.preUpdate(time, delta);

    // Landing squash feedback (visual only — body size stays constant)
    if (!this.isDead && this.body) {
      const onFloor = this.body.onFloor();
      if (onFloor && !this.wasOnFloor) {
        // Brief scale pulse
        this.scene.tweens.add({
          targets: this,
          scaleY: COUSIN_SCALE * 0.85,
          scaleX: COUSIN_SCALE * 1.1,
          duration: 60,
          yoyo: true,
          onComplete: () => this.setScale(COUSIN_SCALE),
        });
      }
      this.wasOnFloor = onFloor;
    }
  }
}