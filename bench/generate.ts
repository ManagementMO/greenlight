/**
 * Build benchmark cases from canonical specs. Labels come from the independent oracle,
 * never from a model. Wording families: A,B = dev, C = test, D = heldout.
 * Run: npx tsx bench/generate.ts
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  BenchCase, CaseSpec, EventSpec, Status, UncertaintySpec, BlockerSpec,
  addDays, minCash, oracle, rng, SNAPSHOT, jointScenarios,
} from "./core";

type R = ReturnType<typeof rng>;
const SPLITS = {
  dev: { families: ["A", "B"], count: 40 },
  test: { families: ["C"], count: 30 },
  heldout: { families: ["D"], count: 20 },
} as const;
const TARGETS: Status[] = ["SUPPORTED", "CONDITIONAL", "SHORTFALL", "NEEDS_INPUT"];

function baseEvents(r: R): EventSpec[] {
  const ev = (id: string, scope: EventSpec["scope"], direction: EventSpec["direction"], label: string, date: string, amount: number): EventSpec =>
    ({ id, scope, direction, label, date, amount });
  const d = (iso: string, lo: number, hi: number) => addDays(iso, r.int(lo, hi));
  return [
    ev("existing-rent", "baseline", "outflow", "shop rent and overhead", d("2026-10-07", 0, 2), r.step(6000, 10000, 500)),
    ev("existing-payroll", "baseline", "outflow", "existing business payroll", d("2026-10-09", 0, 2), r.step(14000, 22000, 500)),
    ev("legacy-supplier", "baseline", "outflow", "previously committed supplier settlement", d("2026-10-10", 0, 3), r.step(15000, 30000, 500)),
    ev("job-deposit", "job", "inflow", "deposit", "2026-10-07", 42000),
    ev("materials-one", "job", "outflow", "air-handler delivery", d("2026-10-12", -1, 2), r.step(20000, 30000, 500)),
    ev("job-labor-one", "job", "outflow", "installation crew payroll", d("2026-10-17", -1, 2), r.step(12000, 18000, 500)),
    ev("phase-receipt", "job", "inflow", "phase-one payment", "2026-10-24", 30000),
    ev("job-labor-two", "job", "outflow", "commissioning crew payroll", d("2026-10-31", -2, 2), r.step(12000, 18000, 500)),
    ev("materials-two", "job", "outflow", "controls and ductwork delivery", d("2026-11-04", -1, 2), r.step(20000, 30000, 500)),
    ev("final-receipt", "job", "inflow", "final contract payment", "2026-11-20", 48000),
  ];
}

function buildSpec(r: R, target: Status): CaseSpec | null {
  const events = baseEvents(r);
  const find = (id: string) => events.find((e) => e.id === id)!;
  const uncertainties: UncertaintySpec[] = [];
  const reserve = r.step(8000, 15000, 1000);

  if (r.chance(0.7)) {
    const early = addDays("2026-10-21", r.int(0, 7));
    const late = addDays("2026-11-10", r.int(0, 12));
    find("phase-receipt").date = early;
    uncertainties.push({
      id: "phase-collection",
      question: `Will the $30,000 phase-one payment reach the bank on ${early} or ${late}?`,
      eventId: "phase-receipt",
      options: [
        { id: "early", label: early, date: early },
        { id: "late", label: late, date: late },
      ],
    });
  } else find("phase-receipt").date = addDays("2026-10-21", r.int(0, 20));

  const surcharges = r.pick([0, 1, 1, 2]);
  (["materials-one", "materials-two"] as const).slice(0, surcharges).forEach((id, i) => {
    const e = find(id);
    const extra = r.step(2000, 7000, 500);
    uncertainties.push({
      id: `supplier-${i + 1}`,
      question: `Will the ${i === 0 ? "air-handler" : "controls"} supplier honor its quoted $${e.amount.toLocaleString("en-US")} price?`,
      eventId: id,
      options: [
        { id: "quoted", label: "quote honored", amount: e.amount },
        { id: "surcharge", label: `surcharge of $${extra.toLocaleString("en-US")}`, amount: e.amount + extra },
      ],
    });
  });

  if (r.chance(0.4)) {
    const a = "2026-11-18", b = "2026-11-20";
    uncertainties.push({
      id: "final-run",
      question: `Will the $48,000 final payment settle on ${a} or ${b}?`,
      eventId: "final-receipt",
      options: [
        { id: "early", label: a, date: a },
        { id: "standard", label: b, date: b },
      ],
    });
    find("final-receipt").date = b;
  }

  const blockers: BlockerSpec[] = [];
  if (target === "NEEDS_INPUT")
    blockers.push(
      r.chance(0.5)
        ? { id: "payroll-tax", question: "What is the employer payroll-tax amount due November 10?", kind: "unknown_amount" }
        : { id: "phase-acceptance", question: "Has the customer formally accepted phase one, given the open punch list?", kind: "conflict" },
    );

  const spec: CaseSpec = { opening: 0, reserve, events, uncertainties, blockers };
  // Shift-invariant: min(opening) = opening + min(0). Choose opening to land on the target status.
  const mins = jointScenarios({ ...spec, blockers: [] }).map((c) => minCash(0, c.events));
  const worst = Math.min(...mins), best = Math.max(...mins);
  const spread = best - worst;
  let opening: number;
  if (target === "SUPPORTED" || target === "NEEDS_INPUT") opening = reserve - worst + r.step(1000, 8000, 500);
  else if (target === "SHORTFALL") opening = reserve - best - r.step(500, 8000, 500);
  else {
    if (spread < 3000) return null;
    opening = reserve - worst - r.step(500, Math.max(500, spread - 500), 500);
  }
  if (opening < 5000) return null;
  spec.opening = opening;
  return oracle(spec).status === target ? spec : null;
}

const usd = (family: string, n: number) => {
  const s = n.toLocaleString("en-US");
  if (family === "A") return `$${s}`;
  if (family === "B") return `USD ${s}`;
  if (family === "C") return n % 1000 === 0 ? `$${n / 1000}K` : `$${(n / 1000).toFixed(1)}K`;
  return `${s} dollars`;
};
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const day = (family: string, iso: string) => {
  const [, m, dd] = iso.split("-").map(Number);
  if (family === "A") return `${MONTHS[m - 1]} ${dd}`;
  if (family === "B") return `${MONTHS[m - 1].slice(0, 3)} ${dd}`;
  if (family === "C") return `${dd} ${MONTHS[m - 1].slice(0, 3)}`;
  return iso;
};

function render(family: string, spec: CaseSpec, r: R) {
  const $ = (n: number) => usd(family, n);
  const D = (iso: string) => day(family, iso);
  const ev = (id: string) => spec.events.find((e) => e.id === id)!;
  const u = (id: string) => spec.uncertainties.find((x) => x.id === id);
  const L: string[] = [];
  const T = {
    A: {
      ledger: `LEDGER NOTE. Settled bank balance at close on ${D(SNAPSHOT)} is ${$(spec.opening)}; restricted funds are ${$(0)}. Company policy requires cash never to fall below a reserve of ${$(spec.reserve)}.`,
      cal: `FORWARD CALENDAR (complete through ${D("2026-11-25")}). Existing commitments: ${spec.events.filter((e) => e.scope === "baseline").map((e) => `${e.label} ${$(e.amount)} on ${D(e.date)}`).join("; ")}.`,
      contract: `CONTRACT. Total price ${$(120000)}. Deposit ${$(42000)} is received ${D("2026-10-07")}. ${$(30000)} becomes invoice-eligible after phase-one inspection and customer receipt of the insurance certificate, both expected ${D("2026-10-20")}. The final ${$(48000)} is due after commissioning is accepted on ${D("2026-11-05")}.`,
      budget: `JOB BUDGET. ${spec.events.filter((e) => e.scope === "job" && e.direction === "outflow").map((e) => `${e.label} ${$(e.amount)} on ${D(e.date)}`).join("; ")}.`,
    },
    B: {
      ledger: `Bank: we have ${$(spec.opening)} settled as of ${D(SNAPSHOT)}, nothing restricted. We must keep at least ${$(spec.reserve)} in the account at all times.`,
      cal: `Calendar check (nothing else is due before ${D("2026-11-25")}): ${spec.events.filter((e) => e.scope === "baseline").map((e) => `${D(e.date)} - ${e.label}, ${$(e.amount)}`).join(" | ")}.`,
      contract: `The signed contract is for ${$(120000)}. We collect a ${$(42000)} deposit on ${D("2026-10-07")}. Phase one (${$(30000)}) can be billed once the inspection passes and the customer has the insurance certificate (expected ${D("2026-10-20")}). The last ${$(48000)} follows final acceptance on ${D("2026-11-05")}.`,
      budget: `Costs for this job: ${spec.events.filter((e) => e.scope === "job" && e.direction === "outflow").map((e) => `${e.label}, ${$(e.amount)}, paid ${D(e.date)}`).join("; ")}.`,
    },
    C: {
      ledger: `Cash on hand ${D(SNAPSHOT)}: ${$(spec.opening)} (zero restricted). Reserve floor: ${$(spec.reserve)}.`,
      cal: `Already committed, no other items through ${D("2026-11-25")}: ${spec.events.filter((e) => e.scope === "baseline").map((e) => `${e.label} ${$(e.amount)} ${D(e.date)}`).join(", ")}.`,
      contract: `Contract ${$(120000)}: ${$(42000)} deposit lands ${D("2026-10-07")}; ${$(30000)} phase invoice unlocks after inspection + insurance certificate (both ${D("2026-10-20")}); ${$(48000)} final after sign-off ${D("2026-11-05")}.`,
      budget: `Job spend: ${spec.events.filter((e) => e.scope === "job" && e.direction === "outflow").map((e) => `${e.label} ${$(e.amount)} on ${D(e.date)}`).join("; ")}.`,
    },
    D: {
      ledger: `As of ${D(SNAPSHOT)} the company holds ${$(spec.opening)} in settled funds, none of it restricted, and its policy forbids the balance from dipping under ${$(spec.reserve)}.`,
      cal: `The owner confirms the schedule of existing outflows is exhaustive up to ${D("2026-11-25")}. They are: ${spec.events.filter((e) => e.scope === "baseline").map((e) => `${e.label} (${$(e.amount)}, ${D(e.date)})`).join("; ")}.`,
      contract: `Per the agreement the price is ${$(120000)}. A deposit of ${$(42000)} arrives ${D("2026-10-07")}. A further ${$(30000)} may be invoiced only after BOTH the inspection is passed and the customer holds the insurance certificate; both are anticipated ${D("2026-10-20")}. The remaining ${$(48000)} is payable once final acceptance occurs ${D("2026-11-05")}.`,
      budget: `Expected expenditure on the job: ${spec.events.filter((e) => e.scope === "job" && e.direction === "outflow").map((e) => `${e.label} - ${$(e.amount)} - ${D(e.date)}`).join("; ")}.`,
    },
  }[family as "A"]!;
  L.push(T.ledger, T.cal, T.contract, T.budget);

  const pc = u("phase-collection");
  const phaseFixed = ev("phase-receipt").date;
  const phaseLine = pc
    ? { A: `CUSTOMER EMAIL. If the phase invoice is approved for our expedited run, the ${$(30000)} will settle ${D(pc.options[0].date!)}; otherwise our next run settles ${D(pc.options[1].date!)}.`,
        B: `Email from the customer's AP team: expedited approval means ${$(30000)} reaches you ${D(pc.options[0].date!)}, otherwise it waits until ${D(pc.options[1].date!)}. We cannot say which yet.`,
        C: `Customer AP: ${$(30000)} phase money arrives either ${D(pc.options[0].date!)} (fast run) or ${D(pc.options[1].date!)} (normal run).`,
        D: `The customer's accounts-payable office has indicated that settlement of the ${$(30000)} will occur on ${D(pc.options[0].date!)} if expedited, or on ${D(pc.options[1].date!)} in the ordinary cycle; the choice is undetermined.` }[family as "A"]
    : { A: `CUSTOMER EMAIL. The ${$(30000)} phase payment is confirmed to settle ${D(phaseFixed)}.`,
        B: `Email from the customer's AP team: the ${$(30000)} will be in your account ${D(phaseFixed)}, confirmed.`,
        C: `Customer AP confirms ${$(30000)} phase money lands ${D(phaseFixed)}.`,
        D: `The customer's accounts-payable office has confirmed that the ${$(30000)} will settle on ${D(phaseFixed)}.` }[family as "A"];
  L.push(phaseLine);

  for (const un of spec.uncertainties.filter((x) => x.id.startsWith("supplier"))) {
    const e = ev(un.eventId), extra = un.options[1].amount! - e.amount;
    L.push({ A: `SUPPLIER NOTE. The ${e.label} is quoted at ${$(e.amount)} but may rise by ${$(extra)}; this has not been resolved.`,
             B: `Supplier says the ${e.label} quote (${$(e.amount)}) could go up by ${$(extra)}. Undecided.`,
             C: `${e.label}: quote ${$(e.amount)}, possible +${$(extra)} surcharge, unresolved.`,
             D: `The supplier has warned that the ${e.label}, quoted at ${$(e.amount)}, might carry an additional ${$(extra)}; this remains open.` }[family as "A"]);
  }
  const fr = u("final-run");
  if (!fr)
    L.push({ A: `CUSTOMER EMAIL. The final ${$(48000)} is confirmed to settle ${D(ev("final-receipt").date)}.`,
             B: `Customer confirms the last ${$(48000)} will be in your account ${D(ev("final-receipt").date)}.`,
             C: `Final ${$(48000)} settles ${D(ev("final-receipt").date)}, confirmed.`,
             D: `The customer has confirmed that the final ${$(48000)} will settle on ${D(ev("final-receipt").date)}.` }[family as "A"]);
  if (fr)
    L.push({ A: `CUSTOMER EMAIL. The final ${$(48000)} will settle either ${D(fr.options[0].date!)} or ${D(fr.options[1].date!)}.`,
             B: `Customer says the final ${$(48000)} might hit your account ${D(fr.options[0].date!)} or ${D(fr.options[1].date!)}.`,
             C: `Final ${$(48000)}: ${D(fr.options[0].date!)} or ${D(fr.options[1].date!)}, customer undecided.`,
             D: `Settlement of the final ${$(48000)} is expected on ${D(fr.options[0].date!)} or, failing that, ${D(fr.options[1].date!)}.` }[family as "A"]);
  for (const b of spec.blockers)
    L.push(b.kind === "unknown_amount"
      ? { A: `PAYROLL NOTE. Payroll figures are gross-only. Employer payroll taxes due ${D("2026-11-10")} have not been supplied.`,
          B: `Heads up: the payroll numbers are gross only, so we don't know the employer tax bill due ${D("2026-11-10")}.`,
          C: `Payroll tax due ${D("2026-11-10")}: amount unknown (gross-only data).`,
          D: `The payroll records contain gross wages only; the employer tax liability payable ${D("2026-11-10")} is not known.` }[family as "A"]
      : { A: `ACCEPTANCE NOTE. The customer contact said "approved to bill," but the authorized project manager still lists inspection punch items as unresolved.`,
          B: `The customer's contact told us phase one is "approved to bill", but the project manager says punch-list items are still open.`,
          C: `Phase-one acceptance disputed: contact says "approved to bill", PM says punch items open.`,
          D: `One customer representative described phase one as "approved to bill", whereas the authorized project manager reports unresolved punch-list items.` }[family as "A"]);
  // Shuffle the middle documents so position carries no information.
  const head = L.slice(0, 1), rest = L.slice(1);
  for (let i = rest.length - 1; i > 0; i--) { const j = r.int(0, i); [rest[i], rest[j]] = [rest[j], rest[i]]; }
  return [...head, ...rest].join("\n");
}

function main() {
  const out = resolve("bench/data");
  mkdirSync(out, { recursive: true });
  const manifest: Record<string, unknown> = { generatedBy: "bench/generate.ts", constructed: true, splits: {} };
  for (const [split, cfg] of Object.entries(SPLITS)) {
    const r = rng(`greenlight-bench-v1-${split}`);
    const cases: BenchCase[] = [];
    let attempts = 0;
    while (cases.length < cfg.count && attempts++ < 10000) {
      const target = TARGETS[cases.length % TARGETS.length];
      const spec = buildSpec(r, target);
      if (!spec) continue;
      const family = cfg.families[cases.length % cfg.families.length];
      const expected = oracle(spec);
      cases.push({
        id: `${split}-${String(cases.length + 1).padStart(2, "0")}`,
        split: split as BenchCase["split"],
        family,
        spec,
        documents: render(family, spec, r),
        items: [...spec.uncertainties, ...spec.blockers].map((x) => ({ id: x.id, question: x.question })),
        expected,
      });
    }
    const body = cases.map((c) => JSON.stringify(c)).join("\n") + "\n";
    writeFileSync(resolve(out, `${split}.jsonl`), body);
    const tally: Record<string, number> = {};
    for (const c of cases) tally[c.expected.status] = (tally[c.expected.status] ?? 0) + 1;
    (manifest.splits as Record<string, unknown>)[split] = {
      count: cases.length, sha256: createHash("sha256").update(body).digest("hex"), statuses: tally, families: cfg.families,
    };
    console.log(split, cases.length, JSON.stringify(tally));
  }
  writeFileSync(resolve(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
}
main();
