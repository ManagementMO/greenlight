/** Shared types, seeded RNG, and the INDEPENDENT oracle. The oracle never imports lib/domain. */
export type Status = "SUPPORTED" | "SHORTFALL" | "CONDITIONAL" | "NEEDS_INPUT";
export const STATUSES: Status[] = ["SUPPORTED", "SHORTFALL", "CONDITIONAL", "NEEDS_INPUT"];

export interface EventSpec {
  id: string;
  scope: "baseline" | "job";
  direction: "inflow" | "outflow";
  label: string;
  date: string; // ISO date
  amount: number; // whole USD
}
export interface OptionSpec {
  id: string;
  label: string;
  date?: string;
  amount?: number;
}
export interface UncertaintySpec {
  id: string;
  question: string;
  eventId: string;
  options: OptionSpec[];
}
export interface BlockerSpec {
  id: string;
  question: string;
  kind: "unknown_amount" | "conflict";
}
export interface CaseSpec {
  opening: number;
  reserve: number;
  events: EventSpec[];
  uncertainties: UncertaintySpec[];
  blockers: BlockerSpec[];
}
export interface Expected {
  status: Status;
  /** Lowest minimum cash over all joint scenarios, whole USD. null when NEEDS_INPUT. */
  worstMinCash: number | null;
  passing: number;
  total: number;
  /** Acceptable answers for the critical item. */
  criticalItems: string[];
}
export interface BenchCase {
  id: string;
  split: "dev" | "test" | "heldout";
  family: string;
  spec: CaseSpec;
  /** Plain-text documents shown to every contestant. */
  documents: string;
  /** Open items a contestant may name as critical. */
  items: { id: string; question: string }[];
  expected: Expected;
}

export function rng(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    step: (lo: number, hi: number, step: number) => lo + step * Math.floor(next() * ((hi - lo) / step + 1)),
    pick: <T>(xs: readonly T[]) => xs[Math.floor(next() * xs.length)],
    chance: (p: number) => next() < p,
  };
}

export const SNAPSHOT = "2026-10-06";
export function addDays(date: string, days: number) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Minimum cash for one joint scenario: events apply in date order, same-day outflows first. */
export function minCash(opening: number, events: EventSpec[]) {
  const sorted = [...events].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      Number(a.direction === "inflow") - Number(b.direction === "inflow"),
  );
  let cash = opening;
  let min = opening;
  for (const e of sorted) {
    cash += e.direction === "inflow" ? e.amount : -e.amount;
    min = Math.min(min, cash);
  }
  return min;
}

/** All joint scenarios: the product of every uncertainty's options. */
export function jointScenarios(spec: CaseSpec) {
  let combos: { picks: Record<string, string>; events: EventSpec[] }[] = [
    { picks: {}, events: spec.events },
  ];
  for (const u of spec.uncertainties) {
    combos = combos.flatMap((c) =>
      u.options.map((o) => ({
        picks: { ...c.picks, [u.id]: o.id },
        events: c.events.map((e) =>
          e.id === u.eventId ? { ...e, date: o.date ?? e.date, amount: o.amount ?? e.amount } : e,
        ),
      })),
    );
  }
  return combos;
}

export function oracle(spec: CaseSpec): Expected {
  const combos = jointScenarios(spec).map((c) => ({
    picks: c.picks,
    min: minCash(spec.opening, c.events),
  }));
  const passes = (min: number) => min >= spec.reserve;
  const passing = combos.filter((c) => passes(c.min)).length;
  const worst = Math.min(...combos.map((c) => c.min));
  if (spec.blockers.length)
    return {
      status: "NEEDS_INPUT",
      worstMinCash: null,
      passing,
      total: combos.length,
      criticalItems: spec.blockers.map((b) => b.id),
    };
  const status: Status =
    passing === 0 ? "SHORTFALL" : passing < combos.length ? "CONDITIONAL" : "SUPPORTED";
  let criticalItems: string[] = [];
  if (status === "CONDITIONAL")
    criticalItems = spec.uncertainties
      .filter((u) => {
        const branches = u.options.map((o) => combos.filter((c) => c.picks[u.id] === o.id));
        const allPass = branches.some((b) => b.every((c) => passes(c.min)));
        const someFail = branches.some((b) => b.some((c) => !passes(c.min)));
        return allPass && someFail;
      })
      .map((u) => u.id);
  return { status, worstMinCash: worst, passing, total: combos.length, criticalItems };
}
