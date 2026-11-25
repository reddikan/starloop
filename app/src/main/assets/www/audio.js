'use strict';
// STARLOOP synth audio — everything generated live with WebAudio, no sample files.
const SFX = (() => {
  let ac = null, master, comp, send, musicBus, noiseBuf, hum, humGain, humFilt;
  let intensity = 0, nextStep = 0, step = 0, sched = null, muted = false;
  const BPM = 100, STEP = 60 / BPM / 4;
  const A4 = 440;
  const f = (semi) => A4 * Math.pow(2, semi / 12);
  // A minor pentatonic for captures
  const PENTA = [0, 3, 5, 7, 10];
  const penta = (i) => f(PENTA[i % 5] + 12 * Math.floor(i / 5));
  // Dreamy progression: Am9, Fmaj7, Cadd9, Em7 (semitones from A4)
  const CHORDS = [
    [-12, -9, -5, -1, 2],
    [-16, -12, -9, -5, -4],
    [-21, -17, -14, -10, -7 + 12],
    [-17, -14, -10, -7, -5],
  ];
  const ROOTS = [-24, -28, -33, -29];

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
    master = ac.createGain(); master.gain.value = 0.85;
    master.connect(comp); comp.connect(ac.destination);
    // echo bus
    const dl = ac.createDelay(1.5); dl.delayTime.value = STEP * 3;
    const fb = ac.createGain(); fb.gain.value = 0.42;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
    send = ac.createGain(); send.gain.value = 0.9;
    send.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(master);
    musicBus = ac.createGain(); musicBus.gain.value = 0.9; musicBus.connect(master);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // orbit hum (always running, gain gated)
    hum = ac.createOscillator(); hum.type = 'sawtooth'; hum.frequency.value = 55;
    const hum2 = ac.createOscillator(); hum2.type = 'sine'; hum2.frequency.value = 110;
    humFilt = ac.createBiquadFilter(); humFilt.type = 'lowpass'; humFilt.frequency.value = 300; humFilt.Q.value = 6;
    humGain = ac.createGain(); humGain.gain.value = 0;
    hum.connect(humFilt); hum2.connect(humFilt); humFilt.connect(humGain); humGain.connect(master);
    hum.start(); hum2.start();
    nextStep = ac.currentTime + 0.1;
    sched = setInterval(schedule, 60);
  }

  function env(g, t, a, peak, dur, rel) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + Math.max(a, dur));
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(a, dur) + rel);
  }

  function tone(freq, t, dur, o = {}) {
    if (!ac) return;
    const osc = ac.createOscillator(), g = ac.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (o.glide) osc.frequency.exponentialRampToValueAtTime(o.glide, t + dur + (o.rel || 0.2));
    if (o.detune) osc.detune.value = o.detune;
    let node = osc;
    if (o.lp) { const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = o.lp; fl.Q.value = o.q || 1; osc.connect(fl); node = fl; }
    node.connect(g);
    env(g, t, o.att || 0.005, o.gain || 0.1, dur, o.rel || 0.2);
    g.connect(o.dest || master);
    if (o.send) { const s = ac.createGain(); s.gain.value = o.send; g.connect(s); s.connect(send); }
    osc.start(t); osc.stop(t + dur + (o.rel || 0.2) + 0.05);
  }

  function noise(t, dur, o = {}) {
    if (!ac) return;
    const src = ac.createBufferSource(); src.buffer = noiseBuf;
    const fl = ac.createBiquadFilter(); fl.type = o.ftype || 'bandpass';
    fl.frequency.setValueAtTime(o.f0 || 1000, t);
    if (o.f1) fl.frequency.exponentialRampToValueAtTime(o.f1, t + dur);
    fl.Q.value = o.q || 1;
    const g = ac.createGain();
    env(g, t, o.att || 0.005, o.gain || 0.1, dur * 0.3, dur * 0.7 + (o.rel || 0.05));
    src.connect(fl); fl.connect(g); g.connect(o.dest || master);
    if (o.send) { const s = ac.createGain(); s.gain.value = o.send; g.connect(s); s.connect(send); }
    src.start(t, Math.random() * 1.5); src.stop(t + dur + (o.rel || 0.05) + 0.1);
  }

  // ---------- music ----------
  function schedule() {
    if (!ac || muted) return;
    while (nextStep < ac.currentTime + 0.25) {
      playStep(step, nextStep);
      step++; nextStep += STEP;
    }
  }
  function playStep(s, t) {
    const bar = Math.floor(s / 16) % 4, st = s % 16;
    const ch = CHORDS[bar];
    if (st === 0) {
      // pad
      for (let i = 0; i < 4; i++) {
        tone(f(ch[i]), t, STEP * 14, { type: 'triangle', gain: 0.022, att: 0.8, rel: 1.6, detune: (i - 1.5) * 7, lp: 1400, dest: musicBus, send: 0.15 });
        tone(f(ch[i]), t, STEP * 14, { type: 'sawtooth', gain: 0.006, att: 1.0, rel: 1.4, detune: -(i - 1.5) * 9, lp: 900, dest: musicBus });
      }
    }
    // sparkle arp
    const pat = [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1];
    if (pat[st] && Math.random() < 0.55 + intensity * 0.12) {
      const n = ch[(st * 3 + bar) % ch.length] + 24;
      tone(f(n), t, 0.05, { type: 'sine', gain: 0.018 + intensity * 0.004, rel: 0.35, dest: musicBus, send: 0.6 });
    }
    if (intensity >= 1) {
      if (st % 4 === 0) { // kick
        tone(130, t, 0.02, { type: 'sine', gain: 0.2, glide: 38, rel: 0.28, dest: musicBus });
      }
      if (st % 2 === 0 && st % 4 !== 0 && Math.random() < 0.8) { // bass on offbeat 8ths
        tone(f(ROOTS[bar]), t, STEP * 1.2, { type: 'sawtooth', gain: 0.05, lp: 420, q: 4, rel: 0.12, dest: musicBus });
      }
    }
    if (intensity >= 2) {
      if (st % 4 === 2) noise(t, 0.05, { ftype: 'highpass', f0: 7500, gain: 0.03, dest: musicBus });
      if (st === 4 || st === 12) noise(t, 0.16, { ftype: 'bandpass', f0: 1800, q: 0.8, gain: 0.05, dest: musicBus, send: 0.2 });
    }
  }

  const api = {
    init,
    get ready() { return !!ac; },
    setIntensity(i) { intensity = i; },
    setMuted(m) { muted = m; if (master && ac) master.gain.setTargetAtTime(m ? 0 : 0.85, ac.currentTime, 0.05); },
    capture(n, chain, gold) {
      if (!ac) return; const t = ac.currentTime;
      const notes = Math.min(Math.max(n, 1), 7);
      const base = 5 + Math.min(chain, 12);
      for (let i = 0; i < notes; i++) {
        const fr = penta(base + i);
        tone(fr, t + i * 0.045, 0.06, { type: 'sine', gain: 0.09, rel: 0.5, send: 0.5 });
        tone(fr * 2, t + i * 0.045, 0.03, { type: 'triangle', gain: 0.025, rel: 0.25 });
      }
      if (n >= 4 || gold) noise(t, 0.6, { ftype: 'highpass', f0: 6000, gain: 0.05, send: 0.4 });
      if (n >= 6) tone(penta(base - 5), t, 0.3, { type: 'sawtooth', gain: 0.05, lp: 1200, rel: 1.2, send: 0.3 });
    },
    emptyLoop() { if (!ac) return; tone(penta(3), ac.currentTime, 0.04, { gain: 0.03, rel: 0.2, send: 0.3 }); },
    latch() {
      if (!ac) return; const t = ac.currentTime;
      tone(220, t, 0.03, { type: 'triangle', gain: 0.08, glide: 110, rel: 0.15 });
      noise(t, 0.05, { ftype: 'highpass', f0: 3000, gain: 0.03 });
    },
    orbit(on, boost) {
      if (!ac) return; const t = ac.currentTime;
      humGain.gain.setTargetAtTime(on ? 0.05 : 0, t, on ? 0.05 : 0.12);
      if (on) { hum.frequency.setTargetAtTime(55 + boost * 60, t, 0.1); humFilt.frequency.setTargetAtTime(260 + boost * 1400, t, 0.1); }
    },
    release(boost) {
      if (!ac) return; const t = ac.currentTime;
      noise(t, 0.32, { ftype: 'bandpass', f0: 500, f1: 2600 + boost * 3000, q: 2, gain: 0.1 + boost * 0.1 });
    },
    hit() {
      if (!ac) return; const t = ac.currentTime;
      noise(t, 0.5, { ftype: 'lowpass', f0: 900, f1: 120, q: 1, gain: 0.35 });
      tone(90, t, 0.05, { type: 'sawtooth', gain: 0.2, glide: 28, rel: 0.45, lp: 600 });
    },
    mite() { if (!ac) return; const t = ac.currentTime; tone(300, t, 0.02, { type: 'square', gain: 0.02, glide: 120, rel: 0.12, lp: 900 }); },
    miteKill() {
      if (!ac) return; const t = ac.currentTime;
      noise(t, 0.35, { ftype: 'bandpass', f0: 2000, f1: 200, q: 3, gain: 0.18, send: 0.3 });
      tone(60, t, 0.03, { type: 'sine', gain: 0.25, glide: 30, rel: 0.3 });
    },
    ignite() { if (!ac) return; const t = ac.currentTime; tone(f(-5), t, 0.1, { type: 'triangle', gain: 0.07, rel: 1.0, send: 0.5 }); tone(f(2), t + 0.03, 0.1, { type: 'sine', gain: 0.05, rel: 1.0, send: 0.5 }); },
    prism() {
      if (!ac) return; const t = ac.currentTime;
      for (let i = 0; i < 14; i++) tone(penta(8 + i), t + i * 0.035, 0.04, { type: 'triangle', gain: 0.06, rel: 0.4, send: 0.6 });
      noise(t, 1.2, { ftype: 'highpass', f0: 4000, gain: 0.08, send: 0.5 });
    },
    prismAppear() { if (!ac) return; const t = ac.currentTime; for (let i = 0; i < 4; i++) tone(penta(15 - i), t + i * 0.08, 0.05, { gain: 0.04, rel: 0.4, send: 0.6 }); },
    sector() {
      if (!ac) return; const t = ac.currentTime;
      noise(t, 1.2, { ftype: 'bandpass', f0: 300, f1: 6000, q: 1.5, gain: 0.12, att: 0.9 });
      [0, 7, 12, 16, 19].forEach((s, i) => tone(f(s - 12), t + 1.0, 0.6, { type: i % 2 ? 'sawtooth' : 'triangle', gain: 0.05, lp: 2400, rel: 2.0, send: 0.4 }));
      tone(55, t + 1.0, 0.1, { gain: 0.3, glide: 30, rel: 0.6 });
    },
    mission() {
      if (!ac) return; const t = ac.currentTime;
      [0, 4, 7, 12, 16].forEach((s, i) => tone(f(s + 3), t + i * 0.07, 0.08, { type: 'triangle', gain: 0.07, rel: 0.6, send: 0.5 }));
    },
    lowPulse() { if (!ac) return; const t = ac.currentTime; tone(70, t, 0.04, { gain: 0.12, glide: 45, rel: 0.2 }); },
    die() {
      if (!ac) return; const t = ac.currentTime;
      noise(t, 2.0, { ftype: 'lowpass', f0: 4000, f1: 60, gain: 0.4, send: 0.4 });
      tone(f(-12), t, 0.4, { type: 'sawtooth', gain: 0.08, glide: f(-36), rel: 1.6, lp: 1500 });
      tone(f(-5), t + 0.1, 0.4, { type: 'triangle', gain: 0.06, glide: f(-29), rel: 1.6 });
    },
    ui() { if (!ac) return; tone(penta(10), ac.currentTime, 0.02, { type: 'triangle', gain: 0.05, rel: 0.12 }); },
    start() { if (!ac) return; const t = ac.currentTime; [0, 3, 7, 10, 12].forEach((s, i) => tone(f(s), t + i * 0.05, 0.05, { type: 'triangle', gain: 0.06, rel: 0.5, send: 0.5 })); },
  };
  return api;
})();
