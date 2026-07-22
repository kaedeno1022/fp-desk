// シミュレーションの保存・呼び出し。
// GitHub Pages(静的配信)向けにDBを廃止し、ブラウザのlocalStorageへ保存する
import type { SimulationInput } from "@/lib/engine/input";

const STORAGE_KEY = "fp-desk:simulations";

export type SimulationRecord = {
  id: string;
  name: string;
  input: SimulationInput;
  createdAt: string;
  updatedAt: string;
};

export type SimulationSummary = Pick<SimulationRecord, "id" | "name" | "updatedAt">;

function readAll(): SimulationRecord[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as SimulationRecord[];
  } catch {
    return [];
  }
}

function writeAll(records: SimulationRecord[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

export function listSimulations(): SimulationSummary[] {
  return readAll()
    .map(({ id, name, updatedAt }) => ({ id, name, updatedAt }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getSimulation(id: string): SimulationRecord | undefined {
  return readAll().find((r) => r.id === id);
}

export function createSimulation(name: string, input: SimulationInput): string {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const records = readAll();
  records.push({ id, name, input, createdAt: now, updatedAt: now });
  writeAll(records);
  return id;
}

export function updateSimulation(id: string, name: string, input: SimulationInput): boolean {
  const records = readAll();
  const idx = records.findIndex((r) => r.id === id);
  if (idx === -1) return false;
  records[idx] = { ...records[idx], name, input, updatedAt: new Date().toISOString() };
  writeAll(records);
  return true;
}

export function deleteSimulation(id: string): boolean {
  const records = readAll();
  const next = records.filter((r) => r.id !== id);
  if (next.length === records.length) return false;
  writeAll(next);
  return true;
}
