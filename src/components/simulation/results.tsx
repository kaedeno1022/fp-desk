"use client";

import { useMemo, useState } from "react";
import type { SimulationResult, YearResult } from "@/lib/engine/simulate";

// dataviz 検証済み参照パレット（カテゴリカル slot 1〜4 を固定順で使用）。
// チャート面はアプリのカード色に合わせる
const VIZ_STYLE = `
.fpviz {
  --surface-1: #fdfdfc;
  --text-primary: #182338;
  --text-secondary: #5a6478;
  --text-muted: #898781;
  --grid: #e1e0d9;
  --axis: #c3c2b7;
  --series-1: #2a78d6;
  --series-2: #1baf7a;
  --series-3: #eda100;
  --series-3b: #f5c95e;
  --series-4: #008300;
}
@media (prefers-color-scheme: dark) {
  .fpviz {
    --surface-1: #161922;
    --text-primary: #e7eaf1;
    --text-secondary: #98a1b3;
    --text-muted: #898781;
    --grid: #272c37;
    --axis: #383835;
    --series-1: #3987e5;
    --series-2: #199e70;
    --series-3: #c98500;
    --series-3b: #eda100;
    --series-4: #008300;
  }
}
`;

// NISAは元本と運用益を同一色相の濃淡で分けて積む。
// value は積み上げ用（負値はクランプ）、real はツールチップ表示用の実額
type AssetSeriesDef = {
  key: string;
  label: string;
  varName: string;
  value: (y: YearResult) => number;
  real: (y: YearResult) => number;
};

const ASSET_SERIES: AssetSeriesDef[] = [
  {
    key: "cash",
    label: "現金・預金",
    varName: "--series-1",
    value: (y) => Math.max(0, y.assets.cash),
    real: (y) => y.assets.cash,
  },
  {
    key: "taxable",
    label: "課税口座",
    varName: "--series-2",
    value: (y) => y.assets.taxable,
    real: (y) => y.assets.taxable,
  },
  {
    key: "nisaPrincipal",
    label: "NISA元本",
    varName: "--series-3",
    value: (y) => Math.min(y.assets.nisa, y.assets.nisaPrincipal),
    real: (y) => Math.min(y.assets.nisa, y.assets.nisaPrincipal),
  },
  {
    key: "nisaGain",
    label: "NISA運用益",
    varName: "--series-3b",
    value: (y) => Math.max(0, y.assets.nisa - y.assets.nisaPrincipal),
    real: (y) => y.assets.nisa - y.assets.nisaPrincipal,
  },
  {
    key: "ideco",
    label: "iDeCo",
    varName: "--series-4",
    value: (y) => y.assets.ideco,
    real: (y) => y.assets.ideco,
  },
];

function fmtMoney(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 100_000_000) return `${(v / 100_000_000).toFixed(2)}億円`;
  return `${Math.round(v / 10_000).toLocaleString("ja-JP")}万円`;
}

/** Y軸目盛り用の短縮表記。左マージンに収まる幅に抑える */
function fmtAxis(v: number): string {
  if (v === 0) return "0";
  const abs = Math.abs(v);
  if (abs >= 100_000_000) return `${(v / 100_000_000).toLocaleString("ja-JP", { maximumFractionDigits: 1 })}億`;
  return `${Math.round(v / 10_000).toLocaleString("ja-JP")}万`;
}

const W = 860;
const H = 314;
const M = { top: 16, right: 96, bottom: 42, left: 72 };
const PW = W - M.left - M.right;
const PH = H - M.top - M.bottom;

function niceTicks(max: number): number[] {
  if (max <= 0) return [0];
  const raw = max / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  // 最後の目盛りが必ず最大値以上になるまで伸ばす（不足するとデータが上にはみ出す）
  const ticks: number[] = [];
  let v = 0;
  for (;;) {
    ticks.push(v);
    if (v >= max) break;
    v += step;
  }
  return ticks;
}

