// 住民税の計算（DOMAIN.md §3.2）。N年所得に対する税額で、キャッシュフロー上はN+1年に計上する
import { floorTo } from "./rounding";
import { totalDeductions, type DeductionInput } from "./income-tax";
import type { TaxTables } from "./tables";

export type ResidentTaxResult = {
  taxableIncome: number;
  incomePortion: number;
  perCapita: number;
  adjustmentCredit: number;
  housingLoanCreditUsed: number;
  tax: number;
};

/** 非課税判定に使う扶養人数（同一生計配偶者+扶養親族） */
function familyCount(input: DeductionInput, t: TaxTables): number {
  const spouse =
    input.spouseTotalIncome !== null &&
    input.spouseTotalIncome <= t.spouseDeduction.spouseIncomeLimit
      ? 1
      : 0;
  return spouse + input.dependentAges.length;
}

function isExemptPerCapita(totalIncome: number, family: number, t: TaxTables): boolean {
  const e = t.residentTax.exemption;
  const n = 1 + family;
  const limit = e.perCapitaBase * n + e.perCapitaAdd + (family > 0 ? e.perCapitaFamilyAdd : 0);
  return totalIncome <= limit;
}

function isExemptIncomePortion(totalIncome: number, family: number, t: TaxTables): boolean {
  const e = t.residentTax.exemption;
  const n = 1 + family;
  const limit = e.incomeBase * n + e.incomeAdd + (family > 0 ? e.incomeFamilyAdd : 0);
  return totalIncome <= limit;
}

/** 調整控除。人的控除差の合計 × 5%（課税所得200万円超は圧縮、最低2,500円） */
function adjustmentCredit(
  taxableIncome: number,
  deductions: ReturnType<typeof totalDeductions>,
  t: TaxTables
): number {
  const a = t.residentTax.adjustmentCredit;
  let diff = a.differenceBasic;
  if (deductions.spouseType === "spouse") diff += a.differenceSpouse;
  if (deductions.spouseType === "spouseSpecial") diff += a.differenceSpouseSpecial;
  diff += deductions.dependentCounts.general * a.differenceDependentGeneral;
  diff += deductions.dependentCounts.specific * a.differenceDependentSpecific;
  diff += deductions.dependentCounts.elderly * a.differenceDependentElderly;

  if (taxableIncome <= 2000000) {
    return Math.floor(Math.min(diff, taxableIncome) * a.rateUnder2M);
  }
  const compressed = diff - (taxableIncome - 2000000);
  return Math.max(Math.floor(compressed * a.rateUnder2M), a.minimum);
}

/**
 * 住民税の年額計算。
 * incomeTaxCreditRemainder は所得税から引き切れなかった住宅ローン控除の残額
 */
export function calcResidentTax(
  totalIncome: number,
  deductionInput: DeductionInput,
  incomeTaxCreditRemainder: number,
  t: TaxTables
): ResidentTaxResult {
  const family = familyCount(deductionInput, t);
  const none: ResidentTaxResult = {
    taxableIncome: 0,
    incomePortion: 0,
    perCapita: 0,
    adjustmentCredit: 0,
    housingLoanCreditUsed: 0,
    tax: 0,
  };
  if (totalIncome <= 0) return none;
  if (isExemptPerCapita(totalIncome, family, t)) return none;

  const perCapita = t.residentTax.perCapita;
  if (isExemptIncomePortion(totalIncome, family, t)) {
    return { ...none, perCapita, tax: perCapita };
  }

  const d = totalDeductions(totalIncome, deductionInput, "residentTax", t);
  const taxableIncome = floorTo(Math.max(0, totalIncome - d.total), 1000);
  const gross = Math.floor(taxableIncome * t.residentTax.incomeRate);
  const adjustment = adjustmentCredit(taxableIncome, d, t);

  // 住宅ローン控除の住民税振替（前年課税所得×5%・97,500円上限）
  const transferCap = Math.min(
    Math.floor(taxableIncome * t.housingLoanCredit.residentTaxTransferRateOfTaxableIncome),
    t.housingLoanCredit.residentTaxTransferCap
  );
  const creditUsed = Math.min(Math.max(0, gross - adjustment), incomeTaxCreditRemainder, transferCap);

  const incomePortion = floorTo(Math.max(0, gross - adjustment - creditUsed), 100);
  return {
    taxableIncome,
    incomePortion,
    perCapita,
    adjustmentCredit: adjustment,
    housingLoanCreditUsed: creditUsed,
    tax: incomePortion + perCapita,
  };
}
