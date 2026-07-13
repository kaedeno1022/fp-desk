import { describe, expect, it } from "vitest";
import { childAllowanceAnnual } from "./child-allowance";
import { loadTaxTables } from "./tables";

const t = loadTaxTables();

describe("childAllowanceAnnual", () => {
  it("3歳未満は月1.5万円、3歳〜高校生は月1万円", () => {
    expect(childAllowanceAnnual([2], t)).toBe(180_000);
    expect(childAllowanceAnnual([10], t)).toBe(120_000);
  });

  it("第3子以降は月3万円（22歳以下の子でカウント）", () => {
    // 20歳: カウント第1子（支給なし）、16歳: 第2子 12万、10歳: 第3子 36万
    expect(childAllowanceAnnual([20, 16, 10], t)).toBe(120_000 + 360_000);
  });

  it("23歳以上はカウントからも外れる", () => {
    // 16歳が第1子、10歳が第2子 → どちらも月1万円
    expect(childAllowanceAnnual([23, 16, 10], t)).toBe(240_000);
  });

  it("19〜22歳はカウントには入るが支給はない", () => {
    expect(childAllowanceAnnual([19], t)).toBe(0);
  });

  it("子がいなければ0", () => {
    expect(childAllowanceAnnual([], t)).toBe(0);
  });
});
