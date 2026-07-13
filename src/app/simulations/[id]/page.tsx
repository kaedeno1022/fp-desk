import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getSimulation, listSimulations } from "@/lib/simulations";
import { normalizeInput, type SimulationInput } from "@/lib/engine/input";
import { SimulationEditor } from "@/components/simulation/editor";

export default async function SimulationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const row = getSimulation(id, session.userId);
  if (!row) notFound();

  const input = normalizeInput(JSON.parse(row.input_json) as SimulationInput);

  // シナリオ比較用に他のシミュレーションも入力ごと渡す（自分専用・少数前提）
  const others = listSimulations(session.userId)
    .filter((s) => s.id !== id)
    .map((s) => {
      const r = getSimulation(s.id, session.userId)!;
      return {
        id: s.id,
        name: s.name,
        input: normalizeInput(JSON.parse(r.input_json) as SimulationInput),
      };
    });

  return (
    <div className="flex flex-col flex-1">
      <header className="flex items-baseline gap-4 border-b border-line bg-card px-6 py-3">
        <Link href="/" className="text-sm text-ink2 hover:text-ink hover:underline">
          ← 一覧
        </Link>
        <h1 className="font-mono text-lg font-bold tracking-tight text-ink">fp-desk</h1>
        <span className="text-xs text-ink2">{row.name}</span>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-5">
        <SimulationEditor id={id} initialName={row.name} initialInput={input} others={others} />
      </main>
    </div>
  );
}
