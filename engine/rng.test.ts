import { describe, expect, it } from "vitest";
import { hexSeed, int, mulberry32, pick, sample, seedFromString, shuffle } from "./rng.js";

describe("rng", () => {
  it("same seed → identical stream", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 10; i++) expect(a()).toBe(b());
  });

  it("different seeds diverge", () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it("seedFromString is stable and case-sensitive", () => {
    expect(seedFromString("atrophy")).toBe(seedFromString("atrophy"));
    expect(seedFromString("atrophy")).not.toBe(seedFromString("Atrophy"));
  });

  it("int stays within inclusive bounds", () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 500; i++) {
      const v = int(rng, 2, 5);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(5);
    }
  });

  it("pick throws on empty, sample caps at length, shuffle keeps elements", () => {
    const rng = mulberry32(9);
    expect(() => pick(rng, [])).toThrow();
    expect(sample(rng, [1, 2, 3], 10).sort()).toEqual([1, 2, 3]);
    expect(shuffle(rng, [1, 2, 3, 4]).sort()).toEqual([1, 2, 3, 4]);
  });

  it("hexSeed is 6 lowercase hex chars", () => {
    const rng = mulberry32(11);
    for (let i = 0; i < 50; i++) expect(hexSeed(rng)).toMatch(/^[0-9a-f]{6}$/);
  });
});
