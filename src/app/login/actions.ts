"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { countUsers, createUser, getUserByEmail } from "@/lib/users";
import { createSession, destroySession } from "@/lib/session";

export type AuthActionState = { error: string | null };

// メールは大文字小文字を区別しないため正規化して保存・照合する
function normalizeEmail(raw: FormDataEntryValue | null): string {
  return String(raw ?? "").trim().toLowerCase();
}

// SESSION_SECRET 未設定のままDB書き込みまで進むと
// 「ユーザーだけ作られてセッション発行で落ちる」半端な状態になるため先に検証する
function configError(): AuthActionState | null {
  if (!process.env.SESSION_SECRET) {
    return { error: "SESSION_SECRET が未設定。.env.local を確認してほしい" };
  }
  return null;
}

export async function signIn(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const confError = configError();
  if (confError) return confError;

  const email = normalizeEmail(formData.get("email"));
  const password = String(formData.get("password") ?? "");

  const user = getUserByEmail(email);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return { error: "メールアドレスまたはパスワードが違う" };
  }

  await createSession(user.id);
  redirect("/");
}

export async function signUp(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const confError = configError();
  if (confError) return confError;

  // 自分専用ツールのため、ユーザーが1人でも存在したら新規登録を閉じる
  if (countUsers() > 0) {
    return { error: "新規登録は受け付けていない（シングルユーザーモード）" };
  }

  const email = normalizeEmail(formData.get("email"));
  const password = String(formData.get("password") ?? "");

  if (!email || !email.includes("@")) {
    return { error: "メールアドレスの形式が不正" };
  }
  if (password.length < 8) {
    return { error: "パスワードは8文字以上にしてほしい" };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = createUser(email, passwordHash);

  await createSession(user.id);
  redirect("/");
}

export async function signOut(): Promise<void> {
  await destroySession();
  redirect("/login");
}
