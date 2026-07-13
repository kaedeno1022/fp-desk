// 退職後の医療・介護保険料（DOMAIN.md §4.2〜§4.4）。
// 料率は自治体差が大きいためユーザー上書き前提（既定値はテーブルの *Defaults）
import { floorTo } from "./rounding";
import type { NhiCategory, TaxTables } from "./tables";

export type NhiRates = {
  medical: NhiCategory;
  support: NhiCategory;
  care: NhiCategory;
  incomeDeduction: number;
};

export type NhiMember = {
  /** 前年の合計所得 */
  totalIncome: number;
  age: number;
};

export type NhiResult = {
  medical: number;
  support: number;
  care: number;
  total: number;
};

/**
 * 国民健康保険料（世帯単位・年額）。
 * 対象は75歳未満の加入者。介護分は40〜64歳のみ。区分ごとに賦課限度額でキャップ
 */
export function calcNhi(members: NhiMember[], rates: NhiRates): NhiResult {
  const enrolled = members.filter((m) => m.age < 75);
  if (enrolled.length === 0) return { medical: 0, support: 0, care: 0, total: 0 };

  const calcCategory = (conf: NhiCategory, targets: NhiMember[]): number => {
    if (targets.length === 0) return 0;
    const incomePortion = targets.reduce(
      (sum, m) => sum + Math.max(0, m.totalIncome - rates.incomeDeduction) * conf.incomeRate,
      0
    );
    const raw = incomePortion + conf.perCapita * targets.length + conf.perHousehold;
    return floorTo(Math.min(raw, conf.cap), 100);
  };

  const medical = calcCategory(rates.medical, enrolled);
  const support = calcCategory(rates.support, enrolled);
  const care = calcCategory(
    rates.care,
    enrolled.filter((m) => m.age >= 40 && m.age <= 64)
  );
  return { medical, support, care, total: medical + support + care };
}

export type LatterElderlyRates = TaxTables["latterElderlyDefaults"];

/**
 * 後期高齢者医療保険料（75歳以上・被保険者ごとの年額合計）。
 * householdIncome は均等割軽減の判定に使う世帯所得
 */
export function calcLatterElderly(
  insured: { totalIncome: number }[],
  householdIncome: number,
  rates: LatterElderlyRates
): number {
  if (insured.length === 0) return 0;
  const n = insured.length;

  // 軽減率は最も手厚い区分から判定する
  let reductionRate = 0;
  for (const b of rates.reduction.brackets) {
    const threshold = b.thresholdBase + b.thresholdPerInsured * n;
    if (householdIncome <= threshold) {
      reductionRate = b.reductionRate;
      break;
    }
  }

  let total = 0;
  for (const person of insured) {
    const incomePortion =
      Math.max(0, person.totalIncome - rates.incomeDeduction) * rates.incomeRate;
    const perCapita = rates.perCapita * (1 - reductionRate);
    total += floorTo(Math.min(incomePortion + perCapita, rates.cap), 100);
  }
  return total;
}

export type CareInsurance1Rates = TaxTables["careInsurance1Defaults"];

/** 介護保険第1号保険料（65歳以上・本人の所得段階別、年額） */
export function calcCareInsurance1(totalIncome: number, rates: CareInsurance1Rates): number {
  for (const stage of rates.stages) {
    if (stage.incomeUpTo === null || totalIncome <= stage.incomeUpTo) {
      return Math.round(rates.baseAnnual * stage.rate);
    }
  }
  return rates.baseAnnual;
}
