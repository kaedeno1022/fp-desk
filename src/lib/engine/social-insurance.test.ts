import { describe, expect, it } from "vitest";
import {
  employeeSocialInsurance,
  nationalPensionAnnual,
  standardMonthly,
} from "./social-insurance";
import { loadTaxTables } from "./tables";

const t = loadTaxTables();

describe("standardMonthly（標準報酬月額の等級判定）", () => {
  const grades = t.socialInsurance.healthGradesThousandYen;

  it("報酬月額は中間値境界で等級に丸められる", () => {
    expect(standardMonthly(416_667, grades)).toBe(410_000);
    expect(standardMonthly(300_000, grades)).toBe(300_000);
    expect(standardMonthly(289_999, grades)).toBe(280_000);
    expect(standardMonthly(290_000, grades)).toBe(300_000);
  });

  it("下限・上限で頭打ちになる", () => {
    expect(standardMonthly(10_000, grades)).toBe(58_000);
    expect(standardMonthly(2_000_000, grades)).toBe(1_390_000);
  });
});

describe("employeeSocialInsurance", () => {
  it("年収500万円・30歳・東京: 健保等級41万円・介護なし", () => {
    const r = employeeSocialInsurance(5_000_000, 30, t);
    expect(r.standardMonthlyHealth).toBe(410_000);
    // 月額 410,000×9.91%×0.5 = 20,315.5 → 50銭ちょうどは切捨て → 20,315×12 = 243,780
    expect(r.health).toBe(243_780);
    expect(r.care2).toBe(0);
    // 月額 410,000×18.3%×0.5 = 37,515 → ×12 = 450,180
    expect(r.pension).toBe(450_180);
    // 5,000,000×0.55% = 27,500
    expect(r.employment).toBe(27_500);
    expect(r.total).toBe(721_460);
  });

  it("40〜64歳は介護保険第2号分が上乗せされる", () => {
    const r = employeeSocialInsurance(5_000_000, 40, t);
    // 月額 410,000×1.59%×0.5 = 3,259.5 → 切捨て 3,259×12 = 39,108
    expect(r.care2).toBe(39_108);
  });

  it("厚生年金の標準報酬月額は65万円で頭打ち（健保は続伸）", () => {
    const r = employeeSocialInsurance(12_000_000, 30, t);
    expect(r.standardMonthlyPension).toBe(650_000);
    expect(r.standardMonthlyHealth).toBe(980_000);
  });

  it("70歳以上は厚生年金の徴収なし", () => {
    const r = employeeSocialInsurance(5_000_000, 70, t);
    expect(r.pension).toBe(0);
    expect(r.health).toBeGreaterThan(0);
  });

  it("収入0は全項目0", () => {
    expect(employeeSocialInsurance(0, 30, t).total).toBe(0);
  });
});

describe("nationalPensionAnnual", () => {
  it("20〜59歳のみ徴収", () => {
    expect(nationalPensionAnnual(19, t)).toBe(0);
    expect(nationalPensionAnnual(20, t)).toBe(17_510 * 12);
    expect(nationalPensionAnnual(59, t)).toBe(17_510 * 12);
    expect(nationalPensionAnnual(60, t)).toBe(0);
  });
});
