"use client";

// Thinking: the step between Home and Answer. Shows the routing as it happens, like a model's
// visible thinking: each part of the question goes to the language model, Jev, or fixed code.
// Styled with the /landing design system, scoped under `.tv`.
//
// Live runs draw /api/analyze's streamed events (AnalyzeEvent): the real file routes, the model's
// real call and the terms it quoted, Jev's real yes/no checks on payment conditions, then the
// engine's real results on the returned input.
// The sample draws the Ductline fixture's stored terms and conditions, then runs the real engine.
// Steps are revealed one at a time so they can be read; nothing shown is invented.

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { evaluateDecision, type DecisionInput } from "@/lib/domain";
import { Icon } from "@/components/icons";
import type { Attachment } from "@/components/ask-home";
import type { AnalyzeEvent } from "@/app/api/analyze/route";
import "./thinking-view.css";

const Gradient = dynamic(() => import("@/app/landing/gradient-background"), { ssr: false });

type Lane = "route" | "llm" | "qwen" | "jev" | "check" | "code";
type Step = { lane: Lane; text: string; result?: string; quote?: string; tone?: "pass" | "warn"; waiting?: boolean };

const LANE_NAME: Record<Lane, string> = { route: "Router", llm: "Language model", qwen: "Qwen V5", jev: "Jev", check: "Conditions", code: "Fixed code" };
const MODEL_KINDS = new Set(["contract", "amendment", "email", "inspection"]);

const usd = (cents: number) => {
  const s = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Math.abs(cents) / 100);
  return cents < 0 ? `−${s}` : s;
};
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const clip = (s: string, n = 110) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// What fixed code concludes, straight from the engine.
function codeSteps(input: DecisionInput): Step[] {
  const r = evaluateDecision(input);
  const reserve = input.reserveCents ?? 0;
  const moves = r.withJob.timeline.filter((p) => p.scope !== "snapshot" && p.deltaCents !== 0).length;
  const next = r.nextQuestions[0];
  const proposal = r.proposal?.status === "AVAILABLE" ? r.proposal : null;
  return [
    { lane: "code", text: "Laying out cash day by day", result: `${plural(moves, "cash movement")} · ${plural(r.scenarioCount, "case")}` },
    { lane: "code", text: "Finding the lowest point", result: `${usd(r.withJob.minimumCents)} on ${day(r.withJob.minimumDate)}`, tone: r.withJob.minimumCents < reserve ? "warn" : "pass" },
    { lane: "code", text: `Checking it against your ${usd(reserve)} reserve`, result: r.reserveGapCents > 0 ? `${usd(r.reserveGapCents)} short` : "Clears", tone: r.reserveGapCents > 0 ? "warn" : "pass" },
    ...(next ? [{ lane: "code" as const, text: "What decides it", quote: next.question, result: `Ask ${next.owner}` }] : []),
    ...(proposal ? [{ lane: "code" as const, text: "Smallest fix that works", result: `${usd(proposal.additionalDepositCents)} more upfront`, tone: "pass" as const }] : []),
  ];
}

// Sample: the fixture's stored sources, terms and conditions, then the real engine.
function sampleSteps(input: DecisionInput): Step[] {
  const toModel = input.evidence.filter((e) => MODEL_KINDS.has(e.kind));
  const toCode = input.evidence.filter((e) => !MODEL_KINDS.has(e.kind) && e.kind !== "assumption");
  const title = (id: string) => input.evidence.find((e) => e.id === id)?.title ?? id;
  return [
    { lane: "route", text: `Sorting ${plural(toModel.length + toCode.length, "source")} by who should read them`, result: `${toCode.length} records → code · ${toModel.length} documents → model` },
    ...toModel.map((e): Step => ({ lane: "llm", text: `Reading ${e.title}` })),
    ...input.job.milestones.map((m): Step => ({ lane: "llm", text: /payment/i.test(m.label) ? m.label : `${m.label} payment`, result: usd(m.amountCents), quote: `from ${m.sourceIds.map(title).join(", ")}` })),
    ...input.job.milestones.map((m): Step => ({
      lane: "check",
      text: clip(m.condition, 90),
      result: m.judgment === "EXPECTED" ? "Expected, not yet seen" : m.judgment,
      tone: m.judgment === "MET" ? "pass" : "warn",
    })),
    ...codeSteps(input),
  ];
}

