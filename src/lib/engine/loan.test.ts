import { describe, expect, it } from "vitest";
import { amortizeLoan, housingLoanCreditForYear } from "./loan";
import { loadTaxTables } from "./tables";

const t = loadTaxTables();

describe("amortizeLoan（元利均等）", () => {
  const rows = amortizeLoan({
    principal: 30_000_000,
    annualRate: 0.01,
    years: 35,
    method: "annuity",
  });

  it("3,000万円・1%・35年の毎月返済額は84,685円（初年度返済額で確認）", () => {
    // 84,685×12 = 1,016,220
    expect(rows[0].payment).toBe(1_016_220);
  });

  it("最終年に残高が0になり、元金合計が借入額に一致する", () => {
    expect(rows[34].balanceEnd).toBe(0);
    const totalPrincipal = rows.reduce((sum, r) => sum + r.principalPaid, 0);
    expect(totalPrincipal).toBe(30_000_000);
  });

  it("利息は残高減少に伴い逓減する", () => {
    expect(rows[0].interestPaid).toBeGreaterThan(rows[34].interestPaid);
  });
});

describe("amortizeLoan（元金均等）", () => {
  const rows = amortizeLoan({
    principal: 30_000_000,
    annualRate: 0.01,
    years: 35,
    method: "equalPrincipal",
  });

  it("元金は毎年ほぼ均等・初年度の返済額が最大", () => {
    expect(rows[0].principalPaid).toBeCloseTo(30_000_000 / 35, -3);
    expect(rows[0].payment).toBeGreaterThan(rows[34].payment);
  });

  it("最終年に残高0", () => {
    expect(rows[34].balanceEnd).toBe(0);
  });
});

describe("金利0%でも計算できる", () => {
  it("元利均等・0%は単純割", () => {
    const rows = amortizeLoan({
      principal: 12_000_000,
      annualRate: 0,
      years: 10,
      method: "annuity",
    });
    expect(rows[0].payment).toBe(1_200_000);
    expect(rows[9].balanceEnd).toBe(0);
  });
});

describe("housingLoanCreditForYear", () => {
  it("年末残高2,800万円・新築認定 → 196,000円", () => {
    expect(housingLoanCreditForYear(28_000_000, "newCertified", 0, t)).toBe(196_000);
  });

  it("残高が借入限度額を超える場合は限度額でキャップ", () => {
    // 4,500万×0.7% = 315,000
    expect(housingLoanCreditForYear(50_000_000, "newCertified", 0, t)).toBe(315_000);
  });

  it("控除期間（新築13年）を過ぎたら0", () => {
    expect(housingLoanCreditForYear(28_000_000, "newCertified", 12, t)).toBeGreaterThan(0);
    expect(housingLoanCreditForYear(28_000_000, "newCertified", 13, t)).toBe(0);
  });

  it("中古は10年で終了", () => {
    expect(housingLoanCreditForYear(15_000_000, "usedOther", 9, t)).toBeGreaterThan(0);
    expect(housingLoanCreditForYear(15_000_000, "usedOther", 10, t)).toBe(0);
  });

  it("不明なプリセットキーは0", () => {
    expect(housingLoanCreditForYear(28_000_000, "unknown", 0, t)).toBe(0);
  });
});
