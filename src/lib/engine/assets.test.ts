import { describe, expect, it } from "vitest";
import { stepNisa, stepSimple, stepTaxable } from "./assets";
import { loadTaxTables } from "./tables";

const t = loadTaxTables();

describe("stepTaxable（課税口座）", () => {
  it("評価益に20.315%課税される", () => {
    // 100万×5% = 5万の益 → 税 floor(50,000×0.20315) = 10,157
    const r = stepTaxable(1_000_000, 0.05, 0, t);
    expect(r.taxPaid).toBe(10_157);
    expect(r.balance).toBe(1_039_843);
  });

  it("マイナスリターンの年は課税されない", () => {
    const r = stepTaxable(1_000_000, -0.05, 0, t);
    expect(r.taxPaid).toBe(0);
    expect(r.balance).toBe(950_000);
  });

  it("積立は期末に非課税で加算される", () => {
    const r = stepTaxable(0, 0.05, 1_200_000, t);
    expect(r.taxPaid).toBe(0);
    expect(r.balance).toBe(1_200_000);
  });
});

describe("stepNisa", () => {
  it("年間360万円の枠を超えた分は受け入れない", () => {
    const r = stepNisa({ balance: 0, lifetimeContributed: 0 }, 0, 5_000_000, t);
    expect(r.accepted).toBe(3_600_000);
    expect(r.rejected).toBe(1_400_000);
  });

  it("生涯1,800万円の枠の残りが優先される", () => {
    const r = stepNisa({ balance: 0, lifetimeContributed: 17_900_000 }, 0, 3_600_000, t);
    expect(r.accepted).toBe(100_000);
    expect(r.rejected).toBe(3_500_000);
    expect(r.state.lifetimeContributed).toBe(18_000_000);
  });

  it("運用益は非課税で複利成長する", () => {
    const r = stepNisa({ balance: 1_000_000, lifetimeContributed: 1_000_000 }, 0.05, 0, t);
    expect(r.state.balance).toBe(1_050_000);
  });
});

describe("stepSimple", () => {
  it("利回り適用後に積立を加算", () => {
    expect(stepSimple(1_000_000, 0.01, 120_000)).toBe(1_130_000);
  });
});
