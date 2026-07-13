"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { createDefaultInput, type SimulationInput } from "@/lib/engine/input";
import {
  createSimulation,
  deleteSimulation,
  updateSimulation,
} from "@/lib/simulations";

async function requireUserId(): Promise<string> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session.userId;
}

export async function createSimulationAction(): Promise<void> {
  const userId = await requireUserId();
  const id = createSimulation(userId, "新しいシミュレーション", createDefaultInput());
  redirect(`/simulations/${id}`);
}

export type SaveState = { message: string | null; error: string | null };

export async function saveSimulationAction(
  _prev: SaveState,
  formData: FormData
): Promise<SaveState> {
  const userId = await requireUserId();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const inputJson = String(formData.get("inputJson") ?? "");

  if (!name) return { message: null, error: "名前を入力してほしい" };

  let input: SimulationInput;
  try {
    input = JSON.parse(inputJson) as SimulationInput;
  } catch {
    return { message: null, error: "入力データの形式が不正" };
  }

  if (!updateSimulation(id, userId, name, input)) {
    return { message: null, error: "保存対象が見つからない" };
  }
  revalidatePath("/");
  revalidatePath(`/simulations/${id}`);
  return { message: "保存した", error: null };
}

/** ヒアリングウィザードの完了時: 回答から組み立てた入力でシミュレーションを作成する */
export async function createFromInterviewAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const name = String(formData.get("name") ?? "").trim() || "ヒアリング結果";
  let input: SimulationInput;
  try {
    input = JSON.parse(String(formData.get("inputJson") ?? "")) as SimulationInput;
  } catch {
    redirect("/interview");
  }
  const id = createSimulation(userId, name, input);
  redirect(`/simulations/${id}`);
}

export async function deleteSimulationAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const id = String(formData.get("id") ?? "");
  deleteSimulation(id, userId);
  revalidatePath("/");
  redirect("/");
}
