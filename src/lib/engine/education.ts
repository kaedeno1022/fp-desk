// 教育費プリセット（DOMAIN.md §5.3）。文科省統計ベースの年額概算
import type { TaxTables } from "./tables";

export type SchoolChoice = "none" | "public" | "private";
export type UniversityChoice = "none" | "national" | "privateLiberal" | "privateScience";

export type EducationPlan = {
  kindergarten: SchoolChoice;
  elementary: SchoolChoice;
  juniorHigh: SchoolChoice;
  highSchool: SchoolChoice;
  university: UniversityChoice;
};

export const defaultEducationPlan: EducationPlan = {
  kindergarten: "public",
  elementary: "public",
  juniorHigh: "public",
  highSchool: "public",
  university: "national",
};

/**
 * 子の年齢に応じた教育費年額。大学は初年度に入学金を加算。
 * 高校は就学支援金（授業料相当）を費用から控除する
 */
export function educationCostForAge(age: number, plan: EducationPlan, t: TaxTables): number {
  const p = t.educationCosts.presets;

  const stages = [
    { conf: p.kindergarten, choice: plan.kindergarten, support: 0 },
    { conf: p.elementary, choice: plan.elementary, support: 0 },
    { conf: p.juniorHigh, choice: plan.juniorHigh, support: 0 },
    {
      conf: p.highSchool,
      choice: plan.highSchool,
      support: plan.highSchool === "none" ? 0 : t.highSchoolSupport[plan.highSchool as "public" | "private"],
    },
  ];
  for (const { conf, choice, support } of stages) {
    if (age >= conf.ageFrom && age <= conf.ageTo) {
      if (choice === "none") return 0;
      return Math.max(0, conf[choice] - support);
    }
  }

  const uni = p.university;
  if (age >= uni.ageFrom && age <= uni.ageTo && plan.university !== "none") {
    const conf = uni[plan.university];
    return conf.annual + (age === uni.ageFrom ? conf.firstYearAdd : 0);
  }
  return 0;
}
