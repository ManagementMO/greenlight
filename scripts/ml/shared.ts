import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { mkdir, open, rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { SpendLedger } from "../../lib/budget/ledger";
export function loadProjectEnv() {
  if (existsSync(resolve(".env"))) loadEnvFile(resolve(".env"));
  return process.env;
}
export function args() {
  const out: Record<string, string | boolean> = {};
  for (let i = 2; i < process.argv.length; i++) {
    const key = process.argv[i].replace(/^--/, "");
    const next = process.argv[i + 1];
    if (next && !next.startsWith("--")) {
      out[key] = next;
      i++;
    } else out[key] = true;
  }
  return out;
}
export function intArg(
  input: Record<string, string | boolean>,
  name: string,
  fallback: number,
  min: number,
  max: number,
) {
  const value = Number(input[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max)
    throw new Error(`--${name} must be ${min}..${max}`);
  return value;
}
export async function saveJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = path + "." + randomUUID() + ".tmp";
  const handle = await open(tmp, "wx", 0o600);
  try {
    await handle.writeFile(JSON.stringify(value, null, 2) + "\n");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(tmp, path);
  const directory = await open(dirname(path), "r");
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}
export function ledger() {
  return new SpendLedger(resolve("work/budget/ledger.json"), 2000);
}
export const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const now = () => new Date().toISOString();
export function publicError(error: unknown) {
  return error instanceof Error ? error.message : "Unknown operation failure";
}
