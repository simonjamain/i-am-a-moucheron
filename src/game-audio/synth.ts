// Procedural sounds of the game: every effect is synthesised, no audio file.
// Profiles give each sound its length and catalogue level.
interface Profile {
  readonly duration: number;
  readonly level: number;
}
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const profiles = {
  alarm: { duration: 3.2, level: 0.3 },
  ambience: { duration: 4, level: 0.035 },
  board: { duration: 0.55, level: 0.2 },
  exit: { duration: 0.35, level: 0.17 },
  clear: { duration: 1.1, level: 0.24 },
  defeat: { duration: 1.5, level: 0.25 },
  dollar: { duration: 0.26, level: 0.2 },
  confirm: { duration: 0.18, level: 0.16 },
  ricochet: { duration: 0.28, level: 0.19 },
  tick: { duration: 0.1, level: 0.14 },
  flak: { duration: 0.45, level: 0.38 },
  dive: { duration: 1, level: 0.22 },
  engine: { duration: 1, level: 0.16 },
  insect: { duration: 1, level: 0.12 },
  // Air rubbing along stalling wings: hissing noise, fluttering at whole hertz (seamless 1 s loop).
  airflow: { duration: 1, level: 0.2 },
  shot: { duration: 0.13, level: 0.28 },
  // Seamless 1 s loop of twelve rounds (the Gatling's 12 rounds/s): one voice for a whole burst.
  gatling: { duration: 1, level: 0.24 },
  impact: { duration: 0.24, level: 0.35 },
  crash: { duration: 0.8, level: 0.4 },
  step: { duration: 0.1, level: 0.11 },
  paper: { duration: 0.28, level: 0.17 },
  fall: { duration: 4, level: 0.22 },
  stamp: { duration: 0.22, level: 0.24 },
  spawn: { duration: 0.7, level: 0.18 },
  wave: { duration: 0.8, level: 0.17 },
  dash: { duration: 0.18, level: 0.13 },
} satisfies Record<string, Profile>;
export function synthesize(kind: SoundKind, sampleRate = 24000): Float32Array<ArrayBuffer> {
  const p = profiles[kind] as Profile | undefined;
  if (!p) throw Error('Unknown sound');
  const samples = new Float32Array(Math.round(p.duration * sampleRate));
  let seed = 12345,
    low = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate,
      u = i / samples.length;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 2147483648 - 1;
    low += 0.08 * (noise - low);
    let v = 0,
      env = 1;
    if (kind === 'fall') {
      const f = 800 * (1 - u) ** 1.6 + 80;
      env = Math.min(1, t / 0.06) * Math.min(1, (p.duration - t) * 3);
      v =
        0.4 * Math.sin(2 * Math.PI * (800 * t - 90 * t * t)) +
        0.15 * Math.sin(2 * Math.PI * f * t) +
        low * 0.35;
    } else if (kind === 'dollar') {
      const notes = [1046.5, 1318.5, 1568, 2093],
        f = notes[Math.min(3, Math.floor(u * 4))];
      env = Math.min(1, t / 0.003) * (1 - u) ** 0.65;
      v = Math.sin(2 * Math.PI * f * t) * 0.55 + Math.sin(4 * Math.PI * f * t) * 0.14;
    } else if (kind === 'alarm') {
      const phase = 2 * Math.PI * 440 * t - (160 / 0.45) * Math.cos(2 * Math.PI * 0.45 * t);
      env = Math.min(1, t / 0.15, (p.duration - t) / 0.4);
      v = (Math.sin(phase) * 0.55 + Math.sin(phase * 2) * 0.18) * env;
    } else if (kind === 'ambience')
      v =
        low * 0.2 + Math.sin(t * 2 * Math.PI * 60) * 0.12 + Math.sin(t * 2 * Math.PI * 120) * 0.04;
    else if (kind === 'engine')
      v =
        0.3 * Math.sin(t * 80 * Math.PI * 2) +
        0.18 * Math.sin(t * 160 * Math.PI * 2) +
        low * 0.7 * (0.7 + 0.3 * Math.sin(t * 24 * Math.PI * 2));
    else if (kind === 'gatling') {
      // Every component repeats at k/12 s, so the loop is seamless at any rate multiple of 12.
      const tp = t % (1 / 12);
      const attack = Math.min(1, tp / 0.0008);
      v =
        0.6 *
        (attack *
          (noise * 0.6 * Math.exp(-tp * 110) +
            Math.sin(2 * Math.PI * 95 * tp) * 0.7 * Math.exp(-tp * 45) +
            Math.sin(2 * Math.PI * 1650 * tp) * 0.16 * Math.exp(-tp * 60)) +
          Math.sin(t * 48 * Math.PI * 2) * 0.14 +
          Math.sin(t * 132 * Math.PI * 2) * 0.07 +
          low * 0.25 * (0.6 + 0.4 * Math.sin(t * 12 * Math.PI * 2)));
    } else if (kind === 'dive')
      v = 0.4 * Math.sin(2 * Math.PI * 420 * t) + 0.2 * Math.sin(2 * Math.PI * 840 * t) + low * 0.2;
    else if (kind === 'airflow')
      v =
        0.55 * (noise - low) * (0.72 + 0.28 * Math.sin(t * 7 * Math.PI * 2)) +
        0.3 * low * (0.6 + 0.4 * Math.sin(t * 3 * Math.PI * 2));
    else if (kind === 'insect')
      v =
        0.3 * Math.sin(t * 210 * Math.PI * 2) + 0.12 * Math.sin(t * 420 * Math.PI * 2) + low * 0.25;
    else {
      env = Math.min(1, t / 0.004) * (1 - u) ** 2;
      if (['board', 'exit', 'clear', 'defeat', 'confirm', 'tick'].includes(kind)) {
        const notes: number[] =
          kind === 'clear'
            ? [440, 550, 660]
            : kind === 'defeat'
              ? [330, 260, 180]
              : kind === 'board'
                ? [330, 440, 550]
                : kind === 'exit'
                  ? [440, 330]
                  : [880];
        const f = notes[Math.min(notes.length - 1, Math.floor(u * notes.length))];
        v = Math.sin(t * 2 * Math.PI * f) * 0.45;
      } else if (kind === 'ricochet')
        v = Math.sin(2 * Math.PI * (1700 * t - 1600 * t * t)) * 0.45 + noise * 0.1;
      else if (kind === 'flak')
        v = low * 2 * Math.exp(-t * 9) + Math.sin(2 * Math.PI * 55 * t) * 0.45 * Math.exp(-t * 8);
      else if (kind === 'shot')
        v =
          noise * 0.55 * Math.exp(-t * 35) +
          Math.sin(t * (180 - 280 * t) * Math.PI * 2) * 0.4 * Math.exp(-t * 25);
      else if (kind === 'crash' || kind === 'impact')
        v =
          low * 2.3 +
          Math.sin(t * (kind === 'crash' ? 42 : 65) * Math.PI * 2) * Math.exp(-t * 12) * 0.6;
      else if (kind === 'stamp')
        v =
          Math.sin(t * 340 * Math.PI * 2) * Math.exp(-t * 35) * 0.35 +
          noise * 0.35 * Math.exp(-t * 28) +
          Math.sin(t * 90 * Math.PI * 2) * 0.4;
      else if (kind === 'step')
        v = low * 1.7 + Math.sin(t * 100 * Math.PI * 2) * Math.exp(-t * 40) * 0.25;
      else if (kind === 'paper') v = (noise - low) * 0.32 * (0.5 + 0.5 * Math.sin(t * 47));
      else if (kind === 'dash') v = low * 1.7 * Math.sin(Math.PI * u);
      else if (kind === 'spawn' || kind === 'wave')
        v =
          Math.sin(t * (kind === 'spawn' ? 260 + 140 * t : 220) * Math.PI * 2) * 0.3 +
          Math.sin(t * 330 * Math.PI * 2) * 0.18;
    }
    samples[i] = clamp(v * env, -0.95, 0.95);
  }
  return samples;
}

export type SoundKind = keyof typeof profiles;
export const AUDIO_PROFILES: Readonly<Record<SoundKind, Profile>> = profiles;
