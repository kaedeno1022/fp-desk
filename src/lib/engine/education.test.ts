import { describe, expect, it } from "vitest";
import { educationCostForAge, defaultEducationPlan } from "./education";
import { loadTaxTables } from "./tables";

const t = loadTaxTables();

describe("educationCostForAge", () => {
  it("公立小学生（10歳）は年35万円", () => {
    expect(educationCostForAge(10, defaultEducationPlan, t)).toBe(350_000);
  });

  it("私立中学（13歳）は年144万円", () => {
    expect(
      educationCostForAge(13, { ...defaultEducationPlan, juniorHigh: "private" }, t)
    ).toBe(1_440_000);
  });

  it("高校は就学支援金が費用から控除される", () => {
    // 公立: 51万 - 11.88万 = 391,200 / 私立: 105万 - 45.7万 = 593,000
    expect(educationCostForAge(16, defaultEducationPlan, t)).toBe(391_200);
    expect(
      educationCostForAge(16, { ...defaultEducationPlan, highSchool: "private" }, t)
    ).toBe(593_000);
  });

  it("国公立大学は初年度に入学金を加算（18歳88万円、19歳60万円）", () => {
    expect(educationCostForAge(18, defaultEducationPlan, t)).toBe(880_000);
    expect(educationCostForAge(19, defaultEducationPlan, t)).toBe(600_000);
  });

  it("大学に行かない場合は18歳以降0円", () => {
    expect(
      educationCostForAge(18, { ...defaultEducationPlan, university: "none" }, t)
    ).toBe(0);
  });

  it("就学前（0〜2歳）・卒業後（22歳超）は0円", () => {
    expect(educationCostForAge(1, defaultEducationPlan, t)).toBe(0);
    expect(educationCostForAge(23, defaultEducationPlan, t)).toBe(0);
  });

  it("段階をnoneにすると0円（例: 幼稚園なし）", () => {
    expect(
      educationCostForAge(4, { ...defaultEducationPlan, kindergarten: "none" }, t)
    ).toBe(0);
  });
});
