// チャート共通のフォーマッタ・座標定数（results / montecarlo-panel で共用）

export function fmtMoney(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 100_000_000) return `${(v / 100_000_000).toFixed(2)}億円`;
  return `${Math.round(v / 10_000).toLocaleString("ja-JP")}万円`;
}

/** Y軸目盛り用の短縮表記。左マージンに収まる幅に抑える */
export function fmtAxis(v: number): string {
  if (v === 0) return "0";
  const abs = Math.abs(v);
  if (abs >= 100_000_000)
    return `${(v / 100_000_000).toLocaleString("ja-JP", { maximumFractionDigits: 1 })}億`;
  return `${Math.round(v / 10_000).toLocaleString("ja-JP")}万`;
}

export function niceTicks(max: number): number[] {
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

export const W = 860;
export const H = 314;
export const M = { top: 16, right: 96, bottom: 42, left: 72 };
export const PW = W - M.left - M.right;
export const PH = H - M.top - M.bottom;
