"use client";

import { useActionState, useState } from "react";
import { signIn, signUp, type AuthActionState } from "./actions";

const initialState: AuthActionState = { error: null };

const inputCls =
  "rounded-md border border-line bg-card px-3 py-2 text-sm text-ink placeholder:text-ink2";

export default function LoginPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [signInState, signInAction, signInPending] = useActionState(signIn, initialState);
  const [signUpState, signUpAction, signUpPending] = useActionState(signUp, initialState);

  const action = mode === "signin" ? signInAction : signUpAction;
  const state = mode === "signin" ? signInState : signUpState;
  const pending = mode === "signin" ? signInPending : signUpPending;

  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="font-mono text-2xl font-bold tracking-tight text-ink">fp-desk</h1>
          <p className="mt-1 text-sm text-ink2">ライフプラン設計ツール</p>
        </div>
        <form
          action={action}
          className="flex flex-col gap-4 rounded-lg border border-line bg-card p-8"
        >
          <h2 className="border-l-[3px] border-accent pl-3 text-sm font-bold text-ink">
            {mode === "signin" ? "ログイン" : "アカウント作成"}
          </h2>

          <label className="flex flex-col gap-1 text-xs text-ink2">
            メールアドレス
            <input type="email" name="email" required className={inputCls} />
          </label>

          <label className="flex flex-col gap-1 text-xs text-ink2">
            パスワード（8文字以上）
            <input type="password" name="password" required minLength={8} className={inputCls} />
          </label>

          {state.error && <p className="text-sm text-critical">{state.error}</p>}

          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-accent px-5 py-2 text-sm font-medium text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {mode === "signin" ? "ログイン" : "アカウント作成"}
          </button>

          <button
            type="button"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="text-xs text-ink2 underline hover:text-ink"
          >
            {mode === "signin" ? "初回利用: アカウントを作成する" : "ログインに戻る"}
          </button>
        </form>
      </div>
    </div>
  );
}
