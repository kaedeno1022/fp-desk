// 所得税の計算（DOMAIN.md §3.1）。すべて年額・円単位の純関数
import { floorTo } from "./rounding";
import type { TaxTables } from "./tables";

/** 給与収入 → 給与所得（給与所得控除を適用） */
export function salaryIncome(grossSalary: number, t: TaxTables): number {
  if (grossSalary <= 0) return 0;
  for (const b of t.salaryDeduction.brackets) {
    if (b.incomeUpTo === null || grossSalary <= b.incomeUpTo) {
      const deduction = grossSalary * b.formula.rate + b.formula.add;
      return Math.max(0, Math.floor(grossSalary - deduction));
    }
  }
  return grossSalary;
}

/** 公的年金収入 → 雑所得（公的年金等控除を適用。年金以外の合計所得1,000万円以下の列） */
export function pensionIncome(pensionRevenue: number, age: number, t: TaxTables): number {
  if (pensionRevenue <= 0) return 0;
  const brackets =
    age >= 65 ? t.pensionIncomeDeduction.over65 : t.pensionIncomeDeduction.under65;
  for (const b of brackets) {
    if (b.pensionUpTo === null || pensionRevenue <= b.pensionUpTo) {
      const deduction = pensionRevenue * b.formula.rate + b.formula.add;
      return Math.max(0, Math.floor(pensionRevenue - deduction));
    }
  }
  return pensionRevenue;
}

export type LifeInsurancePremiums = {
  general: number;
  medical: number;
  pension: number;
};

export type DeductionInput = {
  /** その年に支払った社会保険料の実額 */
  socialInsurancePaid: number;
  /** iDeCo掛金年額（小規模企業共済等掛金控除） */
  idecoContribution: number;
  lifeInsurancePremiums: LifeInsurancePremiums;
  earthquakePremium: number;
  /** 配偶者の合計所得。配偶者がいない場合は null */
  spouseTotalIncome: number | null;
  /** 扶養親族の年齢リスト（所得58万円以下が前提。16歳未満は控除対象外） */
  dependentAges: number[];
};

type TaxKind = "incomeTax" | "residentTax";

function basicDeduction(totalIncome: number, kind: TaxKind, t: TaxTables): number {
  const rows = t.basicDeduction[kind];
  for (const r of rows) {
    if (r.totalIncomeUpTo === null || totalIncome <= r.totalIncomeUpTo) return r.amount;
  }
  return 0;
}

/** 配偶者控除・配偶者特別控除。返り値は該当区分も返す（住民税の調整控除判定に使う） */
export function spouseDeduction(
  taxpayerIncome: number,
  spouseIncome: number | null,
  kind: TaxKind,
  t: TaxTables
): { amount: number; type: "none" | "spouse" | "spouseSpecial" } {
  if (spouseIncome === null) return { amount: 0, type: "none" };

  const row = t.spouseDeduction.byTaxpayerIncome.find(
    (r) => r.taxpayerIncomeUpTo === null || taxpayerIncome <= r.taxpayerIncomeUpTo
  );
  if (!row || row[kind] === 0) return { amount: 0, type: "none" };

  if (spouseIncome <= t.spouseDeduction.spouseIncomeLimit) {
    return { amount: row[kind], type: "spouse" };
  }

  // 配偶者特別控除。テーブルは納税者所得900万円以下の列。
  // 900万円超は満額控除に対する比率で按分する簡易実装（DOMAIN.md の簡略化事項）
  const special = t.spouseDeduction.specialBrackets.find(
    (b) => b.spouseIncomeUpTo === null || spouseIncome <= b.spouseIncomeUpTo
  );
  if (!special || special[kind] === 0) return { amount: 0, type: "none" };
  const fullRow = t.spouseDeduction.byTaxpayerIncome[0];
  const factor = row[kind] / fullRow[kind];
  const amount = Math.round((special[kind] * factor) / 10000) * 10000;
  return { amount, type: "spouseSpecial" };
}

export type DependentCounts = {
  general: number;
  specific: number;
  elderly: number;
};

/** 扶養親族を年齢で控除区分に振り分ける（16歳未満は対象外） */
export function classifyDependents(ages: number[], t: TaxTables): DependentCounts {
  const d = t.dependentDeduction;
  const counts: DependentCounts = { general: 0, specific: 0, elderly: 0 };
  for (const age of ages) {
    if (age >= d.specific.ageFrom && age <= (d.specific.ageTo ?? Infinity)) counts.specific++;
    else if (age >= d.elderly.ageFrom) counts.elderly++;
    else if (age >= d.general.ageFrom) counts.general++;
  }
  return counts;
}

