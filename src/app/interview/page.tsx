import Link from "next/link";
import { InterviewWizard } from "@/components/interview/wizard";

export default function InterviewPage() {
  return (
    <div className="flex flex-col flex-1">
      <header className="flex items-baseline gap-4 border-b border-line bg-card px-6 py-3">
        <Link href="/" className="text-sm text-ink2 hover:text-ink hover:underline">
          ← 一覧
        </Link>
        <h1 className="font-mono text-lg font-bold tracking-tight text-ink">fp-desk</h1>
        <span className="text-xs text-ink2">ヒアリング</span>
      </header>
      <main className="mx-auto w-full max-w-xl flex-1 px-6 py-10">
        <InterviewWizard />
      </main>
    </div>
  );
}
