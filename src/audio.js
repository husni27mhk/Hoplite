// Tiny WebAudio synth: no audio assets needed.
export class GameAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  start() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);

    this.engine = this.ctx.createOscillator();
    this.engine.type = 'sawtooth';
    this.engine2 = this.ctx.createOscillator();
    this.engine2.type = 'square';
    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 400;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.0;
    this.engine.connect(this.filter);
    this.engine2.connect(this.filter);
    this.filter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engine.start();
    this.engine2.start();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  setEngine(speedRatio, throttle, running) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = 45 + speedRatio * 110 + throttle * 15;
    this.engine.frequency.setTargetAtTime(f, t, 0.08);
    this.engine2.frequency.setTargetAtTime(f * 0.5, t, 0.08);
    this.filter.frequency.setTargetAtTime(300 + speedRatio * 900, t, 0.1);
    this.engineGain.gain.setTargetAtTime(running ? 0.06 + throttle * 0.05 : 0, t, 0.15);
  }

  tone(freq, dur, type = 'sine', vol = 0.2, delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  horn() {
    this.tone(392, 0.35, 'square', 0.12);
    this.tone(494, 0.35, 'square', 0.12);
  }

  coin() {
    this.tone(988, 0.12, 'square', 0.1);
    this.tone(1319, 0.25, 'square', 0.1, 0.08);
  }

  fuel() {
    this.tone(330, 0.15, 'triangle', 0.25);
    this.tone(440, 0.15, 'triangle', 0.25, 0.1);
    this.tone(660, 0.3, 'triangle', 0.25, 0.2);
  }

  bump() {
    this.tone(90, 0.2, 'sawtooth', 0.25);
  }

  fanfare() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.25, i * 0.13));
  }
}
