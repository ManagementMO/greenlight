"use client";

// Answer: what the user sees after "Check it". Same design system as the home
// screen and /landing (dark, Lora, mono labels, glass cards), scoped under `.av`.
// Every figure comes from the deterministic engine; nothing here is a model call.
//
// Desktop dashboard, read left to right, top to bottom:
//   1. Verdict + the numbers behind it   |  the cash chart, and what drives its low point
//   2. It depends on  |  Smallest fix (when there is one)  |  Detail: a collapsible, fixed-height bento with tabs
//      for cash movements, assumptions and limits, and how it was answered

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { applyProposal, evaluateDecision, withScenarioAnswer } from "@/lib/domain";
import type { CashPath, DecisionInput, DecisionResult } from "@/lib/domain";
import { curveStepAfter } from "@visx/curve";
import { LineChart, Line as BklitLine } from "@/components/charts/line-chart";
import { Grid } from "@/components/charts/grid";
import { XAxis } from "@/components/charts/x-axis";
import { YAxis } from "@/components/charts/y-axis";
import { ChartTooltip } from "@/components/charts/tooltip";
import "@/app/charts.css";
import type { Routing } from "@/app/api/analyze/route";
import { RecordedRun } from "./recorded-run";
import llmOnly from "@/data/artifacts/llm-only-baseline.json";
import "./answer-view.css";

const Gradient = dynamic(() => import("@/app/landing/gradient-background"), { ssr: false });

const usd = (cents: number) => {
  const s = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Math.abs(cents) / 100);
  return cents < 0 ? `−${s}` : s;
};
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const STATE: Record<string, string> = { MET: "Met", NOT_MET: "Not met", UNKNOWN: "Unknown", CONFLICTING: "Conflicting", UNCHECKED: "Unchecked" };

function headline(result: DecisionResult, reserve: number) {
  switch (result.status) {
    case "SUPPORTED_IN_TESTED_SCENARIOS":
      return { title: "Yes, you can take it.", sub: `Cash stays above your ${usd(reserve)} reserve in every case we tested.` };
    case "SHORTFALL":
      return { title: "Not on these terms.", sub: `Cash drops ${usd(result.reserveGapCents)} below your ${usd(reserve)} reserve in the worst case.` };
    case "CONDITIONAL":
      return { title: "Yes, if the timing works out.", sub: `Cash stays above your ${usd(reserve)} reserve in ${result.passingScenarioCount} of ${result.scenarioCount} cases. It comes down to one question.` };
    default:
      return { title: "Not enough to answer yet.", sub: "Some facts the answer depends on are missing. Fill them in below and it updates." };
  }
}

// ---------- chart (Bklit UI line chart, no animation) ----------

type Line = { id: string; label: string; path: CashPath; color: string };

const COLOR = { base: "rgba(255,255,255,.45)", pass: "#32d17b", fail: "#ff6b5e", fix: "#9fe3c4" };
const shortUsd = (dollars: number) =>
  `${dollars < 0 ? "−" : ""}$${Math.abs(dollars) >= 1000 ? `${Math.round(Math.abs(dollars) / 1000)}k` : Math.round(Math.abs(dollars))}`;

/** One row per date where any line moves; each line's value is its balance after that day's movements. */
function chartRows(lines: Line[], start: string, end: string) {
  const dates = [...new Set([start, end, ...lines.flatMap((l) => l.path.timeline.map((p) => p.date))])].filter((d) => d >= start && d <= end).sort();
  return dates.map((date) => {
    const row: Record<string, unknown> = { date: new Date(`${date}T12:00:00Z`) };
    for (const l of lines) {
      const pts = l.path.timeline;
      const last = [...pts].reverse().find((p) => p.date <= date);
      const cents = last ? last.cashCents : pts[0] ? pts[0].cashCents - pts[0].deltaCents : 0;
      row[l.id] = cents / 100;
    }
    return row;
  });
}

function Chart({ lines, start, end, reserve }: { lines: Line[]; start: string; end: string; reserve: number }) {
  const data = useMemo(() => chartRows(lines, start, end), [lines, start, end]);
  return (
    <div className="av-chart">
      <LineChart data={data} aspectRatio="2.8 / 1" margin={{ top: 16, right: 12, bottom: 32, left: 56 }} animationDuration={0} yDomainTween={false}>
        <Grid horizontal highlightRowValues={[reserve / 100]} highlightRowStroke="#ff8f7d" />
        {lines.map((l) => (
          <BklitLine key={l.id} dataKey={l.id} stroke={l.color} strokeWidth={l.id === "base" ? 1.5 : 2.4} curve={curveStepAfter} animate={false} fadeEdges={false} />
        ))}
        <YAxis formatValue={shortUsd} />
        <XAxis numTicks={5} />
        <ChartTooltip rows={(point) => lines.map((l) => ({ color: l.color, label: l.label, value: usd(Math.round(Number(point[l.id]) * 100)) }))} />
      </LineChart>
    </div>
  );
}

