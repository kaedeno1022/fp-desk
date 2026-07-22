// 年次シミュレーター統合層（DOMAIN.md 全体）。
// 個人単位で税・社保を計算し、世帯キャッシュフロー・資産推移を年ループで生成する
import { stepNisa, stepSimple, stepTaxable, type NisaState } from "./assets";
import { childAllowanceAnnual } from "./child-allowance";
import { educationCostForAge } from "./education";
import {
  calcIncomeTax,
  pensionIncome,
  salaryIncome,
  type DeductionInput,
} from "./income-tax";
import type { SimulationInput } from "./input";
import { amortizeLoan, housingLoanCreditForYear, type LoanYearRow } from "./loan";
import { calcCareInsurance1, calcLatterElderly, calcNhi, type NhiMember } from "./nhi";
import { calcResidentTax } from "./resident-tax";
import { retirementIncomeTax } from "./retirement";
import { employeeSocialInsurance, nationalPensionAnnual } from "./social-insurance";
import type { TaxTables } from "./tables";

export type YearResult = {
  year: number;
  adultAges: number[];
  income: {
    salary: number;
    business: number;
    pension: number;
    severanceNet: number;
    idecoNet: number;
    /** 児童手当（非課税） */
    childAllowance: number;
    eventIncome: number;
    total: number;
  };
  taxes: {
    incomeTax: number;
    residentTax: number;
    capitalGainsTax: number;
    retirementTax: number;
    total: number;
  };
  social: {
    employee: number;
    nationalPension: number;
    nhi: number;
    care1: number;
    latterElderly: number;
    total: number;
  };
  expenses: {
    living: number;
    education: number;
    rent: number;
    housing: number;
    debts: number;
    events: number;
    total: number;
  };
  contributions: { taxable: number; nisa: number; ideco: number };
  /** 現金不足を補うために売却した額（課税口座→NISAの順） */
  withdrawals: { taxable: number; nisa: number };
  /** 収支（資産への積立を除く手残り。現金口座に入る額） */
  cashflow: number;
  /** 年間手取り額（収入合計から所得税・住民税・社会保険料を引いた額。支出は含まない） */
  netIncome: number;
  assets: {
    cash: number;
    taxable: number;
    nisa: number;
    /** NISAの元本（取得原価）。売却時は平均取得単価方式で比例減額 */
    nisaPrincipal: number;
    ideco: number;
    total: number;
  };
};

export type SimulationResult = {
  years: YearResult[];
  warnings: string[];
};

/** 年ごとの運用利回りを注入する口（モンテカルロ用）。未指定なら入力の固定利回り */
export type YearlyRates = (yearIndex: number) => {
  taxable: number;
  nisa: number;
  ideco: number;
};

/** 被扶養者判定の年収基準（130万円の壁）。所得ベースの簡易判定に使う */
const DEPENDENT_INCOME_LIMIT = 1_300_000;

type PrevTaxRecord = {
  totalIncome: number;
  deductions: DeductionInput;
  housingCreditRemainder: number;
};

