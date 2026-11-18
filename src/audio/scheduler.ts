// Pure voice allocation: which logical sounds deserve a real voice this tick.
// No Web Audio here, so the policy is testable on plain objects.
import type { SoundState } from './types.ts';

export interface Candidate {
  /** Creation order: lower = older. */
  readonly id: number;
  readonly state: Exclude<SoundState, 'ended'>;
  readonly loop: boolean;
  readonly score: number;
}

export type Target = 'real' | 'virtual' | 'ended';

/** Where a candidate goes when it does not get (or keep) a voice. */
export const withoutVoice = (c: Candidate): Target => (c.loop ? 'virtual' : 'ended');

/**
 * Returns the target state of every candidate: the `slots` best scores get a
 * real voice. A score that is not above `minScore` (NaN included) never does.
 * Ties keep a playing voice first, then the oldest sound. Sorts in place.
 */
export function schedule(
  candidates: Candidate[],
  slots: number,
  minScore: number,
): Map<Candidate, Target> {
  const rank = (c: Candidate) => (c.score > minScore ? c.score : -Infinity);
  candidates.sort((a, b) => {
    const ra = rank(a),
      rb = rank(b);
    if (ra !== rb) return rb - ra;
    return (a.state === 'real' ? 0 : 1) - (b.state === 'real' ? 0 : 1) || a.id - b.id;
  });
  const targets = new Map<Candidate, Target>();
  let used = 0;
  for (const c of candidates) {
    if (rank(c) > -Infinity && used < slots) {
      used++;
      targets.set(c, 'real');
    } else targets.set(c, withoutVoice(c));
  }
  return targets;
}
