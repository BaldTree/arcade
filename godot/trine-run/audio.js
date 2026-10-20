/* Original, synthesized Trine Run score and cues; no external audio assets. */
(() => {
  class TrineAudio {
    constructor() {
      this.context = null;
      this.enabled = true;
      this.paused = false;
      this.playing = false;
      this.beat = 0;
      this.nextBeat = 0;
      this.timer = null;
      this.voices = new Set();
      this.lastToken = -10;
      this.tokenStep = 0;
    }
    unlock() {
      if (!this.context) {
        try {
          const Context = window.AudioContext || window.webkitAudioContext;
          this.context = new Context();
          const ctx = this.context;
          this.master = ctx.createGain();
          this.master.gain.value = .65;
          this.musicBus = ctx.createGain();
          this.musicBus.gain.value = .48;
          this.fxBus = ctx.createGain();
          const limiter = ctx.createDynamicsCompressor();
          limiter.threshold.value = -18;
          limiter.knee.value = 12;
          limiter.ratio.value = 4;
          this.musicBus.connect(this.master);
          this.fxBus.connect(this.master);
          this.master.connect(limiter);
          limiter.connect(ctx.destination);
          this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
          const samples = this.noise.getChannelData(0);
          for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
        } catch { return; }
      }
      this.sync();
    }
    active() { return this.enabled && !this.paused && !document.hidden; }
    cancel(bus) {
      if (!this.context) return;
      for (const voice of [...this.voices]) {
        if (bus && voice.bus !== bus) continue;
        // Stop scheduled notes too, so unmuting cannot replay stale feedback.
        try { voice.source.stop(); } catch { /* Already ended. */ }
        voice.source.disconnect();
        voice.volume.disconnect();
        voice.filter.disconnect();
        this.voices.delete(voice);
      }
    }
    sync() {
      if (!this.context) return;
      if (!this.active()) {
        this.cancel();
        this.nextBeat = 0;
        this.musicBus.gain.cancelScheduledValues(this.context.currentTime);
        this.musicBus.gain.setValueAtTime(.48, this.context.currentTime);
        this.context.suspend().catch(() => {});
      } else {
        this.context.resume().then(() => { if (this.active()) this.pump(); }).catch(() => {});
      }
    }
    setSound(value) { this.enabled = Boolean(value); this.sync(); }
    setPaused(value) { this.paused = Boolean(value); this.sync(); }
    music(value) {
      const next = Boolean(value);
      if (next === this.playing) return;
      this.playing = next;
      if (next) {
        this.beat = 0;
        this.nextBeat = 0;
        this.lastToken = -10;
        this.tokenStep = 0;
        if (!this.timer) this.timer = setInterval(() => this.pump(), 60);
        this.pump();
      } else {
        clearInterval(this.timer);
        this.timer = null;
        this.cancel('music');
        if (this.context) {
          this.musicBus.gain.cancelScheduledValues(this.context.currentTime);
          this.musicBus.gain.setValueAtTime(.48, this.context.currentTime);
        }
        this.beat = 0;
        this.nextBeat = 0;
      }
    }
    note(hz, at, duration = .18, gain = .1, bus = 'fx', type = 'triangle', endHz = hz) {
      if (!this.context || !this.active() || this.context.state !== 'running' || this.voices.size >= 64) return;
      const ctx = this.context;
      const source = type === 'noise' ? ctx.createBufferSource() : ctx.createOscillator();
      if (type === 'noise') source.buffer = this.noise;
      else {
        source.type = type;
        source.frequency.setValueAtTime(hz, at);
        source.frequency.exponentialRampToValueAtTime(Math.max(20, endHz), at + duration);
      }
      const volume = ctx.createGain(), filter = ctx.createBiquadFilter();
      filter.type = type === 'noise' ? 'highpass' : 'lowpass';
      filter.frequency.value = type === 'noise' ? hz : 2600;
      volume.gain.setValueAtTime(.0001, at);
      volume.gain.exponentialRampToValueAtTime(gain, at + .008);
      volume.gain.exponentialRampToValueAtTime(.0001, at + duration);
      source.connect(filter); filter.connect(volume);
      volume.connect(bus === 'music' ? this.musicBus : this.fxBus);
      const voice = { source, volume, filter, bus };
      this.voices.add(voice);
      source.onended = () => {
        source.disconnect(); volume.disconnect(); filter.disconnect();
        this.voices.delete(voice);
      };
      source.start(at);
      source.stop(at + duration + .015);
    }
    pump() {
      if (!this.context || this.context.state !== 'running' || !this.active() || !this.playing) return;
      const ctx = this.context, eighth = 60 / 132 / 2;
      // Eight bars: a sparse opening, answering phrase and brighter turnaround.
      const melody = [74,0,76,0,81,78,76,0, 74,0,69,0,66,69,74,0,
        71,0,74,0,78,76,74,0, 69,0,66,69,74,0,76,0,
        74,76,81,0,83,81,78,0, 76,0,74,69,66,0,69,0,
        71,74,78,0,76,74,69,0, 69,0,73,76,81,0,76,0];
      const roots = [50,50,47,45,50,50,47,45];
      const hz = midi => 440 * 2 ** ((midi - 69) / 12);
      if (this.nextBeat < ctx.currentTime) this.nextBeat = ctx.currentTime + .03;
      while (this.nextBeat < ctx.currentTime + .15) {
        const index = this.beat % melody.length, withinBar = index % 8;
        if (melody[index]) this.note(hz(melody[index]), this.nextBeat, .20, .075, 'music');
        if (withinBar % 2 === 0) this.note(hz(roots[Math.floor(index / 8)] + (withinBar === 6 ? 7 : 0)), this.nextBeat, .30, .085, 'music', 'sine');
        if (withinBar === 0 || withinBar === 4) this.note(115, this.nextBeat, .10, .10, 'music', 'sine', 45);
        if (withinBar === 2 || withinBar === 6) this.note(1500, this.nextBeat, .065, .025, 'music', 'noise');
        if (withinBar % 2 === 1) this.note(6000, this.nextBeat, .035, .012, 'music', 'noise');
        this.nextBeat += eighth;
        this.beat++;
      }
    }
    duck(duration = .35) {
      const now = this.context.currentTime, gain = this.musicBus.gain;
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(gain.value, now);
      gain.linearRampToValueAtTime(.20, now + .015);
      gain.setValueAtTime(.20, now + duration);
      gain.linearRampToValueAtTime(.48, now + duration + .18);
    }
    tone(kind) {
      if (!this.context || this.context.state !== 'running' || !this.active()) return;
      const at = this.context.currentTime + .005;
      const note = (...args) => this.note(...args);
      if (kind === 'jump') note(390, at, .13, .12, 'fx', 'triangle', 690);
      else if (kind === 'double') {
        note(580, at, .14, .12, 'fx', 'triangle', 1040);
        note(1040, at + .07, .13, .065);
      } else if (kind === 'land' || kind === 'land_earth') {
        note(120, at, .08, .07, 'fx', 'sine', 55);
        note(850, at, .045, .025, 'fx', 'noise');
      } else if (kind === 'land_wood') {
        note(250, at, .055, .07, 'fx', 'triangle', 160);
        note(460, at + .012, .04, .03);
      } else if (kind === 'token') {
        this.tokenStep = at - this.lastToken < .65 ? (this.tokenStep + 1) % 4 : 0;
        this.lastToken = at;
        note([880,988,1175,1319][this.tokenStep], at, .12, .09);
      } else if (kind === 'friend') {
        this.duck(.35);
        [523.25,659.25,783.99,1046.5].forEach((n,i) => note(n, at+i*.075, .22, .10));
      } else if (kind === 'neutral') {
        note(440, at, .10, .05); note(523.25, at+.07, .12, .045);
      } else if (kind === 'enemy') {
        this.duck(.24);
        note(220, at, .20, .10, 'fx', 'sawtooth', 85);
        note(1200, at, .07, .04, 'fx', 'noise');
      } else if (kind === 'fail') {
        this.cancel('fx');
        [392,311.13,261.63,196].forEach((n,i) => note(n, at+i*.10, .19, .07));
      } else if (kind === 'finish') {
        [523.25,659.25,783.99,1046.5].forEach((n,i) => note(n, at+i*.12, .32, .10));
        [523.25,659.25,783.99].forEach(n => note(n, at+.62, .45, .06));
      } else if (kind === 'door') note(150, at, .13, .045, 'fx', 'triangle', 80);
      else if (kind === 'start') { note(523.25, at, .11, .06); note(783.99, at+.10, .15, .065); }
    }
  }
  window.TrineAudio = TrineAudio;
})();
