// モンテカルロシミュレーション（DOMAIN.md Phase 2）。
// 運用リターンを正規分布で揺らして多数試行し、資産推移の分布と成功確率を出す。
// 乱数はシード付き（同じ入力なら同じ結果になる再現性を優先）
import type { SimulationInput } from "./input";
import { simulate } from "./simulate";
import type { TaxTables } from "./tables";

/** mulberry32: 軽量なシード付き擬似乱数 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller法で標準正規乱数を生成 */
function makeNormal(rand: () => number): () => number {
  let spare: number | null = null;
  return () => {
    if (spare !== null) {
      const v = spare;
      spare = null;
      return v;
    }
    let u = 0;
    let v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    const mag = Math.sqrt(-2 * Math.log(u));
    spare = mag * Math.sin(2 * Math.PI * v);
    return mag * Math.cos(2 * Math.PI * v);
  };
}

export type Percentiles = {
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
};

export type MonteCarloResult = {
  trials: number;
  volatility: number;
  /** 現金が一度もマイナスにならなかった試行の割合 */
  successRate: number;
  finalAssets: Percentiles;
  /** 年ごとの総資産パーセンタイル（ファンチャート用） */
  yearly: ({ year: number } & Percentiles)[];
};

function percentileOf(sorted: number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[idx];
}

export function runMonteCarlo(
  input: SimulationInput,
  t: TaxTables,
  options: { trials: number; volatility: number; seed?: number }
): MonteCarloResult {
  const { trials, volatility } = options;
  const seed = options.seed ?? 20260713;

  // 各試行 × 各年の総資産と、成功（現金が常に0以上）かどうかを集める
  const totalsByYear: number[][] = [];
  let successes = 0;
  let years: number[] = [];

  for (let trial = 0; trial < trials; trial++) {
    const normal = makeNormal(mulberry32(seed + trial * 7919));
    // 同一年のショックは全リスク口座で共通（同じ市場に晒されている前提）
    const shocks: number[] = Array.from({ length: input.years }, () => normal());
    const result = simulate(input, t, (y) => ({
      taxable: input.accounts.taxableRate + volatility * shocks[y],
      nisa: input.accounts.nisaRate + volatility * shocks[y],
      ideco: input.accounts.idecoRate + volatility * shocks[y],
    }));

    if (trial === 0) {
      years = result.years.map((r) => r.year);
      result.years.forEach(() => totalsByYear.push([]));
    }
    result.years.forEach((r, yi) => totalsByYear[yi].push(r.assets.total));
    if (result.warnings.length === 0) successes++;
  }

  const yearly = totalsByYear.map((totals, yi) => {
    const sorted = [...totals].sort((a, b) => a - b);
    return {
      year: years[yi],
      p10: percentileOf(sorted, 10),
      p25: percentileOf(sorted, 25),
      p50: percentileOf(sorted, 50),
      p75: percentileOf(sorted, 75),
      p90: percentileOf(sorted, 90),
    };
  });

  const last = yearly[yearly.length - 1];
  return {
    trials,
    volatility,
    successRate: successes / trials,
    finalAssets: { p10: last.p10, p25: last.p25, p50: last.p50, p75: last.p75, p90: last.p90 },
    yearly,
  };
}
