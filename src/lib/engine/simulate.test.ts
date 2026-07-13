import { describe, expect, it } from "vitest";
import { createDefaultInput, type SimulationInput } from "./input";
import { simulate } from "./simulate";
import { loadTaxTables } from "./tables";

const t = loadTaxTables();

function baseInput(): SimulationInput {
  const input = createDefaultInput();
  input.startYear = 2026;
  input.adults[0].birthYear = 1991; // 2026年に35歳
  return input;
}

describe("simulate（会社員の生涯）", () => {
  const result = simulate(baseInput(), t);

  it("初年度: 給与収入があり所得税・住民税・社保が発生する", () => {
    const y0 = result.years[0];
    expect(y0.income.salary).toBe(5_000_000);
    expect(y0.taxes.incomeTax).toBeGreaterThan(0);
    expect(y0.taxes.residentTax).toBeGreaterThan(0);
    expect(y0.social.employee).toBeGreaterThan(0);
    expect(y0.social.nhi).toBe(0);
  });

  it("65歳（退職年）: 給与が消え、退職金と年金受給が始まる", () => {
    const y30 = result.years[30]; // 2056年、65歳
    expect(y30.adultAges[0]).toBe(65);
    expect(y30.income.salary).toBe(0);
    // 退職金1,000万・勤続40年 → 控除2,200万内で非課税
    expect(y30.income.severanceNet).toBe(10_000_000);
    expect(y30.income.pension).toBe(1_800_000);
  });

  it("退職後74歳まで: 国保・介護1号に切り替わる", () => {
    const y35 = result.years[35]; // 70歳
    expect(y35.social.employee).toBe(0);
    expect(y35.social.nhi).toBeGreaterThan(0);
    expect(y35.social.care1).toBeGreaterThan(0);
    expect(y35.social.latterElderly).toBe(0);
  });

  it("75歳以降: 国保から後期高齢者医療に移行する", () => {
    const y40 = result.years[40]; // 75歳
    expect(y40.social.nhi).toBe(0);
    expect(y40.social.latterElderly).toBeGreaterThan(0);
  });
});

describe("住民税の1年ズレ", () => {
  it("退職翌年は無収入でも前年所得の住民税が発生し、翌々年は消える", () => {
    const input = baseInput();
    input.adults[0].birthYear = 2026 - 64; // 初年度64歳
    input.adults[0].retirementAge = 65;
    input.adults[0].severancePay = 0;
    input.adults[0].pensionAnnual = 0;
    input.years = 3;
    const r = simulate(input, t);

    expect(r.years[0].income.salary).toBeGreaterThan(0);
    expect(r.years[1].income.total).toBe(0);
    expect(r.years[1].taxes.residentTax).toBeGreaterThan(100_000);
    expect(r.years[2].taxes.residentTax).toBe(0);
  });
});

describe("iDeCo", () => {
  it("拠出は所得控除として所得税を下げる", () => {
    const without = simulate(baseInput(), t);
    const input = baseInput();
    input.adults[0].idecoAnnualContribution = 276_000;
    const withIdeco = simulate(input, t);
    expect(withIdeco.years[0].taxes.incomeTax).toBeLessThan(without.years[0].taxes.incomeTax);
  });

  it("60歳で一時金として受け取り、以降残高は0", () => {
    const input = baseInput();
    input.adults[0].idecoAnnualContribution = 276_000;
    const r = simulate(input, t);
    const y25 = r.years[25]; // 60歳
    expect(y25.income.idecoNet).toBeGreaterThan(0);
    expect(r.years[26].assets.ideco).toBe(0);
    expect(r.years[26].contributions.ideco).toBe(0);
  });
});

