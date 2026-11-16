// Retro sound engine — sound effects are synthesized with the Web Audio API
// (oscillators + gain envelopes), no audio files needed for SFX.
// Background music can be loaded from external audio files (ogg/mp3).

const MUTE_KEY = 'retro-platformer-muted';

class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.musicSource = null;
    this.musicBuffer = null;
    this.musicLoop = false;
    this.muted = false;
    this.currentMusicKind = null; // Track what's actually playing
    this.musicRequestId = 0; // Incremented on each startMusic call

    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      this.muted = false;
    }

    // Track loading promises for each music track
    this.musicLoadingPromises = {};

    // Browsers only allow audio after a user gesture — create/resume the
    // context on the first interaction (the title screen tap counts).
    const unlock = () => {
      this.ensure();
      // Process any pending preloads now that context exists
      if (this.pendingPreloads) {
        this.pendingPreloads.forEach(({ key, url }) => this.loadAudioBuffer(key, url));
        this.pendingPreloads = null;
      }
      // Process pending music request
      if (this.pendingMusic) {
        const kind = this.pendingMusic;
        this.pendingMusic = null;
        this.startMusic(kind);
      }
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.5;
      this.musicGain.connect(this.master);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(muted) {
    this.muted = muted;
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (this.master) this.master.gain.value = muted ? 0 : 1;
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  /** One enveloped oscillator note: the building block of every effect. */
  tone({ type = 'square', from = 440, to = null, dur = 0.1, delay = 0, vol = 0.25, dest = null }) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    if (to && to !== from) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(dest ?? this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  /** A burst of white noise (impacts, breaking). */
  noise({ dur = 0.15, delay = 0, vol = 0.3 }) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const length = Math.ceil(this.ctx.sampleRate * dur);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(gain);
    gain.connect(this.master);
    src.start(t0);
  }

  /** Play several notes in a row (power-ups, fanfares). */
  arpeggio(freqs, { step = 0.07, dur = 0.09, type = 'square', vol = 0.22 } = {}) {
    freqs.forEach((f, i) => this.tone({ type, from: f, dur, delay: i * step, vol }));
  }

  play(name) {
    if (!this.ctx) return;
    switch (name) {
      case 'jump':
        this.tone({ from: 180, to: 520, dur: 0.18, vol: 0.2 });
        break;
      case 'coin':
        this.tone({ from: 988, dur: 0.07, vol: 0.2 });
        this.tone({ from: 1319, dur: 0.22, delay: 0.07, vol: 0.2 });
        break;
      case 'stomp':
        this.tone({ from: 280, to: 60, dur: 0.12, vol: 0.3 });
        this.noise({ dur: 0.06, vol: 0.15 });
        break;
      case 'bump':
        this.tone({ type: 'triangle', from: 120, to: 80, dur: 0.08, vol: 0.3 });
        break;
      case 'break':
        this.noise({ dur: 0.2, vol: 0.3 });
        this.tone({ from: 200, to: 70, dur: 0.15, vol: 0.2 });
        break;
      case 'fireball':
        this.tone({ from: 700, to: 180, dur: 0.09, vol: 0.16 });
        break;
      case 'powerup':
        this.arpeggio([392, 523, 659, 784, 1047], { type: 'triangle', vol: 0.25 });
        break;
      case 'oneup':
        this.arpeggio([523, 659, 784, 1047, 1319], { step: 0.08 });
        break;
      case 'hurt':
        this.tone({ from: 400, to: 120, dur: 0.25, vol: 0.25 });
        break;
      case 'death':
        this.arpeggio([494, 440, 392, 330, 262, 196], { step: 0.11, dur: 0.12, vol: 0.25 });
        break;
      case 'flag':
        this.arpeggio([523, 659, 784, 1047, 1319, 1568], { step: 0.09, dur: 0.12, type: 'triangle', vol: 0.3 });
        break;
      case 'pipe':
        this.tone({ from: 300, to: 90, dur: 0.3, vol: 0.25 });
        break;
    }
  }

  // ------------------------------------------------------------- music
  // Music can now be loaded from external audio files (ogg/mp3).
  // Place your music files in assets/audio/ and reference them here.
  //
  // Expected files (to be provided by user):
  // - assets/audio/graveyard-music.ogg (gameplay music, loops)
  // - assets/audio/graveyard-title-music.ogg (title screen music, loops)
  //
  // If files are not found, falls back to synthesized retro loops.

  /** Map music kinds to audio file keys. */
  getAudioKey(kind) {
    const musicMap = {
      overworld: 'graveyard-music',
      underground: 'graveyard-music',
      title: 'graveyard-title-music',
    };
    return musicMap[kind] || 'graveyard-music';
  }

  /** Start playing music for the given kind. Stops any existing music first. */
  async startMusic(kind) {
    // Ensure audio context exists
    if (!this.ctx) {
      this.ensure();
      if (!this.ctx) {
        this.pendingMusic = kind; // Will start on first user gesture
        return;
      }
    }
    this.ensure();

    // Increment request ID - this marks a new authoritative request
    const requestId = ++this.musicRequestId;

    // If same music is already playing, do nothing
    if (this.currentMusicKind === kind && this.musicSource) {
      return;
    }

    // Stop any currently playing music
    this.stopMusic();

    const audioKey = this.getAudioKey(kind);

    // Try to load from preloaded audio cache
    const audioCache = this.ctx.audioCache || {};

    let audioBuffer = null;

    // 1. Check cache first
    if (audioCache[audioKey]) {
      audioBuffer = audioCache[audioKey];
    }
    // 2. If not cached, check if already loading
    else if (this.musicLoadingPromises[audioKey]) {
      try {
        audioBuffer = await this.musicLoadingPromises[audioKey];
      } catch (err) {
        console.warn(`[SFX] Failed to load music ${audioKey}:`, err);
      }
    }
    // 3. Not cached, not loading - start loading it now and wait
    else {
      try {
        audioBuffer = await this.loadAudioBuffer(audioKey, `assets/audio/${audioKey}.ogg`);
      } catch (err) {
        console.warn(`[SFX] Failed to load music ${audioKey}:`, err);
      }
    }

    // CRITICAL: Check if this request is still the most recent one
    // If a newer startMusic call happened, abort and don't play
    if (requestId !== this.musicRequestId) {
      console.log(`[SFX] Ignoring stale music load for ${kind} (request ${requestId}, current ${this.musicRequestId})`);
      return;
    }

    // If we got a buffer, play it and track what's playing
    if (audioBuffer) {
      this.playMusicBuffer(audioBuffer, true);
      this.currentMusicKind = kind;
      return;
    }

    // Fallback to synthesized retro loops if external music fails
    this.startSynthesizedMusic(kind);
    this.currentMusicKind = kind;
  }

  /** Load and play an external audio buffer as looping music. */
  playMusicBuffer(audioBuffer, loop = true) {
    if (this.musicSource) {
      this.musicSource.stop();
      this.musicSource.disconnect();
    }

    this.musicSource = this.ctx.createBufferSource();
    this.musicSource.buffer = audioBuffer;
    this.musicSource.loop = loop;
    this.musicSource.connect(this.musicGain);
    this.musicSource.start(0);
  }

  /** Load an external audio file and return a promise that resolves with the decoded buffer. */
  loadAudioBuffer(key, url) {
    // Return existing promise if already loading
    if (this.musicLoadingPromises[key]) {
      return this.musicLoadingPromises[key];
    }

    const promise = fetch(url)
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then(arrayBuffer => this.ctx.decodeAudioData(arrayBuffer))
      .then(audioBuffer => {
        if (!this.ctx.audioCache) this.ctx.audioCache = {};
        this.ctx.audioCache[key] = audioBuffer;
        console.log(`[SFX] Loaded music: ${key}`);
        return audioBuffer;
      })
      .catch(err => {
        console.warn(`[SFX] Failed to load music ${key}:`, err);
        throw err;
      })
      .finally(() => {
        delete this.musicLoadingPromises[key];
      });

    this.musicLoadingPromises[key] = promise;
    return promise;
  }

  /** Synthesized fallback music (original retro loops). */
  startSynthesizedMusic(kind) {
    const C3 = 130.8, E3 = 164.8, F3 = 174.6, G3 = 196, A3 = 220, B2 = 123.5;
    const C5 = 523, D5 = 587, E5 = 659, F5 = 698, G5 = 784, A5 = 880, E4 = 330, A4 = 440, B4 = 494, C4 = 262, D4 = 294, G4 = 392;

    const tracks = {
      overworld: {
        bpm: 138,
        steps: [
          [523, 130.8], [0, 0], [784, 196], [0, 0], [523, 130.8], [523, 0], [587, 196], [523, 0],
          [698, 174.6], [0, 0], [880, 130.8], [0, 0], [784, 174.6], [523, 0], [587, 196], [523, 0],
          [523, 220], [0, 0], [784, 164.8], [0, 0], [880, 220], [784, 0], [523, 164.8], [523, 0],
          [587, 196], [523, 0], [587, 123.5], [523, 0], [523, 130.8], [0, 0], [0, 196], [0, 0],
        ],
      },
      underground: {
        bpm: 112,
        steps: [
          [440, 220], [0, 0], [0, 0], [523, 0], [0, 220], [0, 0], [494, 164.8], [0, 0],
          [440, 220], [0, 0], [0, 0], [330, 0], [0, 220], [0, 0], [392, 164.8], [0, 0],
          [174.6 * 2, 174.6], [0, 0], [0, 0], [440, 0], [0, 174.6], [0, 0], [392, 130.8], [0, 0],
          [330, 220], [0, 0], [0, 0], [0, 0], [494, 164.8], [0, 0], [440, 220], [0, 0],
        ],
      },
      title: {
        bpm: 100,
        steps: [
          [262, 130.8], [0, 0], [330, 164.8], [0, 0], [392, 196], [0, 0], [523, 0],
          [0, 0], [0, 0], [440, 220], [0, 0], [392, 196], [0, 0], [330, 164.8], [0, 0],
          [262, 130.8], [0, 0], [330, 164.8], [0, 0], [392, 196], [0, 0], [523, 0],
          [0, 0], [0, 0], [440, 220], [0, 0], [392, 196], [0, 0], [330, 164.8], [0, 0],
        ],
      },
    };

    const track = tracks[kind];
    if (!track) return;

    const stepDur = 60 / track.bpm / 2; // eighth notes
    const loopDur = track.steps.length * stepDur;

    const scheduleLoop = (t0) => {
      track.steps.forEach(([lead, bass], i) => {
        const delay = t0 + i * stepDur - this.ctx.currentTime;
        if (lead) {
          this.tone({ type: 'square', from: lead, dur: stepDur * 0.85, delay, vol: 0.07, dest: this.musicGain });
        }
        if (bass) {
          this.tone({ type: 'triangle', from: bass, dur: stepDur * 1.6, delay, vol: 0.16, dest: this.musicGain });
        }
      });
    };

    let nextLoop = this.ctx.currentTime + 0.1;
    scheduleLoop(nextLoop);
    nextLoop += loopDur;
    // wake up shortly before each loop ends and schedule the next one
    this.musicTimer = setInterval(() => {
      if (this.ctx.currentTime > nextLoop - 0.3) {
        scheduleLoop(nextLoop);
        nextLoop += loopDur;
      }
    }, 100);
  }

  stopMusic() {
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    if (this.musicSource) {
      this.musicSource.stop();
      this.musicSource.disconnect();
      this.musicSource = null;
    }
    this.currentMusicKind = null;
  }

  /** Call this to preload an external music file.
   * Usage: sfx.preloadMusic('graveyard-music', 'assets/audio/graveyard-music.ogg');
   * Should be called during PreloadScene.preload() */
  preloadMusic(key, url) {
    if (!this.ctx) {
      // Queue for later if context not ready
      if (!this.pendingPreloads) this.pendingPreloads = [];
      this.pendingPreloads.push({ key, url });
      return;
    }
    // Start loading but don't await - fire and forget for preload
    this.loadAudioBuffer(key, url).catch(() => {});
  }
}

// One shared instance for the whole game.
export const sfx = new Sfx();