import { readFileSync } from "node:fs";
import type { BenchCase } from "./core";
import { runEngine } from "./bridge";
let n = 0, bad = 0;
for (const split of ["dev", "test", "heldout"]) {
  for (const line of readFileSync(`bench/data/${split}.jsonl`, "utf8").trim().split("\n")) {
    const c: BenchCase = JSON.parse(line);
    const e = runEngine(c.spec);
    const ok = e.status === c.expected.status && e.worstMinCash === c.expected.worstMinCash &&
      (c.expected.criticalItems.length ? c.expected.criticalItems.includes(e.criticalItem) : e.criticalItem === "none");
    n++;
    if (!ok) { bad++; console.log("MISMATCH", c.id, JSON.stringify(c.expected), JSON.stringify(e)); }
  }
}
console.log(`engine vs oracle: ${n - bad}/${n} agree`);
