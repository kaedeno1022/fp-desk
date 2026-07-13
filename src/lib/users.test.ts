import { beforeAll, describe, expect, it } from "vitest";

// DBモジュールはインポート時に接続を張るため、環境変数を先に設定してから動的に読み込む
process.env.DATABASE_PATH = ":memory:";

let users: typeof import("./users");

beforeAll(async () => {
  users = await import("./users");
});

describe("users", () => {
  it("作成したユーザーをメールアドレスとIDで取得できる", () => {
    const created = users.createUser("taro@example.com", "hash1");
    expect(users.getUserByEmail("taro@example.com")?.id).toBe(created.id);
    expect(users.getUserById(created.id)?.email).toBe("taro@example.com");
  });

  it("countUsers が登録数を返す", () => {
    expect(users.countUsers()).toBe(1);
    users.createUser("hanako@example.com", "hash2");
    expect(users.countUsers()).toBe(2);
  });

  it("メールアドレスの重複はUNIQUE制約で拒否される", () => {
    expect(() => users.createUser("taro@example.com", "hash3")).toThrow();
  });

  it("存在しないユーザーはundefined", () => {
    expect(users.getUserByEmail("nobody@example.com")).toBeUndefined();
    expect(users.getUserById("no-such-id")).toBeUndefined();
  });
});