// Live: one step per streamed event, plus a waiting step for whatever is still running.
function liveSteps(files: Attachment[], events: AnalyzeEvent[], input: DecisionInput | null, done: boolean): Step[] {
  const routes = new Map<string, Extract<AnalyzeEvent, { type: "file" }>["file"]>();
  events.forEach((e) => e.type === "file" && routes.set(e.file.name, e.file));
  const list = [...routes.values()];
  const sorted = list.length >= files.length;
  const steps: Step[] = [{
    lane: "route",
    text: `Sorting ${plural(files.length, "file")} by who should read them`,
    result: sorted ? [["code", "→ code"], ["llm", "→ model"], ["skipped", "skipped"]].map(([k, l]) => {
      const n = list.filter((f) => f.route === k).length;
      return n ? `${n} ${l}` : "";
    }).filter(Boolean).join(" · ") || "Question only" : undefined,
    waiting: !sorted,
  }];
  list.forEach((f) => steps.push({ lane: f.route === "code" ? "code" : f.route === "llm" ? "llm" : "route", text: f.name, result: f.detail, tone: f.route === "skipped" ? "warn" : undefined }));

  const start = events.find((e) => e.type === "model_start");
  const model = events.find((e) => e.type === "model_done");
  const skipped = events.find((e) => e.type === "model_skipped");
  const built = events.find((e) => e.type === "built");

  if (start) {
    steps.push({
      lane: "llm",
      text: start.documents ? `${start.model} reading your question and ${plural(start.documents, "document")}` : `${start.model} reading your question`,
      result: model ? `${(model.llm.inputTokens + model.llm.outputTokens).toLocaleString()} tokens · ${(model.llm.ms / 1000).toFixed(1)}s` : undefined,
      waiting: !model,
    });
  }
  if (skipped) steps.push({ lane: "route", text: "No model key configured, so the question was read with a pattern match", result: "Model skipped", tone: "warn" });

  const plan = model?.plan ?? skipped?.plan;
  if (plan) {
    const price = plan.job.priceCents;
    steps.push({ lane: "llm", text: `Job: ${plan.job.name} for ${plan.job.customer}`, result: price ? usd(price) : "Price from your books" });
    if (plan.reserveCents != null) steps.push({ lane: "llm", text: "Cash you want to keep", result: usd(plan.reserveCents), quote: plan.reserveQuote ?? undefined });
    const terms = [
      ...plan.jobReceipts.map((l) => ({ ...l, kind: "in" })),
      ...plan.jobCosts.map((l) => ({ ...l, kind: "out" })),
      ...plan.otherEvents.map((l) => ({ ...l, kind: l.direction === "inflow" ? "in" : "out", percentOfPrice: null as number | null, dayOffset: null as number | null })),
    ];
    terms.slice(0, 6).forEach((t) => steps.push({
      lane: "llm",
      text: `${t.kind === "in" ? "Payment in" : "Cost"}: ${t.label}${"condition" in t && t.condition ? `, once ${t.condition}` : ""}`,
      result: t.amountCents != null ? usd(t.amountCents) : t.percentOfPrice != null ? `${t.percentOfPrice}% of price` : "Amount not stated",
      quote: t.quote ? `“${clip(t.quote)}”${t.sourceFile ? ` · ${t.sourceFile}` : ""}` : undefined,
    }));
    if (terms.length > 6) steps.push({ lane: "llm", text: `${terms.length - 6} more terms quoted from your documents` });
    if (!terms.length) steps.push({ lane: "llm", text: "No payment terms stated in the documents", result: "Using your own history" });
    plan.missing.slice(0, 3).forEach((m) => steps.push({ lane: "route", text: `Missing: ${m}`, tone: "warn", result: "Needs you" }));
  }

  // Our fine-tuned extractor reads each later payment clause into typed conditions.
  const qwenStart = events.find((e) => e.type === "qwen_start");
  const qwenDone = events.find((e) => e.type === "qwen_done");
  const qwenSkipped = events.find((e) => e.type === "qwen_skipped");
  if (qwenStart) {
    steps.push({
      lane: "qwen",
      text: `Our fine-tuned Qwen extractor reading ${plural(qwenStart.clauses.length, "payment clause")}`,
      result: qwenDone ? `${(qwenDone.qwen.ms / 1000).toFixed(1)}s` : undefined,
      waiting: !qwenDone,
    });
    qwenDone?.qwen.clauses.forEach((c) => steps.push({
      lane: "qwen",
      text: c.label,
      result: c.status === "INVALID" ? "Invalid output" : c.condition ? "Conditions found" : c.status === "PROPOSED" ? "No condition" : c.status.toLowerCase().replace(/^./, (x) => x.toUpperCase()),
      tone: c.status === "PROPOSED" ? "pass" : "warn",
      quote: c.status === "INVALID"
        ? "Failed validation, so Claude's reading of this clause is used instead"
        : [c.condition && `Owed once ${c.condition}`, c.due, ...c.issues].filter(Boolean).join(" · ") || undefined,
    }));
  }
  if (qwenSkipped) steps.push({ lane: "qwen", text: qwenSkipped.reason, result: "Skipped", tone: qwenSkipped.reason.startsWith("No payment") ? undefined : "warn" });

  const jevStart = events.find((e) => e.type === "jev_start");
  const jevDone = events.find((e) => e.type === "jev_done");
  const jevSkipped = events.find((e) => e.type === "jev_skipped");
  if (jevStart) {
    steps.push({
      lane: "jev",
      text: `Asking Jev ${plural(jevStart.checks.length, "yes/no question")}: has each payment condition already happened?`,
      result: jevDone ? `${jevDone.jev.ms}ms` : jevSkipped ? "Failed" : undefined,
      tone: jevSkipped ? "warn" : undefined,
      waiting: !jevDone && !jevSkipped,
    });
    jevDone?.jev.checks.forEach((c) => steps.push({
      lane: "jev",
      text: `${c.label}: ${c.condition}${c.source === "qwen" ? " (read by Qwen)" : ""}`,
      result: `${c.state.replace("_", " ")}${c.confidence != null ? ` · ${Math.round(c.confidence * 100)}%` : ""}`,
      tone: c.state === "MET" ? "pass" : "warn",
      quote: [
        c.parts?.length ? c.parts.map((p) => `${p.condition}: ${p.state.replace("_", " ").toLowerCase()}`).join(" · ") : "",
        c.state === "MET" ? "Counted on schedule" : "Not shown yet, so the answer also tests this payment arriving late",
      ].filter(Boolean).join(". "),
    }));
  }
  if (jevSkipped) {
    const notNeeded = jevSkipped.reason.startsWith("No conditional");
    steps.push({ lane: "jev", text: jevSkipped.reason, result: jevStart ? undefined : notNeeded ? "Not needed" : "Skipped", tone: notNeeded ? undefined : "warn" });
  }

  if (built) steps.push({ lane: "code", text: routes.size && list.some((f) => f.route === "code") ? "Building the cash calendar from your books and the quoted terms" : "Building the cash calendar from the quoted terms", result: plural(built.events, "cash event") });
  if (done && input) steps.push(...codeSteps(input));
  else if (plan && !built && (!jevStart || jevDone || jevSkipped)) steps.push({ lane: "code", text: "Building the cash calendar", waiting: true });
  else if (built) steps.push({ lane: "code", text: "Running the numbers", waiting: true });
  return steps;
}

