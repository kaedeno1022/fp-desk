import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { getUserById } from "@/lib/users";
import { listSimulations } from "@/lib/simulations";
import { LogoutButton } from "@/components/auth/logout-button";
import { createSimulationAction, deleteSimulationAction } from "@/app/simulations/actions";

export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/login");
  const user = getUserById(session.userId);
  const simulations = listSimulations(session.userId);

  return (
    <div className="flex flex-col flex-1">
      <header className="flex items-center justify-between border-b border-line bg-card px-6 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="font-mono text-lg font-bold tracking-tight text-ink">fp-desk</h1>
          <span className="text-xs text-ink2">ライフプラン設計</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-ink2">{user?.email}</span>
          <LogoutButton />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="border-l-[3px] border-accent pl-3 text-base font-bold text-ink">
            シミュレーション
          </h2>
          <form action={createSimulationAction}>
            <button
              type="submit"
              className="rounded-md bg-accent px-5 py-2 text-sm font-medium text-accent-ink transition-opacity hover:opacity-90"
            >
              新規作成
            </button>
          </form>
        </div>

        {simulations.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line bg-card px-6 py-12 text-center text-sm text-ink2">
            まだシミュレーションがない。「新規作成」から最初の1件を作る。
          </div>
        ) : (
          <ul className="overflow-hidden rounded-lg border border-line bg-card">
            {simulations.map((s, i) => (
              <li
                key={s.id}
                className={`flex items-center gap-4 px-5 py-3.5 ${i > 0 ? "border-t border-line" : ""}`}
              >
                <Link
                  href={`/simulations/${s.id}`}
                  className="flex-1 text-sm font-medium text-ink hover:text-accent hover:underline"
                >
                  {s.name}
                </Link>
                <span className="num text-xs text-ink2">更新 {s.updated_at.slice(0, 10)}</span>
                <form action={deleteSimulationAction}>
                  <input type="hidden" name="id" value={s.id} />
                  <button type="submit" className="text-xs text-critical hover:underline">
                    削除
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
