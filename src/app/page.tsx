"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createDefaultInput } from "@/lib/engine/input";
import {
  createSimulation,
  deleteSimulation,
  listSimulations,
  type SimulationSummary,
} from "@/lib/simulations";

export default function Home() {
  const router = useRouter();
  const [simulations, setSimulations] = useState<SimulationSummary[]>([]);

  useEffect(() => {
    // localStorageはSSR時点で存在しないため、effect内での読み込みが必須
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSimulations(listSimulations());
  }, []);

  function handleCreate() {
    const id = createSimulation("新しいシミュレーション", createDefaultInput());
    router.push(`/simulations/edit?id=${id}`);
  }

  function handleDelete(id: string) {
    deleteSimulation(id);
    setSimulations(listSimulations());
  }

  return (
    <div className="flex flex-col flex-1">
      <header className="flex items-center justify-between border-b border-line bg-card px-6 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="font-mono text-lg font-bold tracking-tight text-ink">fp-desk</h1>
          <span className="text-xs text-ink2">ライフプラン設計</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="border-l-[3px] border-accent pl-3 text-base font-bold text-ink">
            シミュレーション
          </h2>
          <div className="flex items-center gap-3">
            <Link
              href="/interview"
              className="rounded-md border border-accent px-5 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent hover:text-accent-ink"
            >
              ヒアリングから作成
            </Link>
            <button
              type="button"
              onClick={handleCreate}
              className="rounded-md bg-accent px-5 py-2 text-sm font-medium text-accent-ink transition-opacity hover:opacity-90"
            >
              新規作成
            </button>
          </div>
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
                  href={`/simulations/edit?id=${s.id}`}
                  className="flex-1 text-sm font-medium text-ink hover:text-accent hover:underline"
                >
                  {s.name}
                </Link>
                <span className="num text-xs text-ink2">更新 {s.updatedAt.slice(0, 10)}</span>
                <button
                  type="button"
                  onClick={() => handleDelete(s.id)}
                  className="text-xs text-critical hover:underline"
                >
                  削除
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