// ---------- cost formatting for the "How it was answered" tab ----------

const money = (usd: number) => (usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(3)}`);
const secs = (ms: number) => `${(ms / 1000).toFixed(ms < 1000 ? 2 : 1)} s`;

// ---------- view ----------

type Tab = "movements" | "limits" | "how";

export function AnswerView({ question, input, routing = null, onChange, onNewQuestion, onOpenWorkspace }: {
  question: string;
  input: DecisionInput;
  /** Present for real uploads; null for the synthetic sample. */
  routing?: Routing | null;
  onChange: (next: DecisionInput) => void;
  onNewQuestion: () => void;
  onOpenWorkspace: (evidenceId?: string) => void;
}) {
  const [compare, setCompare] = useState(false);
  const [tab, setTab] = useState<Tab>("movements");
  const [detailOpen, setDetailOpen] = useState(true);
  const result = useMemo(() => evaluateDecision(input), [input]);
  const reserve = input.reserveCents ?? 0;
  const needsInput = result.status === "NEEDS_INPUT";

  // Pin the deciding question from the first, unanswered result so it stays on screen once answered.
  const [decidingId] = useState(() => result.nextQuestions[0]?.id ?? null);
  const deciding = useMemo(() => {
    if (!decidingId) return null;
    const open = evaluateDecision(withScenarioAnswer(input, decidingId, undefined));
    return open.nextQuestions.find((q) => q.id === decidingId) ?? null;
  }, [input, decidingId]);
  const chosen = decidingId ? input.answers?.[decidingId] : undefined;
  const decides = !!deciding && new Set(deciding.branches.map((b) => `${b.passingCount === b.scenarioCount}|${b.worstReserveGapCents}`)).size > 1;

  const proposal = result.proposal?.status === "AVAILABLE" ? result.proposal : null;
  const fixed = useMemo(() => {
    if (!compare || !proposal) return null;
    try { return evaluateDecision(applyProposal(input, proposal)); } catch { return null; }
  }, [compare, proposal, input]);

  const head = headline(result, reserve);
  // Plot the range, not all cases: without the job, the best and worst tested cases, and the fix when shown.
  const lines: Line[] = useMemo(() => {
    const byLow = [...result.outcomes].sort((x, y) => x.withJob.minimumCents - y.withJob.minimumCents);
    const worst = byLow[0];
    const best = byLow.at(-1);
    const out: Line[] = [{ id: "base", label: "Without the job", path: result.baseline, color: COLOR.base }];
    if (best && best !== worst) out.push({ id: "best", label: "Best case", path: best.withJob, color: best.passes ? COLOR.pass : COLOR.fail });
    if (worst) out.push({ id: "worst", label: best !== worst ? "Worst case" : "With the job", path: worst.withJob, color: worst.passes ? COLOR.pass : COLOR.fail });
    if (fixed) out.push({ id: "fix", label: "With the fix", path: fixed.withJob, color: COLOR.fix });
    return out;
  }, [result, fixed]);

  // Why the low point happens: what leaves and arrives up to that day in the worst case.
  const low = result.withJob;
  const movements = low.timeline.filter((p) => p.scope !== "snapshot" && p.deltaCents !== 0);
  const beforeLow = movements.filter((p) => p.date <= low.minimumDate);
  const outBefore = beforeLow.filter((p) => p.deltaCents < 0);
  const inBefore = beforeLow.filter((p) => p.deltaCents > 0);
  const drivers = [...outBefore].sort((a, b) => a.deltaCents - b.deltaCents).slice(0, 3);
  const sum = (ps: typeof movements) => ps.reduce((s, p) => s + p.deltaCents, 0);
  const cushion = low.minimumCents - reserve;
  const [reserveDraft, setReserveDraft] = useState("");
  const evidenceTitle = (id: string) => input.evidence.find((e) => e.id === id)?.title ?? id;
  const missingDates = input.job.events.filter((e) => !e.date && e.amountCents != null);
  const missingReasons = [...new Set(result.reasons.filter((x) => !["BASELINE_SHORTFALL", "MIXED_SCENARIOS", "INVALID_SCENARIO_EVENT", "INCOMPLETE_HORIZON"].includes(x.code)).map((x) => x.message))].slice(0, 4);

  return (
    <div className="av">
      {/* Same background as the home screen, held as a still frame. */}
      <div className="av-bg" aria-hidden="true">
        <Gradient colors={["#0b8a63", "#5b48c9", "#101412"]} still />
      </div>

      {/* Top bar: the question and the job stay in view; they're the context for everything below. */}
      <header className="av-nav">
        <button type="button" className="av-brand" onClick={onNewQuestion}>Headroom</button>
        <p className="av-asked"><span>You asked</span>“{question}”</p>
        <span className="av-job">{input.job.customer} · {usd(input.job.priceCents)} job</span>
        <nav>
          <button type="button" onClick={() => onOpenWorkspace()}>Full workspace</button>
          <button type="button" className="av-new" onClick={onNewQuestion}>New question</button>
        </nav>
      </header>

      <main className="av-main">
        {/* ---------- Row 1: the answer, and the picture of it ---------- */}
        <section className="av-verdict av-panel">
          <h1>{head.title}</h1>
          <p className="av-sub">{head.sub}</p>

          {input.reserveCents == null ? (
            <form
              className="av-ask"
              onSubmit={(e) => {
                e.preventDefault();
                const dollars = Number(reserveDraft.replace(/[$,\s]/g, ""));
                if (reserveDraft.trim() && Number.isFinite(dollars) && dollars >= 0) onChange({ ...input, reserveCents: Math.round(dollars * 100) });
              }}
            >
              <label htmlFor="av-reserve">How much cash do you always want to keep in the bank?</label>
              <div>
                <input id="av-reserve" inputMode="decimal" placeholder="e.g. 20,000" value={reserveDraft} onChange={(e) => setReserveDraft(e.target.value)} />
                <button type="submit" className="av-btn-solid">Check</button>
              </div>
            </form>
          ) : needsInput ? (
            <div className="av-ask">
              <p className="av-eyebrow">What&apos;s missing</p>
              <ul className="av-list">
                {input.openingCashCents == null
                  ? <li>There&apos;s no bank balance. Attach your accounting books (the .json export), or say how much is in the bank in your question.</li>
                  : missingReasons.map((m) => <li key={m}>{m}</li>)}
              </ul>
              {missingDates.map((e) => (
                <label key={e.id} className="av-date-fix">
                  <span>When do you expect <b>{usd(e.amountCents!)}</b> ({e.label})?</span>
                  <input
                    type="date"
                    min={input.snapshotDate}
                    max={input.horizonDate}
                    onChange={(ev) => ev.target.value && onChange({ ...input, job: { ...input.job, events: input.job.events.map((x) => (x.id === e.id ? { ...x, date: ev.target.value } : x)) } })}
                  />
                </label>
              ))}
            </div>
          ) : (
            // The three numbers the verdict rests on.
            <dl className="av-nums">
              <div className={low.minimumCents < reserve ? "is-fail" : "is-pass"}>
                <dt>Lowest cash</dt>
                <dd>{usd(low.minimumCents)}</dd>
                <span>{day(low.minimumDate)}, worst case</span>
              </div>
              <div className={cushion < 0 ? "is-fail" : "is-pass"}>
                <dt>{cushion < 0 ? "Short of reserve" : "Above reserve"}</dt>
                <dd>{usd(Math.abs(cushion))}</dd>
                <span>vs your {usd(reserve)} cushion</span>
              </div>
            </dl>
          )}
        </section>

        <section className="av-panel av-chart-card">
          <div className="av-card-head">
            <p className="av-eyebrow">Your cash, day by day</p>
            <div className="av-legend">
              {lines.map((l) => <span key={l.id} style={{ color: l.color }}>{l.label}</span>)}
              <span className="is-reserve">Your {usd(reserve)} reserve</span>
            </div>
          </div>
          <Chart lines={lines} start={input.snapshotDate} end={input.horizonDate} reserve={reserve} />
          {drivers.length > 0 && (
            <div className="av-drivers">
              <p>
                <b>Why {day(low.minimumDate)} is the low point:</b> {usd(-sum(outBefore))} goes out before then and only {usd(sum(inBefore))} comes in.
              </p>
              <ul>
                {drivers.map((p) => (
                  <li key={`${p.eventId}-${p.date}`}><span>{day(p.date)}</span>{p.label}<em>{usd(p.deltaCents)}</em></li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* ---------- Row 2: what to do about it ---------- */}
        <section className="av-panel av-card-row">
          <p className="av-eyebrow">It depends on</p>
          {deciding && decides ? (
            <>
              <h2>{deciding.question}</h2>
              <div className="av-branches">
                {deciding.branches.map((b) => {
                  const ok = b.worstReserveGapCents <= 0;
                  return (
                    <button
                      key={b.optionId}
                      type="button"
                      className={`av-branch ${ok ? "is-pass" : "is-fail"}${chosen === b.optionId ? " is-on" : ""}`}
                      aria-pressed={chosen === b.optionId}
                      onClick={() => { setCompare(false); onChange(withScenarioAnswer(input, deciding.id, chosen === b.optionId ? undefined : b.optionId)); }}
                    >
                      <b>{b.label}</b>
                      <span>{ok ? "Clears your reserve" : `${usd(b.worstReserveGapCents)} short`}</span>
                    </button>
                  );
                })}
              </div>
              <p className="av-hint">Ask {deciding.owner} by {day(deciding.requiredBy)}. Tap an answer to see it on the chart.</p>
            </>
          ) : (
            <>
              <h2>{needsInput ? "The missing facts on the left." : result.status === "SHORTFALL" ? "Nothing you could find out changes it: it falls short in every case." : "Nothing open: every case clears."}</h2>
              <p className="av-hint">{needsInput ? "Once they're filled in, the open questions show up here." : `We tested ${plural(result.scenarioCount, "combination")} of payment timing and conditions, and none of them changes the answer.`}</p>
            </>
          )}
        </section>

        {proposal ? (
          <section className="av-panel av-card-row av-fix">
            <p className="av-eyebrow">Smallest fix that works</p>
            <h2>Ask for {usd(proposal.additionalDepositCents)} more upfront.</h2>
            <dl className="av-swap">
              <div><dt>Deposit</dt><dd><s>{usd(proposal.originalDepositCents)}</s> {usd(proposal.proposedDepositCents)}</dd><span>by {day(proposal.proposedCollectionDate)}</span></div>
              <div><dt>Final payment</dt><dd><s>{usd(proposal.originalFinalReceiptCents)}</s> {usd(proposal.proposedFinalReceiptCents)}</dd><span>total stays {usd(proposal.totalRevenueCents)}</span></div>
            </dl>
            <div className="av-fix-btns">
              <button type="button" className="av-btn-solid" aria-pressed={compare} onClick={() => setCompare((v) => !v)}>{compare ? "Hide on chart" : "Show on chart"}</button>
              <button type="button" className="av-btn-ghost" onClick={() => onOpenWorkspace()}>Draft the request →</button>
            </div>
          </section>
        ) : null}

        <section className={`av-panel av-tabs${proposal ? "" : " is-wide"}${detailOpen ? "" : " is-closed"}`}>
          <div className="av-tabbar" role="tablist">
            <button type="button" className="av-collapse" aria-expanded={detailOpen} aria-label={detailOpen ? "Collapse details" : "Expand details"} onClick={() => setDetailOpen((v) => !v)}>
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
            </button>
            {([
              ["movements", `Cash movements (${movements.length})`],
              ["limits", `Assumptions (${input.assumptions.length + input.unresolvedTerms.length})`],
              ["how", "How it was answered"],
            ] as [Tab, string][]).map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={detailOpen && tab === id} className={detailOpen && tab === id ? "is-on" : ""} onClick={() => { setTab(id); setDetailOpen(true); }}>{label}</button>
            ))}
          </div>

          {detailOpen && <div className="av-tabbody">

          {tab === "movements" && (
            <table className="av-table">
              <thead><tr><th>Date</th><th>Movement</th><th>Source</th><th className="av-amt">Amount</th><th className="av-amt">Balance</th></tr></thead>
              <tbody>
                {movements.map((p) => (
                  <tr key={`${p.eventId}-${p.date}`} className={p.date === low.minimumDate ? "is-low" : ""}>
                    <td className="av-mono">{day(p.date)}</td>
                    <td>{p.label}{p.assumed && <em> · assumed</em>}</td>
                    <td>{p.sourceIds.slice(0, 1).map((id) => <button key={id} type="button" className="av-src" onClick={() => onOpenWorkspace(id)}>{evidenceTitle(id)}</button>)}</td>
                    <td className={`av-mono av-amt ${p.deltaCents < 0 ? "is-out" : "is-in"}`}>{p.deltaCents > 0 ? "+" : ""}{usd(p.deltaCents)}</td>
                    <td className={`av-mono av-amt ${p.cashCents < reserve ? "is-out" : ""}`}>{usd(p.cashCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === "limits" && (
            <ul className="av-list av-limits">
              {input.unresolvedTerms.map((t) => <li key={t} className="is-fail">{t}</li>)}
              {input.assumptions.map((t) => <li key={t}>{t}</li>)}
              {input.assumptions.length + input.unresolvedTerms.length === 0 && <li>No extra assumptions beyond the sources listed.</li>}
            </ul>
          )}

          {tab === "how" && (routing ? (
            <div className="av-live-run">
              {/* One card per step, left to right in the order they ran. */}
              <ol className="av-pipe">
                <li className="is-llm">
                  <b>Claude</b>
                  <p>Read the documents and quoted the terms. No arithmetic.</p>
                  <strong>{routing.llm ? secs(routing.llm.ms) : "—"}</strong>
                  <span>{routing.llm ? `${routing.llm.model} · ${(routing.llm.inputTokens + routing.llm.outputTokens).toLocaleString()} tokens` : "Not used: no model key"}</span>
                  <em>{routing.llm ? money(routing.llm.costUsd) : "$0"}</em>
                </li>
                <li className="is-qwen">
                  <b>Qwen V5</b>
                  <p>Our fine-tune turned each payment clause into rules.</p>
                  <strong>{routing.qwen ? secs(routing.qwen.ms) : "—"}</strong>
                  <span>{routing.qwen
                    ? `${plural(routing.qwen.clauses.length, "clause")} · ${routing.qwen.clauses.filter((c) => c.status !== "INVALID").length} valid · ${routing.qwen.clauses.filter((c) => c.status === "INVALID").length} fell back to Claude`
                    : "Not used this run"}</span>
                  <em>{routing.qwen ? "GPU time" : "$0"}</em>
                </li>
                <li className="is-jev">
                  <b>Jev</b>
                  <p>Answered the yes/no checks that feed the forecast.</p>
                  <strong>{routing.jev ? `${routing.jev.ms}ms` : "—"}</strong>
                  <span>{routing.jev ? `${routing.jev.questions} questions in ${plural(routing.jev.calls, "call")}` : "No conditions to check"}</span>
                  <em>{routing.jev ? money(routing.jev.costUsd) : "$0"}</em>
                </li>
                <li className="is-code">
                  <b>Fixed code</b>
                  <p>Did every dollar and date, and tested every case.</p>
                  <strong>instant</strong>
                  <span>{routing.code ? `${routing.code.records.toLocaleString()} book records · ` : ""}{plural(movements.length, "cash movement")} · {plural(result.scenarioCount, "case")}</span>
                  <em>$0</em>
                </li>
              </ol>

              {routing.jev && (
                <section className="av-jevgrid">
                  <p className="av-eyebrow">What Jev checked</p>
                  <ul className="av-checks">
                    {routing.jev.checks.map((c) => (
                      <li key={c.id}><span className={`av-jv is-${c.state.toLowerCase()}`}>{STATE[c.state]}</span><span>{c.label}: {c.condition}{c.source === "qwen" ? " (read by Qwen)" : ""}</span><em>{c.confidence != null ? `${Math.round(c.confidence * 100)}%` : ""}</em></li>
                    ))}
                    {routing.jev.catalog.map((c) => (
                      <li key={c.id}><span className={`av-jv is-${c.state.toLowerCase()}`}>{STATE[c.state]}</span><span>{c.question}</span><em>{c.confidence != null ? `${Math.round(c.confidence * 100)}%` : ""}</em></li>
                    ))}
                  </ul>
                </section>
              )}

              <div className="av-runfoot">
                {routing.jev && (
                  <p className="av-compare">
                    This run: <b>{money((routing.llm?.costUsd ?? 0) + routing.jev.costUsd)}</b> · {secs((routing.llm?.ms ?? 0) + (routing.qwen?.ms ?? 0) + routing.jev.ms)}.
                    {" "}One LLM doing it all, measured once on the Harbor Lane demo files: <b className="is-llm">{money(llmOnly.costUsd)}</b> · {secs(llmOnly.ms)},
                    {" "}{llmOnly.agreeWithJev}/{llmOnly.questions} same answers.
                  </p>
                )}
                <ul className="av-files">
                  {routing.files.map((f) => <li key={f.name} className={`is-${f.route}`} title={f.detail}><code>{f.name}</code><span>{f.detail}</span></li>)}
                </ul>
              </div>
            </div>
          ) : (
            <RecordedRun input={input} result={result} />
          ))}
          </div>}
        </section>
      </main>
    </div>
  );
}
