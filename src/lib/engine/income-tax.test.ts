import { describe, expect, it } from "vitest";
import {
  calcIncomeTax,
  classifyDependents,
  pensionIncome,
  progressiveTax,
  salaryIncome,
  spouseDeduction,
  totalDeductions,
  type DeductionInput,
} from "./income-tax";
import { loadTaxTables } from "./tables";

const t = loadTaxTables();

const noDeductions: DeductionInput = {
  socialInsurancePaid: 0,
  idecoContribution: 0,
  lifeInsurancePremiums: { general: 0, medical: 0, pension: 0 },
  earthquakePremium: 0,
  spouseTotalIncome: null,
  dependentAges: [],
};

describe("salaryIncome（給与所得控除）", () => {
  it("収入190万円以下は最低保障65万円（令和7年改正）", () => {
    expect(salaryIncome(1_900_000, t)).toBe(1_250_000);
    expect(salaryIncome(1_000_000, t)).toBe(350_000);
  });

  it("収入500万円 → 控除144万円 → 所得356万円", () => {
    expect(salaryIncome(5_000_000, t)).toBe(3_560_000);
  });

  it("収入850万円超は控除195万円で頭打ち", () => {
    expect(salaryIncome(10_000_000, t)).toBe(8_050_000);
    expect(salaryIncome(20_000_000, t)).toBe(18_050_000);
  });
});

describe("progressiveTax（累進税率・国税庁速算表）", () => {
  it("課税所得700万円 → 974,000円（国税庁 No.2260 の例）", () => {
    expect(progressiveTax(7_000_000, t)).toBe(974_000);
  });

  it("税率境界で連続している（195万円の前後）", () => {
    expect(progressiveTax(1_950_000, t)).toBe(97_500);
    expect(progressiveTax(1_951_000, t)).toBe(97_600);
  });

  it("課税所得0以下は0円", () => {
    expect(progressiveTax(0, t)).toBe(0);
    expect(progressiveTax(-100, t)).toBe(0);
  });
});

describe("pensionIncome（公的年金等控除）", () => {
  it("65歳以上・年金240万円 → 控除110万円 → 雑所得130万円", () => {
    expect(pensionIncome(2_400_000, 65, t)).toBe(1_300_000);
  });

  it("65歳未満・年金200万円 → 控除77.5万円 → 雑所得122.5万円", () => {
    expect(pensionIncome(2_000_000, 64, t)).toBe(1_225_000);
  });

  it("控除額が収入を上回る場合は所得0", () => {
    expect(pensionIncome(1_000_000, 70, t)).toBe(0);
  });
});

describe("基礎控除（令和7年改正の逓減）", () => {
  it.each([
    [1_320_000, 950_000],
    [3_000_000, 880_000],
    [4_000_000, 680_000],
    [6_000_000, 630_000],
    [10_000_000, 580_000],
    [24_100_000, 320_000],
    [26_000_000, 0],
  ])("合計所得 %d → 基礎控除 %d", (income, expected) => {
    expect(totalDeductions(income, noDeductions, "incomeTax", t).basic).toBe(expected);
  });
});

describe("spouseDeduction", () => {
  it("配偶者所得58万円以下・納税者900万円以下 → 配偶者控除38万円", () => {
    expect(spouseDeduction(5_000_000, 500_000, "incomeTax", t)).toEqual({
      amount: 380_000,
      type: "spouse",
    });
  });

  it("配偶者所得95万円以下 → 配偶者特別控除38万円", () => {
    expect(spouseDeduction(5_000_000, 900_000, "incomeTax", t)).toEqual({
      amount: 380_000,
      type: "spouseSpecial",
    });
  });

  it("配偶者所得133万円超 → 控除なし", () => {
    expect(spouseDeduction(5_000_000, 1_340_000, "incomeTax", t)).toEqual({
      amount: 0,
      type: "none",
    });
  });

  it("納税者所得1,000万円超 → 控除なし", () => {
    expect(spouseDeduction(10_100_000, 500_000, "incomeTax", t)).toEqual({
      amount: 0,
      type: "none",
    });
  });

  it("配偶者なし → 控除なし", () => {
    expect(spouseDeduction(5_000_000, null, "incomeTax", t)).toEqual({
      amount: 0,
      type: "none",
    });
  });
});

describe("classifyDependents", () => {
  it("年齢で一般・特定・老人に振り分け、16歳未満は対象外", () => {
    expect(classifyDependents([10, 16, 20, 45, 71], t)).toEqual({
      general: 2,
      specific: 1,
      elderly: 1,
    });
  });
});

describe("calcIncomeTax（統合）", () => {
  it("給与所得356万円・社保72.1万円の年税額（規定計算の突合）", () => {
    // 所得356万 → 基礎控除68万 + 社保721,460 → 課税所得2,158,000（千円未満切捨て）
    // 215,800 - 97,500 = 118,300 → ×1.021 = 120,784 → 100円未満切捨て 120,700
    const result = calcIncomeTax(
      3_560_000,
      { ...noDeductions, socialInsurancePaid: 721_460 },
      0,
      t
    );
    expect(result.taxableIncome).toBe(2_158_000);
    expect(result.tax).toBe(120_700);
  });

  it("住宅ローン控除が算出税額を上回る場合は所得税0円で残額が返らない（残額計算は呼び出し側）", () => {
    const result = calcIncomeTax(
      3_560_000,
      { ...noDeductions, socialInsurancePaid: 721_460 },
      200_000,
      t
    );
    expect(result.housingLoanCreditUsed).toBe(118_300);
    expect(result.tax).toBe(0);
  });

  it("控除が所得を上回る場合は税額0", () => {
    const result = calcIncomeTax(500_000, noDeductions, 0, t);
    expect(result.tax).toBe(0);
  });
});
