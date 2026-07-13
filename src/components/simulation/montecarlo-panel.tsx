"use client";

import { useState } from "react";
import type { SimulationInput } from "@/lib/engine/input";
import { runMonteCarlo, type MonteCarloResult } from "@/lib/engine/montecarlo";
import { loadTaxTables } from "@/lib/engine/tables";
import { fmtAxis, fmtMoney, H, M, niceTicks, PH, PW, W } from "./chart-utils";

// ファンチャートは単一色相（青）の濃淡で分布を表す（dataviz: sequential）
const FAN_STYLE = `
.fpviz {
  --fan-outer: #cde2fb;
  --fan-inner: #86b6ef;
  --fan-median: #2a78d6;
}
@media (prefers-color-scheme: dark) {
  .fpviz {
    --fan-outer: #104281;
    --fan-inner: #1c5cab;
    --fan-median: #3987e5;
  }
}
`;

function FanChart({ mc }: { mc: MonteCarloResult }) {
  const [hover, setHover] = useState<number | null>(null);
  const n = mc.yearly.length;
  const maxV = Math.max(1, ...mc.yearly.map((y) => y.p90));
  const ticks = niceTicks(maxV);
  const yMax = ticks[ticks.length - 1] * 1.05;

  const x = (i: number) => M.left + (PW * i) / Math.max(1, n - 1);
  const y = (v: number) => M.top + PH - (PH * Math.max(0, v)) / yMax;

  const band = (upper: "p90" | "p75", lower: "p10" | "p25") => {
    const top = mc.yearly.map((r, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(r[upper])}`).join("");
    const bottom = mc.yearly
      .map((_, i) => {
        const j = n - 1 - i;
        return `L${x(j)},${y(mc.yearly[j][lower])}`;
      })
      .join("");
    return `${top}${bottom}Z`;
  };

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - M.left) / PW) * (n - 1));
    setHover(i >= 0 && i < n ? i : null);
  };

  return (
    <div>
      <div className="mb-2 flex items-center gap-4 text-xs" style={{ color: "var(--text-secondary)" }}>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4" style={{ background: "var(--fan-median)" }} />
          中央値
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "var(--fan-inner)" }} />
          25〜75%
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "var(--fan-outer)" }} />
          10〜90%
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ background: "var(--surface-1)" }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label="総資産の分布（モンテカルロ）"
      >
        {ticks.map((tk) => (
          <g key={tk}>
            <line x1={M.left} x2={M.left + PW} y1={y(tk)} y2={y(tk)} stroke="var(--grid)" strokeWidth="1" />
            <text
              x={M.left - 8}
              y={y(tk) + 4}
              textAnchor="end"
              fontSize="11"
              fill="var(--text-muted)"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {fmtAxis(tk)}
            </text>
          </g>
        ))}
        <path d={band("p90", "p10")} fill="var(--fan-outer)" />
        <path d={band("p75", "p25")} fill="var(--fan-inner)" />
        <path
          d={mc.yearly.map((r, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(r.p50)}`).join("")}
          fill="none"
          stroke="var(--fan-median)"
          strokeWidth="2"
        />
        <line x1={M.left} x2={M.left + PW} y1={y(0)} y2={y(0)} stroke="var(--axis)" strokeWidth="1" />
        {mc.yearly.map((r, i) =>
          i % Math.ceil(n / 8) === 0 ? (
            <text
              key={r.year}
              x={x(i)}
              y={H - 22}
              textAnchor="middle"
              fontSize="11"
              fill="var(--text-muted)"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {r.year}
            </text>
          ) : null
        )}
        {hover !== null && (
          <>
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={M.top}
              y2={M.top + PH}
              stroke="var(--text-muted)"
              strokeWidth="1"
              strokeDasharray="3,3"
            />
            <circle
              cx={x(hover)}
              cy={y(mc.yearly[hover].p50)}
              r="4"
              fill="var(--fan-median)"
              stroke="var(--surface-1)"
              strokeWidth="2"
            />
          </>
        )}
      </svg>
      {hover !== null && (
        <div
          className="num mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-line px-3 py-2 text-xs"
          style={{ color: "var(--text-secondary)" }}
        >
          <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
            {mc.yearly[hover].year}年
          </span>
          <span>上位10% {fmtMoney(mc.yearly[hover].p90)}</span>
          <span style={{ color: "var(--text-primary)" }}>中央値 {fmtMoney(mc.yearly[hover].p50)}</span>
          <span>下位10% {fmtMoney(mc.yearly[hover].p10)}</span>
        </div>
      )}
    </div>
  );
}

