// Synthesized modern beach-volleyball sound effects; no downloads or external audio assets needed.
(() => {
  let context, master, dryBus, wetBus, whiteNoise, pinkNoise, enabled = true;
  const voices = new Set();
  const MAX_VOICES = 256;

  function createNoiseBuffers(ctx) {
    const length = ctx.sampleRate * 1.2;
    whiteNoise = ctx.createBuffer(1, length, ctx.sampleRate);
    pinkNoise = ctx.createBuffer(1, length, ctx.sampleRate);
    const white = whiteNoise.getChannelData(0);
    const pink = pinkNoise.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < length; i++) {
      const w = Math.random() * 2 - 1;
      white[i] = w;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.0168980;
      pink[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.18;
      b6 = w * 0.115926;
    }
  }

  function createReverbImpulse(ctx, duration = 0.52, decay = 2.8) {
    const length = Math.floor(ctx.sampleRate * duration);
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        const t = i / length;
        const env = Math.pow(1 - t, decay);
        const early = i < ctx.sampleRate * 0.045 && i % 190 < 14 ? 1.45 : 1;
        data[i] = (Math.random() * 2 - 1) * env * early;
      }
    }
    return impulse;
  }

  function createSoftClipper(ctx) {
    const shaper = ctx.createWaveShaper();
    const samples = 1024;
    const curve = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = Math.tanh(x * 1.45) / Math.tanh(1.45);
    }
    shaper.curve = curve;
    shaper.oversample = '2x';
    return shaper;
  }

  function unlock() {
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      if (!context) {
        context = new Audio();
        master = context.createGain();
        master.gain.value = enabled ? 0.78 : 0;

        const shaper = createSoftClipper(context);
        const limiter = context.createDynamicsCompressor();
        limiter.threshold.value = -9;
        limiter.knee.value = 10;
        limiter.ratio.value = 6;
        limiter.attack.value = 0.002;
        limiter.release.value = 0.12;

        dryBus = context.createGain();
        dryBus.gain.value = 1.0;

        wetBus = context.createGain();
        wetBus.gain.value = 0.34;
        const convolver = context.createConvolver();
        convolver.buffer = createReverbImpulse(context);
        const reverbHighpass = context.createBiquadFilter();
        reverbHighpass.type = 'highpass';
        reverbHighpass.frequency.value = 240;
        const reverbLowpass = context.createBiquadFilter();
        reverbLowpass.type = 'lowpass';
        reverbLowpass.frequency.value = 6800;

        dryBus.connect(shaper);
        wetBus.connect(convolver);
        convolver.connect(reverbHighpass);
        reverbHighpass.connect(reverbLowpass);
        reverbLowpass.connect(shaper);

        shaper.connect(limiter);
        limiter.connect(master);
        master.connect(context.destination);

        createNoiseBuffers(context);
      }
      if (context.state === 'suspended') context.resume().catch(() => {});
    } catch { /* Audio unavailable: the game still works. */ }
  }

  function routeVoice(gainNode, pan = 0, wet = 0.15) {
    let lastNode = gainNode;
    let panner = null;
    if (pan && typeof context.createStereoPanner === 'function') {
      panner = context.createStereoPanner();
      panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), context.currentTime);
      lastNode.connect(panner);
      lastNode = panner;
    }
    lastNode.connect(dryBus);
    let wetSend = null;
    if (wet > 0 && wetBus) {
      wetSend = context.createGain();
      wetSend.gain.value = wet;
      lastNode.connect(wetSend);
      wetSend.connect(wetBus);
    }
    return () => {
      try { panner?.disconnect(); } catch {}
      try { wetSend?.disconnect(); } catch {}
    };
  }

  function tone({
    f0 = 440,
    f1 = f0,
    fMid = null,
    midRatio = 0.35,
    dur = 0.14,
    vol = 0.2,
    type = 'sine',
    delay = 0,
    attack = 0.004,
    hold = 0,
    detune = 0,
    pan = 0,
    wet = 0.14,
    filterType = null,
    filterStart = 2400,
    filterEnd = 600,
    q = 1.0,
    vibFreq = 0,
    vibDepth = 0
  }) {
    if (voices.size >= MAX_VOICES) return;
    const at = context.currentTime + delay;
    const osc = context.createOscillator();
    const gain = context.createGain();
    let filter = null;
    let lfo = null;
    let lfoGain = null;

    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(16, f0), at);
    if (detune) osc.detune.setValueAtTime(detune, at);

    if (fMid !== null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(16, fMid), at + dur * midRatio);
      osc.frequency.exponentialRampToValueAtTime(Math.max(16, f1), at + dur);
    } else if (f1 !== f0) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(16, f1), at + dur);
    }

    if (vibFreq > 0 && vibDepth > 0 && voices.size + 1 < MAX_VOICES) {
      lfo = context.createOscillator();
      lfoGain = context.createGain();
      lfo.frequency.setValueAtTime(vibFreq, at);
      lfoGain.gain.setValueAtTime(vibDepth, at);
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      voices.add(lfo);
      lfo.onended = () => {
        voices.delete(lfo);
        try { lfo.disconnect(); lfoGain.disconnect(); } catch {}
      };
      lfo.start(at);
      lfo.stop(at + dur + 0.015);
    }

    if (filterType) {
      filter = context.createBiquadFilter();
      filter.type = filterType;
      filter.Q.setValueAtTime(q, at);
      filter.frequency.setValueAtTime(Math.max(20, filterStart), at);
      if (filterEnd !== filterStart) {
        filter.frequency.exponentialRampToValueAtTime(Math.max(20, filterEnd), at + dur);
      }
      osc.connect(filter);
      filter.connect(gain);
    } else {
      osc.connect(gain);
    }

    const peakAt = at + Math.min(attack, dur * 0.45);
    const holdUntil = Math.min(at + dur - 0.004, peakAt + hold);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(vol, peakAt);
    if (hold > 0 && holdUntil > peakAt) {
      gain.gain.setValueAtTime(vol, holdUntil);
    }
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);

    const cleanupRoute = routeVoice(gain, pan, wet);
    voices.add(osc);
    osc.onended = () => {
      voices.delete(osc);
      try { osc.disconnect(); filter?.disconnect(); gain.disconnect(); } catch {}
      cleanupRoute();
    };
    osc.start(at);
    osc.stop(at + dur + 0.015);
  }

  function burst({
    f0 = 1800,
    f1 = 320,
    dur = 0.08,
    vol = 0.14,
    delay = 0,
    attack = 0.003,
    filterType = 'lowpass',
    q = 1.2,
    pink = false,
    pan = 0,
    wet = 0.16
  }) {
    if (voices.size >= MAX_VOICES) return;
    const at = context.currentTime + delay;
    const source = context.createBufferSource();
    source.buffer = pink ? pinkNoise : whiteNoise;

    const filter = context.createBiquadFilter();
    filter.type = filterType;
    filter.Q.setValueAtTime(q, at);
    filter.frequency.setValueAtTime(Math.max(30, f0), at);
    if (f1 !== f0) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(30, f1), at + dur);
    }

    const gain = context.createGain();
    const peakAt = at + Math.min(attack, dur * 0.4);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(vol, peakAt);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);

    source.connect(filter);
    filter.connect(gain);
    const cleanupRoute = routeVoice(gain, pan, wet);
    voices.add(source);
    source.onended = () => {
      voices.delete(source);
      try { source.disconnect(); filter.disconnect(); gain.disconnect(); } catch {}
      cleanupRoute();
    };
    source.start(at);
    source.stop(at + dur + 0.015);
  }

  function whistle(dur = 0.18, vol = 0.13, delay = 0, pitch = 2820) {
    tone({
      f0: pitch * 0.96, fMid: pitch, midRatio: 0.15, f1: pitch * 0.985,
      dur, vol, type: 'sine', delay, attack: 0.012, hold: dur * 0.45,
      vibFreq: 29, vibDepth: 48, pan: -0.1, wet: 0.38
    });
    tone({
      f0: pitch * 1.032, f1: pitch * 1.018,
      dur, vol: vol * 0.55, type: 'triangle', delay, attack: 0.014, hold: dur * 0.4,
      vibFreq: 29, vibDepth: 54, pan: 0.12, wet: 0.38
    });
    burst({
      f0: pitch, f1: pitch * 0.85, dur, vol: vol * 0.32, delay,
      attack: 0.01, filterType: 'bandpass', q: 5.5, wet: 0.3
    });
  }

  const effects = {
    receive: () => {
      // Hollow ball resonance + crisp forearm leather slap + clean upward air harmonic
      tone({ f0: 265, f1: 88, dur: 0.15, vol: 0.32, type: 'sine', attack: 0.002, wet: 0.12 });
      tone({ f0: 380, f1: 128, dur: 0.10, vol: 0.16, type: 'triangle', attack: 0.002, wet: 0.15 });
      burst({ f0: 2600, f1: 620, dur: 0.06, vol: 0.16, filterType: 'bandpass', q: 2.0, wet: 0.18 });
      burst({ f0: 3400, f1: 1200, dur: 0.025, vol: 0.08, filterType: 'highpass', q: 0.8, wet: 0.1 });
      tone({ f0: 540, f1: 720, dur: 0.08, vol: 0.055, type: 'sine', delay: 0.012, wet: 0.25 });
    },

    powerReceive: () => {
      // Solid reinforced power receive: deep absorption thud + punchy slap + rising green energy shimmer
      tone({ f0: 220, f1: 54, dur: 0.22, vol: 0.40, type: 'sine', attack: 0.002, wet: 0.16 });
      tone({ f0: 340, f1: 96, dur: 0.15, vol: 0.22, type: 'triangle', attack: 0.002, wet: 0.18 });
      burst({ f0: 3800, f1: 520, dur: 0.11, vol: 0.24, filterType: 'bandpass', q: 2.2, wet: 0.25 });
      [523.25, 659.25, 783.99].forEach((f, i) => {
        tone({ f0: f, f1: f * 1.25, dur: 0.18, vol: 0.08, delay: i * 0.02, type: 'sine', wet: 0.35 });
      });
    },

    flying: () => {
      // Heroic diving dig: sand-skid whoosh + deep punchy dig + bright rising high-arc shimmer
      burst({ f0: 520, f1: 1650, dur: 0.14, vol: 0.15, filterType: 'bandpass', q: 1.8, pink: true, pan: -0.18, wet: 0.22 });
      tone({ f0: 310, f1: 86, dur: 0.18, vol: 0.36, type: 'sine', attack: 0.002, wet: 0.16 });
      tone({ f0: 440, f1: 145, dur: 0.13, vol: 0.19, type: 'triangle', attack: 0.002, wet: 0.2 });
      burst({ f0: 3100, f1: 680, dur: 0.085, vol: 0.20, filterType: 'bandpass', q: 1.9, wet: 0.24 });
      tone({ f0: 523.25, f1: 783.99, dur: 0.15, vol: 0.085, type: 'triangle', delay: 0.018, pan: -0.2, wet: 0.38 });
      tone({ f0: 659.25, f1: 1046.5, dur: 0.17, vol: 0.075, type: 'sine', delay: 0.032, pan: 0.2, wet: 0.42 });
    },

    dive: () => {
      // Fast aerodynamic lunge + body drop + gritty sand slide
      burst({ f0: 1550, f1: 340, dur: 0.17, vol: 0.16, attack: 0.012, filterType: 'bandpass', q: 1.7, pink: true, wet: 0.18 });
      tone({ f0: 215, f1: 72, dur: 0.16, vol: 0.19, type: 'triangle', attack: 0.006, wet: 0.1 });
      burst({ f0: 2400, f1: 520, dur: 0.19, vol: 0.13, delay: 0.035, attack: 0.015, filterType: 'bandpass', q: 1.2, wet: 0.15 });
    },

    set: () => {
      // Soft cushioned fingertip pop + crystalline harmonic interval chime
      tone({ f0: 390, f1: 660, dur: 0.10, vol: 0.16, type: 'sine', attack: 0.004, wet: 0.22 });
      tone({ f0: 587.33, f1: 880, dur: 0.13, vol: 0.11, type: 'triangle', delay: 0.01, pan: -0.15, wet: 0.34 });
      tone({ f0: 880, f1: 1174.66, dur: 0.14, vol: 0.07, type: 'sine', delay: 0.022, pan: 0.15, wet: 0.4 });
      burst({ f0: 2200, f1: 850, dur: 0.038, vol: 0.06, filterType: 'bandpass', q: 2.4, wet: 0.15 });
    },

    attack: () => {
      // Heavy arcade spike: sub-bass drop + compressed leather crack + crisp palm snap
      tone({ f0: 235, f1: 38, dur: 0.23, vol: 0.44, type: 'sine', attack: 0.002, wet: 0.14 });
      tone({
        f0: 320, f1: 62, dur: 0.16, vol: 0.24, type: 'sawtooth', attack: 0.002,
        filterType: 'lowpass', filterStart: 2200, filterEnd: 190, q: 2.2, wet: 0.2
      });
      tone({ f0: 1350, f1: 180, dur: 0.038, vol: 0.16, type: 'triangle', attack: 0.001, wet: 0.15 });
      burst({ f0: 4600, f1: 480, dur: 0.14, vol: 0.26, attack: 0.002, filterType: 'lowpass', q: 1.6, wet: 0.28 });
      burst({ f0: 3200, f1: 950, dur: 0.045, vol: 0.16, attack: 0.001, filterType: 'highpass', q: 1.2, wet: 0.22 });
    },

    quick: () => {
      // High-velocity whip slash + sharp spike punch + metallic speed glint
      effects.attack();
      burst({ f0: 4800, f1: 1100, dur: 0.065, vol: 0.15, attack: 0.002, filterType: 'bandpass', q: 3.4, pan: -0.25, wet: 0.28 });
      tone({
        f0: 1180, f1: 290, dur: 0.095, vol: 0.15, type: 'sawtooth', attack: 0.002,
        filterType: 'lowpass', filterStart: 3600, filterEnd: 600, q: 2.5, pan: 0.2, wet: 0.32
      });
      tone({ f0: 1568, f1: 523.25, dur: 0.08, vol: 0.09, type: 'triangle', delay: 0.015, pan: -0.15, wet: 0.35 });
    },

    double: () => {
      // Explosive super-spike: primary impact + seismic secondary shockwave + power chord glint
      effects.attack();
      tone({ f0: 165, f1: 32, dur: 0.28, vol: 0.38, type: 'sine', delay: 0.055, attack: 0.003, wet: 0.22 });
      burst({ f0: 3600, f1: 320, dur: 0.20, vol: 0.22, delay: 0.055, filterType: 'lowpass', q: 1.8, pink: true, wet: 0.38 });
      [220, 329.63, 440].forEach((f, i) => {
        tone({
          f0: f * 1.5, f1: f * 0.75, dur: 0.18, vol: 0.10, type: 'sawtooth',
          delay: 0.05 + i * 0.012, detune: (i - 1) * 12, pan: (i - 1) * 0.3,
          filterType: 'lowpass', filterStart: 2800, filterEnd: 420, q: 2.0, wet: 0.36
        });
      });
      tone({ f0: 1046.5, f1: 1567.98, dur: 0.12, vol: 0.08, type: 'sine', delay: 0.07, wet: 0.45 });
    },

    mozu: () => {
      // A rising three-note shimmer and airy lift distinguish the high special lob.
      tone({ f0: 330, f1: 990, dur: 0.28, vol: 0.19, type: 'triangle', wet: 0.38 });
      [659.25, 987.77, 1318.51].forEach((f, i) => {
        tone({ f0: f, f1: f * 1.15, dur: 0.2, vol: 0.09, delay: i * 0.045,
          type: 'sine', pan: (i - 1) * 0.2, wet: 0.42 });
      });
      burst({ f0: 650, f1: 4200, dur: 0.25, vol: 0.12, attack: 0.014,
        filterType: 'bandpass', q: 2.1, pink: true, wet: 0.3 });
    },

    mozuDive: () => {
      // The actual apex transition triggers a separate downward whistle/whoosh.
      tone({ f0: 1900, f1: 160, dur: 0.24, vol: 0.16, type: 'triangle', wet: 0.3 });
      burst({ f0: 5500, f1: 380, dur: 0.22, vol: 0.2, attack: 0.008,
        filterType: 'bandpass', q: 2.5, wet: 0.25 });
      tone({ f0: 130, f1: 42, dur: 0.16, vol: 0.22, delay: 0.04, wet: 0.16 });
    },

    empowered: () => {
      // Electric impact, deep bass and a descending power chord for the blue spike.
      tone({ f0: 180, f1: 30, dur: 0.32, vol: 0.4, attack: 0.002, wet: 0.2 });
      burst({ f0: 6000, f1: 600, dur: 0.16, vol: 0.25, attack: 0.002,
        filterType: 'highpass', q: 1.8, wet: 0.28 });
      [440, 554.37, 659.25].forEach((f, i) => {
        tone({ f0: f * 2, f1: f * 0.55, dur: 0.24, vol: 0.09, type: 'sawtooth',
          delay: i * 0.012, pan: (i - 1) * 0.25, filterType: 'lowpass',
          filterStart: 4200, filterEnd: 320, q: 2.3, wet: 0.35 });
      });
      tone({ f0: 2400, f1: 800, dur: 0.08, vol: 0.1, type: 'square', wet: 0.25 });
    },

    feint: () => {
      // Sneaky fingertip tap + playful pitch-bent marimba/pluck drop
      burst({ f0: 2500, f1: 1100, dur: 0.032, vol: 0.08, filterType: 'bandpass', q: 2.8, wet: 0.14 });
      tone({ f0: 640, fMid: 710, midRatio: 0.18, f1: 270, dur: 0.15, vol: 0.18, type: 'triangle', attack: 0.003, wet: 0.24 });
      tone({ f0: 1280, f1: 540, dur: 0.075, vol: 0.07, type: 'sine', attack: 0.002, wet: 0.28 });
    },

    loop: () => {
      // Gentle airy fingertip scoop + soaring melodic whistle/flute rise
      burst({ f0: 2200, f1: 950, dur: 0.04, vol: 0.09, filterType: 'bandpass', q: 2.2, wet: 0.16 });
      tone({ f0: 440, f1: 880, dur: 0.18, vol: 0.16, type: 'sine', attack: 0.003, wet: 0.32 });
      tone({ f0: 880, f1: 1320, dur: 0.16, vol: 0.09, type: 'triangle', delay: 0.015, wet: 0.35 });
    },

    block: () => {
      // Solid two-hand wall collision + resonant thud + defensive metallic ring
      tone({ f0: 195, f1: 54, dur: 0.16, vol: 0.32, type: 'sine', attack: 0.002, wet: 0.16 });
      tone({ f0: 680, f1: 155, dur: 0.12, vol: 0.24, type: 'triangle', attack: 0.002, pan: -0.15, wet: 0.24 });
      tone({
        f0: 920, f1: 230, dur: 0.10, vol: 0.14, type: 'square', attack: 0.002, pan: 0.15,
        filterType: 'lowpass', filterStart: 2400, filterEnd: 480, q: 1.8, wet: 0.26
      });
      burst({ f0: 3400, f1: 550, dur: 0.09, vol: 0.22, filterType: 'bandpass', q: 1.6, wet: 0.24 });
      tone({ f0: 1174.66, f1: 880, dur: 0.11, vol: 0.07, type: 'sine', delay: 0.012, wet: 0.38 });
    },

    jump: () => {
      // Sand push-off grain scatter + energetic upward whoosh lift
      tone({ f0: 130, f1: 62, dur: 0.075, vol: 0.11, type: 'sine', attack: 0.003, wet: 0.08 });
      tone({ f0: 175, f1: 450, dur: 0.14, vol: 0.11, type: 'triangle', attack: 0.008, wet: 0.18 });
      burst({ f0: 850, f1: 240, dur: 0.08, vol: 0.09, filterType: 'bandpass', q: 1.5, pink: true, wet: 0.12 });
      burst({ f0: 480, f1: 1850, dur: 0.12, vol: 0.07, delay: 0.015, attack: 0.015, filterType: 'bandpass', q: 2.0, wet: 0.2 });
    },

    land: () => {
      // Soft deep sand thump + two-stage sand grain scatter
      tone({ f0: 120, f1: 42, dur: 0.11, vol: 0.16, type: 'sine', attack: 0.003, wet: 0.08 });
      burst({ f0: 920, f1: 160, dur: 0.12, vol: 0.12, filterType: 'lowpass', q: 1.4, pink: true, wet: 0.12 });
      burst({ f0: 2400, f1: 480, dur: 0.10, vol: 0.07, delay: 0.02, filterType: 'bandpass', q: 1.8, wet: 0.14 });
    },

    net: () => {
      // Elastic steel cable twang with vibrato wobble + nylon mesh rattle
      tone({
        f0: 132, f1: 58, dur: 0.22, vol: 0.22, type: 'triangle', attack: 0.003,
        vibFreq: 25, vibDepth: 14, wet: 0.18
      });
      tone({
        f0: 264, f1: 112, dur: 0.16, vol: 0.10, type: 'sawtooth', attack: 0.003,
        filterType: 'lowpass', filterStart: 1200, filterEnd: 240, q: 2.4, wet: 0.18
      });
      burst({ f0: 2100, f1: 320, dur: 0.12, vol: 0.12, filterType: 'bandpass', q: 2.2, wet: 0.16 });
      burst({ f0: 1600, f1: 280, dur: 0.09, vol: 0.07, delay: 0.055, filterType: 'bandpass', q: 2.0, wet: 0.16 });
    },

    point: () => {
      // Sand impact + referee pea-whistle + sunny arcade point fanfare chord progression
      tone({ f0: 145, f1: 44, dur: 0.14, vol: 0.22, type: 'sine', wet: 0.12 });
      burst({ f0: 1200, f1: 180, dur: 0.13, vol: 0.15, filterType: 'lowpass', pink: true, wet: 0.15 });
      whistle(0.19, 0.12, 0.02, 2840);

      // Upbeat triad + 9th arpeggio & warm bass
      const lead = [523.25, 659.25, 783.99, 1046.5];
      lead.forEach((f, i) => {
        const d = 0.09 + i * 0.085;
        const isLast = i === lead.length - 1;
        const dur = isLast ? 0.36 : 0.20;
        tone({
          f0: f, f1: f, dur, vol: isLast ? 0.16 : 0.13, type: 'triangle',
          delay: d, attack: 0.006, hold: dur * 0.35, detune: (i - 1.5) * 6,
          pan: (i - 1.5) * 0.22, wet: 0.38
        });
        tone({
          f0: f * 2, f1: f * 2, dur: dur * 0.75, vol: 0.045, type: 'sine',
          delay: d, attack: 0.004, pan: (1.5 - i) * 0.2, wet: 0.45
        });
      });
      tone({ f0: 261.63, f1: 261.63, dur: 0.24, vol: 0.14, type: 'triangle', delay: 0.09, wet: 0.2 });
      tone({ f0: 392.00, f1: 523.25, dur: 0.38, vol: 0.15, type: 'triangle', delay: 0.34, wet: 0.25 });
    },

    win: () => {
      // Double stadium referee whistle + grand summer victory fanfare
      whistle(0.13, 0.11, 0.0, 2860);
      whistle(0.28, 0.13, 0.16, 2920);

      // Bass progression: C3 -> F3 -> G3 -> C4
      const bass = [
        { f: 130.81, d: 0.04, dur: 0.22 },
        { f: 174.61, d: 0.19, dur: 0.22 },
        { f: 196.00, d: 0.34, dur: 0.22 },
        { f: 261.63, d: 0.50, dur: 0.75 }
      ];
      bass.forEach((b) => {
        tone({
          f0: b.f, f1: b.f, dur: b.dur, vol: 0.18, type: 'triangle',
          delay: b.d, attack: 0.008, hold: b.dur * 0.4, wet: 0.2
        });
      });

      // Lead melody & lush stereo harmony
      const notes = [
        { f: 523.25, h: 392.00, d: 0.04, dur: 0.20, pan: -0.25 },
        { f: 659.25, h: 523.25, d: 0.19, dur: 0.20, pan: 0.25 },
        { f: 783.99, h: 587.33, d: 0.34, dur: 0.20, pan: -0.2 },
        { f: 1046.50, h: 659.25, d: 0.50, dur: 0.78, pan: 0.0 }
      ];
      notes.forEach((n, i) => {
        const isFinal = i === notes.length - 1;
        tone({
          f0: n.f, f1: n.f, dur: n.dur, vol: isFinal ? 0.19 : 0.15, type: 'triangle',
          delay: n.d, attack: 0.006, hold: n.dur * 0.45, detune: 7, pan: n.pan, wet: 0.42
        });
        tone({
          f0: n.h, f1: n.h, dur: n.dur, vol: isFinal ? 0.13 : 0.10, type: 'sawtooth',
          delay: n.d, attack: 0.008, hold: n.dur * 0.35, detune: -7, pan: -n.pan,
          filterType: 'lowpass', filterStart: 2600, filterEnd: 900, q: 1.4, wet: 0.4
        });
      });

      // Final major-9th chord shimmer & sparkle arpeggio
      [783.99, 1174.66, 1318.51, 1567.98, 2093.00].forEach((f, i) => {
        tone({
          f0: f, f1: f, dur: 0.55 - i * 0.05, vol: 0.055, type: 'sine',
          delay: 0.52 + i * 0.045, attack: 0.004, pan: (i - 2) * 0.22, wet: 0.55
        });
      });
    },

    serve: () => {
      // Crisp referee whistle indicating serve authorization
      whistle(0.14, 0.12, 0.0, 2880);
    },

    confirm: () => {
      // Sleek modern glassy stereo UI confirmation chime
      tone({ f0: 587.33, f1: 587.33, dur: 0.10, vol: 0.11, type: 'sine', attack: 0.003, pan: -0.18, wet: 0.3 });
      tone({ f0: 880.00, f1: 1174.66, dur: 0.16, vol: 0.13, type: 'triangle', delay: 0.045, attack: 0.003, pan: 0.18, wet: 0.38 });
      tone({ f0: 1760.00, f1: 1760.00, dur: 0.12, vol: 0.045, type: 'sine', delay: 0.05, wet: 0.45 });
    },

    uiMove: () => {
      // Crisp subtle arcade cursor tick
      tone({ f0: 880, f1: 960, dur: 0.032, vol: 0.05, type: 'sine', attack: 0.002, wet: 0.08 });
    },

    uiConfirm: () => {
      // Upbeat glassy dual-tone confirmation
      tone({ f0: 587.33, f1: 587.33, dur: 0.07, vol: 0.08, type: 'sine', attack: 0.003, pan: -0.1, wet: 0.22 });
      tone({ f0: 880.00, f1: 880.00, dur: 0.12, vol: 0.10, type: 'triangle', delay: 0.03, attack: 0.003, pan: 0.1, wet: 0.28 });
    },

    uiCancel: () => {
      // Soft descending cancel tone
      tone({ f0: 659.25, f1: 440.00, dur: 0.08, vol: 0.07, type: 'triangle', attack: 0.003, wet: 0.18 });
    },

    uiSelect: () => {
      // Light round select toggle pop
      tone({ f0: 620, f1: 820, dur: 0.045, vol: 0.065, type: 'sine', attack: 0.002, wet: 0.14 });
    },

    uiTab: () => {
      // Crisp snappy tab switch click
      tone({ f0: 520, f1: 780, dur: 0.055, vol: 0.075, type: 'sine', attack: 0.002, wet: 0.16 });
    }
  };

  window.rallyAudio = {
    unlock,
    play(name) {
      if (enabled) {
        if (!context) unlock();
        else if (context.state === 'suspended') context.resume().catch(() => {});
        if (context?.state === 'running') {
          try { effects[name]?.(); } catch {}
        }
      }
    },
    setEnabled(value) {
      enabled = value;
      if (!enabled) for (const voice of voices) { try { voice.stop(); } catch {} }
      if (enabled) unlock();
      if (master) {
        master.gain.cancelScheduledValues(context.currentTime);
        master.gain.setTargetAtTime(enabled ? 0.78 : 0, context.currentTime, 0.01);
      }
    }
  };
  // Browsers require a real interaction before allowing audio playback.
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
})();
