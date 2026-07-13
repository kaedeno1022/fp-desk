import { describe, expect, it } from "vitest";
import { createDefaultInput, type SimulationInput } from "./input";
import { runMonteCarlo } from "./montecarlo";
import { simulate } from "./simulate";
import { loadTaxTables } from "./tables";

const t = loadTaxTables();

function baseInput(): SimulationInput {
  const input = createDefaultInput();
  input.startYear = 2026;
  input.adults[0].birthYear = 1991;
  input.years = 30;
  input.accounts.nisaAnnualContribution = 1_200_000;
  return input;
}

describe("runMonteCarlo", () => {
  it("ボラティリティ0なら決定論的結果と一致する", () => {
    const input = baseInput();
    const deterministic = simulate(input, t);
    const mc = runMonteCarlo(input, t, { trials: 10, volatility: 0 });

    const lastDet = deterministic.years[deterministic.years.length - 1].assets.total;
    expect(mc.finalAssets.p10).toBe(lastDet);
    expect(mc.finalAssets.p90).toBe(lastDet);
  });

  it("パーセンタイルは順序が保たれる（p10 ≤ p25 ≤ p50 ≤ p75 ≤ p90）", () => {
    const mc = runMonteCarlo(baseInput(), t, { trials: 200, volatility: 0.15 });
    for (const y of mc.yearly) {
      expect(y.p10).toBeLessThanOrEqual(y.p25);
      expect(y.p25).toBeLessThanOrEqual(y.p50);
      expect(y.p50).toBeLessThanOrEqual(y.p75);
      expect(y.p75).toBeLessThanOrEqual(y.p90);
    }
  });

  it("同じシードなら同じ結果になる（再現性）", () => {
    const a = runMonteCarlo(baseInput(), t, { trials: 50, volatility: 0.15, seed: 42 });
    const b = runMonteCarlo(baseInput(), t, { trials: 50, volatility: 0.15, seed: 42 });
    expect(a.finalAssets).toEqual(b.finalAssets);
    expect(a.successRate).toBe(b.successRate);
  });

  it("成功確率は0〜1の範囲で、破綻確実なプランでは低くなる", () => {
    const healthy = runMonteCarlo(baseInput(), t, { trials: 100, volatility: 0.15 });
    expect(healthy.successRate).toBeGreaterThanOrEqual(0);
    expect(healthy.successRate).toBeLessThanOrEqual(1);

    const doomed = baseInput();
    doomed.livingExpenseAnnual = 12_000_000;
    const mcDoomed = runMonteCarlo(doomed, t, { trials: 100, volatility: 0.15 });
    expect(mcDoomed.successRate).toBe(0);
  });
});