export function MonteCarloPanel({
  input,
  onChangeVolatility,
}: {
  input: SimulationInput;
  onChangeVolatility: (v: number) => void;
}) {
  const [trials, setTrials] = useState(1000);
  const [mc, setMc] = useState<MonteCarloResult | null>(null);
  const [running, setRunning] = useState(false);
  // 実行時点の入力スナップショットと比較して、結果が古いかを判定する（自動再計算はしない）
  const [lastRunKey, setLastRunKey] = useState<string | null>(null);
  const inputKey = JSON.stringify(input);
  const stale = mc !== null && lastRunKey !== inputKey;

  const run = () => {
    setRunning(true);
    // 描画を先に反映させてから同期計算する
    setTimeout(() => {
      const t = loadTaxTables();
      setMc(runMonteCarlo(input, t, { trials, volatility: input.accounts.returnVolatility }));
      setLastRunKey(inputKey);
      setRunning(false);
    }, 20);
  };

  return (
    <section className="fpviz rounded-lg border border-line bg-card p-5">
      <style>{FAN_STYLE}</style>
      <div className="mb-4 border-l-[3px] border-accent pl-3">
        <h3 className="text-sm font-bold text-ink">モンテカルロ・シミュレーション</h3>
        <p className="mt-0.5 text-xs text-ink2">
          運用リターンを正規分布で揺らして{trials.toLocaleString()}回試行し、資産推移の分布と成功確率を見る
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-xs text-ink2">
          リターン標準偏差（%）
          <input
            type="number"
            step="1"
            className="num w-32 rounded-md border border-line bg-card px-2 py-1.5 text-sm text-ink"
            value={Math.round(input.accounts.returnVolatility * 100)}
            onChange={(e) => onChangeVolatility(Number(e.target.value) / 100)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink2">
          試行回数
          <select
            className="rounded-md border border-line bg-card px-2 py-1.5 text-sm text-ink"
            value={trials}
            onChange={(e) => setTrials(Number(e.target.value))}
          >
            <option value={500}>500</option>
            <option value={1000}>1,000</option>
            <option value={2000}>2,000</option>
          </select>
        </label>
        <button
          type="button"
          onClick={run}
          disabled={running}
          className="rounded-md bg-accent px-5 py-1.5 text-sm font-medium text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {running ? "計算中…" : "実行"}
        </button>
        {mc && stale && (
          <span className="text-xs text-critical">入力が変わっている。再実行して更新する</span>
        )}
        <span className="text-xs text-ink2">
          目安: 株式中心 15〜18% / バランス型 8〜12% / 債券中心 3〜5%
        </span>
      </div>

      {mc && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-line px-4 py-3">
              <div className="text-xs text-ink2">成功確率（現金が尽きない）</div>
              <div
                className={`num text-2xl font-bold ${mc.successRate < 0.8 ? "text-critical" : "text-ink"}`}
              >
                {(mc.successRate * 100).toFixed(1)}%
              </div>
            </div>
            <div className="rounded-lg border border-line px-4 py-3">
              <div className="text-xs text-ink2">最終資産の中央値</div>
              <div className="num text-2xl font-bold text-ink">{fmtMoney(mc.finalAssets.p50)}</div>
            </div>
            <div className="rounded-lg border border-line px-4 py-3">
              <div className="text-xs text-ink2">最終資産の下位10%</div>
              <div className="num text-2xl font-bold text-ink">{fmtMoney(mc.finalAssets.p10)}</div>
            </div>
          </div>
          <FanChart mc={mc} />
          <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
            リターンは全リスク口座共通のショックを持つ正規分布（平均=各口座の想定利回り、標準偏差=上記設定）でモデル化。
            シード固定のため同じ入力なら同じ結果になる。ファンチャートの帯は下から10・25・75・90パーセンタイル。
          </p>
        </div>
      )}
    </section>
  );
}
