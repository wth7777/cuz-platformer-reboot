import Phaser from 'phaser';
import { loadHighScore } from '../highscore.js';
import { sfx } from '../audio/sfx.js';

// Title screen with graveyard background — no physics, just sprites, animations and tweens.
export default class TitleScene extends Phaser.Scene {
  constructor() {
    super('TitleScene');
  }

  create() {
    const { width, height } = this.scale;
    this.scene.stop('HUDScene');
    // re-centre everything if the device rotates (logical size changes)
    this.scale.once('resize', () => this.scene.restart());

    // --- Graveyard title background (full-screen image)
    this.add.image(width / 2, height / 2, 'title-bg').setDisplaySize(width, height);

    // --- animated subtle parallax: slow fog drift overlay
    this.fog = this.add
      .tileSprite(width / 2, height / 2, width, height, 'graveyard-bg')
      .setScrollFactor(0)
      .setDepth(-5)
      .setAlpha(0.3);

    // --- Cuz character, prominently displayed (large upper-body showcase)
    // Scale 0.99 (10% smaller), moved up ~one shoe length (0.75→0.73), left at 0.3 minus 25px
    this.cuz = this.add.sprite(width * 0.3 - 25, height * 0.73, 'player', 'frame_0')
      .setScale(0.99)
      .setDepth(10)
      .setOrigin(0.5, 0.85); // origin lower to show upper body prominently
    this.cuz.anims.play('player-idle');

    // --- logo + texts
    const logo = this.add
      .text(width / 2, height * 0.18, "CUZ'S CREEPY JAUNT", {
        fontFamily: 'monospace',
        fontSize: Math.min(48, width / 14) + 'px',
        fontStyle: 'bold',
        color: '#ffe066',
      })
      .setOrigin(0.5)
      .setStroke('#7a3045', 6)
      .setShadow(0, 4, '#00000080', 0, true, true);
    this.tweens.add({
      targets: logo,
      y: logo.y - 4,
      duration: 1800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.add
      .text(width / 2, height * 0.28, 'A GRAVEYARD PLATFORMER', {
        fontFamily: 'monospace',
        fontSize: Math.min(18, width / 36) + 'px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setStroke('#000000', 3);

    this.add
      .text(width / 2, height * 0.34, `HI ${String(loadHighScore()).padStart(6, '0')}`, {
        fontFamily: 'monospace',
        fontSize: Math.min(20, width / 30) + 'px',
        fontStyle: 'bold',
        color: '#9dff8d',
      })
      .setOrigin(0.5)
      .setStroke('#000000', 3);

    const prompt = this.add
      .text(width / 2, height * 0.75, 'PRESS START  /  TAP TO START', {
        fontFamily: 'monospace',
        fontSize: Math.min(22, width / 28) + 'px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setStroke('#000000', 4);
    this.tweens.add({ targets: prompt, alpha: 0.25, duration: 550, yoyo: true, repeat: -1 });

    // fullscreen toggle
    const fsBtn = this.add
      .text(width - 10, 8, '⛶', {
        fontFamily: 'monospace',
        fontSize: '22px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(1, 0)
      .setStroke('#000000', 4)
      .setAlpha(0.85)
      .setPadding(10)
      .setInteractive({ useHandCursor: true });
    fsBtn.on('pointerdown', (pointer, lx, ly, event) => {
      event.stopPropagation();
      if (this.scale.isFullscreen) this.scale.stopFullscreen();
      else this.scale.startFullscreen();
    });

    // --- start: keyboard, mouse or touch
    const start = () => {
      this.registry.set('score', 0);
      this.registry.set('coins', 0);
      this.registry.set('lives', 3);
      this.scene.start('IntroScene', { levelId: 'level1' });
    };
    const startLevel3 = () => {
      this.registry.set('score', 0);
      this.registry.set('coins', 0);
      this.registry.set('lives', 3);
      this.scene.start('GameScene', { levelId: 'level3' });
    };
    this.input.keyboard.once('keydown-SPACE', start);
    this.input.keyboard.once('keydown-ENTER', start);
    this.input.keyboard.once('keydown-L', startLevel3);  // TEMP: L key jumps to level 3
    this.input.once('pointerdown', start);

    // Start title music on first user gesture (handled by sfx unlock)
    sfx.startMusic('intro');
  }

  update() {
    // Slow fog drift
    if (this.fog) {
      this.fog.tilePositionX += 0.04;
      this.fog.tilePositionY += 0.02;
    }
  }
}