/** 資産内訳の積み上げ面グラフ。現金マイナスは0にクランプして描画（実額はツールチップ・表を参照） */
function AssetChart({ years }: { years: YearResult[] }) {
  const [hover, setHover] = useState<number | null>(null);

  // 各年の積み上げ値（ASSET_SERIES の順で下から積む）
  const valueRows = useMemo(
    () => years.map((yr) => ASSET_SERIES.map((s) => s.value(yr))),
    [years]
  );
  const hasNegativeCash = years.some((y) => y.assets.cash < 0);
  const maxTotal = Math.max(1, ...valueRows.map((row) => row.reduce((a, b) => a + b, 0)));
  const ticks = niceTicks(maxTotal);
  const yMax = ticks[ticks.length - 1] * 1.05;

  const x = (i: number) => M.left + (PW * i) / Math.max(1, years.length - 1);
  const y = (v: number) => M.top + PH - (PH * v) / yMax;

  const stacks = useMemo(() => {
    return ASSET_SERIES.map((_, si) =>
      valueRows.map((row) => {
        const lower = row.slice(0, si).reduce((a, b) => a + b, 0);
        return { lower, upper: lower + row[si] };
      })
    );
  }, [valueRows]);

  const bandPath = (si: number): string => {
    const s = stacks[si];
    const top = s.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.upper)}`).join("");
    const bottom = s
      .map((p, i) => `L${x(s.length - 1 - i)},${y(s[s.length - 1 - i].lower)}`)
      .join("");
    return `${top}${bottom}Z`;
  };

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - M.left) / PW) * (years.length - 1));
    setHover(i >= 0 && i < years.length ? i : null);
  };

  // 右端の直接ラベル（帯が薄い系列はスキップし、凡例に任せる）
  const last = years.length - 1;
  const directLabels = ASSET_SERIES.map((s, si) => {
    const band = stacks[si][last];
    const h = y(band.lower) - y(band.upper);
    if (h < 14) return null;
    return { label: s.label, varName: s.varName, cy: (y(band.lower) + y(band.upper)) / 2 };
  }).filter((v): v is NonNullable<typeof v> => v !== null);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-4 text-xs" style={{ color: "var(--text-secondary)" }}>
        {ASSET_SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: `var(${s.varName})` }}
            />
            {s.label}
          </span>
        ))}
        {hasNegativeCash && (
          <span className="flex items-center gap-1 text-critical">
            ⚠ 現金マイナスの年は0として描画（実額は表を参照）
          </span>
        )}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ background: "var(--surface-1)" }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label="資産内訳の推移"
      >
        {ticks.map((tk) => (
          <g key={tk}>
            <line
              x1={M.left}
              x2={M.left + PW}
              y1={y(tk)}
              y2={y(tk)}
              stroke="var(--grid)"
              strokeWidth="1"
            />
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
        {ASSET_SERIES.map((s, si) => (
          <path
            key={s.key}
            d={bandPath(si)}
            fill={`var(${s.varName})`}
            stroke="var(--surface-1)"
            strokeWidth="2"
          />
        ))}
        <line
          x1={M.left}
          x2={M.left + PW}
          y1={y(0)}
          y2={y(0)}
          stroke="var(--axis)"
          strokeWidth="1"
        />
        {years.map((yr, i) =>
          i % Math.ceil(years.length / 8) === 0 ? (
            <text
              key={yr.year}
              x={x(i)}
              y={H - 22}
              textAnchor="middle"
              fontSize="11"
              fill="var(--text-muted)"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              <tspan x={x(i)}>{yr.year}</tspan>
              <tspan x={x(i)} dy="13" fontSize="10">
                {yr.adultAges.join("/")}歳
              </tspan>
            </text>
          ) : null
        )}
        {directLabels.map((l) => (
          <g key={l.label}>
            <rect
              x={M.left + PW + 6}
              y={l.cy - 5}
              width={10}
              height={10}
              rx={2}
              fill={`var(${l.varName})`}
            />
            <text x={M.left + PW + 20} y={l.cy + 4} fontSize="11" fill="var(--text-secondary)">
              {l.label}
            </text>
          </g>
        ))}
        {hover !== null && (
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1={M.top}
            y2={M.top + PH}
            stroke="var(--text-muted)"
            strokeWidth="1"
            strokeDasharray="3,3"
          />
        )}
      </svg>
      {hover !== null && (
        <div
          className="num mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-line px-3 py-2 text-xs"
          style={{ color: "var(--text-secondary)" }}
        >
          <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
            {years[hover].year}年（{years[hover].adultAges.join("・")}歳）
          </span>
          {ASSET_SERIES.map((s) => (
            <span key={s.key} className="flex items-center gap-1">
              <span
                className="inline-block h-2 w-2 rounded-sm"
                style={{ background: `var(${s.varName})` }}
              />
              {s.label} {fmtMoney(s.real(years[hover]))}
            </span>
          ))}
          <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
            計 {fmtMoney(years[hover].assets.total)}
          </span>
        </div>
      )}
    </div>
  );
}

/** 総資産の比較（2系列の折れ線） */
function CompareChart({
  current,
  currentName,
  other,
  otherName,
}: {
  current: YearResult[];
  currentName: string;
  other: YearResult[];
  otherName: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const n = Math.max(current.length, other.length);
  const series = [
    { label: currentName || "このシナリオ", varName: "--series-1", data: current },
    { label: otherName, varName: "--series-2", data: other },
  ];
  const allValues = series.flatMap((s) => s.data.map((y) => y.assets.total));
  const maxV = Math.max(1, ...allValues);
  const minV = Math.min(0, ...allValues);
  const ticks = niceTicks(maxV);
  const yMax = ticks[ticks.length - 1] * 1.05;
  const yMin = minV;

  const x = (i: number) => M.left + (PW * i) / Math.max(1, n - 1);
  const y = (v: number) => M.top + PH - (PH * (v - yMin)) / (yMax - yMin);

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - M.left) / PW) * (n - 1));
    setHover(i >= 0 && i < n ? i : null);
  };

  return (
    <div>
      <div className="mb-2 flex items-center gap-4 text-xs" style={{ color: "var(--text-secondary)" }}>
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: `var(${s.varName})` }}
            />
            {s.label}
          </span>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ background: "var(--surface-1)" }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label="総資産の比較"
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
        <line x1={M.left} x2={M.left + PW} y1={y(0)} y2={y(0)} stroke="var(--axis)" strokeWidth="1" />
        {series.map((s) => (
          <path
            key={s.label}
            d={s.data.map((yr, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(yr.assets.total)}`).join("")}
            fill="none"
            stroke={`var(${s.varName})`}
            strokeWidth="2"
          />
        ))}
        {series.map((s, si) => {
          const lastIdx = s.data.length - 1;
          if (lastIdx < 0) return null;
          return (
            <text
              key={s.label}
              x={M.left + PW + 6}
              y={y(s.data[lastIdx].assets.total) + 4 + si * 2}
              fontSize="11"
              fill="var(--text-secondary)"
            >
              {s.label}
            </text>
          );
        })}
        {series[0].data.map((yr, i) =>
          i % Math.ceil(n / 8) === 0 ? (
            <text
              key={yr.year}
              x={x(i)}
              y={H - 22}
              textAnchor="middle"
              fontSize="11"
              fill="var(--text-muted)"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              <tspan x={x(i)}>{yr.year}</tspan>
              <tspan x={x(i)} dy="13" fontSize="10">
                {yr.adultAges.join("/")}歳
              </tspan>
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
            {series.map((s) =>
              hover < s.data.length ? (
                <circle
                  key={s.label}
                  cx={x(hover)}
                  cy={y(s.data[hover].assets.total)}
                  r="4"
                  fill={`var(${s.varName})`}
                  stroke="var(--surface-1)"
                  strokeWidth="2"
                />
              ) : null
            )}
          </>
        )}
      </svg>
      {hover !== null && (
        <div
          className="num mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-line px-3 py-2 text-xs"
          style={{ color: "var(--text-secondary)" }}
        >
          <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
            {series[0].data[Math.min(hover, series[0].data.length - 1)].year}年
          </span>
          {series.map((s) =>
            hover < s.data.length ? (
              <span key={s.label} className="flex items-center gap-1">
                <span
                  className="inline-block h-2 w-2 rounded-sm"
                  style={{ background: `var(${s.varName})` }}
                />
                {s.label} {fmtMoney(s.data[hover].assets.total)}
              </span>
            ) : null
          )}
        </div>
      )}
    </div>
  );
}

