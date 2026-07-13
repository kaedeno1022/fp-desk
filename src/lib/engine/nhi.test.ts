import { describe, expect, it } from "vitest";
import { calcCareInsurance1, calcLatterElderly, calcNhi } from "./nhi";
import { loadTaxTables } from "./tables";

const t = loadTaxTables();

describe("calcNhi（国民健康保険）", () => {
  it("単身65歳・所得200万円: 医療分+支援分（介護分は40-64歳のみ）", () => {
    const r = calcNhi([{ totalIncome: 2_000_000, age: 65 }], t.nhiDefaults);
    // 医療: (200万-43万)×7.7% + 47,300 = 168,190 → 100円未満切捨て 168,100
    expect(r.medical).toBe(168_100);
    // 支援: (200万-43万)×2.7% + 16,800 = 59,190 → 59,100
    expect(r.support).toBe(59_100);
    expect(r.care).toBe(0);
    expect(r.total).toBe(227_200);
  });

  it("45歳は介護分（2号としての国保介護分）が加算される", () => {
    const r = calcNhi([{ totalIncome: 2_000_000, age: 45 }], t.nhiDefaults);
    // 介護: (200万-43万)×2.3% + 16,600 = 52,710 → 52,700
    expect(r.care).toBe(52_700);
  });

  it("高所得は賦課限度額でキャップされる", () => {
    const r = calcNhi([{ totalIncome: 30_000_000, age: 50 }], t.nhiDefaults);
    expect(r.medical).toBe(t.nhiDefaults.medical.cap);
    expect(r.support).toBe(t.nhiDefaults.support.cap);
    expect(r.care).toBe(t.nhiDefaults.care.cap);
  });

  it("75歳以上は国保の対象外（後期高齢者医療へ移行）", () => {
    const r = calcNhi([{ totalIncome: 2_000_000, age: 75 }], t.nhiDefaults);
    expect(r.total).toBe(0);
  });

  it("世帯2人分は均等割が2人分になる", () => {
    const single = calcNhi([{ totalIncome: 2_000_000, age: 65 }], t.nhiDefaults);
    const couple = calcNhi(
      [
        { totalIncome: 2_000_000, age: 65 },
        { totalIncome: 0, age: 63 },
      ],
      t.nhiDefaults
    );
    expect(couple.medical).toBe(single.medical + t.nhiDefaults.medical.perCapita);
  });
});

describe("calcLatterElderly（後期高齢者医療）", () => {
  it("76歳・所得100万円: 軽減なしで所得割+均等割", () => {
    // 所得割 (100万-43万)×9.67% = 55,119 + 均等割47,300 = 102,419 → 102,400
    const r = calcLatterElderly([{ totalIncome: 1_000_000 }], 1_000_000, t.latterElderlyDefaults);
    expect(r).toBe(102_400);
  });

  it("世帯所得43万円以下は均等割7割軽減", () => {
    // 所得割0 + 47,300×0.3 = 14,190 → 14,100
    const r = calcLatterElderly([{ totalIncome: 400_000 }], 400_000, t.latterElderlyDefaults);
    expect(r).toBe(14_100);
  });

  it("被保険者なしは0", () => {
    expect(calcLatterElderly([], 0, t.latterElderlyDefaults)).toBe(0);
  });
});

describe("calcCareInsurance1（介護保険第1号）", () => {
  it("所得段階に応じて基準額×乗率", () => {
    // 所得150万 → 210万以下の段階 rate 0.9 → 80,000×0.9 = 72,000
    expect(calcCareInsurance1(1_500_000, t.careInsurance1Defaults)).toBe(72_000);
    // 所得500万 → 最上段 rate 1.7 → 136,000
    expect(calcCareInsurance1(5_000_000, t.careInsurance1Defaults)).toBe(136_000);
  });
});
