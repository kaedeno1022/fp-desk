// 税率・料率テーブルの型定義とローダー。
// 数値は data/tax-tables/<年度>.json に持ち、ロジックはすべてテーブル参照で計算する。
import tables2025 from "../../../data/tax-tables/2025.json";

/** 「上限までは rate×収入 + add」形式の段階式 */
export type FormulaBracket = {
  formula: { rate: number; add: number };
};

export type TaxBracket = { upTo: number | null; rate: number; deduction: number };

export type TaxTables = {
  meta: {
    fiscalYear: number;
    fiscalLabel: string;
    lastVerified: string;
    description: string;
    note?: string;
  };
  incomeTax: {
    brackets: TaxBracket[];
    reconstructionSurtaxRate: number;
  };
  salaryDeduction: {
    brackets: ({ incomeUpTo: number | null } & FormulaBracket)[];
  };
  basicDeduction: {
    incomeTax: { totalIncomeUpTo: number | null; amount: number }[];
    residentTax: { totalIncomeUpTo: number | null; amount: number }[];
  };
  spouseDeduction: {
    spouseIncomeLimit: number;
    byTaxpayerIncome: {
      taxpayerIncomeUpTo: number | null;
      incomeTax: number;
      residentTax: number;
    }[];
    specialBrackets: {
      spouseIncomeUpTo: number | null;
      incomeTax: number;
      residentTax: number;
    }[];
  };
  dependentDeduction: {
    incomeLimit: number;
    general: DependentBracket;
    specific: DependentBracket;
    generalAdult: DependentBracket;
    elderly: DependentBracket;
  };
  insuranceDeduction: {
    lifeInsurance: {
      incomeTax: { brackets: ({ premiumUpTo: number | null } & FormulaBracket)[]; totalCap: number };
      residentTax: { brackets: ({ premiumUpTo: number | null } & FormulaBracket)[]; totalCap: number };
    };
    earthquakeInsurance: {
      incomeTaxCap: number;
      residentTaxRate: number;
      residentTaxCap: number;
    };
  };
  residentTax: {
    incomeRate: number;
    perCapita: number;
    adjustmentCredit: {
      differenceBasic: number;
      differenceSpouse: number;
      differenceSpouseSpecial: number;
      differenceDependentGeneral: number;
      differenceDependentSpecific: number;
      differenceDependentElderly: number;
      rateUnder2M: number;
      minimum: number;
    };
    exemption: {
      perCapitaBase: number;
      perCapitaAdd: number;
      perCapitaFamilyAdd: number;
      incomeBase: number;
      incomeAdd: number;
      incomeFamilyAdd: number;
    };
  };
  socialInsurance: {
    kenpoRates: Record<string, { health: number; care2: number }>;
    healthGradesThousandYen: number[];
    pensionGradeMinThousandYen: number;
    pensionGradeMaxThousandYen: number;
    pensionRate: number;
    employmentInsuranceRate: number;
    employeeShareRatio: number;
    nationalPensionMonthly: number;
  };
  pensionIncomeDeduction: {
    under65: ({ pensionUpTo: number | null } & FormulaBracket)[];
    over65: ({ pensionUpTo: number | null } & FormulaBracket)[];
  };
  retirementDeduction: {
    perYearUpTo20: number;
    perYearOver20: number;
    minimum: number;
  };
  capitalGainsTaxRate: number;
  nisa: { annualLimit: number; lifetimeLimit: number };
  housingLoanCredit: {
    creditRate: number;
    presets: { key: string; label: string; loanLimit: number; years: number }[];
    residentTaxTransferRateOfTaxableIncome: number;
    residentTaxTransferCap: number;
  };
  childAllowance: {
    under3Monthly: number;
    standardMonthly: number;
    thirdChildMonthly: number;
    supportAgeMax: number;
    countAgeMax: number;
  };
  highSchoolSupport: {
    public: number;
    private: number;
  };
  educationCosts: {
    presets: {
      kindergarten: SchoolCost;
      elementary: SchoolCost;
      juniorHigh: SchoolCost;
      highSchool: SchoolCost;
      university: {
        national: UniversityCost;
        privateLiberal: UniversityCost;
        privateScience: UniversityCost;
        ageFrom: number;
        ageTo: number;
      };
    };
  };
  nhiDefaults: {
    medical: NhiCategory;
    support: NhiCategory;
    care: NhiCategory;
    incomeDeduction: number;
  };
  latterElderlyDefaults: {
    perCapita: number;
    incomeRate: number;
    cap: number;
    incomeDeduction: number;
    reduction: {
      brackets: { thresholdBase: number; thresholdPerInsured: number; reductionRate: number }[];
    };
  };
  careInsurance1Defaults: {
    baseAnnual: number;
    stages: { incomeUpTo: number | null; rate: number }[];
  };
};

export type DependentBracket = {
  incomeTax: number;
  residentTax: number;
  ageFrom: number;
  ageTo: number | null;
};

export type SchoolCost = {
  public: number;
  private: number;
  ageFrom: number;
  ageTo: number;
};

export type UniversityCost = { annual: number; firstYearAdd: number };

export type NhiCategory = {
  incomeRate: number;
  perCapita: number;
  perHousehold: number;
  cap: number;
};

export function loadTaxTables(): TaxTables {
  return tables2025 as unknown as TaxTables;
}
