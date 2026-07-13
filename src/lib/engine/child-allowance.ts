// 児童手当（令和6年10月改正後: 所得制限なし・高校生年代まで・第3子以降増額）
import type { TaxTables } from "./tables";

/**
 * 世帯の児童手当年額。
 * 第3子判定は countAgeMax（22歳年度末）以下の子を年長順に数える。
 * 年度末基準は年齢で近似する（月次の失権タイミングは扱わない）。非課税
 */
export function childAllowanceAnnual(childAges: number[], t: TaxTables): number {
  const ca = t.childAllowance;
  const countable = childAges
    .filter((a) => a >= 0 && a <= ca.countAgeMax)
    .sort((a, b) => b - a);

  let total = 0;
  countable.forEach((age, idx) => {
    if (age > ca.supportAgeMax) return; // 支給は高校生年代まで（多子カウントには含む）
    const monthly =
      idx >= 2 ? ca.thirdChildMonthly : age < 3 ? ca.under3Monthly : ca.standardMonthly;
    total += monthly * 12;
  });
  return total;
}