function StatTile({ label, value, sub, critical }: { label: string; value: string; sub?: string; critical?: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-card px-4 py-3">
      <div className="text-xs text-ink2">{label}</div>
      <div className={`num text-2xl font-bold ${critical ? "text-critical" : "text-ink"}`}>
        {value}
      </div>
      {sub && <div className="num text-xs text-ink2">{sub}</div>}
    </div>
  );
}

function ResultSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-card p-5">
      <h3 className="mb-4 border-l-[3px] border-accent pl-3 text-sm font-bold text-ink">{title}</h3>
      {children}
    </section>
  );
}

export function SimulationResults({
  name,
  result,
  compare,
}: {
  name: string;
  result: SimulationResult;
  compare: { name: string; result: SimulationResult } | null;
}) {
  const years = result.years;
  if (years.length === 0) return null;

  const final = years[years.length - 1];
  const minCash = years.reduce((min, y) => (y.assets.cash < min.assets.cash ? y : min), years[0]);
  const peak = years.reduce((max, y) => (y.assets.total > max.assets.total ? y : max), years[0]);

  return (
    <div className="fpviz flex flex-col gap-4">
      <style>{VIZ_STYLE}</style>

      {result.warnings.length > 0 && (
        <div className="rounded-lg border border-critical bg-card px-4 py-3 text-sm text-critical">
          {result.warnings.map((w) => (
            <div key={w}>⚠ {w}</div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <StatTile label="最終資産" value={fmtMoney(final.assets.total)} sub={`${final.year}年時点`} />
        <StatTile label="資産ピーク" value={fmtMoney(peak.assets.total)} sub={`${peak.year}年`} />
        <StatTile
          label="現金残高の最小"
          value={fmtMoney(minCash.assets.cash)}
          sub={`${minCash.year}年`}
          critical={minCash.assets.cash < 0}
        />
      </div>

      <ResultSection title="資産内訳の推移">
        <AssetChart years={years} />
      </ResultSection>

      {compare && (
        <ResultSection title="総資産の比較">
          <CompareChart
            current={years}
            currentName={name}
            other={compare.result.years}
            otherName={compare.name}
          />
        </ResultSection>
      )}

      <ResultSection title="キャッシュフロー表">
        <div className="max-h-96 overflow-auto">
          <table className="num w-full min-w-[900px] text-right text-xs text-ink2">
            <thead className="sticky top-0 bg-card text-ink2">
              <tr>
                <th className="px-2 py-1.5 text-left font-normal">年</th>
                <th className="px-2 py-1.5 font-normal">年齢</th>
                <th className="px-2 py-1.5 font-normal">収入</th>
                <th className="px-2 py-1.5 font-normal">所得税</th>
                <th className="px-2 py-1.5 font-normal">住民税</th>
                <th className="px-2 py-1.5 font-normal">社会保険</th>
                <th className="px-2 py-1.5 font-normal">支出</th>
                <th className="px-2 py-1.5 font-normal">積立</th>
                <th className="px-2 py-1.5 font-normal">取崩</th>
                <th className="px-2 py-1.5 font-normal">収支</th>
                <th className="px-2 py-1.5 font-normal">現金</th>
                <th className="px-2 py-1.5 font-normal">総資産</th>
              </tr>
            </thead>
            <tbody>
              {years.map((y) => (
                <tr key={y.year} className="border-t border-line">
                  <td className="px-2 py-1 text-left">{y.year}</td>
                  <td className="px-2 py-1">{y.adultAges.join("・")}</td>
                  <td className="px-2 py-1">{fmtMoney(y.income.total)}</td>
                  <td className="px-2 py-1">{fmtMoney(y.taxes.incomeTax)}</td>
                  <td className="px-2 py-1">{fmtMoney(y.taxes.residentTax)}</td>
                  <td className="px-2 py-1">{fmtMoney(y.social.total)}</td>
                  <td className="px-2 py-1">{fmtMoney(y.expenses.total)}</td>
                  <td className="px-2 py-1">
                    {fmtMoney(y.contributions.taxable + y.contributions.nisa + y.contributions.ideco)}
                  </td>
                  <td className="px-2 py-1">
                    {fmtMoney(y.withdrawals.taxable + y.withdrawals.nisa)}
                  </td>
                  <td className={`px-2 py-1 ${y.cashflow < 0 ? "text-critical" : ""}`}>
                    {fmtMoney(y.cashflow)}
                  </td>
                  <td className={`px-2 py-1 ${y.assets.cash < 0 ? "text-critical" : ""}`}>
                    {fmtMoney(y.assets.cash)}
                  </td>
                  <td className="px-2 py-1 font-medium text-ink">{fmtMoney(y.assets.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ResultSection>
    </div>
  );
}
