import { describe, expect, it } from "vitest";
import { createDefaultInput, normalizeInput, type SimulationInput } from "./input";

describe("normalizeInput", () => {
  it("旧スキーマの保存データに新フィールドを補完する", () => {
    const old = createDefaultInput();
    // 旧バージョンの保存データを再現: 新フィールドを欠落させる
    const raw = JSON.parse(JSON.stringify(old)) as Record<string, unknown>;
    delete raw.debts;
    delete raw.livingExpenseChanges;
    delete (raw.accounts as Record<string, unknown>).drawdownStartYear;
    delete (raw.accounts as Record<string, unknown>).drawdownRate;

    const normalized = normalizeInput(raw as unknown as SimulationInput);
    expect(normalized.debts).toEqual([]);
    expect(normalized.livingExpenseChanges).toEqual([]);
    expect(normalized.accounts.drawdownStartYear).toBeNull();
    expect(normalized.accounts.drawdownRate).toBe(0.04);
  });

  it("保存済みの値は上書きしない", () => {
    const input = createDefaultInput();
    input.livingExpenseAnnual = 9_999_999;
    input.accounts.drawdownRate = 0.03;
    const normalized = normalizeInput(JSON.parse(JSON.stringify(input)));
    expect(normalized.livingExpenseAnnual).toBe(9_999_999);
    expect(normalized.accounts.drawdownRate).toBe(0.03);
  });
});
