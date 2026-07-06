/**
 * Deterministic seeded randomness for exercise generation: the same seed must
 * always produce the identical exercise, so drills are reproducible from the
 * exercise id recorded in a session.
 */

export type Rng = () => number;

/** FNV-1a 32-bit hash of a string, for turning seeds into PRNG state. */
export function seedFromString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32: tiny, fast, good-enough PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in [min, max], inclusive on both ends. */
export function int(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function pick<T>(rng: Rng, arr: readonly T[]): T {
  if (arr.length === 0) throw new Error("pick from empty array");
  return arr[Math.floor(rng() * arr.length)]!;
}

/** Fisher–Yates on a copy. */
export function shuffle<T>(rng: Rng, arr: readonly T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** n distinct elements, order randomized. */
export function sample<T>(rng: Rng, arr: readonly T[], n: number): T[] {
  return shuffle(rng, arr).slice(0, Math.min(n, arr.length));
}

/** Six lowercase hex chars — the seed suffix appended to generated exercise ids. */
export function hexSeed(rng: Rng): string {
  return Math.floor(rng() * 0xffffff)
    .toString(16)
    .padStart(6, "0");
}