describe("住宅購入", () => {
  function withHousing(creditPresetKey: string): SimulationInput {
    const input = baseInput();
    input.housing = {
      purchaseYear: 2028,
      price: 40_000_000,
      loanPrincipal: 30_000_000,
      loanAnnualRate: 0.01,
      loanYears: 35,
      loanMethod: "annuity",
      creditPresetKey,
    };
    return input;
  }

  it("購入年に頭金+返済、購入後は家賃が消える", () => {
    const r = simulate(withHousing("newCertified"), t);
    expect(r.years[1].expenses.rent).toBeGreaterThan(0);
    expect(r.years[2].expenses.rent).toBe(0);
    // 頭金1,000万 + 年間返済1,016,220
    expect(r.years[2].expenses.housing).toBe(11_016_220);
  });

  it("住宅ローン控除が所得税を下げる", () => {
    const withCredit = simulate(withHousing("newCertified"), t);
    const noCredit = simulate(withHousing("unknown"), t);
    expect(withCredit.years[2].taxes.incomeTax).toBeLessThan(noCredit.years[2].taxes.incomeTax);
  });
});

describe("教育費・警告", () => {
  it("子の年齢に応じた教育費が計上される", () => {
    const input = baseInput();
    input.children = [
      {
        name: "子1",
        birthYear: 2020, // 2026年に6歳
        educationPlan: {
          kindergarten: "public",
          elementary: "public",
          juniorHigh: "public",
          highSchool: "public",
          university: "national",
        },
      },
    ];
    const r = simulate(input, t);
    expect(r.years[0].expenses.education).toBe(350_000);
  });

  it("現金がマイナスになる年に警告が出る", () => {
    const input = baseInput();
    input.livingExpenseAnnual = 10_000_000;
    input.years = 10;
    const r = simulate(input, t);
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.warnings[0]).toMatch(/現金残高がマイナス/);
  });
});

