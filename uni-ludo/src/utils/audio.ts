// Procedural Web Audio API synthesizer for Mench Daneshjooi

class GameAudioEngine {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;

  public setMuted(muted: boolean) {
    this.muted = muted;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  private getContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private playTone(
    freq: number,
    duration: number,
    type: OscillatorType = 'triangle',
    gainPeak = 0.12,
    delay = 0,
    endFreq?: number
  ) {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), now + duration);
    }

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(gainPeak, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  public playClick() {
    this.playTone(540, 0.055, 'sine', 0.07, 0, 680);
  }

  public playDiceRattle() {
    const jitter = () => 0.92 + Math.random() * 0.16;
    this.playTone(290 * jitter(), 0.045, 'triangle', 0.08, 0.0, 210);
    this.playTone(360 * jitter(), 0.045, 'triangle', 0.07, 0.06, 260);
    this.playTone(420 * jitter(), 0.05, 'triangle', 0.08, 0.12, 310);
    this.playTone(500 * jitter(), 0.06, 'sine', 0.09, 0.19, 390);
  }

  public playSixChime() {
    this.playTone(523.25, 0.11, 'triangle', 0.12, 0);
    this.playTone(659.25, 0.12, 'triangle', 0.12, 0.07);
    this.playTone(783.99, 0.18, 'sine', 0.14, 0.14);
  }

  public playPawnHop(stepIndex = 0) {
    const base = 360 + Math.min(stepIndex, 6) * 28;
    const pitchVar = 0.96 + Math.random() * 0.08;
    this.playTone(base * pitchVar, 0.075, 'sine', 0.1, 0, base * 1.28);
  }

  public playCapture() {
    // Punchy low knock + falling comical sting
    this.playTone(180, 0.16, 'sawtooth', 0.14, 0, 72);
    this.playTone(520, 0.12, 'triangle', 0.11, 0.05, 310);
    this.playTone(310, 0.18, 'triangle', 0.11, 0.14, 190);
  }

  public playCampusEvent(positive: boolean) {
    if (positive) {
      this.playTone(440, 0.1, 'sine', 0.1, 0);
      this.playTone(554.37, 0.1, 'sine', 0.11, 0.07);
      this.playTone(659.25, 0.16, 'triangle', 0.13, 0.14);
    } else {
      this.playTone(392, 0.12, 'triangle', 0.1, 0, 340);
      this.playTone(311, 0.18, 'triangle', 0.1, 0.11, 240);
    }
  }

  public playGraduation() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, idx) => {
      this.playTone(n, 0.18, 'triangle', 0.13, idx * 0.08);
    });
  }

  public playVictoryFanfare() {
    const notes = [523.25, 659.25, 783.99, 1046.5, 987.77, 1046.5];
    const delays = [0, 0.09, 0.18, 0.28, 0.42, 0.54];
    notes.forEach((n, idx) => {
      this.playTone(n, idx === notes.length - 1 ? 0.45 : 0.16, 'triangle', 0.15, delays[idx]);
    });
  }
}

export const gameAudio = new GameAudioEngine();
