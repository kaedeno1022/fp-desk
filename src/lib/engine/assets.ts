// 資産運用・口座区分（DOMAIN.md §6）。
// 年次ステップは「期首残高に利回りを適用 → 期末に積立を加算」の順で統一する
import type { TaxTables } from "./tables";

/** 現金・iDeCoなど課税イベントのない口座の年次ステップ */
export function stepSimple(balance: number, rate: number, contribution: number): number {
  return Math.floor(balance * (1 + rate)) + contribution;
}

/** 課税口座: 評価益に毎年20.315%課税する簡易モデル（含み益の繰延はしない） */
export function stepTaxable(
  balance: number,
  rate: number,
  contribution: number,
  t: TaxTables
): { balance: number; taxPaid: number } {
  const gain = Math.floor(balance * rate);
  const taxPaid = gain > 0 ? Math.floor(gain * t.capitalGainsTaxRate) : 0;
  return { balance: balance + gain - taxPaid + contribution, taxPaid };
}

export type NisaState = {
  balance: number;
  /** 生涯投資枠の消化額（簿価ベース） */
  lifetimeContributed: number;
};

/** NISA: 非課税。年間枠・生涯枠を超えた分は受け入れずに返す（呼び出し側で課税口座等へ回す） */
export function stepNisa(
  state: NisaState,
  rate: number,
  contribution: number,
  t: TaxTables
): { state: NisaState; accepted: number; rejected: number } {
  const room = Math.max(0, t.nisa.lifetimeLimit - state.lifetimeContributed);
  const accepted = Math.min(contribution, t.nisa.annualLimit, room);
  const rejected = contribution - accepted;
  return {
    state: {
      balance: Math.floor(state.balance * (1 + rate)) + accepted,
      lifetimeContributed: state.lifetimeContributed + accepted,
    },
    accepted,
    rejected,
  };
}