describe("定率取り崩し", () => {
  it("退職して労働収入がなくなった年から積立が止まり、残高×取り崩し率が現金化される", () => {
    const input = baseInput();
    input.adults[0] = {
      ...input.adults[0],
      birthYear: 2026 - 63, // 2028年に65歳で退職
      retirementAge: 65,
      severancePay: 0,
      pensionStartAge: 65,
      pensionAnnual: 5_000_000, // 生活費を賄える年金にして安全網売却を発生させない
    };
    input.accounts.taxableAnnualContribution = 600_000;
    input.accounts.nisaAnnualContribution = 400_000;
    input.accounts.taxableInitial = 10_000_000;
    input.accounts.taxableRate = 0;
    input.accounts.nisaRate = 0;
    input.accounts.drawdownRate = 0.04;
    input.years = 4;
    const r = simulate(input, t);

    // 就労中は積立が続き、取り崩しはない
    expect(r.years[0].contributions.taxable).toBe(600_000);
    expect(r.years[1].contributions.nisa).toBe(400_000);
    expect(r.years[1].withdrawals.taxable).toBe(0);

    // 退職年: 積立0、(課税1,120万+NISA80万)×4% = 48万を課税口座から取り崩す
    expect(r.years[2].income.salary).toBe(0);
    expect(r.years[2].contributions.taxable).toBe(0);
    expect(r.years[2].contributions.nisa).toBe(0);
    expect(r.years[2].withdrawals.taxable).toBe(480_000);
    expect(r.years[2].withdrawals.nisa).toBe(0);
  });

  it("課税口座の残高が足りない分はNISAから取り崩される", () => {
    const input = baseInput();
    // 労働収入なし → 初年度から取り崩し期。現金・生活費は安全網が働かない条件にする
    input.adults[0] = {
      ...input.adults[0],
      employment: "none",
      grossAnnual: 0,
      severancePay: 0,
    };
    input.livingExpenseAnnual = 0;
    input.rentAnnual = 0;
    input.accounts.cashInitial = 5_000_000;
    input.accounts.taxableInitial = 100_000;
    input.accounts.taxableRate = 0;
    input.accounts.nisaInitial = 9_900_000;
    input.accounts.nisaInitialContributed = 9_900_000;
    input.accounts.nisaRate = 0;
    input.accounts.drawdownRate = 0.04;
    input.years = 1;
    const r = simulate(input, t);

    // (10万+990万)×4% = 40万 → 課税10万 + NISA30万
    expect(r.years[0].withdrawals.taxable).toBe(100_000);
    expect(r.years[0].withdrawals.nisa).toBe(300_000);
  });

  it("NISAの積立は生涯枠1,800万円に達すると自動で止まる", () => {
    const input = baseInput();
    input.adults[0].grossAnnual = 30_000_000;
    input.accounts.nisaAnnualContribution = 3_600_000;
    input.accounts.nisaRate = 0;
    input.years = 7;
    const r = simulate(input, t);

    // 360万×5年 = 1,800万で生涯枠を使い切り、6年目からは積立0
    expect(r.years[4].contributions.nisa).toBe(3_600_000);
    expect(r.years[5].contributions.nisa).toBe(0);
    expect(r.years[6].assets.nisa).toBe(18_000_000);
  });

  it("現金不足の年は課税口座→NISAの順に取り崩され、現金は0以上に保たれる", () => {
    const input = baseInput();
    // 無収入で生活費だけが出ていく世帯: 現金50万 → 課税300万 → NISA300万 の順に減るはず
    input.adults[0] = {
      ...input.adults[0],
      employment: "none",
      grossAnnual: 0,
      severancePay: 0,
      pensionAnnual: 0,
    };
    input.livingExpenseAnnual = 1_000_000;
    input.rentAnnual = 0;
    input.inflationRate = 0;
    input.accounts = {
      ...input.accounts,
      cashInitial: 500_000,
      taxableInitial: 3_000_000,
      taxableRate: 0,
      nisaInitial: 3_000_000,
      nisaInitialContributed: 3_000_000,
      nisaRate: 0,
      cashRate: 0,
    };
    input.years = 8;
    const r = simulate(input, t);

    // 初年度から取り崩しが発生し、課税口座が先に減る
    expect(r.years[0].withdrawals.taxable).toBeGreaterThan(0);
    expect(r.years[0].withdrawals.nisa).toBe(0);
    expect(r.years[0].assets.cash).toBe(0);

    // NISAの取り崩しが始まる年には課税口座は空になっている
    const firstNisaDraw = r.years.find((y) => y.withdrawals.nisa > 0);
    expect(firstNisaDraw).toBeDefined();
    expect(firstNisaDraw!.assets.taxable).toBe(0);

    // 資産が尽きるまでは現金がマイナスにならない
    for (const y of r.years) {
      if (y.assets.taxable > 0 || y.assets.nisa > 0) {
        expect(y.assets.cash).toBeGreaterThanOrEqual(0);
      }
    }

    // 全資産が尽きた後は警告が出る
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.warnings[0]).toMatch(/取り崩しても現金残高がマイナス/);
  });
});

describe("年収の変更（賃金カーブ）", () => {
  it("指定年齢以降は成長率を適用せず変更額をそのまま使う", () => {
    const input = baseInput();
    input.adults[0] = {
      ...input.adults[0],
      birthYear: 2026 - 53, // 初年度53歳
      incomeGrowthRate: 0.02,
      incomeChanges: [
        { fromAge: 55, annual: 6_000_000 }, // 役職定年
        { fromAge: 60, annual: 4_000_000 }, // 再雇用
      ],
    };
    input.years = 13;
    const r = simulate(input, t);

    // 54歳まで: 成長率で複利
    expect(r.years[1].income.salary).toBe(Math.floor(5_000_000 * 1.02));
    // 55歳から: 600万固定（成長しない）
    expect(r.years[2].income.salary).toBe(6_000_000);
    expect(r.years[4].income.salary).toBe(6_000_000);
    // 60歳から: 400万固定
    expect(r.years[7].income.salary).toBe(4_000_000);
    // 65歳（2038年、index 12）: 退職して給与0
    expect(r.years[12].income.salary).toBe(0);
  });
});

