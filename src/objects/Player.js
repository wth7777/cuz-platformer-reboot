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
const COUSIN_BODY_H = 22;          // collision height (world units) — 1px taller for reliable ground contact
const COUSIN_ORIGIN_Y = 0.5;       // center origin (like original AstroHop) for correct body-sprite sync
// Sprite scale 0.2 scales body AND offset.
// Body centered horizontally: body.x = sprite.x - body.width/2.
// Phaser: body.x = sprite.x - displayOriginX + offsetX*sprite.scale.
// displayOriginX = 42.8, body.width/2 = 8. => offsetX*0.2 = 34.8 => offsetX = 174.
const COUSIN_BODY_OFFSET_X = 174;
// Visual feet at frame y=253 (3px from frame bottom 256, measured from actual atlas).
// At scale 0.2: visual feet 3px * 0.2 = 0.6 world units above frame bottom.
// displayHeight = 256 * 0.2 = 51.2. Frame bottom = sprite.y + displayHeight/2 = sprite.y + 25.6.
// Visual feet = sprite.y + 25.6 - 0.6 = sprite.y + 25.0.
// Physics body height 22, centered on sprite. Body bottom = sprite.y + 11 with zero offset.
// Want body bottom = visual feet = sprite.y + 25.0.
// Body.bottom = sprite.topLeft.y + offsetY*sprite.scale + bodyH = (sprite.y - 25.6) + offsetY*0.2 + 22.
// Set = sprite.y + 25.0  =>  offsetY*0.2 = 28.6 => offsetY = 143.
// Use 143 for body bottom exactly at visual feet (no penetration, perfect alignment).
const COUSIN_BODY_OFFSET_Y = 143;
const ATTACK_DURATION = 350;

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

    // Fixed collision body, anchored to visual feet
    // Sprite scale 0.2 scales body AND offset, so set base size 5x larger and offset 5x larger
    this.body.setSize(COUSIN_BODY_W / COUSIN_SCALE, COUSIN_BODY_H / COUSIN_SCALE);
    this.body.setOffset(COUSIN_BODY_OFFSET_X, COUSIN_BODY_OFFSET_Y);
    this.body.setMaxVelocity(MAX_RUN_SPEED, MAX_FALL_SPEED);
    this.body.setDragX(DRAG);

    this.isAttacking = false;
    this.attackTimer = null;
    this.isDead = false;
    this.wasOnFloor = true;
    this.invulnerable = false;
    this.invulnTimer = null;
  }

  /** Called by GameScene every frame with the merged input state. */
  handleInput({ moveX, jumpHeld, jumpPressed, attackPressed, joystickMoveX, joystickMoveY, keyboardActive }) {
    if (this.isDead || this.isAttacking) return;

    const body = this.body;
    const onGround = body.onFloor();

    // JOYSTICK: constant velocity (no acceleration buildup)
    // Keyboard OVERRIDES joystick when keyboard is actively pressed
    if (!keyboardActive && joystickMoveX !== 0) {
      // Joystick constant velocity: 25% of keyboard max speed (240 * 0.25 = 60)
      const JOYSTICK_SPEED = 60;
      body.setAccelerationX(0);
      body.setVelocityX(joystickMoveX > 0 ? 60 : -60);
      // joystickMoveY is VISUAL ONLY - no vertical velocity change
      this.setFlipX(joystickMoveX > 0 ? false : true);
    } else {
      // KEYBOARD: proportional acceleration (original behavior)
      if (moveX < -0.1) {
        body.setAccelerationX(-ACCELERATION);
        this.setFlipX(true);
      } else if (moveX > 0.1) {
        body.setAccelerationX(ACCELERATION);
        this.setFlipX(false);
      } else {
        body.setAccelerationX(0);
      }
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

    // Fire the blue fireball via scene (matches original AstroHop)
    if (this.scene.shootFireball) this.scene.shootFireball(this);

    // Lock movement for the full attack animation
    this.attackTimer = this.scene.time.delayedCall(ATTACK_DURATION, () => {
      this.isAttacking = false;
      this.attackTimer = null;
    });
  }

  /** Provide spawn position for fireball (visual center of sprite). */
  getFireballSpawnPoint() {
    // Sprite origin at center (0.5, 0.5), visual center = sprite position
    return {
      x: this.x + (this.flipX ? -this.displayWidth * 0.5 : this.displayWidth * 0.5),
      y: this.y
    };
  }

  /** Make player temporarily invulnerable after taking damage. */
  makeInvulnerable(duration = 1200) {
    this.invulnerable = true;
    // Blink effect
    this.scene.tweens.add({
      targets: this,
      alpha: 0.3,
      duration: 100,
      yoyo: true,
      repeat: duration / 200 - 1,
      onComplete: () => {
        this.setAlpha(1);
        this.invulnerable = false;
      }
    });
    if (this.invulnTimer) this.invulnTimer.remove();
    this.invulnTimer = this.scene.time.delayedCall(duration, () => {
      this.invulnerable = false;
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
        // Brief visual squash using a separate scale tween that doesn't affect physics body
        // We use setScale on the sprite which Phaser syncs to body — so skip for now
        // to keep physics body stable during landing
      }
      this.wasOnFloor = onFloor;
    }
  }
}