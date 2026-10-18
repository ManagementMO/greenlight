import { describe, it, expect } from "vitest";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SpendLedger } from "../../lib/budget/ledger";
describe("durable spending authority", () => {
  it("atomically refuses competing reservations beyond the total cap", async () => {
    const path = join(await mkdtemp(join(tmpdir(), "greenlight-budget-")), "ledger.json");
    const ledgers = [new SpendLedger(path, 2000), new SpendLedger(path, 2000)];
    const results = await Promise.allSettled(ledgers.map((l, i) => l.reserve({ id: String(i), provider: "veri", purpose: "bounded training", maxCents: 1200 })));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect((await ledgers[0].snapshot()).reservedCents).toBe(1200);
  });
  it("retains uncertain costs and records overruns instead of hiding them", async () => {
    const path = join(await mkdtemp(join(tmpdir(), "greenlight-budget-")), "ledger.json");
    const ledger = new SpendLedger(path, 2000);
    await ledger.reserve({ id: "run", provider: "veri", purpose: "proof", maxCents: 300 });
    expect((await new SpendLedger(path, 2000).snapshot()).reservedCents).toBe(300);
    await ledger.settle("run", 350, "provider final invoice");
    expect((await ledger.snapshot()).spentCents).toBe(350);
    await expect(ledger.reserve({ id: "later", provider: "veri", purpose: "another", maxCents: 1 })).rejects.toThrow(/overrun/i);
  });
  it("is idempotent and rejects malformed or raised-cap state", async () => {
    const path = join(await mkdtemp(join(tmpdir(), "greenlight-budget-")), "ledger.json");
    const ledger = new SpendLedger(path, 2000);
    await ledger.reserve({ id: "once", provider: "anthropic", purpose: "smoke", maxCents: 5 });
    await expect(ledger.reserve({ id: "once", provider: "anthropic", purpose: "smoke", maxCents: 5 })).rejects.toThrow(/exists/i);
    await ledger.settle("once", 2, "usage");
    await ledger.settle("once", 2, "usage");
    await expect(ledger.settle("once", 1, "rewrite")).rejects.toThrow();
    const raw = JSON.parse(await readFile(path, "utf8")); raw.capCents = 2001;
    await writeFile(path, JSON.stringify(raw));
    await expect(ledger.snapshot()).rejects.toThrow(/cap/i);
  });
});
