// Tiny Web Audio sound effects — no audio assets, generated on the fly.
let ctx: AudioContext | null = null;
let muted = localStorage.getItem('fa-muted') === '1';

export function isMuted(): boolean {
  return muted;
}

export function setMuted(m: boolean): void {
  muted = m;
  localStorage.setItem('fa-muted', m ? '1' : '0');
}

function ac(): AudioContext | null {
  try {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

interface ToneOpts {
  type?: OscillatorType;
  gain?: number;
  delay?: number;
  glideTo?: number;
}

function tone(freq: number, dur: number, opts: ToneOpts = {}): void {
  if (muted) return;
  const c = ac();
  if (!c) return;
  const { type = 'sine', gain = 0.12, delay = 0, glideTo } = opts;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

export const sfx = {
  /** pin dropped on the map */
  place(): void {
    tone(500, 0.09, { type: 'triangle', gain: 0.16, glideTo: 950 });
  },
  /** guess confirmed / locked in */
  lock(): void {
    tone(1047, 0.1, { type: 'triangle', gain: 0.14 });
    tone(1319, 0.14, { type: 'triangle', gain: 0.12, delay: 0.07 });
  },
  /** new round begins */
  round(): void {
    tone(880, 0.16, { type: 'sine', gain: 0.1 });
  },
  /** reveal — tune by how good the guess was */
  reveal(score: number): void {
    if (score >= 4500) {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, { type: 'triangle', gain: 0.13, delay: i * 0.09 }));
    } else if (score >= 2000) {
      tone(523, 0.14, { type: 'triangle', gain: 0.12 });
      tone(784, 0.18, { type: 'triangle', gain: 0.12, delay: 0.1 });
    } else {
      tone(392, 0.18, { type: 'sine', gain: 0.11 });
      tone(311, 0.24, { type: 'sine', gain: 0.1, delay: 0.14 });
    }
  },
  /** final leaderboard fanfare */
  fanfare(): void {
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.22, { type: 'triangle', gain: 0.13, delay: i * 0.11 }));
  },
  /** countdown tick — urgency 0 (calm) → 2 (frantic double-tick) */
  tick(urgency: 0 | 1 | 2 = 0): void {
    const freq = urgency === 2 ? 1400 : urgency === 1 ? 1100 : 850;
    const gain = urgency === 2 ? 0.12 : urgency === 1 ? 0.085 : 0.055;
    tone(freq, 0.045, { type: 'square', gain });
    if (urgency === 2) tone(freq, 0.045, { type: 'square', gain, delay: 0.1 });
  },
  /** timer hit zero */
  timeUp(): void {
    tone(240, 0.35, { type: 'sawtooth', gain: 0.09, glideTo: 170 });
  },
};
