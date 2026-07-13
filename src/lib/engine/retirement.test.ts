import { describe, expect, it } from "vitest";
import { retirementDeduction, retirementIncomeTax } from "./retirement";
import { loadTaxTables } from "./tables";

const t = loadTaxTables();

describe("retirementDeduction", () => {
  it("勤続20年以下は40万円/年", () => {
    expect(retirementDeduction(10, t)).toBe(4_000_000);
    expect(retirementDeduction(20, t)).toBe(8_000_000);
  });

  it("勤続20年超は超過分70万円/年", () => {
    expect(retirementDeduction(30, t)).toBe(8_000_000 + 7_000_000);
    expect(retirementDeduction(38, t)).toBe(8_000_000 + 12_600_000);
  });

  it("最低80万円", () => {
    expect(retirementDeduction(1, t)).toBe(800_000);
  });
});

describe("retirementIncomeTax", () => {
  it("退職金2,000万円・勤続30年: 課税退職所得250万円", () => {
    const r = retirementIncomeTax(20_000_000, 30, t);
    expect(r.deduction).toBe(15_000_000);
    expect(r.taxableIncome).toBe(2_500_000);
    // 250万×10%-97,500 = 152,500 → ×1.021 = 155,702（1円未満切捨て）
    expect(r.incomeTax).toBe(155_702);
    // 250万×10% = 250,000
    expect(r.residentTax).toBe(250_000);
    expect(r.net).toBe(20_000_000 - 405_702);
  });

  it("控除内に収まる退職金は非課税", () => {
    const r = retirementIncomeTax(8_000_000, 20, t);
    expect(r.totalTax).toBe(0);
    expect(r.net).toBe(8_000_000);
  });
});
