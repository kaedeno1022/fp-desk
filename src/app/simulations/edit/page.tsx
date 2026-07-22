"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSimulation, listSimulations, type SimulationRecord } from "@/lib/simulations";
import { normalizeInput, type SimulationInput } from "@/lib/engine/input";
import { SimulationEditor } from "@/components/simulation/editor";

type OtherSim = { id: string; name: string; input: SimulationInput };

function EditContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") ?? "";
  const [record, setRecord] = useState<SimulationRecord | null>(null);
  const [others, setOthers] = useState<OtherSim[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // localStorageはSSR時点で存在しないため、effect内での読み込みが必須
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecord(getSimulation(id) ?? null);
    // シナリオ比較用に他のシミュレーションも入力ごと渡す（自分専用・少数前提）
    setOthers(
      listSimulations()
        .filter((s) => s.id !== id)
        .map((s) => {
          const r = getSimulation(s.id)!;
          return { id: s.id, name: s.name, input: normalizeInput(r.input) };
        })
    );
    setLoaded(true);
  }, [id]);

  if (!loaded) return null;

  if (!record) {
    return (
      <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-10 text-sm text-ink2">
        シミュレーションが見つからない。
        <Link href="/" className="ml-2 text-accent hover:underline">
          一覧に戻る
        </Link>
      </div>
    );
  }

  const input = normalizeInput(record.input);

  return (
    <div className="flex flex-col flex-1">
      <header className="flex items-baseline gap-4 border-b border-line bg-card px-6 py-3">
        <Link href="/" className="text-sm text-ink2 hover:text-ink hover:underline">
          ← 一覧
        </Link>
        <h1 className="font-mono text-lg font-bold tracking-tight text-ink">fp-desk</h1>
        <span className="text-xs text-ink2">{record.name}</span>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-5">
        <SimulationEditor
          id={record.id}
          initialName={record.name}
          initialInput={input}
          others={others}
        />
      </main>
    </div>
  );
}

export default function SimulationEditPage() {
  return (
    <Suspense fallback={null}>
      <EditContent />
    </Suspense>
  );
}
