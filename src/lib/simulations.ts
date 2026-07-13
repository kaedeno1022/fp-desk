// シミュレーションの保存・呼び出し。
// 単一ユーザー運用だが、将来の顧客紐付け（Phase 2）に備えて必ず user_id で絞り込む
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import type { SimulationInput } from "@/lib/engine/input";

export type SimulationRow = {
  id: string;
  user_id: string;
  name: string;
  input_json: string;
  created_at: string;
  updated_at: string;
};

export type SimulationSummary = Pick<SimulationRow, "id" | "name" | "updated_at">;

export function listSimulations(userId: string): SimulationSummary[] {
  return db
    .prepare(
      "SELECT id, name, updated_at FROM simulations WHERE user_id = ? ORDER BY updated_at DESC"
    )
    .all(userId) as SimulationSummary[];
}

export function getSimulation(id: string, userId: string): SimulationRow | undefined {
  return db
    .prepare("SELECT * FROM simulations WHERE id = ? AND user_id = ?")
    .get(id, userId) as SimulationRow | undefined;
}

export function createSimulation(
  userId: string,
  name: string,
  input: SimulationInput
): string {
  const id = randomUUID();
  db.prepare(
    "INSERT INTO simulations (id, user_id, name, input_json) VALUES (?, ?, ?, ?)"
  ).run(id, userId, name, JSON.stringify(input));
  return id;
}

export function updateSimulation(
  id: string,
  userId: string,
  name: string,
  input: SimulationInput
): boolean {
  const result = db
    .prepare(
      "UPDATE simulations SET name = ?, input_json = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?"
    )
    .run(name, JSON.stringify(input), id, userId);
  return result.changes > 0;
}

export function deleteSimulation(id: string, userId: string): boolean {
  const result = db
    .prepare("DELETE FROM simulations WHERE id = ? AND user_id = ?")
    .run(id, userId);
  return result.changes > 0;
}
