// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { createDefaultInput } from "@/lib/engine/input";
import {
  createSimulation,
  deleteSimulation,
  getSimulation,
  listSimulations,
  updateSimulation,
} from "./simulations";

beforeEach(() => {
  localStorage.clear();
});

describe("simulations CRUD", () => {
  it("作成・取得・一覧・更新・削除が一巡する", () => {
    const input = createDefaultInput();
    const id = createSimulation("案件A", input);

    const record = getSimulation(id);
    expect(record?.name).toBe("案件A");
    expect(record?.input.years).toBe(input.years);

    expect(listSimulations().map((s) => s.id)).toContain(id);

    const modified = { ...input, years: 30 };
    expect(updateSimulation(id, "案件A改", modified)).toBe(true);
    expect(getSimulation(id)?.name).toBe("案件A改");

    expect(deleteSimulation(id)).toBe(true);
    expect(getSimulation(id)).toBeUndefined();
  });

  it("存在しないIDへの更新・削除はfalseを返す", () => {
    expect(updateSimulation("no-such-id", "改竄", createDefaultInput())).toBe(false);
    expect(deleteSimulation("no-such-id")).toBe(false);
  });
});
