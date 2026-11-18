import Phaser from 'phaser';
import Player from '../objects/Player.js';
import Walker from '../objects/Walker.js';
import Zombie from '../objects/Zombie.js';
import Wolf from '../objects/Wolf.js';
import LavaCreature from '../objects/LavaCreature.js';
import GoblinBoss from '../objects/GoblinBoss.js';
import LadyInGrey from '../objects/LadyInGrey.js';
import { touchState } from '../input/TouchControls.js';
import { LEVELS, THEMES } from '../levels/index.js';
import { sfx } from '../audio/sfx.js';
import { GAME_ZOOM, TILE, ROWS, GAME_WIDTH, GAME_HEIGHT } from '../config.js';

// ---- World ----

// ---- Tile frame indices in the 'tiles' spritesheet ----
const T = {
  // Platform pieces (from graveyard-tiles atlas)
  PLATFORM_SINGLE: 'graveyard-platform-single',
  PLATFORM_LEFT: 'graveyard-platform-left',
  PLATFORM_MID: 'tex-graveyard-platform-mid',  // tileSprite texture for middle
  PLATFORM_RIGHT: 'graveyard-platform-right',
  // Kenney spritesheet frames still used for: coins, bricks, flag, door
  CLOUD_LEFT: 153,
  CLOUD_MID: 154,
  CLOUD_RIGHT: 155,
  CLOUD_SMALL: 156,
  COIN: 151,
  BRICK: 6,
  POLE: 131,
  FLAG: 111,
  DOOR_TOP: 130,
  DOOR_BOTTOM: 150,
};

// Graveyard decor from graveyard-decor atlas
// Sprites scaled to fit 18x18 tile grid proportionally
const DECOR = {
  '>': { atlas: 'graveyard-decor', frame: 'struct_04b', scale: 0.30 }, // gate/fence (364x237) → ~72px tall
  '*': { atlas: 'graveyard-decor', frame: 'tile_18', scale: 0.27 },    // bush → tombstone (132x132) → ~36px tall
  '^': { atlas: 'graveyard-decor', frame: 'struct_01', scale: 0.21 },  // pine → monument (211x258) → ~54px tall
  '"': { atlas: 'graveyard-decor', frame: 'tile_14', scale: 0.23 },    // sprout → grave marker (123x105) → ~24px tall
  o: { atlas: 'graveyard-decor', frame: 'tile_18', scale: 0.27 },      // snowman → tombstone (132x132) → ~36px tall
};

const STOMP_BOUNCE = -300;

// Tattoo shop scale: frame is 384x256, target ~11 tiles (198px) tall
// 256 * scale = 198 → scale ≈ 0.77, then reduced by 15% → 0.6545, then another 5% → 0.6218
const TATTOO_SHOP_SCALE = 0.6218;

// Vertical adjustment to align artwork bottom with ground (compensate for transparent padding in frame)
const TATTOO_SHOP_Y_OFFSET = 3;

// ---- Fireballs ----
const FIREBALL_SPEED = 300;
const FIREBALL_BOUNCE_VY = -170;
const FIREBALL_LIFETIME = 3000;
const MAX_FIREBALLS = 2;

