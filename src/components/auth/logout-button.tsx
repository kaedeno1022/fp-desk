import { signOut } from "@/app/login/actions";

export function LogoutButton() {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className="rounded-md border border-line px-4 py-1.5 text-sm text-ink2 transition-colors hover:border-accent hover:text-ink"
      >
        ログアウト
      </button>
    </form>
  );
}
