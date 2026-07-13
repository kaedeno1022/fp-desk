// 公式の端数処理ルール。突合テストは丸めが一致しないと成立しないため一元管理する

/** unit未満切捨て（課税所得は1,000円、確定税額は100円） */
export function floorTo(value: number, unit: number): number {
  return Math.floor(value / unit) * unit;
}