export function ThinkingView({ question, files, mode, input = null, events = [], done = true, onFinish }: {
  question: string;
  files: Attachment[];
  mode: "sample" | "live";
  /** Sample: the fixture. Live: the returned input, once done. */
  input?: DecisionInput | null;
  /** Live: events streamed from /api/analyze so far. */
  events?: AnalyzeEvent[];
  /** Live: whether the final event has arrived. */
  done?: boolean;
  onFinish: () => void;
}) {
  const live = mode === "live";
  const steps = useMemo(
    () => (live ? liveSteps(files, events, input, done) : input ? sampleSteps(input) : []),
    [live, files, events, input, done],
  );
  const [shown, setShown] = useState(0); // steps fully revealed; steps[shown] is in progress
  const [elapsed, setElapsed] = useState(0);
  const [still, setStill] = useState(false);
  const started = useRef(0);
  const list = useRef<HTMLOListElement>(null);
  const finish = useRef(onFinish);
  finish.current = onFinish;
  const active = steps[shown];
  const finished = done && shown >= steps.length;

  useEffect(() => {
    started.current = performance.now();
    setStill(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    if (finished) return;
    const id = window.setInterval(() => setElapsed((performance.now() - started.current) / 1000), 100);
    return () => window.clearInterval(id);
  }, [finished]);

  // Reveal one step at a time; a waiting step holds until its result arrives.
  useEffect(() => {
    if (finished) {
      const id = window.setTimeout(() => finish.current(), still ? 400 : 1500);
      return () => window.clearTimeout(id);
    }
    if (!active || active.waiting) return;
    const id = window.setTimeout(() => setShown((i) => i + 1), still ? 80 : active.quote ? 650 : 420);
    return () => window.clearTimeout(id);
  }, [active, finished, still]);

  // Keep the newest step in view, unless the reader has scrolled up to look at earlier ones.
  const following = useRef(true);
  useEffect(() => {
    const el = list.current;
    if (!el) return;
    const onScroll = () => { following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    const el = list.current;
    // Jump, don't animate: a smooth scroll still in flight when the next step lands reads as the reader scrolling up.
    if (el && following.current) el.scrollTop = el.scrollHeight;
  }, [shown, steps.length]);

  const modelDone = events.find((e) => e.type === "model_done");
  const jevCost = events.find((e) => e.type === "jev_done")?.jev.costUsd ?? null;
  const totals = live
    ? [
        { lane: "llm", label: "Language model", value: modelDone ? `$${modelDone.llm.costUsd.toFixed(4)}` : "—" },
        { lane: "jev", label: "Jev", value: jevCost != null ? `$${jevCost.toFixed(5)}` : "—" },
        { lane: "code", label: "Fixed code", value: "$0" },
      ]
    : [
        { lane: "llm", label: "Language model", value: "sample data" },
        { lane: "check", label: "Conditions", value: "sample data" },
        { lane: "code", label: "Fixed code", value: "$0 · live" },
      ];

  return (
    <div className={`tv${still ? " tv-still" : ""}`}>
      <div className="tv-bg" aria-hidden="true">
        <Gradient colors={["#0b8a63", "#5b48c9", "#101412"]} />
      </div>

      <header className="tv-nav">
        <span className="tv-brand">Headroom</span>
      </header>

      <main className="tv-main">
        <p className="tv-eyebrow">You asked</p>
        <h1>“{question}”</h1>
        {files.length > 0 && (
          <ul className="tv-files">
            {files.map((f) => (
              <li key={f.id}><Icon name="document" size={13} /> {f.name}</li>
            ))}
          </ul>
        )}

        <section className="tv-card" aria-live="polite">
          <div className="tv-head">
            <span className={`tv-orb${finished ? " is-done" : ""}`} aria-hidden="true" />
            <span className={`tv-status${finished ? "" : " is-shimmer"}`}>
              {finished ? `Thought for ${elapsed.toFixed(1)}s` : active ? `Thinking · ${LANE_NAME[active.lane]}` : "Thinking"}
            </span>
            <span className="tv-clock">{elapsed.toFixed(1)}s</span>
          </div>

          <ol className="tv-steps" ref={list}>
            {steps.slice(0, shown + 1).map((s, i) => {
              const on = i === shown;
              return (
                <li key={i} className={`tv-step is-${s.lane}${on ? " is-active" : ""}`}>
                  <span className="tv-dot" aria-hidden="true">{!on && <Icon name="check" size={10} />}</span>
                  <span className="tv-lane">{LANE_NAME[s.lane]}</span>
                  <span className={`tv-text${on ? " is-shimmer" : ""}`}>{s.text}</span>
                  {!on && s.result && <span className={`tv-result${s.tone ? ` is-${s.tone}` : ""}`}>{s.result}</span>}
                  {!on && s.quote && <span className="tv-quote">{s.quote}</span>}
                </li>
              );
            })}
          </ol>

          <div className="tv-totals">
            {totals.map((t) => (
              <span key={t.lane} className={`is-${t.lane}`}><i />{t.label} <b>{t.value}</b></span>
            ))}
          </div>
        </section>

        <p className="tv-note">
          {live
            ? "Live run on your files: every step above is a real event from this request."
            : "Sample: document terms and conditions come from the sample's stored data; the math runs live."}{" "}
          The model only reads; tested code does every dollar and date.
        </p>
      </main>
    </div>
  );
}
