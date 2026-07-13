// 被用者の社会保険料（DOMAIN.md §3.3）と国民年金（§3.4）。
// 賞与は考慮せず年収/12を報酬月額として等級判定する簡易方式（テーブル側 note 参照）
import type { TaxTables } from "./tables";

export type EmployeeSocialInsurance = {
  standardMonthlyHealth: number;
  standardMonthlyPension: number;
  health: number;
  care2: number;
  pension: number;
  employment: number;
  total: number;
};

/** 被保険者負担分の端数処理: 50銭以下切捨て・50銭超切上げ（健康保険法167条） */
export function roundEmployeeShare(amount: number): number {
  const cents = Math.round(amount * 100) / 100;
  const frac = cents - Math.floor(cents);
  return frac <= 0.5 ? Math.floor(cents) : Math.ceil(cents);
}

/** 報酬月額 → 標準報酬月額。等級境界は隣接する標準報酬額の中間値 */
export function standardMonthly(monthly: number, gradesThousandYen: number[]): number {
  const grades = gradesThousandYen.map((g) => g * 1000);
  for (let i = 0; i < grades.length - 1; i++) {
    const upper = (grades[i] + grades[i + 1]) / 2;
    if (monthly < upper) return grades[i];
  }
  return grades[grades.length - 1];
}

export function employeeSocialInsurance(
  annualSalary: number,
  age: number,
  prefecture: string,
  t: TaxTables
): EmployeeSocialInsurance {
  const s = t.socialInsurance;
  const zero: EmployeeSocialInsurance = {
    standardMonthlyHealth: 0,
    standardMonthlyPension: 0,
    health: 0,
    care2: 0,
    pension: 0,
    employment: 0,
    total: 0,
  };
  if (annualSalary <= 0) return zero;

  const rates = s.kenpoRates[prefecture] ?? s.kenpoRates["tokyo"];
  const monthly = annualSalary / 12;
  const share = s.employeeShareRatio;

  // 保険料は月額で計算して端数処理し、年額は×12（保険料額表と一致させるため）
  const smrHealth = standardMonthly(monthly, s.healthGradesThousandYen);
  const health = roundEmployeeShare(smrHealth * rates.health * share) * 12;
  // 介護保険第2号被保険者（40〜64歳）は健康保険料に上乗せ
  const care2 =
    age >= 40 && age <= 64 ? roundEmployeeShare(smrHealth * rates.care2 * share) * 12 : 0;

  // 厚生年金は70歳まで。等級は健保と同じ標準報酬額のうち上下限で頭打ち
  const pensionGrades = s.healthGradesThousandYen.filter(
    (g) => g >= s.pensionGradeMinThousandYen && g <= s.pensionGradeMaxThousandYen
  );
  const smrPension = age < 70 ? standardMonthly(monthly, pensionGrades) : 0;
  const pension = smrPension > 0 ? roundEmployeeShare(smrPension * s.pensionRate * share) * 12 : 0;

  const employment = Math.floor(annualSalary * s.employmentInsuranceRate);

  return {
    standardMonthlyHealth: smrHealth,
    standardMonthlyPension: smrPension,
    health,
    care2,
    pension,
    employment,
    total: health + care2 + pension + employment,
  };
}

/** 国民年金保険料の年額（20〜59歳） */
export function nationalPensionAnnual(age: number, t: TaxTables): number {
  if (age < 20 || age >= 60) return 0;
  return t.socialInsurance.nationalPensionMonthly * 12;
}