describe("借入（奨学金等）", () => {
  it("元利均等で完済まで年間返済額が支出に計上される", () => {
    const input = baseInput();
    input.debts = [{ label: "奨学金", balance: 2_400_000, annualRate: 0, remainingYears: 10 }];
    input.years = 12;
    const r = simulate(input, t);

    // 240万・無利子・10年 → 24万/年
    expect(r.years[0].expenses.debts).toBe(240_000);
    expect(r.years[9].expenses.debts).toBe(240_000);
    expect(r.years[10].expenses.debts).toBe(0);
  });
});

describe("生活費の変更", () => {
  it("指定年以降は変更後の基礎生活費が使われる", () => {
    const input = baseInput();
    input.inflationRate = 0;
    input.livingExpenseAnnual = 2_400_000;
    input.livingExpenseChanges = [{ fromYear: 2030, annual: 3_000_000 }];
    input.years = 6;
    const r = simulate(input, t);

    expect(r.years[3].expenses.living).toBe(2_400_000); // 2029年
    expect(r.years[4].expenses.living).toBe(3_000_000); // 2030年
    expect(r.years[5].expenses.living).toBe(3_000_000);
  });
});

describe("取り崩し開始年の指定", () => {
  it("指定すると就労中でもその年から取り崩し期に入る", () => {
    const input = baseInput();
    input.accounts.taxableInitial = 10_000_000;
    input.accounts.taxableRate = 0;
    input.accounts.taxableAnnualContribution = 600_000;
    input.accounts.drawdownStartYear = 2028;
    input.years = 4;
    const r = simulate(input, t);

    expect(r.years[1].contributions.taxable).toBe(600_000);
    expect(r.years[1].withdrawals.taxable).toBe(0);
    // 2028年: 就労中（給与あり）でも積立停止+定率取り崩し
    expect(r.years[2].income.salary).toBeGreaterThan(0);
    expect(r.years[2].contributions.taxable).toBe(0);
    expect(r.years[2].withdrawals.taxable).toBeGreaterThan(0);
  });

  it("指定すると退職後も指定年までは定率取り崩しをしない", () => {
    const input = baseInput();
    input.adults[0] = {
      ...input.adults[0],
      birthYear: 2026 - 64, // 2027年に65歳で退職
      retirementAge: 65,
      severancePay: 0,
      pensionAnnual: 5_000_000, // 生活費を賄える年金で安全網売却を防ぐ
    };
    input.accounts.taxableInitial = 10_000_000;
    input.accounts.taxableRate = 0;
    input.accounts.drawdownStartYear = 2030;
    input.years = 6;
    const r = simulate(input, t);

    // 退職後（2027〜2029年）も定率取り崩しは始まらない
    expect(r.years[2].income.salary).toBe(0);
    expect(r.years[2].withdrawals.taxable).toBe(0);
    expect(r.years[3].withdrawals.taxable).toBe(0);
    // 2030年から定率取り崩し
    expect(r.years[4].withdrawals.taxable).toBe(400_000);
  });
});

describe("NISA生涯枠の復活", () => {
  it("就労中の安全網売却で売った簿価分が翌年の生涯枠に復活し、積立を継続できる", () => {
    const input = baseInput();
    // 生涯枠1,800万を使い切った状態で大きな支出→安全網がNISAを売却→翌年に枠が戻る
    input.adults[0] = { ...input.adults[0], grossAnnual: 10_000_000 };
    input.livingExpenseAnnual = 0;
    input.rentAnnual = 0;
    input.events = [{ year: 2026, label: "大型支出", amount: 20_000_000 }];
    input.accounts = {
      ...input.accounts,
      cashInitial: 0,
      taxableInitial: 0,
      nisaInitial: 18_000_000,
      nisaInitialContributed: 18_000_000,
      nisaRate: 0,
      nisaAnnualContribution: 3_600_000,
    };
    input.years = 2;
    const r = simulate(input, t);

    // y0: 枠満杯のため積立は受け入れられず、現金不足でNISAが売却される
    expect(r.years[0].contributions.nisa).toBe(0);
    expect(r.years[0].withdrawals.nisa).toBeGreaterThan(3_600_000);

    // y1: 復活した枠により年間上限いっぱいまで積立できる
    expect(r.years[1].contributions.nisa).toBe(3_600_000);
  });
});

