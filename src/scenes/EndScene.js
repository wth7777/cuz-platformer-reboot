import Phaser from 'phaser';
import { loadHighScore, saveHighScore } from '../highscore.js';
import { sfx } from '../audio/sfx.js';

// Final victory screen after completing Level 5 (WORLD 1-5).
export default class EndScene extends Phaser.Scene {
  constructor() {
    super('EndScene');
    this.selectedIndex = 0; // 0 = PLAY AGAIN, 1 = RETURN TO TITLE
    this.transitioning = false;
  }

  create() {
    const { width, height } = this.scale;

    // Stop HUD and gameplay music
    this.scene.stop('HUDScene');
    sfx.stopMusic();
    sfx.startMusic('intro');

    // Save high score
    const finalScore = this.registry.get('score') ?? 0;
    saveHighScore(finalScore);
    const highScore = loadHighScore();

    // Dark background with subtle graveyard atmosphere
    this.cameras.main.setBackgroundColor('#0a0a0f');
    this.scale.once('resize', () => this.scene.restart());

    // --- Subtle fog parallax (reused from TitleScene) ---
    this.fog = this.add
      .tileSprite(width / 2, height / 2, width, height, 'graveyard-bg')
      .setScrollFactor(0)
      .setDepth(-5)
      .setAlpha(0.15);

    // --- Celebratory Cousin character (using existing atlas) ---
    const cousin = this.add.sprite(width / 2, height * 0.35, 'player', 'frame_0')
      .setScale(0.6)
      .setDepth(10)
      .setOrigin(0.5, 0.5);
    cousin.anims.play('player-idle');

    // Small bounce animation for celebration
    this.tweens.add({
      targets: cousin,
      y: cousin.y - 8,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // --- Victory fanfare (short, distinct from level-complete flag fanfare) ---
    sfx.play('oneup'); // celebratory arpeggio

    // --- Text elements ---
    // "YOU MADE IT OUT ALIVE!"
    this.add
      .text(width / 2, height * 0.1, 'YOU MADE IT OUT ALIVE!', {
        fontFamily: 'monospace',
        fontSize: Math.min(36, width / 20) + 'px',
        fontStyle: 'bold',
        color: '#ffcc00',
      })
      .setOrigin(0.5)
      .setStroke('#7a3045', 4)
      .setShadow(2, 4, '#000000', 0, true, true);

    // "THE END"
    this.add
      .text(width / 2, height * 0.52, 'THE END', {
        fontFamily: 'monospace',
        fontSize: Math.min(56, width / 12) + 'px',
        fontStyle: 'bold',
        color: '#ff4444',
      })
      .setOrigin(0.5)
      .setStroke('#3a0a0a', 6)
      .setShadow(3, 6, '#000000', 0, true, true);

    // Final score
    this.add
      .text(width / 2, height * 0.62, `FINAL SCORE  ${String(finalScore).padStart(6, '0')}`, {
        fontFamily: 'monospace',
        fontSize: Math.min(22, width / 30) + 'px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setStroke('#000000', 3);

    // High score
    this.add
      .text(width / 2, height * 0.68, `HIGH SCORE   ${String(highScore).padStart(6, '0')}`, {
        fontFamily: 'monospace',
        fontSize: Math.min(18, width / 36) + 'px',
        color: '#9dff8d',
      })
      .setOrigin(0.5)
      .setStroke('#000000', 2);

    // --- Buttons ---
    const buttonY = height * 0.8;
    const buttonSpacing = 140;

    this.playAgainBtn = this.createButton(
      width / 2 - buttonSpacing / 2,
      buttonY,
      'PLAY AGAIN',
      0
    );

    this.returnToTitleBtn = this.createButton(
      width / 2 + buttonSpacing / 2,
      buttonY,
      'RETURN TO TITLE',
      1
    );

    this.buttons = [this.playAgainBtn, this.returnToTitleBtn];
    this.updateButtonHighlight();

    // --- Input: Keyboard navigation ---
    this.cursors = this.input.keyboard.createCursorKeys();
    this.enterKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.escKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    // Prevent space from auto-triggering (handled explicitly)
    this.input.keyboard.on('keydown-SPACE', (e) => e.preventDefault());

    // --- Input: Touch/mouse ---
    this.input.on('pointerdown', (pointer) => {
      if (this.transitioning) return;
      for (let i = 0; i < this.buttons.length; i++) {
        const btn = this.buttons[i];
        const bounds = btn.text.getBounds();
        if (pointer.x >= bounds.x && pointer.x <= bounds.x + bounds.width &&
            pointer.y >= bounds.y && pointer.y <= bounds.y + bounds.height) {
          this.selectButton(i);
          break;
        }
      }
    });

    // Hover effect for desktop
    this.input.on('pointermove', (pointer) => {
      for (let i = 0; i < this.buttons.length; i++) {
        const btn = this.buttons[i];
        const bounds = btn.text.getBounds();
        const isOver = pointer.x >= bounds.x && pointer.x <= bounds.x + bounds.width &&
                       pointer.y >= bounds.y && pointer.y <= bounds.y + bounds.height;
        if (isOver && this.selectedIndex !== i) {
          this.selectedIndex = i;
          this.updateButtonHighlight();
        }
      }
    });
  }

  createButton(x, y, label, index) {
    const container = this.add.container(x, y);

    // Button background
    const bg = this.add
      .rectangle(0, 0, 220, 56, 0x2a1a2e)
      .setStrokeStyle(3, index === 0 ? 0xffcc00 : 0x7a3045)
      .setDepth(5);

    // Button text
    const text = this.add
      .text(0, 0, label, {
        fontFamily: 'monospace',
        fontSize: '20px',
        fontStyle: 'bold',
        color: '#ffe066',
      })
      .setOrigin(0.5)
      .setDepth(6);

    container.add([bg, text]);
    container.setSize(220, 56);
    container.setInteractive(new Phaser.Geom.Rectangle(-110, -28, 220, 56), Phaser.Geom.Rectangle.Contains);
    container.index = index;

    // Visual feedback on hover/press
    container.on('pointerover', () => {
      if (!this.transitioning && this.selectedIndex !== index) {
        this.selectedIndex = index;
        this.updateButtonHighlight();
      }
    });
    container.on('pointerout', () => {
      // Keep keyboard selection
    });
    container.on('pointerdown', () => {
      if (!this.transitioning) this.selectButton(index);
    });

    return { container, text, bg };
  }

  updateButtonHighlight() {
    for (let i = 0; i < this.buttons.length; i++) {
      const { container, text, bg } = this.buttons[i];
      const isSelected = i === this.selectedIndex;
      bg.setStrokeStyle(3, isSelected ? 0xffcc00 : (i === 0 ? 0x7a3045 : 0x3a0a0a));
      bg.setFillStyle(isSelected ? 0x3a1a3e : 0x2a1a2e);
      text.setColor(isSelected ? '#fff8cc' : (i === 0 ? '#ffe066' : '#ffaaaa'));
      text.setScale(isSelected ? 1.05 : 1.0);
    }
  }

  update() {
    // Fog drift
    if (this.fog) {
      this.fog.tilePositionX += 0.02;
      this.fog.tilePositionY += 0.01;
    }

    // Keyboard navigation (only if not transitioning)
    if (this.transitioning) return;

    const leftJustPressed = Phaser.Input.Keyboard.JustDown(this.cursors.left);
    const rightJustPressed = Phaser.Input.Keyboard.JustDown(this.cursors.right);
    const upJustPressed = Phaser.Input.Keyboard.JustDown(this.cursors.up);
    const downJustPressed = Phaser.Input.Keyboard.JustDown(this.cursors.down);
    const enterJustPressed = Phaser.Input.Keyboard.JustDown(this.enterKey);
    const escJustPressed = Phaser.Input.Keyboard.JustDown(this.escKey);

    if (leftJustPressed || upJustPressed) {
      this.selectedIndex = (this.selectedIndex - 1 + this.buttons.length) % this.buttons.length;
      this.updateButtonHighlight();
      sfx.play('coin'); // subtle navigation sound
    }
    if (rightJustPressed || downJustPressed) {
      this.selectedIndex = (this.selectedIndex + 1) % this.buttons.length;
      this.updateButtonHighlight();
      sfx.play('coin');
    }
    if (enterJustPressed) {
      this.selectButton(this.selectedIndex);
    }
    if (escJustPressed) {
      this.selectButton(1); // RETURN TO TITLE
    }
  }

  selectButton(index) {
    if (this.transitioning) return;
    this.transitioning = true;

    // Visual feedback
    const btn = this.buttons[index];
    this.tweens.add({
      targets: btn.container,
      scaleX: 0.95,
      scaleY: 0.95,
      duration: 80,
      yoyo: true,
      onComplete: () => {
        if (index === 0) {
          this.playAgain();
        } else {
          this.returnToTitle();
        }
      }
    });
  }

  playAgain() {
    // Full game reset - same as TitleScene start()
    this.registry.set('score', 0);
    this.registry.set('coins', 0);
    this.registry.set('lives', 3);
    this.registry.set('time', 300);
    this.registry.set('world', '1-1');
    // Clear consumed items so everything respawns
    this.registry.remove('consumed');
    this.scene.start('IntroScene', { levelId: 'level1' });
  }

  returnToTitle() {
    // Return to title without resetting (TitleScene will reset on start)
    this.scene.start('TitleScene');
  }
}