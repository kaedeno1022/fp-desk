// 退職所得の分離課税（DOMAIN.md §2・§6）。退職金とiDeCo一時金受取に使う
import { floorTo } from "./rounding";
import { progressiveTax } from "./income-tax";
import type { TaxTables } from "./tables";

export type RetirementTaxResult = {
  deduction: number;
  taxableIncome: number;
  incomeTax: number;
  residentTax: number;
  totalTax: number;
  net: number;
};

/** 退職所得控除額（勤続年数ベース、1年未満切上げ済みの年数を渡す） */
export function retirementDeduction(serviceYears: number, t: TaxTables): number {
  const r = t.retirementDeduction;
  const years = Math.max(1, serviceYears);
  const amount =
    years <= 20
      ? r.perYearUpTo20 * years
      : r.perYearUpTo20 * 20 + r.perYearOver20 * (years - 20);
  return Math.max(amount, r.minimum);
}

/** 退職金への課税（2分の1課税・分離課税）。特定役員等の例外は対象外 */
export function retirementIncomeTax(
  severance: number,
  serviceYears: number,
  t: TaxTables
): RetirementTaxResult {
  const deduction = retirementDeduction(serviceYears, t);
  const taxableIncome = floorTo(Math.max(0, severance - deduction) / 2, 1000);
  const base = progressiveTax(taxableIncome, t);
  // 源泉徴収税額は復興税込みで1円未満切捨て
  const incomeTax = Math.floor(base * (1 + t.incomeTax.reconstructionSurtaxRate));
  const residentTax = floorTo(taxableIncome * t.residentTax.incomeRate, 100);
  const totalTax = incomeTax + residentTax;
  return { deduction, taxableIncome, incomeTax, residentTax, totalTax, net: severance - totalTax };
}
