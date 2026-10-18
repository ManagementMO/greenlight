import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";

export interface Reservation {
  id: string;
  provider: string;
  purpose: string;
  maxCents: number;
}
export interface SpendEntry extends Reservation {
  state: "reserved" | "settled" | "released";
  actualCents?: number;
  createdAt: string;
  settledAt?: string;
  evidence?: string;
  overrun?: boolean;
}
interface LedgerFile {
  schemaVersion: 1;
  capCents: number;
  entries: SpendEntry[];
}
export interface BudgetSnapshot extends LedgerFile {
  spentCents: number;
  reservedCents: number;
  availableCents: number;
  capUsd: number;
  spentUsd: number;
  reservedUsd: number;
}
const cents = (value: number) => {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error("Cost must be non-negative integer cents");
  return value;
};
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Local CLI authority only. A stale reservation is never silently expired. */
export class SpendLedger {
  readonly path: string;
  constructor(
    path: string,
    readonly capCents = 2000,
  ) {
    this.path = resolve(path);
    cents(capCents);
    if (capCents > 2000 || capCents === 0)
      throw new Error("Budget cap cannot exceed the authorized $20");
  }
  private async locked<T>(fn: (data: LedgerFile) => Promise<T>): Promise<T> {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const lock = this.path + ".lock";
    let acquired = false;
    for (let i = 0; i < 150; i++) {
      try {
        await mkdir(lock, { mode: 0o700 });
        acquired = true;
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        await pause(20);
      }
    }
    if (!acquired)
      throw new Error("Budget ledger locked; inspect owner before retrying");
    try {
      let data: LedgerFile;
      try {
        data = JSON.parse(await readFile(this.path, "utf8"));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT")
          throw new Error("Budget ledger is corrupt; spending refused");
        data = { schemaVersion: 1, capCents: this.capCents, entries: [] };
      }
      this.validate(data);
      const result = await fn(data);
      this.validate(data);
      const temp = this.path + "." + randomUUID() + ".tmp";
      const handle = await open(temp, "wx", 0o600);
      try {
        await handle.writeFile(JSON.stringify(data, null, 2) + "\n");
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temp, this.path);
      const dir = await open(dirname(this.path), "r");
      try {
        await dir.sync();
      } finally {
        await dir.close();
      }
      return result;
    } finally {
      await rm(lock, { recursive: true, force: true });
    }
  }
  private validate(data: LedgerFile) {
    if (
      data.schemaVersion !== 1 ||
      data.capCents !== this.capCents ||
      !Array.isArray(data.entries)
    )
      throw new Error("Budget ledger schema/cap mismatch");
    const ids = new Set<string>();
    for (const e of data.entries) {
      if (
        !e.id ||
        ids.has(e.id) ||
        !["reserved", "settled", "released"].includes(e.state)
      )
        throw new Error("Invalid budget ledger entries");
      ids.add(e.id);
      cents(e.maxCents);
      if (e.actualCents !== undefined) cents(e.actualCents);
      if (e.state === "settled" && e.actualCents === undefined)
        throw new Error("Missing settled cost");
    }
  }
  private summary(data: LedgerFile): BudgetSnapshot {
    const spentCents = data.entries.reduce(
      (n, e) => n + (e.state === "settled" ? (e.actualCents ?? 0) : 0),
      0,
    );
    const reservedCents = data.entries.reduce(
      (n, e) => n + (e.state === "reserved" ? e.maxCents : 0),
      0,
    );
    return {
      ...structuredClone(data),
      spentCents,
      reservedCents,
      availableCents: Math.max(0, data.capCents - spentCents - reservedCents),
      capUsd: data.capCents / 100,
      spentUsd: spentCents / 100,
      reservedUsd: reservedCents / 100,
    };
  }
  async snapshot() {
    return this.locked(async (data) => this.summary(data));
  }
  async reserve(input: Reservation) {
    cents(input.maxCents);
    if (!input.id || !input.provider || !input.purpose || input.maxCents === 0)
      throw new Error(
        "Reservation identity, purpose and positive maximum required",
      );
    return this.locked(async (data) => {
      if (data.entries.some((e) => e.overrun))
        throw new Error(
          "Prior budget reservation overrun requires reconciliation",
        );
      if (data.entries.some((e) => e.id === input.id))
        throw new Error("Reservation already exists");
      if (this.summary(data).availableCents < input.maxCents)
        throw new Error("Authorized spending cap exceeded");
      const entry: SpendEntry = {
        ...input,
        state: "reserved",
        createdAt: new Date().toISOString(),
      };
      data.entries.push(entry);
      return structuredClone(entry);
    });
  }
  async settle(id: string, actualCents: number, evidence: string) {
    cents(actualCents);
    if (!evidence) throw new Error("Final cost evidence required");
    return this.locked(async (data) => {
      const entry = data.entries.find((e) => e.id === id);
      if (!entry) throw new Error("Unknown reservation");
      if (entry.state === "settled" && entry.actualCents === actualCents)
        return structuredClone(entry);
      if (entry.state !== "reserved")
        throw new Error("Cannot rewrite a finalized reservation");
      Object.assign(entry, {
        state: "settled",
        actualCents,
        evidence,
        settledAt: new Date().toISOString(),
        overrun: actualCents > entry.maxCents,
      });
      return structuredClone(entry);
    });
  }
  /** Only for positively verified zero-charge operations, never ambiguous timeouts. */
  async release(id: string, evidence: string) {
    if (!evidence) throw new Error("Zero-charge evidence required");
    return this.locked(async (data) => {
      const e = data.entries.find((x) => x.id === id);
      if (!e || e.state !== "reserved")
        throw new Error("Unknown or finalized reservation");
      Object.assign(e, {
        state: "released",
        actualCents: 0,
        evidence,
        settledAt: new Date().toISOString(),
      });
      return structuredClone(e);
    });
  }
}
export const usdToCentsCeil = (usd: number) => {
  if (!Number.isFinite(usd) || usd < 0) throw new Error("Invalid USD cost");
  return Math.ceil(usd * 100 - 1e-9);
};