export function simulate(
  input: SimulationInput,
  t: TaxTables,
  yearlyRates?: YearlyRates
): SimulationResult {
  const warnings: string[] = [];
  const years: YearResult[] = [];

  // 住宅ローンは全期間分を先に償還計算しておく
  const loanRows: LoanYearRow[] | null = input.housing
    ? amortizeLoan({
        principal: input.housing.loanPrincipal,
        annualRate: input.housing.loanAnnualRate,
        years: input.housing.loanYears,
        method: input.housing.loanMethod,
      })
    : null;

  // 既存の借入（奨学金等）は開始年から元利均等で完済まで返済する
  const debtSchedules: LoanYearRow[][] = (input.debts ?? []).map((d) =>
    amortizeLoan({
      principal: d.balance,
      annualRate: d.annualRate,
      years: Math.max(1, d.remainingYears),
      method: "annuity",
    })
  );

  // 個人ごとの持ち越し状態
  const idecoBalances = input.adults.map((a) => a.idecoInitialBalance);
  const idecoContribYears = input.adults.map(() => 0);
  const idecoPaidOut = input.adults.map(() => false);
  let prevTax: PrevTaxRecord[] | null = null;

  // 口座状態
  let cash = input.accounts.cashInitial;
  let taxable = input.accounts.taxableInitial;
  let nisa: NisaState = {
    balance: input.accounts.nisaInitial,
    lifetimeContributed: input.accounts.nisaInitialContributed,
  };
  // NISAの取得原価。初期値は生涯枠消化額（ただし残高を上回らない範囲）
  let nisaPrincipal = Math.min(
    input.accounts.nisaInitial,
    input.accounts.nisaInitialContributed
  );
  // 売却した簿価分は翌年に生涯枠へ復活する（新NISAルール。年間枠は復活しない）
  let nisaRestoreCarry = 0;

  let negativeCashWarned = false;

  for (let y = 0; y < input.years; y++) {
    const year = input.startYear + y;
    const adultAges = input.adults.map((a) => year - a.birthYear);
    const childAges = input.children.map((c) => year - c.birthYear);

    // 初年度は年途中開始を想定し、残り月数分だけに按分する（「現在の残高」に
    // 年初からの実績が反映済みという前提と、収入・支出の二重計上を避けるため）
    const yearFraction = y === 0 ? (13 - input.startMonth) / 12 : 1;
    const prorate = (v: number) => Math.floor(v * yearFraction);

    // --- 収入（個人別） ---
    const isEmployee = input.adults.map(
      (a, i) => a.employment === "employee" && adultAges[i] < a.retirementAge
    );
    const isSelfEmployed = input.adults.map(
      (a, i) => a.employment === "selfEmployed" && adultAges[i] < a.retirementAge
    );
    // 年収: 年齢起点の変更指定があればその額（成長率なし）、なければ成長率を複利適用
    const laborIncomeFor = (i: number): number => {
      const a = input.adults[i];
      const change = (a.incomeChanges ?? [])
        .filter((c) => c.fromAge <= adultAges[i])
        .reduce(
          (acc, c) => (acc === null || c.fromAge > acc.fromAge ? c : acc),
          null as { fromAge: number; annual: number } | null
        );
      if (change) return change.annual;
      return Math.floor(a.grossAnnual * Math.pow(1 + a.incomeGrowthRate, y));
    };
    const grossSalary = input.adults.map((_, i) =>
      isEmployee[i] ? prorate(laborIncomeFor(i)) : 0
    );
    const businessIncome = input.adults.map((_, i) =>
      isSelfEmployed[i] ? prorate(laborIncomeFor(i)) : 0
    );
    const pensionRevenue = input.adults.map((a, i) =>
      adultAges[i] >= a.pensionStartAge ? prorate(a.pensionAnnual) : 0
    );

    const totalIncomes = input.adults.map((a, i) => {
      const salaryPart = grossSalary[i] > 0 ? salaryIncome(grossSalary[i], t) : 0;
      const pensionPart =
        pensionRevenue[i] > 0 ? pensionIncome(pensionRevenue[i], adultAges[i], t) : 0;
      return salaryPart + businessIncome[i] + pensionPart;
    });

    const anyEmployee = isEmployee.some(Boolean);

    // --- 社会保険（個人別 + 世帯単位の国保） ---
    const employeeSi = input.adults.map((a, i) =>
      isEmployee[i]
        ? employeeSocialInsurance(grossSalary[i], adultAges[i], t).total
        : 0
    );

    // 被扶養者: 世帯に被用者がいて自分の所得が130万円未満なら社保・年金の負担なし
    const isDependent = input.adults.map(
      (_, i) =>
        !isEmployee[i] &&
        anyEmployee &&
        totalIncomes[i] < DEPENDENT_INCOME_LIMIT
    );

    const nationalPension = input.adults.map((a, i) => {
      if (isEmployee[i] || isDependent[i]) return 0;
      return nationalPensionAnnual(adultAges[i], t);
    });

    // 国保: 被用者でも被扶養者でもない75歳未満の世帯員（子含む）
    const nhiMembers: NhiMember[] = [];
    input.adults.forEach((_, i) => {
      if (!isEmployee[i] && !isDependent[i] && adultAges[i] < 75) {
        nhiMembers.push({ totalIncome: totalIncomes[i], age: adultAges[i] });
      }
    });
    if (!anyEmployee) {
      childAges.forEach((age) => {
        if (age >= 0 && age <= 22) nhiMembers.push({ totalIncome: 0, age });
      });
    }
    const nhi = calcNhi(nhiMembers, input.municipal.nhi);

    const care1 = input.adults.reduce(
      (sum, _, i) =>
        adultAges[i] >= 65
          ? sum + calcCareInsurance1(totalIncomes[i], input.municipal.care1)
          : sum,
      0
    );

    const latterElderlyInsured = input.adults
      .map((_, i) => i)
      .filter((i) => adultAges[i] >= 75)
      .map((i) => ({ totalIncome: totalIncomes[i] }));
    const householdIncome = totalIncomes.reduce((a, b) => a + b, 0);
    const latterElderly = calcLatterElderly(
      latterElderlyInsured,
      householdIncome,
      input.municipal.latterElderly
    );

    // --- iDeCo拠出（59歳まで） ---
    const idecoContribs = input.adults.map((a, i) =>
      adultAges[i] < 60 && !idecoPaidOut[i] ? prorate(a.idecoAnnualContribution) : 0
    );
    idecoContribs.forEach((c, i) => {
      if (c > 0) idecoContribYears[i]++;
    });

    // --- 所得控除の構築（社会保険料の帰属: 国保は世帯主=adults[0]に付ける） ---
    const socialPaid = input.adults.map(
      (_, i) =>
        employeeSi[i] +
        nationalPension[i] +
        (adultAges[i] >= 65 ? calcCareInsurance1(totalIncomes[i], input.municipal.care1) : 0) +
        (i === 0 ? nhi.total + latterElderly : 0)
    );

    // 配偶者控除・扶養控除は所得の高い方に付ける
    const primaryIdx =
      input.adults.length === 2 && totalIncomes[1] > totalIncomes[0] ? 1 : 0;
    const dependentAges = childAges.filter((age) => age >= 16 && age <= 22);

    const deductionInputs: DeductionInput[] = input.adults.map((a, i) => ({
      socialInsurancePaid: socialPaid[i],
      idecoContribution: idecoContribs[i],
      lifeInsurancePremiums: a.lifeInsurancePremiums,
      earthquakePremium: a.earthquakePremium,
      spouseTotalIncome:
        i === primaryIdx && input.adults.length === 2
          ? totalIncomes[1 - primaryIdx]
          : null,
      dependentAges: i === primaryIdx ? dependentAges : [],
    }));

    // --- 住宅ローン（返済・控除） ---
    let loanPayment = 0;
    let downPayment = 0;
    let housingCredit = 0;
    if (input.housing && loanRows) {
      const idx = year - input.housing.purchaseYear;
      if (idx === 0) downPayment = input.housing.price - input.housing.loanPrincipal;
      if (idx >= 0 && idx < loanRows.length) {
        loanPayment = loanRows[idx].payment;
        housingCredit = housingLoanCreditForYear(
          loanRows[idx].balanceEnd,
          input.housing.creditPresetKey,
          idx,
          t
        );
      }
    }

    // --- 所得税（当年課税） ---
    const incomeTaxResults = input.adults.map((_, i) =>
      calcIncomeTax(
        totalIncomes[i],
        deductionInputs[i],
        i === primaryIdx ? housingCredit : 0,
        t
      )
    );
    const incomeTaxTotal = incomeTaxResults.reduce((s, r) => s + r.tax, 0);
    const creditRemainders = incomeTaxResults.map((r, i) =>
      i === primaryIdx ? Math.max(0, housingCredit - r.housingLoanCreditUsed) : 0
    );

    // --- 住民税（前年所得課税。初年度は当年所得で近似） ---
    const residentBasis: PrevTaxRecord[] =
      prevTax ??
      input.adults.map((_, i) => ({
        totalIncome: totalIncomes[i],
        deductions: deductionInputs[i],
        housingCreditRemainder: creditRemainders[i],
      }));
    const residentTaxTotal = residentBasis.reduce(
      (s, rec) =>
        s + calcResidentTax(rec.totalIncome, rec.deductions, rec.housingCreditRemainder, t).tax,
      0
    );
    prevTax = input.adults.map((_, i) => ({
      totalIncome: totalIncomes[i],
      deductions: deductionInputs[i],
      housingCreditRemainder: creditRemainders[i],
    }));

    // --- 退職金・iDeCo一時金（分離課税） ---
    let severanceNet = 0;
    let idecoNet = 0;
    let retirementTax = 0;
    input.adults.forEach((a, i) => {
      const retiringNow = adultAges[i] === a.retirementAge && a.severancePay > 0;
      const idecoNow = adultAges[i] === 60 && idecoBalances[i] > 0 && !idecoPaidOut[i];

      if (retiringNow && idecoNow && a.retirementAge === 60) {
        // 同年受取は合算して1回で課税（勤続年数は長い方を採用する簡易方式）
        const amount = a.severancePay + idecoBalances[i];
        const years = Math.max(a.serviceYearsAtRetirement, idecoContribYears[i]);
        const r = retirementIncomeTax(amount, years, t);
        severanceNet += a.severancePay - r.totalTax;
        idecoNet += idecoBalances[i];
        retirementTax += r.totalTax;
        idecoBalances[i] = 0;
        idecoPaidOut[i] = true;
        return;
      }
      if (retiringNow) {
        const r = retirementIncomeTax(a.severancePay, a.serviceYearsAtRetirement, t);
        severanceNet += r.net;
        retirementTax += r.totalTax;
      }
      if (idecoNow) {
        const r = retirementIncomeTax(idecoBalances[i], idecoContribYears[i], t);
        idecoNet += r.net;
        retirementTax += r.totalTax;
        idecoBalances[i] = 0;
        idecoPaidOut[i] = true;
      }
    });

    // --- 支出 ---
    const inflator = Math.pow(1 + input.inflationRate, y);
    // 基礎生活費は変更点リストの直近適用分を使う（額は開始年時点の価格水準で入力）
    const livingBase = (input.livingExpenseChanges ?? [])
      .filter((c) => c.fromYear <= year)
      .reduce(
        (acc, c) => (acc === null || c.fromYear > acc.fromYear ? c : acc),
        null as { fromYear: number; annual: number } | null
      );
    const living = prorate((livingBase?.annual ?? input.livingExpenseAnnual) * inflator);
    const debtPayments = debtSchedules.reduce(
      (sum, rows) => sum + (y < rows.length ? rows[y].payment : 0),
      0
    );
    const education = prorate(
      input.children.reduce(
        (sum, c, ci) => sum + educationCostForAge(childAges[ci], c.educationPlan, t),
        0
      )
    );
    const childAllowance = prorate(childAllowanceAnnual(childAges, t));
    const paysRent = !input.housing || year < input.housing.purchaseYear;
    const rent = paysRent ? prorate(input.rentAnnual * inflator) : 0;
    const yearEvents = input.events.filter((e) => e.year === year);
    const eventExpense = yearEvents.reduce((s, e) => s + Math.max(0, e.amount), 0);
    const eventIncome = yearEvents.reduce((s, e) => s + Math.max(0, -e.amount), 0);
    const housingExpense = downPayment + loanPayment;

    // --- 資産（期首残高に利回り → 期末に積立） ---
    // 取り崩し期の判定: 開始年の指定があればそれを優先、なければ労働収入がなくなった年から
    const hasLaborIncome =
      grossSalary.some((s) => s > 0) || businessIncome.some((b) => b > 0);
    const startOverride = input.accounts.drawdownStartYear ?? null;
    const drawdownActive = startOverride !== null ? year >= startOverride : !hasLaborIncome;
    const contributing = hasLaborIncome && !drawdownActive;
    const taxableContribution = contributing ? prorate(input.accounts.taxableAnnualContribution) : 0;
    const nisaContribution = contributing ? prorate(input.accounts.nisaAnnualContribution) : 0;

    const rates = yearlyRates?.(y) ?? {
      taxable: input.accounts.taxableRate,
      nisa: input.accounts.nisaRate,
      ideco: input.accounts.idecoRate,
    };

    const taxableStep = stepTaxable(taxable, rates.taxable, taxableContribution, t);
    taxable = taxableStep.balance;

    // 前年に売却した簿価分の生涯枠復活を反映してから積み立てる
    if (nisaRestoreCarry > 0) {
      nisa = {
        ...nisa,
        lifetimeContributed: Math.max(0, nisa.lifetimeContributed - nisaRestoreCarry),
      };
      nisaRestoreCarry = 0;
    }
    const nisaStep = stepNisa(nisa, rates.nisa, nisaContribution, t);
    nisa = nisaStep.state;
    nisaPrincipal += nisaStep.accepted;

    input.adults.forEach((_, i) => {
      if (!idecoPaidOut[i]) {
        idecoBalances[i] = stepSimple(idecoBalances[i], rates.ideco, idecoContribs[i]);
      }
    });

    // --- キャッシュフロー ---
    const grossIncomeTotal =
      grossSalary.reduce((a, b) => a + b, 0) +
      businessIncome.reduce((a, b) => a + b, 0) +
      pensionRevenue.reduce((a, b) => a + b, 0);
    const socialTotal =
      employeeSi.reduce((a, b) => a + b, 0) +
      nationalPension.reduce((a, b) => a + b, 0) +
      nhi.total +
      care1 +
      latterElderly;
    const idecoContribTotal = idecoContribs.reduce((a, b) => a + b, 0);
    const expenseTotal =
      living + education + rent + housingExpense + debtPayments + eventExpense;

    const cashflow =
      grossIncomeTotal +
      severanceNet +
      idecoNet +
      childAllowance +
      eventIncome -
      incomeTaxTotal -
      residentTaxTotal -
      socialTotal -
      expenseTotal -
      idecoContribTotal -
      taxableContribution -
      nisaStep.accepted;

    cash = stepSimple(cash, input.accounts.cashRate, cashflow);

    // 取り崩しは2段構え。売却額はそのまま現金になる
    // （課税口座は毎年課税の簡易モデルのため売却時の追加課税なし、
    //   NISAの生涯枠は簿価消化のまま = 売却による枠復活はモデル化しない）
    let withdrawnTaxable = 0;
    let withdrawnNisa = 0;
    const sellTaxable = (amount: number) => {
      const sold = Math.min(taxable, amount);
      taxable -= sold;
      cash += sold;
      withdrawnTaxable += sold;
      return sold;
    };
    const sellNisa = (amount: number) => {
      const prevBalance = nisa.balance;
      const sold = Math.min(prevBalance, amount);
      nisa = { ...nisa, balance: prevBalance - sold };
      // 元本は平均取得単価方式で残高比例に減額し、減額分（簿価）は翌年の枠復活に回す
      if (prevBalance > 0) {
        const prevPrincipal = nisaPrincipal;
        nisaPrincipal = Math.floor((nisaPrincipal * nisa.balance) / prevBalance);
        nisaRestoreCarry += prevPrincipal - nisaPrincipal;
      }
      cash += sold;
      withdrawnNisa += sold;
      return sold;
    };

    // 1) 定率取り崩し: 取り崩し期はその年の現金不足額を、残高合計×取り崩し率を上限に
    //    課税口座→NISAの順に現金化する（非課税のNISAを温存するFPの定石順）。
    //    年金等で不足がない年は売らない（上限を無条件に売ると使わない現金だけが積み上がるため）
    if (drawdownActive) {
      const rate = input.accounts.drawdownRate ?? 0;
      const ceiling = Math.floor((taxable + nisa.balance) * rate);
      let planned = Math.min(ceiling, Math.max(0, -cash));
      planned -= sellTaxable(planned);
      sellNisa(planned);
    }

    // 2) 安全網: それでも現金が不足する年は不足分を追加で売却する（開始前でも働く）
    if (cash < 0) {
      sellTaxable(-cash);
    }
    if (cash < 0) {
      sellNisa(-cash);
    }

    if (cash < 0 && !negativeCashWarned) {
      warnings.push(`${year}年に資産を取り崩しても現金残高がマイナスになる`);
      negativeCashWarned = true;
    }

    const idecoTotal = idecoBalances.reduce((a, b) => a + b, 0);
    years.push({
      year,
      adultAges,
      income: {
        salary: grossSalary.reduce((a, b) => a + b, 0),
        business: businessIncome.reduce((a, b) => a + b, 0),
        pension: pensionRevenue.reduce((a, b) => a + b, 0),
        severanceNet,
        idecoNet,
        childAllowance,
        eventIncome,
        total: grossIncomeTotal + severanceNet + idecoNet + childAllowance + eventIncome,
      },
      taxes: {
        incomeTax: incomeTaxTotal,
        residentTax: residentTaxTotal,
        capitalGainsTax: taxableStep.taxPaid,
        retirementTax,
        total: incomeTaxTotal + residentTaxTotal + taxableStep.taxPaid + retirementTax,
      },
      social: {
        employee: employeeSi.reduce((a, b) => a + b, 0),
        nationalPension: nationalPension.reduce((a, b) => a + b, 0),
        nhi: nhi.total,
        care1,
        latterElderly,
        total: socialTotal,
      },
      expenses: {
        living,
        education,
        rent,
        housing: housingExpense,
        debts: debtPayments,
        events: eventExpense,
        total: expenseTotal,
      },
      contributions: {
        taxable: taxableContribution,
        nisa: nisaStep.accepted,
        ideco: idecoContribTotal,
      },
      withdrawals: { taxable: withdrawnTaxable, nisa: withdrawnNisa },
      cashflow,
      netIncome:
        grossIncomeTotal +
        severanceNet +
        idecoNet +
        childAllowance +
        eventIncome -
        incomeTaxTotal -
        residentTaxTotal -
        socialTotal,
      assets: {
        cash,
        taxable,
        nisa: nisa.balance,
        nisaPrincipal,
        ideco: idecoTotal,
        total: cash + taxable + nisa.balance + idecoTotal,
      },
    });
  }

  return { years, warnings };
}