// ---- Scoring ----
const SCORE_COIN = 100;
const SCORE_BRICK = 50;
const SCORE_STOMP = 100;
const SCORE_POWERUP = 1000;
const SCORE_STAR_KILL = 200;

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  /** Everything that can vary between visits arrives via scene data. */
  init(data) {
    this.levelId = data.levelId ?? 'level1';
    this.spawnColOverride = data.spawnCol ?? null;
    this.returnTo = data.returnTo ?? null; // set while inside a bonus room
    this.exitViaPipe = data.exitViaPipe ?? false; // rise out of the pipe at spawnCol
    this.keepTime = data.keepTime ?? false; // pipe travel keeps the level timer
    // What's already been collected/killed/broken, per level — carried
    // through pipe travel so the world keeps its state across the trip.
    // Death and level changes do NOT carry it, so everything respawns.
    this.consumedAll = data.consumed ?? {};
  }

  create() {
    console.log('[GameScene] create() START');
    this.level = LEVELS[this.levelId];
    this.theme = THEMES[this.level.theme];
    // Level 1-3 retains its original sky color despite lava parallax background
    if (this.levelId === 'level3') {
      this.theme = { ...this.theme, sky: '#1a1a2e' };
    }
    this.worldWidth = this.level.width * TILE;

    if (!this.scene.isActive('HUDScene')) this.scene.launch('HUDScene');
    this.registry.set('world', this.level.name.replace(/^WORLD\s*/, ''));
    this.setupTimer();
    this.setupPause();

    sfx.startMusic(this.level.theme);
    this.events.once('shutdown', () => {
      sfx.stopMusic();
      // Clean up Lady in Grey timer
      if (this.ladyTimer) {
        this.ladyTimer.remove(false);
        this.ladyTimer = null;
      }
      if (this.ladyInGrey) {
        this.ladyInGrey.stopAndCleanup();
        this.ladyInGrey = null;
      }
    });

    this.autoPhase = null; // null | 'pipe' | 'flag' | 'walk' | 'done'
    this.pipeUnder = null;
    this.doorX = null;
    this.pipes = []; // {colLeft, colRight, topRow, cx} of every pipe built
    this.consumed = new Set(this.consumedAll[this.levelId] ?? []);

    this.solids = [];
    this.blocks = this.physics.add.staticGroup();
    this.coins = this.add.group();
    this.enemies = this.add.group();
    this.items = this.physics.add.group();
    this.fireballs = this.physics.add.group();
    // pipeSensors and hiddenSensors removed - no pipes or hidden blocks

    this.cameras.main.setBackgroundColor(this.theme.sky);
    if (this.theme.parallax) this.buildParallax();

    // World bounds: bottom check OFF so you can fall into pits.
    this.physics.world.setBounds(0, 0, this.worldWidth, GAME_HEIGHT, true, true, true, false);

    console.log('[GameScene] Before parseGrid');
    this.parseGrid();
    console.log('[GameScene] After parseGrid');
    this.spawnPlayer();
    console.log('[GameScene] After spawnPlayer');

    // TEST: Spawn Lava Creature for testing (near player, on ground)
    // Spawn ~500px ahead of player, feet on ground
    try {
      const playerFeetY = this.player.y + 25.0; // player visual feet Y
      const groundRow = this.findFloorRow(Math.floor((this.player.x + 500) / TILE));
      const groundY = groundRow * TILE;
      // Lava displayHeight = 256 * 0.22 = 56.32, idle frame_0 feet at y=248 → 120px from center * 0.22 = 26.4px
      const testLavaX = this.player.x + 500;
      const testLavaY = groundY - 26.4;  // lava idle frame_0: feet at y=248 (7px padding), 120px from center * 0.22 = 26.4px
      console.log('[GameScene] TEST: Spawning test lava at', { x: testLavaX, y: testLavaY, groundRow, groundY, playerX: this.player.x, playerFeetY });
      window.__gameSceneTestLavaSpawned = true;
      this.enemies.add(new LavaCreature(this, testLavaX, testLavaY, 'test_lava_direct'));
      console.log('[GameScene] TEST: Lava added to enemies group');
    } catch (err) {
      console.error('[GameScene] TEST SPAWN ERROR:', err);
      window.__gameSceneTestLavaSpawned = false;
    }

    // TEST: Spawn Goblin Boss for testing (near player, on ground)
    // Spawn ~600px ahead of player, feet on ground
    try {
      const playerFeetY = this.player.y + 25.0; // player visual feet Y
      const groundRow = this.findFloorRow(Math.floor((this.player.x + 600) / TILE));
      const groundY = groundRow * TILE;
      // Goblin displayHeight = 268 * 0.25 = 67, feet ~22 below center (similar to lava)
      const testGoblinX = this.player.x + 600;
      const testGoblinY = groundY - 22.0;
      console.log('[GameScene] TEST: Spawning test goblin at', { x: testGoblinX, y: testGoblinY, groundRow, groundY, playerX: this.player.x, playerFeetY });
      window.__gameSceneTestGoblinSpawned = true;
      this.enemies.add(new GoblinBoss(this, testGoblinX, testGoblinY, 'test_goblin_direct'));
      console.log('[GameScene] TEST: Goblin added to enemies group');
    } catch (err) {
      console.error('[GameScene] TEST GOBLIN SPAWN ERROR:', err);
      window.__gameSceneTestGoblinSpawned = false;
    }

    this.setupInput();

    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.worldWidth, GAME_HEIGHT);
    cam.startFollow(this.player, true, 0.12, 0.12);
    cam.setZoom(GAME_ZOOM);
    cam.fadeIn(250);

    // --- Lady in Grey ghost appearance system ---
    this.ladyInGrey = null;
    this.ladyTimer = null;
    // First appearance: randomly between 10-30 seconds after level start
    this.scheduleLadyAppearance();

    // --- Physics wiring
    this.physics.add.collider(this.player, this.solids);
    this.physics.add.collider(this.player, this.blocks, this.onPlayerBlockCollide, null, this);
    this.physics.add.collider(this.player, this.enemies, this.onPlayerEnemyContact, null, this);
    this.physics.add.collider(this.enemies, this.solids);
    this.physics.add.collider(this.enemies, this.blocks);
    this.physics.add.collider(this.enemies, this.enemies);
    this.physics.add.collider(this.items, this.solids, this.onItemBounce, null, this);
    this.physics.add.collider(this.items, this.blocks, this.onItemBounce, null, this);
    this.physics.add.collider(this.fireballs, this.solids, this.onFireballBounce, null, this);
    this.physics.add.collider(this.fireballs, this.blocks, this.onFireballBounce, null, this);
    this.physics.add.overlap(this.player, this.coins, this.onCollectCoin, null, this);
    this.physics.add.overlap(this.player, this.items, this.onCollectItem, null, this);
    this.physics.add.overlap(this.fireballs, this.enemies, this.onFireballHitsEnemy, null, this);
    if (this.tattooShopZone) {
      this.physics.add.overlap(this.player, this.tattooShopZone, this.startTattooShopSequence, null, this);
    }
  }

  // ----------------------------------------------------- grid parsing

  /** Pad the level rows into a full ROWS×width char matrix (bottom-anchored). */
  buildMatrix() {
    const { rows, width } = this.level;
    const empty = ' '.repeat(width);
    const pad = Array(ROWS - rows.length).fill(empty);
    return pad.concat(rows.map((r) => r.padEnd(width, ' ')));
  }

  parseGrid() {
    const grid = this.buildMatrix();
    const width = this.level.width;
    this.grid = grid;

    console.log('=== PARSE GRID START ===');
    console.log('[GameScene] parseGrid: ROWS=', ROWS, 'width=', width, 'grid rows=', grid.length, 'level rows=', this.level.rows.length);

    // 'X' = solid, 'x' = decorative (drawn the same, no collision)
    const isFilled = (row, col) =>
      row >= 0 && row < ROWS && col >= 0 && col < width &&
      (grid[row][col] === 'X' || grid[row][col] === 'x');

    for (let row = 0; row < ROWS; row++) {
      let col = 0;
      while (col < width) {
        const ch = grid[row][col];
        const x = col * TILE + TILE / 2;
        const y = row * TILE + TILE / 2;

        if (ch === 'X') {
          // merge the whole horizontal run into ONE body (no seams)
          const start = col;
          while (col < width && grid[row][col] === 'X') {
            // Use graveyard ground texture for all solid ground tiles
            this.add.image(col * TILE + TILE / 2, y, 'tex-graveyard-ground');
            col++;
          }
          const run = col - start;
          this.addSolid(start * TILE + (run * TILE) / 2, y, run * TILE, TILE);
          continue;
        }

        if (ch === 'x') {
          // decorative terrain — visual only, no body
          this.add.image(x, y, 'tex-graveyard-ground');
          col++;
          continue;
        }

        if (ch === 'P') {
          const start = col;
          while (col < width && grid[row][col] === 'P') col++;
          this.buildPlatform(start, col - start, row);
          continue;
        }

        // Every entity's identity is its grid cell — 'gone' means it was
        // consumed before a pipe trip and must not respawn.
        const key = `r${row}c${col}`;
        const gone = this.consumed.has(key);

        // DEBUG: Log non-space characters
        if (ch !== ' ' && ch !== 'B' && ch !== 'c' && ch !== 'p') {
          console.log('[GameScene] parseGrid char:', { row, col, ch, x, y, key, gone });
        }

        switch (ch) {
          case 'B':
            if (!gone) this.addBlock(x, y, T.BRICK, 'brick', null, key);
            break;
          // Special blocks removed: ?, M, S, H
          case 'c': {
            if (gone) break;
            const coin = this.add.sprite(x, y, 'tiles', T.COIN).play('coin-spin');
            this.physics.add.existing(coin, true);
            coin.setData('key', key);
            this.coins.add(coin);
            break;
          }
          case 'e':
            if (!gone) {
              // Zombie enemy spawn — find ground below and spawn with feet on ground
              const zombieGroundRow = this.findFloorRow(col, row + 1);
              const zombieGroundY = zombieGroundRow * TILE;
              // Zombie visual feet at sprite.y + ~27.51 (displayHeight/2 - feet_padding)
              // displayHeight = 503 * 0.1144 = 57.54, feet padding = 11px → 1.26 scaled
              // Frame bottom = sprite.y + 28.77, visual feet = sprite.y + 27.51
              const zombieSpawnY = zombieGroundY - 27.51;
              console.log('[GameScene] Spawning zombie at:', { col, row, x, y: zombieSpawnY, groundRow: zombieGroundRow, groundY: zombieGroundY, key });
              this.enemies.add(new Zombie(this, x, zombieSpawnY, key));
            }
            break;
          case 'p':
            this.spawnCol = col;
            this.spawnRow = row; // floor is searched from HERE down (rooms have ceilings!)
            break;
          // Pipes removed: T, t
          case 'K':
            this.buildTattooShop(col, row);
            break;
          case 'w':
            // Wolf enemy spawn — find ground below and spawn with feet on ground
            const wolfGroundRow = this.findFloorRow(col, row + 1);
            const wolfGroundY = wolfGroundRow * TILE;
            // Wolf visual feet at sprite.y + ~22.2 (displayHeight/2 - feet_offset)
            // displayHeight = 256 * 0.2125 = 54.4, feet ~22.2 below center
            const wolfSpawnY = wolfGroundY - 22.2;
            console.log('[GameScene] Spawning wolf at:', { col, row, x, y: wolfSpawnY, groundRow: wolfGroundRow, groundY: wolfGroundY, key });
            this.enemies.add(new Wolf(this, x, wolfSpawnY, key));
            break;
          case 'l':
            // LavaCreature enemy spawn — find ground below and spawn with feet on ground
            const lavaGroundRow = this.findFloorRow(col, row + 1);
            const lavaGroundY = lavaGroundRow * TILE;
            // LavaCreature visual feet at sprite.y + ~22.2 (matches Wolf: same frame height 256, similar scale)
            const lavaSpawnY = lavaGroundY - 22.2;
            console.log('[GameScene] Spawning LavaCreature at:', { col, row, x, y: lavaSpawnY, groundRow: lavaGroundRow, groundY: lavaGroundY, key });
            this.enemies.add(new LavaCreature(this, x, lavaSpawnY, key));
            break;
          case 'g':
            // GoblinBoss enemy spawn — find ground below and spawn with feet on ground
            const goblinGroundRow = this.findFloorRow(col, row + 1);
            const goblinGroundY = goblinGroundRow * TILE;
            // GoblinBoss visual feet at sprite.y + ~28.5 (frame 268 * 0.25 = 67px display, center origin)
            const goblinSpawnY = goblinGroundY - 28.5;
            console.log('[GameScene] Spawning GoblinBoss at:', { col, row, x, y: goblinSpawnY, groundRow: goblinGroundRow, groundY: goblinGroundY, key });
            this.enemies.add(new GoblinBoss(this, x, goblinSpawnY, key));
            break;
          case 'd':
            this.buildDoor(col, row);
            break;
          default:
            if (DECOR[ch]) {
              const decor = DECOR[ch];
              this.add.image(x, (row + 1) * TILE, decor.atlas, decor.frame)
                .setOrigin(0.5, 1)
                .setScale(decor.scale || 1);
            }
        }
        col++;
      }
    }
  }

  /** First terrain row at/below `fromRow` in this column (for pipes/flag/spawn). */
  findFloorRow(col, fromRow = 0) {
    for (let row = fromRow; row < ROWS; row++) {
      if (this.grid[row][col] === 'X') return row;
    }
    return ROWS - 2; // sensible fallback: standard ground height
  }

  buildPlatform(startCol, run, row) {
    const y = row * TILE + TILE / 2;
    const platformWidth = run * TILE;
    const startX = startCol * TILE;
    const endX = startX + platformWidth;

    // Collision body (unchanged - 18px tall, full platform width)
    this.addSolid(startX + platformWidth / 2, y, platformWidth, TILE);

    if (run === 1) {
      // Single tile platform: use single platform texture centered
      this.add.image(startX + TILE / 2, y, T.PLATFORM_SINGLE);
      return;
    }

    // Multi-tile platform: left cap + tileSprite middle + right cap
    // Texture dimensions (approximate, at 18px height):
    // left cap: ~12.7px wide, right cap: ~11.2px wide, middle tiles at ~12.3px/repeat
    const leftCapWidth = 13;   // graveyard-platform-left scaled width
    const rightCapWidth = 11;  // graveyard-platform-right scaled width

    // Left cap at start
    this.add.image(startX + leftCapWidth / 2, y, T.PLATFORM_LEFT);

    // Right cap at end
    this.add.image(endX - rightCapWidth / 2, y, T.PLATFORM_RIGHT);

    // Middle tileSprite spanning between caps
    const midStartX = startX + leftCapWidth;
    const midEndX = endX - rightCapWidth;
    const midWidth = midEndX - midStartX;
    if (midWidth > 0) {
      this.add
        .tileSprite(midStartX + midWidth / 2, y, midWidth, TILE, T.PLATFORM_MID)
        .setTileScale(1, 1); // 18px height matches TILE
    }
  }

  // buildPipe removed - no pipes in graveyard

  buildTattooShop(col, topRow) {
    const bottomRow = this.findFloorRow(col, topRow);
    const x = col * TILE + TILE / 2;

    // Tattoo shop sprite (animated) - origin at bottom center so feet sit on ground
    this.tattooShopSprite = this.add.sprite(x, bottomRow * TILE + TATTOO_SHOP_Y_OFFSET, 'tattooshop', 'frame_0')
      .setOrigin(0.5, 1)
      .setScale(TATTOO_SHOP_SCALE)
      .setDepth(5);
    this.tattooShopSprite.play('tattooshop-idle');

    // Tattoo shop info for completion logic (reuse flagInfo structure)
    this.tattooShopInfo = { x, topY: topRow * TILE, bottomY: bottomRow * TILE };

    // Trigger zone at the ENTRANCE (door area) - bottom 2 tiles of building
    // Building height ~11 tiles, so entrance zone covers bottom ~2 tiles
    const buildingHeightTiles = 11;
    const entranceZoneHeight = 2 * TILE;
    const entranceZoneY = bottomRow * TILE - entranceZoneHeight / 2;
    this.tattooShopZone = this.add.zone(x, entranceZoneY, 10, entranceZoneHeight);
    this.physics.add.existing(this.tattooShopZone, true);
  }

  buildDoor(col, row) {
    const x = col * TILE + TILE / 2;
    this.add.image(x, (row - 1) * TILE + TILE / 2, 'tiles', T.DOOR_TOP);
    this.add.image(x, row * TILE + TILE / 2, 'tiles', T.DOOR_BOTTOM);
    this.doorX = x;
  }

  addBlock(x, y, frame, type, content = null, key = null) {
    const block = this.blocks.create(x, y, 'tiles', frame);
    block.setData('type', type);
    if (content) block.setData('content', content);
    if (key) block.setData('key', key);
    return block;
  }

  // addHiddenBlock removed - no hidden blocks

  addSolid(x, y, width, height) {
    const zone = this.add.zone(x, y, width, height);
    this.physics.add.existing(zone, true);
    this.solids.push(zone);
    return zone;
  }

  spawnPlayer() {
    const col = this.spawnColOverride ?? this.spawnCol ?? 3;

    // Arriving from a bonus room: rise out of the pipe at the spawn column
    const pipe = this.exitViaPipe
      ? this.pipes.find((p) => col >= p.colLeft - 1 && col <= p.colRight + 1)
      : null;

    // Scan from the 'p' marker's row, NOT from the top of the world —
    // otherwise a level with a ceiling would put the player on its roof.
    const fromRow = this.spawnColOverride !== null ? 0 : this.spawnRow ?? 0;
    const floorRow = this.findFloorRow(col, fromRow);
    const feetY = floorRow * TILE;

    // Cousin has center origin (0.5, 0.5). Visual feet at sprite.y + 25.0.
    // Spawn with sprite.y = feetY - 25.0 so visual feet rest on ground top.
    this.player = new Player(this, col * TILE + TILE / 2, feetY - 25.0);
    // icy themes have less friction — the classic slide
    if (this.theme.dragFactor) this.player.setDragFactor(this.theme.dragFactor);

    if (pipe) {
      // start hidden inside the mouth, slide up until standing on it
      const mouthY = pipe.topRow * TILE;
      this.player.x = pipe.cx;
      this.player.y = mouthY + 20;
      this.player.body.enable = false;
      this.player.body.reset(this.player.x, this.player.y);
      this.autoPhase = 'pipe';
      this.tweens.add({
        targets: this.player,
        y: mouthY - 12 * this.player.scale,
        duration: 600,
        ease: 'Sine.easeOut',
        onComplete: () => {
          this.player.body.enable = true;
          this.player.body.reset(this.player.x, this.player.y);
          this.autoPhase = null;
        },
      });
      return;
    }
  }

  // ----------------------------------------------------------- parallax

  buildParallax() {
    // World 1-3 (level3) and 1-4 (level4) use lava background
    const isLavaLevel = this.levelId === 'level3' || this.levelId === 'level4';
    const bgKey = isLavaLevel ? 'lava-level-bg' : 'graveyard-bg';
    const bgHeight = 700;
    // Lava background: shift down to show more bottom of image (was 324)
    const centerY = isLavaLevel ? 380 : 324;
    const scrollFactor = 0.15;

    this.graveyardBg = this.add
      .tileSprite(this.worldWidth / 2, centerY, this.worldWidth, bgHeight, bgKey)
      .setScrollFactor(scrollFactor)
      .setDepth(-10);
  }

  // ------------------------------------------------------------- blocks

  onPlayerBlockCollide(player, block) {
    const hitFromBelow = player.body.touching.up && block.y < player.y;
    if (!hitFromBelow) return;

    const type = block.getData('type');
    if (type === 'question') {
      // Question blocks removed - this shouldn't be reached
    } else if (type === 'brick') {
      // cousin can always break bricks
      this.breakBrick(block);
    }
  }

  // openQuestionBlock removed - no question blocks

  breakBrick(block) {
    sfx.play('break');
    this.cameras.main.shake(110, 0.006);
    this.consume(block.getData('key'));
    this.addScore(SCORE_BRICK, block.x, block.y - TILE);
    const { x, y } = block;
    block.destroy();

    const bursts = [
      [-60, -280], [60, -280],
      [-110, -180], [110, -180],
    ];
    bursts.forEach(([vx, vy]) => {
      const frag = this.add.image(x, y, 'tiles', T.BRICK).setScale(0.5);
      this.physics.add.existing(frag);
      frag.body.checkCollision.none = true;
      frag.body.setVelocity(vx + Phaser.Math.Between(-20, 20), vy + Phaser.Math.Between(-40, 0));
      frag.body.setAngularVelocity(Phaser.Math.Between(-400, 400));
      this.tweens.add({
        targets: frag,
        alpha: 0,
        delay: 250,
        duration: 450,
        onComplete: () => frag.destroy(),
      });
    });
  }

  bumpBlock(block) {
    sfx.play('bump');
    this.tweens.add({
      targets: block,
      y: block.y - 6,
      duration: 70,
      ease: 'Quad.easeOut',
      yoyo: true,
    });
  }

  // onHiddenSensor removed - no hidden blocks

  // -------------------------------------------------------------- items

  emergeItem(block, sprite, onReady) {
    sprite.setDepth(-1);
    sprite.body.enable = false;
    this.tweens.add({
      targets: sprite,
      y: block.y - TILE,
      duration: 450,
      ease: 'Sine.easeOut',
      onComplete: () => {
        sprite.setDepth(1);
        sprite.body.enable = true;
        onReady();
      },
    });
  }

  /** Mushroom-style item: slides, bounces off walls, falls off edges. */
  spawnWalkingItem(block, kind, texture, frame) {
    const item = this.items.create(block.x, block.y, texture, frame);
    item.setData('kind', kind);
    item.body.setSize(14, 14);
    item.body.setOffset(2, 4);
    this.emergeItem(block, item, () => {
      item.setCollideWorldBounds(true);
      item.setBounce(1, 0);
      item.setVelocityX(60);
    });
  }

  spawnFireGem(block) {
    const gem = this.items.create(block.x, block.y, 'gem-fire');
    gem.setData('kind', 'fireGem');
    gem.body.setAllowGravity(false);
    this.emergeItem(block, gem, () => {});
  }

  spawnStar(block) {
    const star = this.items.create(block.x, block.y, 'gem-star');
    star.setData('kind', 'star');
    star.body.setSize(12, 12);
    star.body.setOffset(3, 3);
    this.emergeItem(block, star, () => {
      star.setCollideWorldBounds(true);
      star.setBounce(1, 0);
      star.setVelocity(110, -240);
    });
    const tints = [0xffffff, 0xffe066, 0x66e0ff, 0xff8de1, 0x9dff8d];
    const shimmer = this.time.addEvent({
      delay: 120,
      repeat: -1,
      callback: () => {
        if (!star.active) {
          shimmer.remove();
          return;
        }
        star.setTint(tints[Math.floor(this.time.now / 120) % tints.length]);
      },
    });
  }

  onItemBounce(a, b) {
    // argument order is not guaranteed in group-vs-group collisions
    const item = a.getData && a.getData('kind') ? a : b;
    if (item.getData('kind') === 'star' && item.body.blocked.down) {
      item.setVelocityY(-330);
    }
  }

  onCollectItem(player, item) {
    if (!item.body.enable) return; // still emerging
    const kind = item.getData('kind');
    item.destroy();

    this.sparkle(item.x, item.y, 0xffe066);
    this.addScore(SCORE_POWERUP, player.x, player.y - 24);
    // simple pickups just give points; no power-up state changes
  }

  // ---------------------------------------------------------- fireballs

  shootFireball(player) {
    const active = this.fireballs.getChildren().filter((f) => f.active).length;
    if (active >= MAX_FIREBALLS) return;

    sfx.play('fireball');
    const spawn = player.getFireballSpawnPoint();
    const dir = player.flipX ? -1 : 1;
    const ball = this.fireballs.create(spawn.x + dir * 8, spawn.y, 'fireball');
    ball.setDepth(2);
    ball.setCircle(5);
    ball.setVelocity(dir * FIREBALL_SPEED, 60);
    ball.body.setAngularVelocity(dir * 600);

    this.time.delayedCall(FIREBALL_LIFETIME, () => {
      if (ball.active) this.poof(ball);
    });
  }

  onFireballBounce(a, b) {
    const ball = a.texture && a.texture.key === 'fireball' ? a : b;
    // Ensure ball is the fireball (has dynamic body with setVelocityY)
    if (!ball.body || typeof ball.setVelocityY !== 'function') return;
    if (ball.body.blocked.left || ball.body.blocked.right) {
      this.poof(ball);
    } else if (ball.body.blocked.down) {
      ball.setVelocityY(FIREBALL_BOUNCE_VY);
    }
  }

  onFireballHitsEnemy(a, b) {
    // Handle any enemy that has knockAway method (Walker, Zombie, Wolf, etc.)
    const enemy = (a.knockAway ? a : b);
    const ball = enemy === a ? b : a;
    if (enemy.isSquashed || !ball.body.enable) return;
    sfx.play('stomp');
    this.poof(ball);
    enemy.knockAway(ball.x);
    this.addScore(SCORE_STOMP, enemy.x, enemy.y - 16);
  }

  poof(obj) {
    obj.body.enable = false;
    this.tweens.add({
      targets: obj,
      scale: obj.scale * 1.8,
      alpha: 0,
      duration: 120,
      onComplete: () => obj.destroy(),
    });
  }

  // ------------------------------------------------------ player contact

  /** Remember that a grid entity is gone (survives pipe trips). */
  consume(key) {
    if (key) this.consumed.add(key);
  }

  onCollectCoin(player, coin) {
    coin.body.enable = false;
    this.consume(coin.getData('key'));
    sfx.play('coin');
    this.sparkle(coin.x, coin.y);
    this.addScore(SCORE_COIN, coin.x, coin.y);
    this.registry.values.coins += 1;
    this.tweens.add({
      targets: coin,
      y: coin.y - 24,
      scale: 1.4,
      alpha: 0,
      duration: 250,
      ease: 'Cubic.easeOut',
      onComplete: () => coin.destroy(),
    });
  }

  onPlayerEnemyContact(player, enemy) {
    if (player.isDead || enemy.isSquashed || enemy.isDead || this.autoPhase) return;

    // Stomp detection: player must be clearly falling with significant velocity
    // and be positioned above the enemy's center.
    // This prevents false stomps when walking horizontally into the enemy.
    const stomping =
      player.body.velocity.y > 100 &&  // must be falling with meaningful speed
      player.body.bottom < enemy.body.center.y + 4;

    if (stomping) {
      enemy.squash();
      sfx.play('stomp');
      this.cameras.main.shake(70, 0.004);
      player.body.setVelocityY(STOMP_BOUNCE);
      this.addScore(SCORE_STOMP, enemy.x, enemy.y - 16);
    } else {
      this.hurtPlayer(); // contact damage enabled
    }
  }

  /** Little burst of glittery squares (coin and item pick-ups). */
  sparkle(x, y, tint = 0xffe066) {
    const particles = this.add
      .particles(x, y, 'spark', {
        speed: { min: 50, max: 150 },
        lifespan: 350,
        scale: { start: 1.3, end: 0 },
        tint,
        emitting: false,
      })
      .setDepth(5);
    particles.explode(8);
    this.time.delayedCall(500, () => particles.destroy());
  }

  hurtPlayer() {
    const p = this.player;
    if (p.isDead || p.invulnerable || this.autoPhase) return;
    p.makeInvulnerable();
    // For now, cousin has no power states - one hit = death
    // But with invulnerability frames to prevent instant re-death
    this.killPlayer();
  }

  killPlayer() {
    if (this.player.isDead) return;
    sfx.stopMusic();
    sfx.play('death');
    this.player.die();
    this.cameras.main.stopFollow();
    this.time.delayedCall(1800, () => {
      const lives = (this.registry.get('lives') ?? 3) - 1;
      this.registry.set('lives', lives);
      // dying in a bonus room restarts the level it belongs to
      const levelId = this.returnTo?.levelId ?? this.levelId;
      if (lives > 0) this.scene.start('IntroScene', { levelId });
      else this.scene.start('GameOverScene');
    });
  }

  addScore(amount, x, y) {
    this.registry.values.score += amount;
    const popup = this.add
      .text(x, y, `+${amount}`, {
        fontFamily: 'monospace',
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setStroke('#000000', 3)
      .setDepth(10);
    this.tweens.add({
      targets: popup,
      y: y - 28,
      alpha: 0,
      duration: 600,
      onComplete: () => popup.destroy(),
    });
  }

  // -------------------------------------------- tattoo shop & level transitions

  startTattooShopSequence(player, zone) {
    if (this.autoPhase || player.isDead) return;

    // Prevent re-triggering
    this.physics.world.removeCollider(this.tattooShopCollider);
    this.tattooShopZone.destroy();
    this.tattooShopZone = null;

    this.autoPhase = 'tattooshop';
    sfx.stopMusic();
    sfx.play('flag'); // reuse flag fanfare sound

    const { x, topY, bottomY } = this.tattooShopInfo;

    // Award points based on approach (reuse flag scoring)
    const ratio = Phaser.Math.Clamp((bottomY - player.body.bottom) / (bottomY - topY), 0, 1);
    const points = 100 + Math.round(ratio * 49) * 100;
    this.addScore(points, x, topY - 10);

    player.body.enable = false;
    player.setFlipX(true);
    player.x = x + 10;
    player.anims.play(`${player.animPrefix}-jump`);

    // Stop idle animation, play entrance animation once
    this.tattooShopSprite.stop();
    this.tattooShopSprite.play('tattooshop-entrance');

    // When entrance animation completes, transition to level completion
    this.tattooShopSprite.once('animationcomplete-tattooshop-entrance', () => {
      player.body.enable = true;
      player.body.reset(player.x, player.y);
      player.setFlipX(false);
      this.finishLevel();
    });

    // Fallback: if animation doesn't fire, still complete level after duration
    // 11 frames at 8fps = 1.375s, add buffer
    this.time.delayedCall(2000, () => {
      if (this.autoPhase === 'tattooshop') {
        this.finishLevel();
      }
    });
  }

  finishLevel() {
    this.autoPhase = 'done';
    this.player.body.setVelocityX(0);

    // remaining time becomes points (50 per second, like the classics)
    const t = this.registry.get('time') ?? 0;
    if (t > 0) {
      this.registry.set('time', 0);
      this.addScore(t * 50, this.player.x, this.player.y - 40);
    }

    this.tweens.add({ targets: this.player, alpha: 0, duration: 250 }); // into the door
    this.cameras.main.fadeOut(700);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      if (this.level.next === 'end') {
        this.scene.start('EndScene');
      } else {
        this.scene.start('IntroScene', {
          levelId: this.level.next,
        });
      }
    });
  }

  // enterPipe removed - no pipes

  // ------------------------------------------------------- Lady in Grey appearance system

  /** Schedule next appearance with random timing (10-30 seconds between appearances) */
  scheduleLadyAppearance() {
    // Stop any existing timer
    if (this.ladyTimer) {
      this.ladyTimer.remove(false);
      this.ladyTimer = null;
    }

    // Random interval: 10-30 seconds between appearances
    const delay = Phaser.Math.Between(10000, 30000);

    this.ladyTimer = this.time.addEvent({
      delay: delay,
      callback: () => {
        if (!this.player || this.player.isDead || this.autoPhase) {
          this.scheduleLadyAppearance(); // retry if game state is not ready
          return;
        }
        if (this.isInTattooShopExclusionZone()) {
          // Postpone: reschedule to check again in 5 seconds
          this.scheduleLadyAppearanceAfter(5000);
          return;
        }
        this.spawnLadyInGrey();
      },
      loop: false,
    });
  }

  /** Schedule Lady appearance after a fixed delay (used for postponing) */
  scheduleLadyAppearanceAfter(delay) {
    // Stop any existing timer
    if (this.ladyTimer) {
      this.ladyTimer.remove(false);
      this.ladyTimer = null;
    }

    this.ladyTimer = this.time.addEvent({
      delay: delay,
      callback: () => {
        if (!this.player || this.player.isDead || this.autoPhase) {
          this.scheduleLadyAppearanceAfter(delay);
          return;
        }
        if (this.isInTattooShopExclusionZone()) {
          this.scheduleLadyAppearanceAfter(5000);
          return;
        }
        this.spawnLadyInGrey();
      },
      loop: false,
    });
  }

  /** Check if the tattoo shop is visible in the camera (player is near it) */
  isInTattooShopExclusionZone() {
    if (!this.tattooShopInfo) return false;

    const cam = this.cameras.main;
    const camWidth = cam.width;
    const shopX = this.tattooShopInfo.x;

    // Camera visible range in world coordinates
    const camLeft = cam.scrollX - camWidth / 2;
    const camRight = cam.scrollX + camWidth / 2;

    // Exclude if the tattoo shop is in the camera's viewing area
    if (shopX >= camLeft && shopX <= camRight) {
      return true;
    }

    return false;
  }

  /** Spawn Lady in Grey at a random position within camera view */
  spawnLadyInGrey() {
    if (this.ladyInGrey) return; // Only one at a time

    const cam = this.cameras.main;
    const camWidth = cam.width;
    const camHeight = cam.height;

    // Create Lady in Grey sprite at center (will be positioned/tweened in her class)
    this.ladyInGrey = new LadyInGrey(this, camWidth / 2, camHeight / 2);

    // Set her to render above gameplay
    this.ladyInGrey.setDepth(5);

    // Set callback to schedule next random appearance after she completes
    this.ladyInGrey.onCompleteCallback = () => {
      this.ladyInGrey = null;
      this.scheduleLadyAppearance();
    };

    // Start the animation sequence
    this.ladyInGrey.start();
  }

  // ------------------------------------------------------- timer & pause

  setupTimer() {
    // pipe travel keeps the clock running; everything else resets it
    if (!this.keepTime) this.registry.set('time', this.level.time ?? 300);
    this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        if (this.autoPhase || this.player.isDead) return;
        const t = (this.registry.get('time') ?? 0) - 1;
        this.registry.set('time', Math.max(0, t));
        if (t <= 0) this.killPlayer(); // time up — power state doesn't save you
      },
    });
  }

  setupPause() {
    this.input.keyboard.on('keydown-ESC', () => this.pauseGame());
    this.input.keyboard.on('keydown-P', () => this.pauseGame());
  }

  /** Also called by the HUD's pause button. */
  pauseGame() {
    if (this.autoPhase || this.player.isDead || this.scene.isPaused()) return;
    this.scene.launch('PauseScene');
    this.scene.pause();
  }

  // -------------------------------------------------------------- input

  setupInput() {
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,A,S,D,SHIFT,X');
    this.jumpWasHeld = false;
    this.attackWasHeld = false;
  }

  // -------------------------------------------------------------- update

  update() {
    if (this.hills) {
      this.hills.tilePositionX = (this.cameras.main.scrollX * 0.4) / 3;
    }

    // TEMP DIAGNOSTIC: Log actual runtime positions of all characters every 60 frames
    if (!this._diagFrame) this._diagFrame = 0;
    this._diagFrame++;
    if (this._diagFrame % 60 === 0) {
      const logChar = (name, char) => {
        if (!char || char.isDead || char.isSquashed) return;
        const b = char.body;
        const feetY = char.y + (char.displayHeight / 2) * (1 - char.originY);
        console.log(`[POS] ${name}:`, {
          sprite: { x: Math.round(char.x), y: Math.round(char.y) },
          origin: { x: char.originX, y: char.originY },
          displaySize: { w: Math.round(char.displayWidth), h: Math.round(char.displayHeight) },
          body: {
            x: Math.round(b.x), y: Math.round(b.y),
            w: Math.round(b.width), h: Math.round(b.height),
            centerX: Math.round(b.center.x), centerY: Math.round(b.center.y),
            top: Math.round(b.top), bottom: Math.round(b.bottom),
            left: Math.round(b.left), right: Math.round(b.right),
            offset: { x: b.offset.x, y: b.offset.y },
            blocked: b.blocked, touching: b.touching,
            onFloor: b.onFloor(),
          },
          visualFeetY: Math.round(feetY),
          animFrame: char.anims.currentFrame?.index,
        });
      };
      logChar('Player', this.player);
      this.enemies.getChildren().forEach(e => logChar(e.constructor.name, e));
    }

    if (this.player.isDead) return;

    // fell into a pit
    if (this.player.y > GAME_HEIGHT + 40 && !this.autoPhase) {
      this.killPlayer();
      return;
    }

    if (this.autoPhase === 'walk') {
      // auto-walk to the castle door after the flag slide
      this.player.handleInput({ left: false, right: true, jumpHeld: false, jumpPressed: false });
      if (this.doorX === null || this.player.x >= this.doorX - 2) this.finishLevel();
      return;
    }
    if (this.autoPhase) return; // pipe / flag / done / tattooshop — tweens/animations are in charge

    const left = this.cursors.left.isDown || this.keys.A.isDown || touchState.left;
    const right = this.cursors.right.isDown || this.keys.D.isDown || touchState.right;
    const down = this.cursors.down.isDown || this.keys.S.isDown || touchState.down;
    const jumpHeld =
      this.cursors.up.isDown ||
      this.cursors.space.isDown ||
      this.keys.W.isDown ||
      touchState.jump;
    const attackHeld = this.keys.SHIFT.isDown || this.keys.X.isDown || touchState.fire;

    const jumpPressed = jumpHeld && !this.jumpWasHeld;
    const attackPressed = attackHeld && !this.attackWasHeld;
    this.jumpWasHeld = jumpHeld;
    this.attackWasHeld = attackHeld;

    this.player.handleInput({ left, right, jumpHeld, jumpPressed, attackPressed });

    // standing on a secret pipe + Down = travel (removed - no pipes)

    // tidy up items and enemies that fell into pits
    this.items.getChildren().forEach((item) => {
      if (item.y > GAME_HEIGHT + 60) item.destroy();
    });
    this.enemies.getChildren().forEach((enemy) => {
      if (enemy.y > GAME_HEIGHT + 60) {
        this.consume(enemy.gridKey); // gone for good, like a kill
        enemy.destroy();
      }
    });
  }
}