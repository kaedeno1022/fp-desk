import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";

export type User = {
  id: string;
  email: string;
  password_hash: string;
  created_at: string;
};

export function countUsers(): number {
  const row = db.prepare("SELECT COUNT(*) AS count FROM users").get() as { count: number };
  return row.count;
}

export function getUserByEmail(email: string): User | undefined {
  return db.prepare("SELECT * FROM users WHERE email = ?").get(email) as User | undefined;
}

export function getUserById(id: string): User | undefined {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as User | undefined;
}

export function createUser(email: string, passwordHash: string): User {
  const id = randomUUID();
  db.prepare("INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)").run(
    id,
    email,
    passwordHash
  );
  return getUserById(id)!;
}
