import Phaser from 'phaser';
import { sfx } from '../audio/sfx.js';

const TILEMAP_DIR = 'assets/kenney_pixel-platformer/Tilemap';

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
    this.load.atlas('zombie', 'assets/zombie/zombie-atlas.png', 'assets/zombie/zombie-atlas.json');

    // --- Graveyard terrain atlas (ground_dirt + platform_stone pieces)
    this.load.atlas('graveyard-tiles', 'assets/graveyard/tiles.png', 'assets/graveyard/tiles.json');

    // --- Graveyard parallax background (single cohesive 1168x784 painting)
    this.load.image('graveyard-bg', 'assets/parallax-bg.jpg');

    // --- Lava level background (World 1-3)
    this.load.image('lava-level-bg', 'assets/lava-level-bg.jpg');

    // --- Title screen background (user provided)
    this.load.image('title-bg', 'assets/title/title-bg.jpg');

    // --- Decorative graveyard spritesheet (35 sprites - for background/scenery)
    this.load.atlas('graveyard-decor', 'assets/graveyard-sprites/graveyard-new-atlas-corrected.png', 'assets/graveyard-sprites/graveyard-new-atlas-corrected.json');

    // --- Tattoo shop (level ending destination)
    this.load.atlas('tattooshop', 'assets/tattooshop/tattooshop.png', 'assets/tattooshop/tattooshop.json');

    // --- Wolf enemy
    this.load.atlas('wolf', 'assets/wolf/wolf.png', 'assets/wolf/wolf.json');

    // --- Lava Creature enemy
    this.load.atlas('lava', 'assets/lava/lava.png', 'assets/lava/lava.json');

    // --- Goblin Boss enemy
    this.load.atlas('goblin', 'assets/goblin/goblin.png', 'assets/goblin/goblin.json');

    // --- Lady in Grey ghost (visual prank character)
    this.load.atlas('lady-in-grey', 'assets/graveyard-sprites/lady-in-grey.png', 'assets/graveyard-sprites/lady-in-grey.json');

    // --- Graveyard music
    this.load.audio('graveyard-music', 'assets/audio/graveyard-music.ogg');
    this.load.audio('graveyard-title-music', 'assets/audio/graveyard-title-music.ogg');

    // Preload external music files for Web Audio API (sfx.js) - do this EARLY in preload
    sfx.preloadMusic('graveyard-music', 'assets/audio/graveyard-music.ogg');
    sfx.preloadMusic('graveyard-title-music', 'assets/audio/graveyard-title-music.ogg');
    // Preload Lady in Grey sound effect via sfx.js (uses shared Web Audio context)
    sfx.preloadExternalSfx('lady-in-grey', 'assets/lady-in-grey.wav');
  }

  create() {
    // Force canvas pool initialization
    this.textures.createCanvas('__warmup', 1, 1)?.destroy();

    // --- Kenney textures still needed for: coins, bricks, flag, door
    this.makeTilingTexture('tex-grass-top', 'tiles', [2]);
    this.makeTilingTexture('tex-dirt', 'tiles', [122]);
    this.makeTilingTexture('tex-hills', 'bg', [8, 9, 10, 11], { r: 223, g: 246, b: 245 });
    this.makeFireballTexture();

    this.makeRecoloredTexture('gem-fire', 'tiles', 67, (r, g, b) => [b, g, r]);
    this.makeRecoloredTexture('gem-star', 'tiles', 67, (r, g, b) => {
      const l = Math.min(255, Math.round(Math.max(r, g, b) * 1.15));
      return [l, l, l];
    });

    const spark = this.textures.createCanvas('spark', 4, 4);
    spark.context.fillStyle = '#ffffff';
    spark.context.fillRect(0, 0, 4, 4);
    spark.refresh();
    this.makeRecoloredTexture('mushroom-1up', 'tiles', 128, (r, g, b) => [g, r, b]);

    // --- Graveyard terrain: from graveyard-tiles atlas
    // Ground: ground_dirt (128x128) → scale 18/128 = 0.140625 for 18px logical tile
    const GROUND_SCALE = 18 / 128;
    this.makeScaledTilingTexture('tex-graveyard-ground', 'graveyard-tiles', 'ground_dirt', GROUND_SCALE);
    this.makeScaledTexture('graveyard-ground-single', 'graveyard-tiles', 'ground_dirt', GROUND_SCALE);

    // Platforms: platform_stone pieces (64x64) → scale 18/64 = 0.28125 for 18px height
    const PLATFORM_SCALE = 18 / 64;
    // Left cap = platform_stone_2_1
    this.makeScaledTexture('graveyard-platform-left', 'graveyard-tiles', 'platform_stone_2_1', PLATFORM_SCALE);
    // Middle tileable = platform_stone_2_2
    this.makeScaledTilingTexture('tex-graveyard-platform-mid', 'graveyard-tiles', 'platform_stone_2_2', PLATFORM_SCALE);
    // Right cap = platform_stone_2_3
    this.makeScaledTexture('graveyard-platform-right', 'graveyard-tiles', 'platform_stone_2_3', PLATFORM_SCALE);
    // Single platform = platform_stone_2_2_center (128x128)
    this.makeScaledTexture('graveyard-platform-single', 'graveyard-tiles', 'platform_stone_2_2_center', PLATFORM_SCALE);

    this.createAnimations();

    this.registry.set('score', 0);
    this.registry.set('coins', 0);
    this.registry.set('lives', 3);
    this.registry.set('time', 300);
    this.registry.set('world', '1-1');

    this.scene.start('TitleScene');
  }

  makeTilingTexture(destKey, srcKey, frames, colorKey = null) {
    const first = this.textures.getFrame(srcKey, frames[0]);
    const w = first.width;
    const h = first.height;

    const canvas = this.textures.createCanvas(destKey, w * frames.length, h);
    const ctx = canvas.context;

    frames.forEach((frameIndex, i) => {
      const f = this.textures.getFrame(srcKey, frameIndex);
      ctx.drawImage(f.source.image, f.cutX, f.cutY, w, h, i * w, 0, w, h);
    });

    if (colorKey) {
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] === colorKey.r && d[i + 1] === colorKey.g && d[i + 2] === colorKey.b) {
          d[i + 3] = 0;
        }
      }
      ctx.putImageData(img, 0, 0);
    }

    canvas.refresh();
  }

  makeScaledTilingTexture(destKey, srcKey, frameName, scale) {
    const f = this.textures.getFrame(srcKey, frameName);
    const canvas = this.textures.createCanvas(destKey, f.width * scale, f.height * scale);
    const ctx = canvas.context;
    ctx.drawImage(f.source.image, f.cutX, f.cutY, f.width, f.height, 0, 0, f.width * scale, f.height * scale);
    canvas.refresh();
  }

  makeScaledTexture(destKey, srcKey, frameName, scale) {
    const f = this.textures.getFrame(srcKey, frameName);
    const canvas = this.textures.createCanvas(destKey, f.width * scale, f.height * scale);
    const ctx = canvas.context;
    ctx.drawImage(f.source.image, f.cutX, f.cutY, f.width, f.height, 0, 0, f.width * scale, f.height * scale);
    canvas.refresh();
  }

  makeRecoloredTexture(destKey, srcKey, frameIndex, transform) {
    const f = this.textures.getFrame(srcKey, frameIndex);
    const canvas = this.textures.createCanvas(destKey, f.width, f.height);
    const ctx = canvas.context;
    ctx.drawImage(f.source.image, f.cutX, f.cutY, f.width, f.height, 0, 0, f.width, f.height);

    const img = ctx.getImageData(0, 0, f.width, f.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      const [r, g, b] = transform(d[i], d[i + 1], d[i + 2]);
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
    }
    ctx.putImageData(img, 0, 0);
    canvas.refresh();
  }

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
    this.anims.create({ key: 'player-idle', frames: [{ key: 'player', frame: 'frame_0' }] });
    this.anims.create({ key: 'player-run', frames: ['frame_1','frame_2','frame_3','frame_4'].map(f => ({ key: 'player', frame: f })), frameRate: 10, repeat: -1 });
    this.anims.create({ key: 'player-jump', frames: ['frame_5','frame_6','frame_7'].map(f => ({ key: 'player', frame: f })), frameRate: 8, repeat: 0 });
    this.anims.create({ key: 'player-attack', frames: ['frame_8','frame_9','frame_10'].map(f => ({ key: 'player', frame: f })), frameRate: 12, repeat: 0 });
    this.anims.create({ key: 'player-crouch', frames: [{ key: 'player', frame: 'frame_11' }] });
    this.anims.create({ key: 'player-hurt', frames: ['frame_12','frame_13','frame_14'].map(f => ({ key: 'player', frame: f })), frameRate: 8, repeat: 0 });
    this.anims.create({ key: 'player-die', frames: [{ key: 'player', frame: 'frame_15' }] });

    this.anims.create({
      key: 'coin-spin',
      frames: this.anims.generateFrameNumbers('tiles', { frames: [151, 152] }),
      frameRate: 6,
      repeat: -1,
    });

    this.anims.create({
      key: 'walker-walk',
      frames: this.anims.generateFrameNumbers('chars', { frames: [18, 19] }),
      frameRate: 6,
      repeat: -1,
    });

    this.anims.create({
      key: 'zombie-walk',
      frames: this.anims.generateFrameNames('zombie', { start: 0, end: 7, prefix: 'frame_', zeroPad: 0 }),
      frameRate: 8,
      repeat: -1,
    });

    this.anims.create({
      key: 'flag-wave',
      frames: this.anims.generateFrameNumbers('tiles', { frames: [111, 112] }),
      frameRate: 3,
      repeat: -1,
    });

    // --- Tattoo shop animations ---
    // Idle: frames 0-4 (building with closed door, subtle movement)
    this.anims.create({
      key: 'tattooshop-idle',
      frames: this.anims.generateFrameNames('tattooshop', { start: 0, end: 4, prefix: 'frame_', zeroPad: 0 }),
      frameRate: 8,
      repeat: -1,
    });

    // Entrance: frames 5-15 (door opens, skull smoke appears, door closes) - plays once
    this.anims.create({
      key: 'tattooshop-entrance',
      frames: this.anims.generateFrameNames('tattooshop', { start: 5, end: 15, prefix: 'frame_', zeroPad: 0 }),
      frameRate: 8,
      repeat: 0,
    });

    // --- Wolf animations ---
    // Walk: frames 0-7 (8-frame walk cycle)
    this.anims.create({
      key: 'wolf-walk',
      frames: this.anims.generateFrameNames('wolf', { start: 0, end: 7, prefix: 'frame_', zeroPad: 0 }),
      frameRate: 10,
      repeat: -1,
    });

    // Attack: frames 8-15 (8-frame attack sequence)
    this.anims.create({
      key: 'wolf-attack',
      frames: this.anims.generateFrameNames('wolf', { start: 8, end: 15, prefix: 'frame_', zeroPad: 0 }),
      frameRate: 12,
      repeat: 0,
    });

    // --- Lava Creature animations (20 frames: frame_0 to frame_19) ---
    // Idle: frames 0-3 (4 frames - subtle idle)
    this.anims.create({
      key: 'lava-idle',
      frames: this.anims.generateFrameNames('lava', { start: 0, end: 3, prefix: 'frame_', zeroPad: 0 }),
      frameRate: 6,
      repeat: -1,
    });

    // Walk: frames 4-11 (8 frames - walk cycle)
    this.anims.create({
      key: 'lava-walk',
      frames: this.anims.generateFrameNames('lava', { start: 4, end: 11, prefix: 'frame_', zeroPad: 0 }),
      frameRate: 10,
      repeat: -1,
    });

    // Claw attack: frames 12-15 (4 frames - claw swipe)
    this.anims.create({
      key: 'lava-claw-attack',
      frames: this.anims.generateFrameNames('lava', { start: 12, end: 15, prefix: 'frame_', zeroPad: 0 }),
      frameRate: 12,
      repeat: 0,
    });

    // Lava eruption: frames 16-18 (3 frames - eruption)
    this.anims.create({
      key: 'lava-eruption',
      frames: this.anims.generateFrameNames('lava', { start: 16, end: 18, prefix: 'frame_', zeroPad: 0 }),
      frameRate: 8,
      repeat: 0,
    });

    // Death: frames 19 (1 frame - death pose)
    this.anims.create({
      key: 'lava-death',
      frames: this.anims.generateFrameNames('lava', { start: 19, end: 19, prefix: 'frame_', zeroPad: 0 }),
      frameRate: 8,
      repeat: 0,
    });

    // --- Goblin Boss animations (20 frames: frame_0 to frame_19) ---
    // Idle: frames 0-3 (4 frames - subtle idle)
    this.anims.create({
      key: 'goblin-idle',
      frames: this.anims.generateFrameNames('goblin', { start: 0, end: 3, prefix: 'frame_', zeroPad: 0 }),
      frameRate: 6,
      repeat: -1,
    });

    // Walk: frames 4-7 (4 frames - walk cycle)
    this.anims.create({
      key: 'goblin-walk',
      frames: this.anims.generateFrameNames('goblin', { start: 4, end: 7, prefix: 'frame_', zeroPad: 0 }),
      frameRate: 8,
      repeat: -1,
    });

    // Attack: frames 8-11 (4 frames - attack)
    this.anims.create({
      key: 'goblin-attack',
      frames: this.anims.generateFrameNames('goblin', { start: 8, end: 11, prefix: 'frame_', zeroPad: 0 }),
      frameRate: 10,
      repeat: 0,
    });

    // Super Attack: frames 12-15 (4 frames - super/charged attack)
    this.anims.create({
      key: 'goblin-super-attack',
      frames: this.anims.generateFrameNames('goblin', { start: 12, end: 15, prefix: 'frame_', zeroPad: 0 }),
      frameRate: 10,
      repeat: 0,
    });

    // Death: frames 16-19 (4 frames - death)
    this.anims.create({
      key: 'goblin-death',
      frames: this.anims.generateFrameNames('goblin', { start: 16, end: 19, prefix: 'frame_', zeroPad: 0 }),
      frameRate: 8,
      repeat: 0,
    });

    // --- Lady in Grey animations (16 frames: frame_0 to frame_15) ---
    // Entrance: frames 1-7 (rapid ghostly entrance)
    // Close-up: frames 8-11 (mischievous smile)
    // Disappearance: frames 12-15 (rapid vanish)
  }
}