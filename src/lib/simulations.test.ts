import { beforeAll, describe, expect, it } from "vitest";
import { createDefaultInput } from "@/lib/engine/input";

process.env.DATABASE_PATH = ":memory:";

let users: typeof import("./users");
let sims: typeof import("./simulations");
let userId: string;
let otherUserId: string;

beforeAll(async () => {
  users = await import("./users");
  sims = await import("./simulations");
  userId = users.createUser("owner@example.com", "hash").id;
  otherUserId = users.createUser("other@example.com", "hash").id;
});

describe("simulations CRUD", () => {
  it("作成・取得・一覧・更新・削除が一巡する", () => {
    const input = createDefaultInput();
    const id = sims.createSimulation(userId, "案件A", input);

    const row = sims.getSimulation(id, userId);
    expect(row?.name).toBe("案件A");
    expect(JSON.parse(row!.input_json).years).toBe(input.years);

    expect(sims.listSimulations(userId).map((s) => s.id)).toContain(id);

    const modified = { ...input, years: 30 };
    expect(sims.updateSimulation(id, userId, "案件A改", modified)).toBe(true);
    expect(sims.getSimulation(id, userId)?.name).toBe("案件A改");

    expect(sims.deleteSimulation(id, userId)).toBe(true);
    expect(sims.getSimulation(id, userId)).toBeUndefined();
  });

  it("他ユーザーのシミュレーションにはアクセスできない", () => {
    const id = sims.createSimulation(userId, "本人のみ", createDefaultInput());
    expect(sims.getSimulation(id, otherUserId)).toBeUndefined();
    expect(sims.updateSimulation(id, otherUserId, "改竄", createDefaultInput())).toBe(false);
    expect(sims.deleteSimulation(id, otherUserId)).toBe(false);
    expect(sims.listSimulations(otherUserId)).toHaveLength(0);
  });
});
