import { describe, expect, it } from "vitest";
import { buildInputFromInterview, interviewSimulationName } from "./interview";

describe("buildInputFromInterview", () => {
  const base = {
    clientName: "田中",
    selfBirthYear: 1990,
    hasSpouse: "yes",
    spouseBirthYear: 1992,
    childCount: 2,
    child1Year: 2020,
    child2Year: 2023,
    selfWork: "employee",
    selfIncome: 600,
    selfRetireAge: 65,
    selfSeverance: 1500,
    spouseWork: "none",
    housingStatus: "rent",
    rentMonthly: 12,
    planPurchase: "yes",
    purchaseInYears: 3,
    purchasePrice: 4500,
    downPayment: 500,
    livingMonthly: 22,
    cashSavings: 800,
    nisaBalance: 300,
    nisaAnnual: 80,
    idecoBalance: 0,
    pensionAnnual: 200,
    lifeInsurance: 12,
  };

  it("世帯・収入・住居・資産が回答通りに反映される", () => {
    const input = buildInputFromInterview(base);

    expect(input.adults).toHaveLength(2);
    expect(input.adults[0].birthYear).toBe(1990);
    expect(input.adults[0].grossAnnual).toBe(6_000_000);
    expect(input.adults[0].severancePay).toBe(15_000_000);
    expect(input.adults[0].pensionAnnual).toBe(2_000_000);
    expect(input.adults[1].employment).toBe("none");
    expect(input.adults[1].grossAnnual).toBe(0);

    expect(input.children).toHaveLength(2);
    expect(input.children[1].birthYear).toBe(2023);

    expect(input.rentAnnual).toBe(1_440_000);
    expect(input.housing).not.toBeNull();
    expect(input.housing!.price).toBe(45_000_000);
    expect(input.housing!.loanPrincipal).toBe(40_000_000);

    expect(input.livingExpenseAnnual).toBe(2_640_000);
    expect(input.accounts.cashInitial).toBe(8_000_000);
    expect(input.accounts.nisaInitial).toBe(3_000_000);
    expect(input.accounts.nisaAnnualContribution).toBe(800_000);
    expect(input.adults[0].lifeInsurancePremiums.general).toBe(120_000);
  });

  it("ローン返済中の持ち家は家賃0・借入として計上される", () => {
    const input = buildInputFromInterview({
      ...base,
      housingStatus: "loan",
      loanBalance: 2500,
      loanYearsLeft: 25,
      loanRate: 1.2,
    });
    expect(input.rentAnnual).toBe(0);
    expect(input.housing).toBeNull();
    expect(input.debts).toHaveLength(1);
    expect(input.debts[0].balance).toBe(25_000_000);
    expect(input.debts[0].annualRate).toBeCloseTo(0.012);
    expect(input.debts[0].remainingYears).toBe(25);
  });

  it("独身・購入予定なしなら大人1人・住宅なし", () => {
    const input = buildInputFromInterview({
      ...base,
      hasSpouse: "no",
      childCount: 0,
      planPurchase: "no",
    });
    expect(input.adults).toHaveLength(1);
    expect(input.children).toHaveLength(0);
    expect(input.housing).toBeNull();
  });

  it("年金が未回答なら概算180万円で仮置きする", () => {
    const answers = { ...base } as Record<string, string | number>;
    delete answers.pensionAnnual;
    const input = buildInputFromInterview(answers);
    expect(input.adults[0].pensionAnnual).toBe(1_800_000);
  });
});

describe("interviewSimulationName", () => {
  it("名前があれば「◯◯様」", () => {
    expect(interviewSimulationName({ clientName: "田中" })).toBe("田中様");
  });

  it("名前がなければ日付ベース", () => {
    expect(interviewSimulationName({})).toMatch(/^ヒアリング \d{4}-\d{2}-\d{2}$/);
  });
});
