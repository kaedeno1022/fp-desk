import { SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { verifySessionToken } from "./session";

const SECRET = "test-secret-for-session-tests";

function key(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

beforeAll(() => {
  process.env.SESSION_SECRET = SECRET;
});

async function sign(payload: Record<string, unknown>, opts?: { secret?: string; expiresIn?: string }) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(opts?.expiresIn ?? "1h")
    .sign(key(opts?.secret ?? SECRET));
}

describe("verifySessionToken", () => {
  it("正しい署名のトークンからuserIdを取り出せる", async () => {
    const token = await sign({ userId: "user-1" });
    expect(await verifySessionToken(token)).toEqual({ userId: "user-1" });
  });

  it("別のシークレットで署名されたトークンは拒否される", async () => {
    const token = await sign({ userId: "user-1" }, { secret: "attacker-secret" });
    expect(await verifySessionToken(token)).toBeNull();
  });

  it("期限切れトークンは拒否される", async () => {
    const token = await sign({ userId: "user-1" }, { expiresIn: "-1s" });
    expect(await verifySessionToken(token)).toBeNull();
  });

  it("トークンとして不正な文字列は拒否される", async () => {
    expect(await verifySessionToken("not-a-jwt")).toBeNull();
  });
});
