// ヒアリングウィザードの回答 → シミュレーション入力への変換（DOMAIN対象外の入口機能）。
// 顧客が答えられる質問だけを聞き、FP側の設定（自治体料率・控除区分・ボラティリティ等)は
// 既定値のまま生成する。生成後にエディタで調整する前提
import { createDefaultInput, createDefaultPerson, type SimulationInput } from "./input";

/** ウィザードの回答。キーは質問ID */
export type InterviewAnswers = Record<string, string | number>;

function num(a: InterviewAnswers, key: string, fallback = 0): number {
  const v = Number(a[key]);
  return Number.isFinite(v) ? v : fallback;
}

function man(a: InterviewAnswers, key: string, fallback = 0): number {
  return Math.round(num(a, key, fallback) * 10000);
}

/**
 * 回答からシミュレーション入力を組み立てる。
 * 判断を伴う既定値: 配偶者の年金は基礎年金相当80万円/年、購入ローンは固定1.5%・35年・省エネ基準。
 * いずれもエディタでの調整を前提とした初期値
 */
export function buildInputFromInterview(answers: InterviewAnswers): SimulationInput {
  const input = createDefaultInput();
  const startYear = input.startYear;

  // --- 本人 ---
  const self = createDefaultPerson("本人", num(answers, "selfBirthYear", startYear - 35));
  self.employment =
    (answers.selfWork as "employee" | "selfEmployed" | "none") ?? "employee";
  self.grossAnnual = self.employment === "none" ? 0 : man(answers, "selfIncome");
  self.retirementAge = num(answers, "selfRetireAge", 65);
  self.severancePay = self.employment === "employee" ? man(answers, "selfSeverance") : 0;
  // 勤続年数は22歳就職と仮定した概算（退職所得控除に影響。エディタで調整可能）
  self.serviceYearsAtRetirement = Math.max(1, self.retirementAge - 22);
  self.pensionAnnual = man(answers, "pensionAnnual", 180);
  self.idecoInitialBalance = man(answers, "idecoBalance");
  self.idecoAnnualContribution = man(answers, "idecoMonthly") * 12;
  self.lifeInsurancePremiums = { general: man(answers, "lifeInsurance"), medical: 0, pension: 0 };
  input.adults = [self];

  // --- 配偶者 ---
  if (answers.hasSpouse === "yes") {
    const spouse = createDefaultPerson(
      "配偶者",
      num(answers, "spouseBirthYear", num(answers, "selfBirthYear", startYear - 35))
    );
    spouse.employment =
      (answers.spouseWork as "employee" | "selfEmployed" | "none") ?? "none";
    spouse.grossAnnual = spouse.employment === "none" ? 0 : man(answers, "spouseIncome");
    spouse.severancePay = 0;
    // 配偶者の年金は基礎年金相当の概算。ねんきん定期便を見てエディタで調整する
    spouse.pensionAnnual = 800_000;
    input.adults.push(spouse);
  }

  // --- 子ども ---
  const childCount = num(answers, "childCount");
  input.children = Array.from({ length: childCount }, (_, i) => ({
    name: `子${i + 1}`,
    birthYear: num(answers, `child${i + 1}Year`, startYear),
    educationPlan: {
      kindergarten: "public" as const,
      elementary: "public" as const,
      juniorHigh: "public" as const,
      highSchool: "public" as const,
      university: "national" as const,
    },
  }));

  // --- 住居 ---
  const housingStatus = answers.housingStatus as string;
  if (housingStatus === "rent") {
    input.rentAnnual = man(answers, "rentMonthly") * 12;
    if (answers.planPurchase === "yes") {
      const price = man(answers, "purchasePrice", 4000);
      const down = man(answers, "downPayment", 1000);
      input.housing = {
        purchaseYear: startYear + num(answers, "purchaseInYears", 3),
        price,
        loanPrincipal: Math.max(0, price - down),
        loanAnnualRate: 0.015,
        loanYears: 35,
        loanMethod: "annuity",
        creditPresetKey: "newEnergySaving",
      };
    } else {
      input.housing = null;
    }
  } else {
    input.rentAnnual = 0;
    input.housing = null;
    if (housingStatus === "loan") {
      input.debts.push({
        label: "住宅ローン（返済中）",
        balance: man(answers, "loanBalance"),
        annualRate: num(answers, "loanRate", 1) / 100,
        remainingYears: num(answers, "loanYearsLeft", 20),
      });
    }
  }

  // --- 住宅ローン以外の借入（最大2件。3件以上はエディタで追加） ---
  const debtLabels: Record<string, string> = {
    scholarship: "奨学金",
    car: "自動車ローン",
    other: "その他の借入",
  };
  for (const k of [1, 2]) {
    if (answers[`hasDebt${k}`] !== "yes") continue;
    input.debts.push({
      label: debtLabels[String(answers[`debt${k}Type`])] ?? "その他の借入",
      balance: man(answers, `debt${k}Balance`),
      annualRate: num(answers, `debt${k}Rate`) / 100,
      remainingYears: Math.max(1, num(answers, `debt${k}YearsLeft`, 10)),
    });
  }

  // --- 生活費・資産 ---
  input.livingExpenseAnnual = man(answers, "livingMonthly", 20) * 12;
  input.accounts.cashInitial = man(answers, "cashSavings");
  input.accounts.nisaInitial = man(answers, "nisaBalance");
  // 簿価は残高と同額とみなす（含み益の内訳は不明のため。エディタで調整可能）
  input.accounts.nisaInitialContributed = man(answers, "nisaBalance");
  input.accounts.nisaAnnualContribution = man(answers, "nisaAnnual");

  return input;
}

/** シミュレーション名。顧客名があれば「◯◯様」、なければ日付ベース */
export function interviewSimulationName(answers: InterviewAnswers): string {
  const name = String(answers.clientName ?? "").trim();
  if (name) return `${name}様`;
  return `ヒアリング ${new Date().toISOString().slice(0, 10)}`;
}
