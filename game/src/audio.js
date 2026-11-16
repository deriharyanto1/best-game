// Every sound is synthesised live with WebAudio: no audio files, no network. Effects are
// short oscillator and noise bursts; the music is a quiet generative loop in A minor (a bass
// pulse under a slow arpeggio) that starts on the first user gesture and never blocks the game.

const MUSIC_BPM = 112;
const STEP_SECONDS = 60 / MUSIC_BPM / 2;
/** One bar (8 eighth-notes) per chord: Am, F, C, G. */
const CHORDS = [
  { bass: 110.0, arp: [220.0, 261.63, 329.63, 440.0] },
  { bass: 87.31, arp: [174.61, 220.0, 261.63, 349.23] },
  { bass: 130.81, arp: [261.63, 329.63, 392.0, 523.25] },
  { bass: 98.0, arp: [196.0, 246.94, 293.66, 392.0] },
];

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let noiseBuffer = null;
  let muted = false;
  let musicTimer = null;
  let nextStep = 0;
  let stepIndex = 0;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.14;
      musicGain.connect(master);
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      return true;
    } catch {
      ctx = null;
      return false;
    }
  }

  function tone({ freq, freqEnd = null, dur = 0.15, type = 'sine', vol = 0.2, delay = 0, dest = null }) {
    if (!ctx || muted) return;
    try {
      const t0 = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (freqEnd !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(vol, t0 + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain);
      gain.connect(dest ?? master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    } catch {
      // Sound never blocks the game.
    }
  }

  function noise({ dur = 0.2, vol = 0.2, filterFreq = 1200, delay = 0 }) {
    if (!ctx || muted || !noiseBuffer) return;
    try {
      const t0 = ctx.currentTime + delay;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start(t0);
      src.stop(t0 + dur + 0.05);
    } catch {
      // Sound never blocks the game.
    }
  }

  function scheduleMusicStep() {
    if (!ctx || muted) return;
    const chord = CHORDS[Math.floor(stepIndex / 8) % CHORDS.length];
    const stepInBar = stepIndex % 8;
    const when = nextStep - ctx.currentTime;
    if (stepInBar === 0) tone({ freq: chord.bass, dur: 0.5, type: 'sine', vol: 0.5, delay: when, dest: musicGain });
    if (stepInBar === 4) tone({ freq: chord.bass / 2, dur: 0.5, type: 'sine', vol: 0.35, delay: when, dest: musicGain });
    const note = chord.arp[stepInBar % chord.arp.length];
    tone({ freq: note, dur: 0.22, type: 'triangle', vol: 0.16, delay: when, dest: musicGain });
    nextStep += STEP_SECONDS;
    stepIndex += 1;
  }

  return {
    /** Create (or resume) the context: call from a user gesture. */
    unlock() {
      if (!ensure()) return;
      try {
        if (ctx.state === 'suspended') void ctx.resume();
      } catch {
        // Ignore.
      }
      this.startMusic();
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    isMuted() {
      return muted;
    },
    startMusic() {
      if (!ctx || musicTimer !== null) return;
      nextStep = ctx.currentTime + 0.1;
      stepIndex = 0;
      musicTimer = window.setInterval(() => {
        if (!ctx) return;
        while (nextStep < ctx.currentTime + 0.3) scheduleMusicStep();
      }, 120);
    },
    stopMusic() {
      if (musicTimer !== null) {
        window.clearInterval(musicTimer);
        musicTimer = null;
      }
    },
    shoot() {
      tone({ freq: 880, freqEnd: 320, dur: 0.09, type: 'square', vol: 0.08 });
    },
    hit() {
      noise({ dur: 0.07, vol: 0.14, filterFreq: 2400 });
      tone({ freq: 220, freqEnd: 110, dur: 0.08, type: 'triangle', vol: 0.12 });
    },
    explode(big) {
      noise({ dur: big ? 0.45 : 0.28, vol: big ? 0.32 : 0.2, filterFreq: big ? 700 : 1100 });
      tone({ freq: big ? 160 : 200, freqEnd: 40, dur: big ? 0.4 : 0.25, type: 'sawtooth', vol: 0.16 });
    },
    pickup(kind) {
      if (kind === 'heal' || kind === 'shield') {
        tone({ freq: 523.25, dur: 0.12, type: 'sine', vol: 0.18 });
        tone({ freq: 783.99, dur: 0.18, type: 'sine', vol: 0.18, delay: 0.09 });
      } else if (kind === 'gem') {
        tone({ freq: 1046.5, dur: 0.08, type: 'sine', vol: 0.1 });
      } else {
        tone({ freq: 659.25, dur: 0.1, type: 'triangle', vol: 0.16 });
        tone({ freq: 987.77, dur: 0.14, type: 'triangle', vol: 0.16, delay: 0.07 });
      }
    },
    wave() {
      tone({ freq: 220, dur: 0.35, type: 'sawtooth', vol: 0.12 });
      tone({ freq: 277.18, dur: 0.35, type: 'sawtooth', vol: 0.12, delay: 0.02 });
      tone({ freq: 329.63, dur: 0.5, type: 'sawtooth', vol: 0.14, delay: 0.04 });
    },
    upgrade() {
      tone({ freq: 523.25, dur: 0.12, type: 'sine', vol: 0.16 });
      tone({ freq: 659.25, dur: 0.12, type: 'sine', vol: 0.16, delay: 0.08 });
      tone({ freq: 783.99, dur: 0.22, type: 'sine', vol: 0.18, delay: 0.16 });
    },
    hurt() {
      tone({ freq: 140, freqEnd: 55, dur: 0.3, type: 'sawtooth', vol: 0.22 });
      noise({ dur: 0.2, vol: 0.18, filterFreq: 500 });
    },
    dash() {
      noise({ dur: 0.14, vol: 0.1, filterFreq: 3200 });
    },
    over() {
      tone({ freq: 392, freqEnd: 370, dur: 0.4, type: 'triangle', vol: 0.18 });
      tone({ freq: 311.13, freqEnd: 294, dur: 0.4, type: 'triangle', vol: 0.18, delay: 0.35 });
      tone({ freq: 233.08, freqEnd: 220, dur: 0.8, type: 'triangle', vol: 0.2, delay: 0.7 });
    },
    victory() {
      const notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5];
      notes.forEach((freq, i) => tone({ freq, dur: 0.28, type: 'triangle', vol: 0.18, delay: i * 0.13 }));
    },
    click() {
      tone({ freq: 660, dur: 0.06, type: 'sine', vol: 0.12 });
    },
  };
}
