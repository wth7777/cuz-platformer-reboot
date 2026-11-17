import Phaser from 'phaser';

/**
 * Lady in Grey - A mischievous ghost that appears as a visual prank.
 * She never damages the player and runs on top of gameplay.
 * 
 * Animation phases:
 * 1. Random appearance + materialization (scale from 0.3 to 1.0 while flying toward camera center)
 * 2. Rapid entrance (frames 1-7 at 24fps, ~300ms total)
 * 3. Large mischievous close-up (frames 8-11, occupies most of screen, 3-4 seconds)
 * 4. Rapid disappearance (frames 12-15 at 24fps, ~300ms total, then destroy)
 */
export default class LadyInGrey extends Phaser.GameObjects.Sprite {
  constructor(scene, x, y) {
    super(scene, x, y, 'lady-in-grey', 'frame_0');
    
    this.scene = scene;
    
    // Use scroll factor 0 so we render relative to camera, not world
    this.setScrollFactor(0);
    
    // Render above gameplay but can be under HUD if needed
    this.setDepth(5);
    
    // Initialize state
    this.isActive = false;
    this.isAppearing = false;
    this.isCloseUp = false;
    this.isDisappearing = false;
    
    // Callback to schedule next appearance after this one completes
    this.onCompleteCallback = null;
    
    // Add to scene but don't set active yet
    scene.add.existing(this);
  }

  /** Start the full animation sequence */
  start() {
    if (this.isActive) return;
    
    this.isActive = true;
    this.isAppearing = true;
    
    // Get camera dimensions
    const cam = this.scene.cameras.main;
    const camWidth = cam.width;
    const camHeight = cam.height;
    
    // Start tiny and positioned at a random edge of the camera view
    const edge = Phaser.Math.Between(0, 3);
    let startX, startY;
    const targetScale = 1.0;
    const startScale = 0.3;
    
    switch (edge) {
      case 0: // top
        startX = Phaser.Math.Between(0, camWidth);
        startY = -100;
        break;
      case 1: // right
        startX = camWidth + 100;
        startY = Phaser.Math.Between(0, camHeight);
        break;
      case 2: // bottom
        startX = Phaser.Math.Between(0, camWidth);
        startY = camHeight + 100;
        break;
      case 3: // left
        startX = -100;
        startY = Phaser.Math.Between(0, camHeight);
        break;
    }
    
    this.setPosition(startX, startY);
    this.setScale(startScale);
    this.setVisible(true);
    this.setAlpha(1);
    
    // Phase 1: Fly toward camera center with scale up
    this.scene.tweens.add({
      targets: this,
      x: camWidth / 2,
      y: camHeight / 2,
      scale: targetScale,
      duration: 800,
      ease: 'Power2',
      onUpdate: (tween) => {
        // Ensure she's visible during flight
        this.setAlpha(Math.max(0.3, tween.progress * 0.7 + 0.3));
      },
      onComplete: () => {
        this.onFlyComplete();
      }
    });
  }

  /** Called when the fly-in completes */
  onFlyComplete() {
    this.isAppearing = false;
    
    // Wait a brief moment before entrance animation
    this.scene.time.delayedCall(100, () => {
      this.playPhase2Entrance();
    });
  }

  /** Phase 2: Rapid entrance (frames 1-7) */
  playPhase2Entrance() {
    // Play frames 1-7 very quickly (24fps = ~41ms per frame)
    const animConfig = {
      key: 'lady-entrance',
      frames: this.scene.anims.generateFrameNames('lady-in-grey', {
        start: 1,
        end: 7,
        prefix: 'frame_',
        zeroPad: 0
      }),
      frameRate: 24,
      repeat: 0
    };
    
    if (!this.scene.anims.exists('lady-entrance')) {
      this.scene.anims.create(animConfig);
    }
    
    this.play('lady-entrance');
    
    // After entrance, move to close-up
    this.once('animationcomplete-lady-entrance', () => {
      this.playPhase3CloseUp();
    });
  }

  /** Phase 3: Large mischievous close-up (frames 8-11) */
  playPhase3CloseUp() {
    this.isCloseUp = true;
    
    // Create close-up animation (frames 8-11 at normal speed)
    const animConfig = {
      key: 'lady-closeup',
      frames: this.scene.anims.generateFrameNames('lady-in-grey', {
        start: 8,
        end: 11,
        prefix: 'frame_',
        zeroPad: 0
      }),
      frameRate: 8,
      repeat: 0
    };
    
    if (!this.scene.anims.exists('lady-closeup')) {
      this.scene.anims.create(animConfig);
    }
    
    this.play('lady-closeup');
    
    // Hold the close-up for a few seconds to disrupt the player's view
    this.scene.time.delayedCall(3000, () => {
      if (this.isCloseUp) {
        this.playPhase4Disappearance();
      }
    });
  }

  /** Phase 4: Rapid disappearance (frames 12-15) */
  playPhase4Disappearance() {
    this.isCloseUp = false;
    this.isDisappearing = true;
    
    // Create disappearance animation (frames 12-15 very fast)
    const animConfig = {
      key: 'lady-disappear',
      frames: this.scene.anims.generateFrameNames('lady-in-grey', {
        start: 12,
        end: 15,
        prefix: 'frame_',
        zeroPad: 0
      }),
      frameRate: 24,
      repeat: 0
    };
    
    if (!this.scene.anims.exists('lady-disappear')) {
      this.scene.anims.create(animConfig);
    }
    
    this.play('lady-disappear');
    
    // After disappearance animation, destroy and schedule next
    this.once('animationcomplete-lady-disappear', () => {
      this.cleanup();
    });
    
    // Safety cleanup: destroy after animation + buffer
    this.scene.time.delayedCall(500, () => {
      if (this.isDisappearing) {
        this.cleanup();
      }
    });
  }

  /** Clean up the sprite and schedule next appearance */
  cleanup() {
    this.isActive = false;
    this.isAppearing = false;
    this.isCloseUp = false;
    this.isDisappearing = false;
    
    // Schedule the next appearance before destroying
    if (this.onCompleteCallback) {
      this.onCompleteCallback();
    }
    
    this.destroy();
  }

  /** Check if the animation sequence is complete */
  isAnimationComplete() {
    return !this.isActive || !this.isDisappearing;
  }

  /** Stop all animations and clean up immediately */
  stopAndCleanup() {
    this.anims.stop();
    this.isAppearing = false;
    this.isCloseUp = false;
    this.isDisappearing = false;
    this.isActive = false;
    this.destroy();
  }
}