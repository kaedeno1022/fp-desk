// シミュレーション入力モデル。UIとエンジンで共有する
import type { EducationPlan } from "./education";
import type { LoanMethod } from "./loan";
import type { NhiRates, LatterElderlyRates, CareInsurance1Rates } from "./nhi";
import type { LifeInsurancePremiums } from "./income-tax";
import { loadTaxTables } from "./tables";

export type Employment = "employee" | "selfEmployed" | "none";

export type PersonInput = {
  name: string;
  birthYear: number;
  employment: Employment;
  /** employee: 額面年収 / selfEmployed: 事業所得（収入-経費-青色控除後の所得金額） */
  grossAnnual: number;
  /** 年収成長率（年率、0.01 = 1%）。incomeChanges の適用後は使わない */
  incomeGrowthRate: number;
  /**
   * 年齢起点の年収変更（役職定年・転職・再雇用など）。
   * 指定年齢以降は成長率を適用せず、直近の変更額をそのまま使う
   */
  incomeChanges: { fromAge: number; annual: number }[];
  /** この年齢になる年から無職（前年まで就労）。severance はこの年に受取 */
  retirementAge: number;
  severancePay: number;
  serviceYearsAtRetirement: number;
  pensionStartAge: number;
  /** ねんきん定期便ベースの年金見込み年額 */
  pensionAnnual: number;
  /** iDeCo拠出年額（59歳まで拠出、60歳で一時金受取） */
  idecoAnnualContribution: number;
  idecoInitialBalance: number;
  lifeInsurancePremiums: LifeInsurancePremiums;
  earthquakePremium: number;
};

export type ChildInput = {
  name: string;
  birthYear: number;
  educationPlan: EducationPlan;
};

export type LifeEventInput = {
  year: number;
  label: string;
  /** 支出は正、収入は負で入力 */
  amount: number;
};

/** 既存の借入（奨学金・自動車ローン・返済中の住宅ローン等）。元利均等で完済まで返済する */
export type DebtInput = {
  label: string;
  /** 現在の残高 */
  balance: number;
  annualRate: number;
  remainingYears: number;
};

/** 指定年以降の基礎生活費を変更する（子の独立・老後の縮小等） */
export type LivingExpenseChange = {
  fromYear: number;
  /** 開始年時点の価格水準での年額。インフレはこの額に対して開始年からの累積で掛かる */
  annual: number;
};

export type HousingInput = {
  purchaseYear: number;
  /** 物件価格。頭金 = price - loanPrincipal を購入年に支出 */
  price: number;
  loanPrincipal: number;
  loanAnnualRate: number;
  loanYears: number;
  loanMethod: LoanMethod;
  /** 住宅ローン控除プリセットキー（tax-tables の housingLoanCredit.presets） */
  creditPresetKey: string;
};

export type AccountsInput = {
  cashInitial: number;
  cashRate: number;
  taxableInitial: number;
  taxableRate: number;
  taxableAnnualContribution: number;
  nisaInitial: number;
  /** NISA生涯枠の既消化額（簿価） */
  nisaInitialContributed: number;
  nisaRate: number;
  nisaAnnualContribution: number;
  idecoRate: number;
  /**
   * 定率取り崩しの年率（0.04 = 4%）。
   * 取り崩し期には課税口座+NISAの残高×この率を課税口座→NISAの順に毎年現金化する。
   * 現金が不足した年は時期を問わず不足分を自動売却する
   */
  drawdownRate: number;
  /**
   * 取り崩し開始年。null なら自動（世帯の労働収入がなくなった年から）。
   * 指定すると就労中でもその年から取り崩し期に入る（積立も止まる）
   */
  drawdownStartYear: number | null;
};

export type MunicipalRates = {
  nhi: NhiRates;
  latterElderly: LatterElderlyRates;
  care1: CareInsurance1Rates;
};

export type SimulationInput = {
  startYear: number;
  years: number;
  prefecture: string;
  adults: PersonInput[];
  children: ChildInput[];
  /** 教育費・住宅費以外の基礎生活費（年額、初年度価格） */
  livingExpenseAnnual: number;
  /** 時期による基礎生活費の変更（fromYear昇順でなくてよい） */
  livingExpenseChanges: LivingExpenseChange[];
  /** 生活費に適用するインフレ率（年率） */
  inflationRate: number;
  /** 住宅購入前・非購入時の家賃（年額） */
  rentAnnual: number;
  events: LifeEventInput[];
  /** 既存の借入（奨学金・自動車ローン等） */
  debts: DebtInput[];
  housing: HousingInput | null;
  accounts: AccountsInput;
  municipal: MunicipalRates;
};

/**
 * 保存済みJSONを現行スキーマに補完する。
 * フィールド追加のたびに過去データが壊れないよう、読み込み時に必ず通す
 */
export function normalizeInput(raw: SimulationInput): SimulationInput {
  const d = createDefaultInput();
  return {
    ...d,
    ...raw,
    adults: (raw.adults ?? d.adults).map((a) => ({
      ...a,
      incomeChanges: a.incomeChanges ?? [],
    })),
    livingExpenseChanges: raw.livingExpenseChanges ?? [],
    debts: raw.debts ?? [],
    events: raw.events ?? [],
    accounts: { ...d.accounts, ...raw.accounts },
    municipal: raw.municipal ?? d.municipal,
  };
}

export function createDefaultPerson(name: string, birthYear: number): PersonInput {
  return {
    name,
    birthYear,
    employment: "employee",
    grossAnnual: 5_000_000,
    incomeGrowthRate: 0.01,
    incomeChanges: [],
    retirementAge: 65,
    severancePay: 10_000_000,
    serviceYearsAtRetirement: 40,
    pensionStartAge: 65,
    pensionAnnual: 1_800_000,
    idecoAnnualContribution: 0,
    idecoInitialBalance: 0,
    lifeInsurancePremiums: { general: 0, medical: 0, pension: 0 },
    earthquakePremium: 0,
  };
}

export function createDefaultInput(): SimulationInput {
  const t = loadTaxTables();
  const currentYear = new Date().getFullYear();
  return {
    startYear: currentYear,
    years: 60,
    prefecture: "tokyo",
    adults: [createDefaultPerson("本人", currentYear - 35)],
    children: [],
    livingExpenseAnnual: 2_400_000,
    livingExpenseChanges: [],
    inflationRate: 0.01,
    rentAnnual: 1_200_000,
    events: [],
    debts: [],
    housing: null,
    accounts: {
      cashInitial: 5_000_000,
      cashRate: 0,
      taxableInitial: 0,
      taxableRate: 0.03,
      taxableAnnualContribution: 0,
      nisaInitial: 0,
      nisaInitialContributed: 0,
      nisaRate: 0.03,
      nisaAnnualContribution: 0,
      idecoRate: 0.03,
      drawdownRate: 0.04,
      drawdownStartYear: null,
    },
    municipal: {
      nhi: t.nhiDefaults,
      latterElderly: t.latterElderlyDefaults,
      care1: t.careInsurance1Defaults,
    },
  };
}
