import { describe, expect, it } from "vitest";
import { calcResidentTax } from "./resident-tax";
import { loadTaxTables } from "./tables";
import type { DeductionInput } from "./income-tax";

const t = loadTaxTables();

const noDeductions: DeductionInput = {
  socialInsurancePaid: 0,
  idecoContribution: 0,
  lifeInsurancePremiums: { general: 0, medical: 0, pension: 0 },
  earthquakePremium: 0,
  spouseTotalIncome: null,
  dependentAges: [],
};

describe("calcResidentTax", () => {
  it("所得300万円・社保45万円: 課税所得212万円 → 調整控除2,500円 → 214,500円", () => {
    const r = calcResidentTax(
      3_000_000,
      { ...noDeductions, socialInsurancePaid: 450_000 },
      0,
      t
    );
    expect(r.taxableIncome).toBe(2_120_000);
    expect(r.adjustmentCredit).toBe(2_500);
    expect(r.incomePortion).toBe(209_500);
    expect(r.tax).toBe(214_500);
  });

  it("課税所得200万円以下: 調整控除は基礎控除差5万円×5%=2,500円", () => {
    const r = calcResidentTax(
      2_500_000,
      { ...noDeductions, socialInsurancePaid: 350_000 },
      0,
      t
    );
    expect(r.taxableIncome).toBe(1_720_000);
    expect(r.adjustmentCredit).toBe(2_500);
    expect(r.tax).toBe(174_500);
  });

  it("単身・所得45万円以下は均等割も非課税", () => {
    const r = calcResidentTax(400_000, noDeductions, 0, t);
    expect(r.tax).toBe(0);
  });

  it("配偶者ありの非課税限度額は世帯人数で拡大する", () => {
    // n=2: 35万×2+10万+21万 = 101万円以下 → 非課税
    const r = calcResidentTax(800_000, { ...noDeductions, spouseTotalIncome: 0 }, 0, t);
    expect(r.tax).toBe(0);
  });

  it("住宅ローン控除の住民税振替は97,500円で頭打ち", () => {
    const r = calcResidentTax(
      5_000_000,
      { ...noDeductions, socialInsurancePaid: 700_000 },
      300_000,
      t
    );
    expect(r.housingLoanCreditUsed).toBe(97_500);
  });

  it("所得0は税額0", () => {
    expect(calcResidentTax(0, noDeductions, 0, t).tax).toBe(0);
  });
});