function dependentDeduction(counts: DependentCounts, kind: TaxKind, t: TaxTables): number {
  const d = t.dependentDeduction;
  return (
    counts.general * d.general[kind] +
    counts.specific * d.specific[kind] +
    counts.elderly * d.elderly[kind]
  );
}

function lifeInsuranceDeduction(
  premiums: LifeInsurancePremiums,
  kind: TaxKind,
  t: TaxTables
): number {
  const conf = t.insuranceDeduction.lifeInsurance[kind];
  const per = (premium: number): number => {
    if (premium <= 0) return 0;
    for (const b of conf.brackets) {
      if (b.premiumUpTo === null || premium <= b.premiumUpTo) {
        return Math.ceil(premium * b.formula.rate + b.formula.add);
      }
    }
    return 0;
  };
  const total = per(premiums.general) + per(premiums.medical) + per(premiums.pension);
  return Math.min(total, conf.totalCap);
}

function earthquakeDeduction(premium: number, kind: TaxKind, t: TaxTables): number {
  const conf = t.insuranceDeduction.earthquakeInsurance;
  if (premium <= 0) return 0;
  if (kind === "incomeTax") return Math.min(premium, conf.incomeTaxCap);
  return Math.min(Math.ceil(premium * conf.residentTaxRate), conf.residentTaxCap);
}

export type DeductionBreakdown = {
  basic: number;
  socialInsurance: number;
  ideco: number;
  lifeInsurance: number;
  earthquake: number;
  spouse: number;
  spouseType: "none" | "spouse" | "spouseSpecial";
  dependents: number;
  dependentCounts: DependentCounts;
  total: number;
};

/** 所得控除の合計（所得税用・住民税用を kind で切り替え） */
export function totalDeductions(
  totalIncome: number,
  input: DeductionInput,
  kind: TaxKind,
  t: TaxTables
): DeductionBreakdown {
  const spouse = spouseDeduction(totalIncome, input.spouseTotalIncome, kind, t);
  const counts = classifyDependents(input.dependentAges, t);
  const breakdown = {
    basic: basicDeduction(totalIncome, kind, t),
    socialInsurance: input.socialInsurancePaid,
    ideco: input.idecoContribution,
    lifeInsurance: lifeInsuranceDeduction(input.lifeInsurancePremiums, kind, t),
    earthquake: earthquakeDeduction(input.earthquakePremium, kind, t),
    spouse: spouse.amount,
    spouseType: spouse.type,
    dependents: dependentDeduction(counts, kind, t),
    dependentCounts: counts,
  };
  const total =
    breakdown.basic +
    breakdown.socialInsurance +
    breakdown.ideco +
    breakdown.lifeInsurance +
    breakdown.earthquake +
    breakdown.spouse +
    breakdown.dependents;
  return { ...breakdown, total };
}

/** 課税所得（1,000円未満切捨て済み）に累進税率を適用した算出税額（復興税・税額控除は含まない） */
export function progressiveTax(taxableIncome: number, t: TaxTables): number {
  if (taxableIncome <= 0) return 0;
  for (const b of t.incomeTax.brackets) {
    if (b.upTo === null || taxableIncome <= b.upTo) {
      return Math.floor(taxableIncome * b.rate - b.deduction);
    }
  }
  return 0;
}

export type IncomeTaxResult = {
  taxableIncome: number;
  baseTax: number;
  housingLoanCreditUsed: number;
  /** 復興特別所得税込み・100円未満切捨ての最終税額 */
  tax: number;
};

/**
 * 所得税の年額計算。
 * housingLoanCredit は住宅ローン控除の理論額（残額は住民税へ振り替える。resident-tax.ts 側で使用）
 */
export function calcIncomeTax(
  totalIncome: number,
  deductions: DeductionInput,
  housingLoanCredit: number,
  t: TaxTables
): IncomeTaxResult {
  const d = totalDeductions(totalIncome, deductions, "incomeTax", t);
  const taxableIncome = floorTo(Math.max(0, totalIncome - d.total), 1000);
  const progressive = progressiveTax(taxableIncome, t);
  const creditUsed = Math.min(progressive, housingLoanCredit);
  const baseTax = progressive - creditUsed;
  const tax = floorTo(baseTax * (1 + t.incomeTax.reconstructionSurtaxRate), 100);
  return { taxableIncome, baseTax, housingLoanCreditUsed: creditUsed, tax };
}