describe("NISA元本の追跡", () => {
  it("積立で増え、運用益では増えない", () => {
    const input = baseInput();
    input.accounts.nisaAnnualContribution = 1_000_000;
    input.accounts.nisaRate = 0.1;
    input.years = 2;
    const r = simulate(input, t);

    expect(r.years[0].assets.nisa).toBe(1_000_000);
    expect(r.years[0].assets.nisaPrincipal).toBe(1_000_000);
    // 残高は 100万×1.1 + 100万 = 210万に増えるが元本は200万
    expect(r.years[1].assets.nisa).toBe(2_100_000);
    expect(r.years[1].assets.nisaPrincipal).toBe(2_000_000);
  });

  it("売却時は平均取得単価方式で元本が比例減額される", () => {
    const input = baseInput();
    input.adults[0] = {
      ...input.adults[0],
      employment: "none",
      grossAnnual: 0,
      severancePay: 0,
    };
    input.livingExpenseAnnual = 0;
    input.rentAnnual = 0;
    input.accounts = {
      ...input.accounts,
      cashInitial: 5_000_000,
      taxableInitial: 0,
      nisaInitial: 10_000_000,
      nisaInitialContributed: 6_000_000,
      nisaRate: 0,
      drawdownRate: 0.1,
    };
    input.years = 1;
    const r = simulate(input, t);

    // 残高1,000万(元本600万)から100万売却 → 残高900万・元本540万
    expect(r.years[0].withdrawals.nisa).toBe(1_000_000);
    expect(r.years[0].assets.nisa).toBe(9_000_000);
    expect(r.years[0].assets.nisaPrincipal).toBe(5_400_000);
  });
});

describe("共働き世帯", () => {
  it("夫婦それぞれに税・社保が計算される（片働きより世帯税額が大きい）", () => {
    const single = baseInput();
    single.adults[0].grossAnnual = 10_000_000;

    const dual = baseInput();
    dual.adults = [
      { ...dual.adults[0], grossAnnual: 5_000_000 },
      { ...createDefaultInput().adults[0], name: "配偶者", birthYear: 1991, grossAnnual: 5_000_000 },
    ];

    const rs = simulate(single, t);
    const rd = simulate(dual, t);
    // 累進課税のため同じ世帯年収1,000万でも共働きの方が税負担は軽い
    expect(rd.years[0].taxes.incomeTax).toBeLessThan(rs.years[0].taxes.incomeTax);
    expect(rd.years[0].social.employee).toBeGreaterThan(0);
  });

  it("片働き配偶者は被扶養者として社保負担なし・配偶者控除が効く", () => {
    const withSpouse = baseInput();
    withSpouse.adults = [
      withSpouse.adults[0],
      { ...createDefaultInput().adults[0], name: "配偶者", birthYear: 1991, grossAnnual: 0, employment: "none", pensionAnnual: 800_000, severancePay: 0 },
    ];
    const alone = baseInput();

    const rs = simulate(withSpouse, t);
    const ra = simulate(alone, t);
    // 配偶者控除の分だけ所得税が下がる。国民年金・国保の追加負担は発生しない（被扶養）
    expect(rs.years[0].taxes.incomeTax).toBeLessThan(ra.years[0].taxes.incomeTax);
    expect(rs.years[0].social.nationalPension).toBe(0);
    expect(rs.years[0].social.nhi).toBe(0);
  });
});
