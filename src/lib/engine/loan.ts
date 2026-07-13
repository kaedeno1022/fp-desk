// 住宅ローンの償還計算と住宅ローン控除（DOMAIN.md §5.1・§5.2）
import { floorTo } from "./rounding";
import type { TaxTables } from "./tables";

export type LoanMethod = "annuity" | "equalPrincipal";

export type LoanPlan = {
  principal: number;
  /** 年利（0.01 = 1%）。固定金利のみ */
  annualRate: number;
  years: number;
  method: LoanMethod;
};

export type LoanYearRow = {
  /** 返済開始からの経過年（0始まり） */
  yearIndex: number;
  payment: number;
  principalPaid: number;
  interestPaid: number;
  balanceEnd: number;
};

/** 月次で償還計算し年次集計する */
export function amortizeLoan(plan: LoanPlan): LoanYearRow[] {
  const months = plan.years * 12;
  const r = plan.annualRate / 12;
  let balance = plan.principal;
  const rows: LoanYearRow[] = [];

  // 毎月返済額は円未満切捨て（銀行実務に合わせる）。端数は最終回で精算する
  const annuityPayment =
    r === 0
      ? Math.floor(plan.principal / months)
      : Math.floor((plan.principal * r) / (1 - Math.pow(1 + r, -months)));
  const monthlyPrincipal = Math.floor(plan.principal / months);

  for (let y = 0; y < plan.years; y++) {
    let payment = 0;
    let principalPaid = 0;
    let interestPaid = 0;
    for (let m = 0; m < 12; m++) {
      if (balance <= 0) break;
      const interest = Math.round(balance * r);
      const isFinalMonth = y === plan.years - 1 && m === 11;
      let principalPart: number;
      if (isFinalMonth) {
        principalPart = balance;
      } else if (plan.method === "annuity") {
        principalPart = Math.min(annuityPayment - interest, balance);
      } else {
        principalPart = Math.min(monthlyPrincipal, balance);
      }
      balance -= principalPart;
      payment += principalPart + interest;
      principalPaid += principalPart;
      interestPaid += interest;
    }
    rows.push({ yearIndex: y, payment, principalPaid, interestPaid, balanceEnd: balance });
  }
  return rows;
}

/**
 * 住宅ローン控除の理論額（年末残高×控除率、借入限度額でキャップ、100円未満切捨て）。
 * yearsSinceMoveIn が控除期間を超えていれば0
 */
export function housingLoanCreditForYear(
  yearEndBalance: number,
  presetKey: string,
  yearsSinceMoveIn: number,
  t: TaxTables
): number {
  const preset = t.housingLoanCredit.presets.find((p) => p.key === presetKey);
  if (!preset) return 0;
  if (yearsSinceMoveIn < 0 || yearsSinceMoveIn >= preset.years) return 0;
  if (yearEndBalance <= 0) return 0;
  const base = Math.min(yearEndBalance, preset.loanLimit);
  return floorTo(base * t.housingLoanCredit.creditRate, 100);
}
