import Phaser from 'phaser';

const TILEMAP_DIR = 'assets/kenney_pixel-platformer/Tilemap';

// The pale sky colour baked into Kenney's background tiles — we turn it
// transparent at load time so the hills can sit on our own blue sky.
const BG_SKY_COLOR = { r: 223, g: 246, b: 245 };

export default class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
  }

  preload() {
    const { width, height } = this.scale;

    // --- Simple loading bar driven by the loader's progress event (0..1)
    this.add.rectangle(width / 2, height / 2, 324, 22, 0x222230);
    const bar = this.add
      .rectangle(width / 2 - 158, height / 2, 316, 12, 0x5c94fc)
      .setOrigin(0, 0.5)
      .setScale(0, 1);
    this.load.on('progress', (value) => bar.setScale(value, 1));

    // --- Spritesheets: one image, many fixed-size frames.
    // Phaser slices them by frameWidth/frameHeight and numbers the
    // frames left-to-right, top-to-bottom (0, 1, 2, ...).
    this.load.spritesheet('tiles', `${TILEMAP_DIR}/tilemap_packed.png`, {
      frameWidth: 18,
      frameHeight: 18,
    });
    this.load.spritesheet('chars', `${TILEMAP_DIR}/tilemap-characters_packed.png`, {
      frameWidth: 24,
      frameHeight: 24,
    });
    this.load.spritesheet('bg', `${TILEMAP_DIR}/tilemap-backgrounds_packed.png`, {
      frameWidth: 24,
      frameHeight: 24,
    });
    this.load.atlas('player', 'assets/player/cousin-atlas.png', 'assets/player/cousin-atlas.json');
  }

  create() {
    // Force canvas pool initialization — createCanvas returns null during
    // loader 'complete' callback because CanvasPool isn't ready yet.
    // A dummy call wakes it up; subsequent calls succeed synchronously.
    this.textures.createCanvas('__warmup', 1, 1)?.destroy();

    // TileSprites repeat a whole texture, not a single frame of a sheet —
    // so we copy the frames we want to repeat into small standalone textures.
    this.makeTilingTexture('tex-grass-top', 'tiles', [2]);
    this.makeTilingTexture('tex-dirt', 'tiles', [122]);
    this.makeTilingTexture('tex-hills', 'bg', [8, 9, 10, 11], BG_SKY_COLOR);
    this.makeFireballTexture();

    this.makeRecoloredTexture('gem-fire', 'tiles', 67, (r, g, b) => [b, g, r]);
    this.makeRecoloredTexture('gem-star', 'tiles', 67, (r, g, b) => {
      const l = Math.min(255, Math.round(Math.max(r, g, b) * 1.15));
      return [l, l, l];
    });
    this.makePipeTextures();

    const spark = this.textures.createCanvas('spark', 4, 4);
    spark.context.fillStyle = '#ffffff';
    spark.context.fillRect(0, 0, 4, 4);
    spark.refresh();
    this.makeRecoloredTexture('mushroom-1up', 'tiles', 128, (r, g, b) => [g, r, b]);

    this.createAnimations();

    this.registry.set('score', 0);
    this.registry.set('coins', 0);
    this.registry.set('lives', 3);
    this.registry.set('time', 300);
    this.registry.set('world', '1-1');

    this.scene.start('TitleScene');
  }

  /**
     * Copies one or more frames side by side into a new canvas texture.
     * If colorKey is given, every pixel of exactly that colour becomes
     * transparent (classic "color key" transparency).
     */
    makeTilingTexture(destKey, srcKey, frames, colorKey = null) {
      const first = this.textures.getFrame(srcKey, frames[0]);
      const w = first.width;
      const h = first.height;

      const canvas = this.textures.createCanvas(destKey, w * frames.length, h);
      const ctx = canvas.context;

      frames.forEach((frameIndex, i) => {
        const f = this.textures.getFrame(srcKey, frameIndex);
        // cutX/cutY = where this frame lives inside the packed source image
        ctx.drawImage(f.source.image, f.cutX, f.cutY, w, h, i * w, 0, w, h);
      });

      if (colorKey) {
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = img.data; // flat array: r,g,b,a, r,g,b,a, ...
        for (let i = 0; i < d.length; i += 4) {
          if (d[i] === colorKey.r && d[i + 1] === colorKey.g && d[i + 2] === colorKey.b) {
            d[i + 3] = 0; // alpha 0 = fully transparent
          }
        }
        ctx.putImageData(img, 0, 0);
      }

      canvas.refresh(); // push the canvas pixels to the GPU texture
    }

    /** Copies a frame into a new texture, rewriting every pixel's colour. */
    makeRecoloredTexture(destKey, srcKey, frameIndex, transform) {
      const f = this.textures.getFrame(srcKey, frameIndex);
      const canvas = this.textures.createCanvas(destKey, f.width, f.height);
      const ctx = canvas.context;
      ctx.drawImage(f.source.image, f.cutX, f.cutY, f.width, f.height, 0, 0, f.width, f.height);

      const img = ctx.getImageData(0, 0, f.width, f.height);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] === 0) continue; // skip transparent pixels
        const [r, g, b] = transform(d[i], d[i + 1], d[i + 2]);
        d[i] = r;
        d[i + 1] = g;
        d[i + 2] = b;
      }
      ctx.putImageData(img, 0, 0);
      canvas.refresh();
    }

    /** Classic green pipe: a wider rimmed mouth + a tileable shaft piece. */
    makePipeTextures() {
      const OUTLINE = '#14541c';
      const DARK = '#2e8a36';
      const MID = '#48b552';
      const LIGHT = '#a0e25c';

      const mouth = this.textures.createCanvas('pipe-mouth', 44, 18);
      const m = mouth.context;
      m.fillStyle = OUTLINE;
      m.fillRect(0, 0, 44, 18);
      m.fillStyle = MID;
      m.fillRect(2, 2, 40, 14);
      m.fillStyle = LIGHT;
      m.fillRect(7, 2, 7, 14);
      m.fillStyle = DARK;
      m.fillRect(33, 2, 6, 14);
      mouth.refresh();

      const shaft = this.textures.createCanvas('pipe-shaft', 36, 18);
      const s = shaft.context;
      s.fillStyle = MID;
      s.fillRect(0, 0, 36, 18);
      s.fillStyle = OUTLINE;
      s.fillRect(0, 0, 2, 18);
      s.fillRect(34, 0, 2, 18);
      s.fillStyle = LIGHT;
      s.fillRect(6, 0, 6, 18);
      s.fillStyle = DARK;
      s.fillRect(28, 0, 5, 18);
      shaft.refresh();
    }

  /** A tiny hand-drawn texture: orange ball with a yellow core. */
  makeFireballTexture() {
    const size = 10;
    const canvas = this.textures.createCanvas('fireball', size, size);
    const ctx = canvas.context;
    ctx.fillStyle = '#d83b0c';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff9b1c';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffe45c';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, 1.8, 0, Math.PI * 2);
    ctx.fill();
    canvas.refresh();
  }

  createAnimations() {
    // Cousin 16-frame atlas (428x256 per frame). Frame names: frame_0..frame_15
    // Mapping verified from atlas: idle=0, walk=1-4, jump=5-7, attack=8-10, crouch=11, hurt=12-14, die=15
    this.anims.create({ key: 'player-idle', frames: [{ key: 'player', frame: 'frame_0' }] });
    this.anims.create({ key: 'player-run', frames: ['frame_1','frame_2','frame_3','frame_4'].map(f => ({ key: 'player', frame: f })), frameRate: 10, repeat: -1 });
    this.anims.create({ key: 'player-jump', frames: ['frame_5','frame_6','frame_7'].map(f => ({ key: 'player', frame: f })), frameRate: 8, repeat: 0 });
    this.anims.create({ key: 'player-attack', frames: ['frame_8','frame_9','frame_10'].map(f => ({ key: 'player', frame: f })), frameRate: 12, repeat: 0 });
    this.anims.create({ key: 'player-crouch', frames: [{ key: 'player', frame: 'frame_11' }] });
    this.anims.create({ key: 'player-hurt', frames: ['frame_12','frame_13','frame_14'].map(f => ({ key: 'player', frame: f })), frameRate: 8, repeat: 0 });
    this.anims.create({ key: 'player-die', frames: [{ key: 'player', frame: 'frame_15' }] });

    // Coin: face/edge-on frames alternating reads as a spin
    this.anims.create({
      key: 'coin-spin',
      frames: this.anims.generateFrameNumbers('tiles', { frames: [151, 152] }),
      frameRate: 6,
      repeat: -1,
    });

    // Walker enemy (blue slime): two-frame shuffle
    this.anims.create({
      key: 'walker-walk',
      frames: this.anims.generateFrameNumbers('chars', { frames: [18, 19] }),
      frameRate: 6,
      repeat: -1,
    });

    // End-of-level flag waving on its pole
    this.anims.create({
      key: 'flag-wave',
      frames: this.anims.generateFrameNumbers('tiles', { frames: [111, 112] }),
      frameRate: 3,
      repeat: -1,
    });
  }
}
