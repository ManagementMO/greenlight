"use client";

import { useEffect, useMemo, useState } from "react";
import {
  applyProposal,
  evaluateDecision,
  getScenario,
  listScenarios,
  reviseDeposit,
  validateDecisionInput,
  withScenarioAnswer,
} from "@/lib/domain";
import type {
  CashPath,
  DecisionInput,
  DecisionStatus,
  ScenarioFixture,
  SourceEvidence,
} from "@/lib/domain";
import { CashBridge, type CashChartSeries } from "@/components/cash-bridge";
import { Dialog } from "@/components/dialog";
import { HeadroomMark, Icon } from "@/components/icons";
import { ImprovementLab } from "@/components/improvement-lab";
import { RecordedExtraction } from "@/components/recorded-extraction";
import { AskHome, type Attachment } from "@/components/ask-home";
import { AnswerView } from "@/components/answer-view";
import { ThinkingView } from "@/components/thinking-view";
import type { AnalyzeEvent, Routing } from "@/app/api/analyze/route";

type View = "home" | "thinking" | "answer" | "decision" | "evidence" | "lab";

function decisionSnapshot(fixture: ScenarioFixture): DecisionInput {
  const parsed = validateDecisionInput(structuredClone(fixture));
  if (!parsed.success)
    throw new Error(
      "The reference scenario does not satisfy the decision input contract.",
    );
  return parsed.data;
}

function money(cents: number | null | undefined, compact = false) {
  if (cents == null || !Number.isFinite(cents)) return "Not confirmed";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
    notation: compact ? "compact" : "standard",
  }).format(cents / 100);
}

function dateLabel(date: string | null | undefined, year = false) {
  if (!date || Number.isNaN(Date.parse(date))) return "Date unknown";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    ...(year ? { year: "numeric" as const } : {}),
    timeZone: "UTC",
  }).format(new Date(`${date.slice(0, 10)}T12:00:00Z`));
}

function chartSeries(
  path: CashPath,
  id: string,
  label: string,
): CashChartSeries {
  return {
    id,
    label,
    points: path.timeline.map((point) => ({
      id: point.eventId,
      date: point.date,
      balanceCents: point.cashCents,
      label: point.label,
    })),
  };
}

function statusTone(status: DecisionStatus) {
  return status === "SUPPORTED_IN_TESTED_SCENARIOS"
    ? "positive"
    : status === "SHORTFALL"
      ? "negative"
      : "caution";
}

function SourceTag({ source }: { source: SourceEvidence }) {
  return (
    <span
      className={`source-tag ${source.provenance === "sponsor_dataset" ? "source-dataset" : ""}`}
    >
      {source.provenance === "sponsor_dataset"
        ? "Intuit synthetic dataset"
        : source.provenance === "user_upload"
          ? "Your upload"
          : "Added demo fixture"}
    </span>
  );
}

function EvidenceView({
  input,
  fixture,
  selectedId,
  onSelect,
}: {
  input: DecisionInput;
  fixture: ScenarioFixture;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const selected =
    input.evidence.find((source) => source.id === selectedId) ??
    input.evidence[0];
  return (
    <section className="evidence-view" aria-label="Source evidence">
      <div className="view-title-row">
        <div>
          <span className="eyebrow">A decision you can trace</span>
          <h1>Show your working.</h1>
          <p className="view-intro">
            The original sources, the added assumptions, and the cash movements
            they support.
          </p>
        </div>
        <span className="outline-label">
          <Icon name="shield" size={15} />
          Immutable sources
        </span>
      </div>
      <div className="provenance-banner">
        <Icon name="document" size={21} />
        <div>
          <strong>{fixture.provenance.label}</strong>
          <p>{fixture.provenance.accountingSource}</p>
          <a
            href={fixture.provenance.datasetUrl}
            target="_blank"
            rel="noreferrer"
          >
            View original dataset <Icon name="arrow-up-right" size={13} />
          </a>
        </div>
      </div>
      <div className="evidence-layout">
        <aside className="source-index">
          <div className="section-heading">
            <h2>Source library</h2>
            <span className="count-label mono">{input.evidence.length}</span>
          </div>
          {input.evidence.map((source) => (
            <button
              type="button"
              className={`source-index-item ${selected?.id === source.id ? "is-active" : ""}`}
              key={source.id}
              onClick={() => onSelect(source.id)}
              aria-pressed={selected?.id === source.id}
            >
              <span className="source-index-icon">
                <Icon name="document" size={18} />
              </span>
              <span>
                <strong>{source.title}</strong>
                <span>
                  {source.kind} · {dateLabel(source.observedDate)}
                </span>
              </span>
              <Icon name="arrow-up-right" size={14} />
            </button>
          ))}
        </aside>
        <article className="source-document" id="source-document">
          {selected ? (
            <>
              <div className="source-document-meta">
                <SourceTag source={selected} />
                <span className="mono">{selected.id}</span>
              </div>
              <h2>{selected.title}</h2>
              <div className="document-dates">
                <span>
                  Observed{" "}
                  <strong>{dateLabel(selected.observedDate, true)}</strong>
                </span>
                <span>
                  Effective{" "}
                  <strong>{dateLabel(selected.effectiveDate, true)}</strong>
                </span>
              </div>
              <blockquote>{selected.text}</blockquote>
              {selected.id === "signed-contract" && (
                <RecordedExtraction source={selected} />
              )}
              {selected.supersedes && (
                <p className="document-note">
                  Supersedes source <code>{selected.supersedes}</code>. Both
                  versions remain in the evidence trail.
                </p>
              )}
              {selected.url && (
                <a
                  className="text-link"
                  href={selected.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open source <Icon name="arrow-up-right" size={14} />
                </a>
              )}
              {selected.sha256 && (
                <div className="source-fingerprint">
                  <span className="eyebrow">Source fingerprint</span>
                  <code>{selected.sha256}</code>
                </div>
              )}
              <div className="linked-cash">
                <span className="eyebrow">Linked cash movements</span>
                {[...input.commitments, ...input.job.events]
                  .filter((event) => event.sourceIds.includes(selected.id))
                  .map((event) => (
                    <div className="linked-cash-row" key={event.id}>
                      <span>
                        <strong>{event.label}</strong>
                        <small>
                          {dateLabel(event.date)} · {event.settlement}{" "}
                          settlement
                        </small>
                      </span>
                      <span className="mono">
                        {event.direction === "outflow" ? "−" : "+"}
                        {money(event.amountCents)}
                      </span>
                    </div>
                  ))}
              </div>
            </>
          ) : (
            <div className="empty-run">
              <Icon name="document" size={25} />
              <strong>No sources attached</strong>
              <p>
                Add dated evidence and confirm the forward cash calendar before
                relying on a decision.
              </p>
            </div>
          )}
        </article>
      </div>
      <section className="assumption-section">
        <div>
          <span className="eyebrow">What this forecast depends on</span>
          <h2>Assumptions stay in view.</h2>
        </div>
        <ul>
          {input.assumptions.map((assumption, index) => (
            <li key={index}>
              <Icon name="chevron-down" size={13} />
              <span>{assumption}</span>
            </li>
          ))}
        </ul>
      </section>
      {!!input.unresolvedTerms.length && (
        <div className="inline-error">
          <Icon name="warning" />
          <div>
            <strong>Terms requiring review</strong>
            <ul>
              {input.unresolvedTerms.map((term, index) => (
                <li key={index}>{term}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <div className="fixture-disclosure">
        <strong>What we added for this demonstration</strong>
        <ul>
          {fixture.provenance.additions.map((addition, index) => (
            <li key={index}>{addition}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default function Headroom() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);
  const fixtures = useMemo(() => listScenarios(), []);
  const initialFixture = getScenario("ductline-phase-delay") ?? fixtures[0];
  const [fixtureId, setFixtureId] = useState(initialFixture.id);
  const [input, setInput] = useState<DecisionInput>(() =>
    decisionSnapshot(initialFixture),
  );
  const [view, setView] = useState<View>("home");
  const [question, setQuestion] = useState("");
  const [routing, setRouting] = useState<Routing | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  // Thinking: what Home handed over, and the events streamed back for a live run.
  const [thinking, setThinking] = useState<{ files: Attachment[]; mode: "sample" | "live"; events: AnalyzeEvent[]; done: boolean } | null>(null);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [view]);
  const [compareProposal, setCompareProposal] = useState(false);
  const [selectedEvidence, setSelectedEvidence] = useState<string | null>(null);
  useEffect(() => {
    if (
      view === "evidence" &&
      selectedEvidence &&
      window.matchMedia("(max-width: 680px)").matches
    ) {
      const frame = requestAnimationFrame(() =>
        document
          .getElementById("source-document")
          ?.scrollIntoView({ block: "start", behavior: "auto" }),
      );
      return () => cancelAnimationFrame(frame);
    }
  }, [view, selectedEvidence]);
  const [helpOpen, setHelpOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [depositDraft, setDepositDraft] = useState<string | null>(null);
  const [collectionDraft, setCollectionDraft] = useState<string | null>(null);
  const [auditStatus, setAuditStatus] = useState<
    "pending" | "verified" | "local"
  >("pending");
  const fixture =
    fixtures.find((item) => item.id === fixtureId) ?? initialFixture;
  const result = useMemo(() => evaluateDecision(input), [input]);
  const proposal = result.proposal;
  const proposalSnapshot = useMemo(() => {
    if (!compareProposal || proposal?.status !== "AVAILABLE") return null;
    try {
      return applyProposal(input, proposal);
    } catch {
      return null;
    }
  }, [compareProposal, input, proposal]);
  const proposalResult = useMemo(
    () => (proposalSnapshot ? evaluateDecision(proposalSnapshot) : null),
    [proposalSnapshot],
  );
  const activeResult = proposalResult ?? result;
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setAuditStatus("pending");
      try {
        const response = await fetch("/api/decision", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(proposalSnapshot ?? input),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Server audit unavailable");
        const serverResult = await response.json();
        if (!controller.signal.aborted)
          setAuditStatus(
            serverResult.inputHash === activeResult.inputHash
              ? "verified"
              : "local",
          );
      } catch {
        if (!controller.signal.aborted) setAuditStatus("local");
      }
    }, 450);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [input, proposalSnapshot, activeResult.inputHash]);
  const nextQuestion = result.nextQuestions[0];
  const evidencePreview =
    input.evidence.find(
      (source) =>
        source.id ===
        (nextQuestion?.sourceIds[0] ?? input.job.milestones[0]?.sourceIds[0]),
    ) ??
    input.evidence.find((source) => source.kind === "contract") ??
    input.evidence[0];
  const negotiation = input.job.negotiation;
  const depositEvent = input.job.events.find(
    (event) => event.id === negotiation?.depositEventId,
  );
  const originalDeposit = fixture.job.events.find(
    (event) => event.id === negotiation?.depositEventId,
  );
  const isEdited = input.version !== fixture.version;
  const tone = statusTone(activeResult.status);
  const sourceEvents = [...input.commitments, ...input.job.events];
  const allEvents = activeResult.withJob.timeline.length
    ? activeResult.withJob.timeline
        .filter((point) => point.scope !== "snapshot" && point.deltaCents !== 0)
        .flatMap((point) => {
          const source = sourceEvents.find(
            (event) => event.id === point.eventId,
          );
          return source
            ? [
                {
                  ...source,
                  label: point.label,
                  date: point.date,
                  amountCents: Math.abs(point.deltaCents),
                  direction:
                    point.deltaCents < 0
                      ? ("outflow" as const)
                      : ("inflow" as const),
                },
              ]
            : [];
        })
    : sourceEvents
        .filter((event) => !event.includedInOpeningCash)
        .sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"));

  function changeFixture(id: string) {
    const next = getScenario(id);
    if (!next) return;
    setFixtureId(id);
    setInput(decisionSnapshot(next));
    setCompareProposal(false);
    setSelectedEvidence(null);
    setDepositDraft(null);
    setCollectionDraft(null);
    setEditError(null);
    setNotice(null);
  }

  function inspectEvidence(id: string) {
    setSelectedEvidence(id);
    setView("evidence");
  }

  function updateAnswer(id: string, optionId: string | undefined) {
    setInput((current) => withScenarioAnswer(current, id, optionId));
    setCompareProposal(false);
    setEditError(null);
    setNotice("What-if updated. Original source evidence is preserved.");
  }

  function updateDeposit() {
    if (!negotiation || !depositEvent) return;
    const raw = depositDraft ?? String((depositEvent.amountCents ?? 0) / 100);
    const dollars = Number(raw);
    if (!/^\d+(\.\d{1,2})?$/.test(raw) || !Number.isFinite(dollars)) {
      setEditError(
        "Enter a deposit in dollars, with no more than two decimal places.",
      );
      return;
    }
    try {
      const revised = reviseDeposit(input, {
        depositCents: Math.round(dollars * 100),
        collectionDate: collectionDraft ?? depositEvent.date ?? undefined,
      });
      setInput(revised);
      setCompareProposal(false);
      setEditError(null);
      setNotice(
        "Deposit what-if updated. The final installment was offset to preserve the job total.",
      );
    } catch (cause) {
      setEditError(
        cause instanceof Error
          ? cause.message
          : "That deposit is outside the permitted negotiating range.",
      );
    }
  }

  function downloadDecision() {
    const payload = {
      product: "Headroom",
      synthetic: true,
      exportedAt: new Date().toISOString(),
      snapshot: input,
      currentDecision: result,
      proposedDecision: proposalResult,
      notice:
        "Conditional scenario analysis. Proposed terms are not executed agreements.",
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `headroom-${input.id}-v${input.version}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice(
      "Decision snapshot downloaded with sources, assumptions, and proposal status.",
    );
  }

  const requestText =
    proposal?.status === "AVAILABLE"
      ? `Subject: Proposed payment schedule — ${input.job.name}\n\nHi ${input.job.customer},\n\nTo reserve the job and protect the delivery schedule, we propose a deposit of ${money(proposal.proposedDepositCents)}, collected on ${dateLabel(proposal.proposedCollectionDate, true)}. The final installment would become ${money(proposal.proposedFinalReceiptCents)}. Total contract revenue remains ${money(proposal.totalRevenueCents)}.\n\nThis proposal depends on:\n${proposal.requiredAgreements.map((agreement) => `• ${agreement}`).join("\n")}\n\nPlease confirm the payment schedule and expected settlement dates in writing.\n\nDraft only. No agreement has been executed and no funds have been transferred.`
      : "No funding proposal is available for the current input.";

  if (view === "home")
    return (
      <AskHome
        onOpenSample={() => setView("decision")}
        busy={analyzing}
        error={analyzeError}
        onSubmit={async (asked, files) => {
          setQuestion(asked);
          setAnalyzeError(null);
          // Sample files open the synthetic Ductline fixture; real files go through intake.
          if (files.length && files.every((f) => f.sample)) {
            changeFixture(initialFixture.id);
            setRouting(null);
            setThinking({ files, mode: "sample", events: [], done: true });
            setView("thinking");
            return;
          }
          const body = new FormData();
          body.set("question", asked);
          body.set("stream", "1");
          files.forEach((f) => f.file && body.append("files", f.file, f.name));
          setAnalyzing(true);
          setThinking({ files, mode: "live", events: [], done: false });
          setView("thinking");
          try {
            // NDJSON progress events; the last one is `done` or `error`.
            const response = await fetch("/api/analyze", { method: "POST", body });
            if (!response.ok || !response.body) {
              const data = await response.json().catch(() => ({}));
              throw new Error([data.error ?? "Something went wrong reading your files.", ...(data.fields ?? [])].join(" · "));
            }
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let finished = false;
            while (!finished) {
              const { value, done } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              let nl: number;
              while ((nl = buffer.indexOf("\n")) >= 0) {
                const line = buffer.slice(0, nl).trim();
                buffer = buffer.slice(nl + 1);
                if (!line) continue;
                const event = JSON.parse(line) as AnalyzeEvent;
                if (event.type === "error") throw new Error([event.error, ...(event.fields ?? [])].join(" · "));
                if (event.type === "done") {
                  setInput(event.input);
                  setRouting(event.routing);
                  setCompareProposal(false);
                  setThinking((t) => t && { ...t, done: true });
                  finished = true;
                } else {
                  setThinking((t) => t && { ...t, events: [...t.events, event] });
                }
              }
            }
            if (!finished) throw new Error("The connection closed before your files were read.");
          } catch (cause) {
            setAnalyzeError(cause instanceof Error ? cause.message : "Something went wrong reading your files.");
            setThinking(null);
            setView("home");
          } finally {
            setAnalyzing(false);
          }
        }}
      />
    );

  if (view === "thinking" && thinking)
    return (
      <ThinkingView
        question={question}
        files={thinking.files}
        mode={thinking.mode}
        input={thinking.done ? input : null}
        events={thinking.events}
        done={thinking.done}
        onFinish={() => setView("answer")}
      />
    );

  if (view === "answer")
    return (
      <AnswerView
        question={question}
        input={input}
        routing={routing}
        onChange={(next) => setInput(next)}
        onNewQuestion={() => setView("home")}
        onOpenWorkspace={(evidenceId) =>
          evidenceId ? inspectEvidence(evidenceId) : setView("decision")
        }
      />
    );

  return (
    <div className="greenlight-app" data-hydrated={ready}>
      <a className="skip-link" href="#main-content">
        Skip to decision workspace
      </a>
      <header className="topbar">
        <a
          className="brand"
          href="#"
          onClick={(event) => {
            event.preventDefault();
            setView("home");
          }}
          aria-label="Headroom home"
        >
          <HeadroomMark size={32} />
          <span>
            headroom<span className="brand-period">.</span>
          </span>
        </a>
        <div className="topbar-divider" />
        <div className="workspace-switcher">
          <span className="workspace-avatar">DM</span>
          <span className="workspace-name">
            {input.company.name}
            <span>Decision workspace</span>
          </span>
        </div>
        <div className="topbar-actions">
          <span className="demo-pill">
            <span />
            Synthetic demo
          </span>
          <button
            disabled={!ready}
            type="button"
            className="topbar-help"
            aria-label="How it works"
            onClick={() => setHelpOpen(true)}
          >
            <Icon name="help" size={17} />
            <span>How it works</span>
          </button>
          <a
            className="github-link"
            href="https://github.com/ManagementMO/headroom"
            target="_blank"
            rel="noreferrer"
            aria-label="View Headroom on GitHub"
          >
            <Icon name="arrow-up-right" size={18} />
          </a>
        </div>
      </header>
      <div className="app-shell">
        <aside className="sidebar">
          <div>
            <span className="sidebar-label">Workspace</span>
            <nav className="main-navigation" aria-label="Workspace navigation">
              <button
                disabled={!ready}
                type="button"
                onClick={() => setView("home")}
              >
                <Icon name="spark" />
                <span>New question</span>
              </button>
              <button
                disabled={!ready}
                type="button"
                className={view === "decision" ? "active" : ""}
                onClick={() => setView("decision")}
                aria-current={view === "decision" ? "page" : undefined}
              >
                <Icon name="timeline" />
                <span>Decision</span>
                <span className="nav-dot" />
              </button>
              <button
                disabled={!ready}
                type="button"
                className={view === "evidence" ? "active" : ""}
                onClick={() => setView("evidence")}
                aria-current={view === "evidence" ? "page" : undefined}
              >
                <Icon name="evidence" />
                <span>Evidence</span>
                <span className="nav-count mono">{input.evidence.length}</span>
              </button>
              <button
                disabled={!ready}
                type="button"
                className={view === "lab" ? "active" : ""}
                onClick={() => setView("lab")}
                aria-current={view === "lab" ? "page" : undefined}
              >
                <Icon name="flask" />
                <span>Improvement lab</span>
              </button>
            </nav>
            <div className="sidebar-case">
              <span className="sidebar-label">Active opportunity</span>
              <strong>{input.job.name}</strong>
              <span className="mono">
                {money(input.job.priceCents)} · {input.currency}
              </span>
              <div>
                <span className="small-status-dot" />
                {isEdited ? "What-if in progress" : "Ready to review"}
              </div>
            </div>
          </div>
          <div className="sidebar-bottom">
            <span className="sidebar-illustration">
              <HeadroomMark size={38} />
            </span>
            <strong>Grow with room to breathe.</strong>
            <p>Good decisions leave room for payroll.</p>
            <button
              disabled={!ready}
              type="button"
              onClick={() => setHelpOpen(true)}
            >
              Take the short tour <Icon name="arrow-right" size={14} />
            </button>
            <span className="sidebar-build mono">LA HACKS · HEADROOM</span>
          </div>
        </aside>
        <main className="main-content" id="main-content">
          {view === "decision" && (
            <>
              <div className="workspace-breadcrumb">
                <span>Growth decisions</span>
                <span>/</span>
                <strong>New opportunity</strong>
                <span className="snapshot-label mono">
                  AS OF {dateLabel(input.snapshotDate, true).toUpperCase()}
                </span>
              </div>
              <div className="decision-heading">
                <div>
                  <span className="eyebrow">
                    A clear path from opportunity to cash
                  </span>
                  <h1>Can we take this job?</h1>
                  <p>
                    {input.job.name}
                    <span className="inline-dot">·</span>
                    {input.job.customer}
                    <span className="job-price mono">
                      {money(input.job.priceCents)}
                    </span>
                  </p>
                </div>
                <button
                  disabled={!ready}
                  type="button"
                  className="button button-secondary button-small"
                  onClick={downloadDecision}
                >
                  <Icon name="document" size={16} />
                  Export decision
                </button>
              </div>
              <div className={`decision-signal signal-${tone}`} role="status">
                <span className="signal-icon">
                  <Icon
                    name={
                      tone === "positive"
                        ? "check"
                        : tone === "negative"
                          ? "warning"
                          : "shield"
                    }
                    size={22}
                  />
                </span>
                <div>
                  <div className="signal-topline">
                    <strong>{activeResult.statusLabel}</strong>
                    {(proposalResult || isEdited) && (
                      <span className="draft-tag">
                        {proposalResult
                          ? "Proposed terms · what-if"
                          : "Local what-if · not agreed terms"}
                      </span>
                    )}
                  </div>
                  <p>
                    {activeResult.reasons[0]?.message ??
                      "Review the complete scenario and its assumptions before deciding."}
                  </p>
                </div>
                <span className="signal-state">
                  {activeResult.status === "SUPPORTED_IN_TESTED_SCENARIOS"
                    ? "RESERVE PROTECTED"
                    : activeResult.status === "NEEDS_INPUT"
                      ? "MORE INPUT NEEDED"
                      : "REVIEW REQUIRED"}
                </span>
              </div>
              <div className="decision-grid">
                <div className="decision-primary">
                  <section
                    className="cash-panel"
                    aria-labelledby="cash-heading"
                  >
                    <div className="section-heading">
                      <div>
                        <span className="eyebrow">The cash bridge</span>
                        <h2 id="cash-heading">Timing changes everything.</h2>
                      </div>
                      <span className="currency-note mono">USD</span>
                    </div>
                    <div className="cash-metrics">
                      <div>
                        <span>Lowest modeled cash</span>
                        <strong
                          className={`cash-minimum mono ${activeResult.withJob.minimumCents < (input.reserveCents ?? 0) ? "negative-text" : ""}`}
                        >
                          {activeResult.status === "NEEDS_INPUT" &&
                          !activeResult.withJob.timeline.length
                            ? "—"
                            : money(activeResult.withJob.minimumCents)}
                        </strong>
                        <small>
                          {dateLabel(activeResult.withJob.minimumDate)} · worst
                          tested path
                        </small>
                      </div>
                      <div>
                        <span>Reserve gap</span>
                        <strong
                          className={`mono ${activeResult.status === "NEEDS_INPUT" ? "muted" : activeResult.reserveGapCents > 0 ? "negative-text" : "positive-text"}`}
                        >
                          {activeResult.status === "NEEDS_INPUT"
                            ? "—"
                            : money(activeResult.reserveGapCents)}
                        </strong>
                        <small>
                          {activeResult.status === "NEEDS_INPUT"
                            ? "Needs complete inputs"
                            : activeResult.reserveGapCents > 0
                              ? "Earlier liquidity needed"
                              : "Within tested assumptions"}
                        </small>
                      </div>
                      <div>
                        <span>Scenarios protecting reserve</span>
                        <strong className="mono">
                          {activeResult.passingScenarioCount}
                          <span className="metric-denominator">
                            {" "}
                            / {activeResult.scenarioCount}
                          </span>
                        </strong>
                        <small>
                          {activeResult.coverageComplete
                            ? "All admissible combinations tested"
                            : "Coverage incomplete"}
                        </small>
                      </div>
                    </div>
                    {activeResult.status === "NEEDS_INPUT" && (
                      <div className="provisional-note">
                        <Icon name="warning" size={14} />
                        <span>
                          This is a provisional cash path. Complete the missing
                          inputs before treating its balances as a decision.
                        </span>
                      </div>
                    )}
                    <CashBridge
                      interactive={ready}
                      current={chartSeries(
                        activeResult.withJob,
                        "with-job",
                        proposalResult
                          ? "Proposed payment terms"
                          : "Current payment terms",
                      )}
                      baseline={chartSeries(
                        activeResult.baseline,
                        "baseline",
                        "Company without this job",
                      )}
                      comparison={
                        proposalResult
                          ? chartSeries(
                              result.withJob,
                              "current-terms",
                              "Original payment terms",
                            )
                          : undefined
                      }
                      scenarios={activeResult.outcomes.map((outcome) =>
                        chartSeries(
                          outcome.withJob,
                          outcome.id,
                          outcome.labels.join(" · "),
                        ),
                      )}
                      reserveCents={input.reserveCents ?? 0}
                      incomplete={activeResult.status === "NEEDS_INPUT"}
                    />
                    <div className="chart-legend">
                      <span>
                        <i className="legend-line legend-job" />
                        {proposalResult ? "Proposed terms" : "With this job"}
                      </span>
                      <span>
                        <i className="legend-line legend-baseline" />
                        Company baseline
                      </span>
                      {proposalResult && (
                        <span>
                          <i className="legend-line legend-comparison" />
                          Original terms
                        </span>
                      )}
                      <span>
                        <i className="legend-envelope" />
                        Tested scenario paths
                      </span>
                    </div>
                    <div className="chart-policy">
                      <Icon name="shield" size={15} />
                      <span>
                        {money(input.reserveCents)} reserve ·{" "}
                        {money(input.openingCashCents)} opening cash · horizon{" "}
                        {dateLabel(input.horizonDate)}
                      </span>
                    </div>
                  </section>
                  <section
                    className="whatif-panel"
                    aria-labelledby="whatif-heading"
                  >
                    <div className="section-heading">
                      <div>
                        <span className="eyebrow">Try the conditions</span>
                        <h2 id="whatif-heading">
                          What would change the answer?
                        </h2>
                      </div>
                      {isEdited && (
                        <button
                          disabled={!ready}
                          type="button"
                          className="text-button"
                          onClick={() => changeFixture(fixtureId)}
                        >
                          <Icon name="refresh" size={13} />
                          Reset what-if
                        </button>
                      )}
                    </div>
                    <label className="scenario-picker">
                      <span>Reference scenario</span>
                      <select
                        disabled={!ready}
                        value={fixtureId}
                        onChange={(event) => changeFixture(event.target.value)}
                      >
                        {fixtures.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                      <Icon name="chevron-down" size={15} />
                    </label>
                    <p className="scenario-description">
                      {fixture.description}
                    </p>
                    {input.uncertainties.map((uncertainty) => (
                      <fieldset
                        className="uncertainty-control"
                        key={uncertainty.id}
                      >
                        <legend>{uncertainty.question}</legend>
                        <div className="option-pills">
                          <button
                            disabled={!ready}
                            type="button"
                            className={
                              !input.answers?.[uncertainty.id]
                                ? "is-selected"
                                : ""
                            }
                            onClick={() =>
                              updateAnswer(uncertainty.id, undefined)
                            }
                            aria-pressed={!input.answers?.[uncertainty.id]}
                          >
                            Keep both possibilities
                          </button>
                          {uncertainty.options.map((option) => (
                            <button
                              disabled={!ready}
                              type="button"
                              key={option.id}
                              className={
                                input.answers?.[uncertainty.id] === option.id
                                  ? "is-selected"
                                  : ""
                              }
                              onClick={() =>
                                updateAnswer(uncertainty.id, option.id)
                              }
                              aria-pressed={
                                input.answers?.[uncertainty.id] === option.id
                              }
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                        <span className="control-footnote">
                          What-if hypothesis · {uncertainty.owner} · needed by{" "}
                          {dateLabel(uncertainty.requiredBy)}
                        </span>
                      </fieldset>
                    ))}
                    {negotiation && depositEvent && (
                      <details className="custom-terms">
                        <summary>
                          Try a different deposit{" "}
                          <Icon name="chevron-down" size={14} />
                        </summary>
                        <p>
                          Move part of the final installment into the deposit.
                          The job total stays {money(input.job.priceCents)}.
                        </p>
                        <div className="terms-form">
                          <label>
                            <span>Deposit amount · USD</span>
                            <input
                              disabled={!ready}
                              inputMode="decimal"
                              type="text"
                              value={
                                depositDraft ??
                                String((depositEvent.amountCents ?? 0) / 100)
                              }
                              onChange={(event) =>
                                setDepositDraft(event.target.value)
                              }
                              aria-describedby="deposit-range"
                            />
                          </label>
                          <label>
                            <span>Deposit collected</span>
                            <select
                              disabled={!ready}
                              value={collectionDraft ?? depositEvent.date ?? ""}
                              onChange={(event) =>
                                setCollectionDraft(event.target.value)
                              }
                            >
                              {negotiation.allowedCollectionDates.map(
                                (date) => (
                                  <option key={date} value={date}>
                                    {dateLabel(date, true)}
                                  </option>
                                ),
                              )}
                            </select>
                          </label>
                          <button
                            disabled={!ready}
                            type="button"
                            className="button button-secondary button-small"
                            onClick={updateDeposit}
                          >
                            Recalculate <Icon name="arrow-right" size={14} />
                          </button>
                        </div>
                        <p className="control-footnote" id="deposit-range">
                          Negotiating ceiling:{" "}
                          {money(
                            (originalDeposit?.amountCents ?? 0) +
                              (fixture.job.negotiation?.maxAdditionalCents ??
                                0),
                          )}
                          . This is a local proposal, subject to agreement.
                        </p>
                        {editError && (
                          <p className="form-error" role="alert">
                            {editError}
                          </p>
                        )}
                      </details>
                    )}
                  </section>
                </div>
                <aside className="decision-secondary">
                  <section className="next-move">
                    <div className="section-heading">
                      <span className="eyebrow">Your next move</span>
                      <span className="tiny-green-dot" />
                    </div>
                    {proposal?.status === "AVAILABLE" ? (
                      <>
                        <h2>
                          A proposed path
                          <br />
                          to yes.
                        </h2>
                        <p>
                          Collect{" "}
                          <strong>
                            {money(proposal.additionalDepositCents)} more
                          </strong>{" "}
                          upfront to close the modeled reserve gap.
                        </p>
                        <div className="proposal-amount">
                          <span>Proposed deposit</span>
                          <strong className="mono">
                            {money(proposal.proposedDepositCents)}
                          </strong>
                          <small>
                            Collected by{" "}
                            {dateLabel(proposal.proposedCollectionDate)}
                          </small>
                        </div>
                        <div className="proposal-shift">
                          <span>Final installment</span>
                          <span className="mono">
                            <s>{money(proposal.originalFinalReceiptCents)}</s>
                            <Icon name="arrow-right" size={12} />
                            <strong>
                              {money(proposal.proposedFinalReceiptCents)}
                            </strong>
                          </span>
                        </div>
                        <div className="proposal-total">
                          <Icon name="check" size={14} />
                          <span>
                            Total revenue remains{" "}
                            {money(proposal.totalRevenueCents)}
                          </span>
                        </div>
                        <button
                          disabled={!ready}
                          type="button"
                          className={`button button-primary proposal-compare ${compareProposal ? "is-compared" : ""}`}
                          onClick={() => {
                            setCompareProposal((value) => !value);
                            setNotice(null);
                          }}
                          aria-pressed={compareProposal}
                        >
                          {compareProposal
                            ? "Showing proposed terms"
                            : "Compare proposed terms"}
                          <Icon
                            name={compareProposal ? "check" : "arrow-right"}
                            size={16}
                          />
                        </button>
                        <button
                          disabled={!ready}
                          type="button"
                          className="text-button proposal-request"
                          onClick={() => {
                            setRequestOpen(true);
                            setCopied(false);
                          }}
                        >
                          Prepare payment request{" "}
                          <Icon name="arrow-up-right" size={13} />
                        </button>
                        <p className="proposal-disclaimer">
                          <Icon name="warning" size={12} />
                          Draft proposal. Customer agreement and settlement
                          timing still matter.
                        </p>
                      </>
                    ) : (
                      <>
                        <h2>
                          {result.status === "NEEDS_INPUT"
                            ? "Complete the picture."
                            : result.status === "SUPPORTED_IN_TESTED_SCENARIOS"
                              ? "Room to move forward."
                              : "Review the bottleneck."}
                        </h2>
                        <p>
                          {proposal?.limitation ??
                            result.reasons[0]?.message ??
                            "Confirm the remaining conditions before accepting this opportunity."}
                        </p>
                        <div className="next-move-note">
                          <Icon name="shield" size={22} />
                          <span>
                            {input.forwardCalendarConfirmed
                              ? "Forward cash calendar confirmed through"
                              : "Forward cash calendar needs confirmation through"}
                            <strong>
                              {dateLabel(input.calendarCoverageEnd, true)}
                            </strong>
                          </span>
                        </div>
                        <button
                          disabled={!ready}
                          type="button"
                          className="button button-secondary"
                          onClick={() => setView("evidence")}
                        >
                          Review the evidence{" "}
                          <Icon name="arrow-right" size={15} />
                        </button>
                      </>
                    )}
                  </section>
                  {nextQuestion && (
                    <section className="question-panel">
                      <span className="eyebrow">The most useful question</span>
                      <span className="question-mark">?</span>
                      <h3>{nextQuestion.question}</h3>
                      <p>
                        {nextQuestion.distinguishesFeasibility
                          ? "The answer can change whether the tested plan protects your reserve."
                          : "The answer narrows the cash exposure in the current plan."}
                      </p>
                      <div className="question-meta">
                        <span>{nextQuestion.owner}</span>
                        <span>By {dateLabel(nextQuestion.requiredBy)}</span>
                      </div>
                      {nextQuestion.branches.map((branch) => (
                        <div className="question-branch" key={branch.optionId}>
                          <span>{branch.label}</span>
                          <strong
                            className={`mono ${branch.worstReserveGapCents > 0 ? "negative-text" : "positive-text"}`}
                          >
                            {money(branch.worstReserveGapCents)} gap
                          </strong>
                        </div>
                      ))}
                      {nextQuestion.sourceIds[0] && (
                        <button
                          disabled={!ready}
                          type="button"
                          className="text-button"
                          onClick={() =>
                            inspectEvidence(nextQuestion.sourceIds[0])
                          }
                        >
                          See why this matters{" "}
                          <Icon name="arrow-up-right" size={13} />
                        </button>
                      )}
                    </section>
                  )}
                  {evidencePreview && (
                    <section className="evidence-peek">
                      <div className="section-heading">
                        <span className="eyebrow">From the source</span>
                        <Icon name="document" size={16} />
                      </div>
                      <blockquote>
                        “
                        {evidencePreview.text.length > 230
                          ? `${evidencePreview.text.slice(0, 230)}…`
                          : evidencePreview.text}
                        ”
                      </blockquote>
                      <button
                        disabled={!ready}
                        type="button"
                        onClick={() => inspectEvidence(evidencePreview.id)}
                      >
                        <span>{evidencePreview.title}</span>
                        <Icon name="arrow-up-right" size={14} />
                      </button>
                      <SourceTag source={evidencePreview} />
                    </section>
                  )}
                </aside>
              </div>
              <section
                className="cash-calendar"
                aria-labelledby="calendar-heading"
              >
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">Every movement has a reason</span>
                    <h2 id="calendar-heading">The forward cash calendar</h2>
                  </div>
                  <span className="count-label">
                    {allEvents.length} movements ·{" "}
                    {activeResult.status === "NEEDS_INPUT"
                      ? "incomplete plan"
                      : "worst tested path"}
                  </span>
                </div>
                <div className="calendar-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Cash movement</th>
                        <th>Source</th>
                        <th>Settlement</th>
                        <th className="align-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allEvents.map((event) => (
                        <tr key={event.id}>
                          <td className="mono">{dateLabel(event.date)}</td>
                          <td>
                            <strong>{event.label}</strong>
                            <span className="calendar-scope">
                              {event.scope === "job"
                                ? "This job"
                                : "Existing business"}
                            </span>
                          </td>
                          <td>
                            {event.sourceIds[0] ? (
                              <button
                                disabled={!ready}
                                type="button"
                                className="source-link"
                                onClick={() =>
                                  inspectEvidence(event.sourceIds[0])
                                }
                              >
                                <Icon name="document" size={13} />
                                View evidence
                              </button>
                            ) : (
                              <span className="muted">Source required</span>
                            )}
                          </td>
                          <td>
                            <span
                              className={`settlement-state ${event.settlement}`}
                            >
                              {event.settlement}
                            </span>
                          </td>
                          <td
                            className={`align-right mono ${event.direction === "inflow" ? "positive-text" : ""}`}
                          >
                            {event.amountCents == null
                              ? "Unknown"
                              : `${event.direction === "outflow" ? "−" : "+"}${money(event.amountCents)}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <details className="decision-assumptions">
                <summary>
                  <span>
                    <Icon name="shield" size={16} />
                    Assumptions, coverage & limits
                  </span>
                  <span className="count-label">
                    {activeResult.assumptions.length} assumptions{" "}
                    <Icon name="chevron-down" size={13} />
                  </span>
                </summary>
                <div className="assumptions-body">
                  <p>
                    Tested {activeResult.scenarioCount} of{" "}
                    {activeResult.possibleScenarioCount} admissible
                    combinations.{" "}
                    {activeResult.coverageComplete
                      ? "Enumeration is complete for this bounded fixture."
                      : "Coverage is incomplete; the current result cannot establish all modeled outcomes."}{" "}
                    Future cash settlement remains conditional on the stated
                    evidence and timing.
                  </p>
                  <ul>
                    {activeResult.assumptions.map((assumption, index) => (
                      <li key={index}>{assumption}</li>
                    ))}
                  </ul>
                  {proposal?.status === "AVAILABLE" && (
                    <>
                      <strong>Proposed terms require</strong>
                      <ul>
                        {proposal.requiredAgreements.map((agreement, index) => (
                          <li key={index}>{agreement}</li>
                        ))}
                      </ul>
                      <p>{proposal.limitation}</p>
                    </>
                  )}
                </div>
              </details>
              <div className="decision-footer">
                <span>
                  <span className="small-status-dot" />
                  Deterministic cash calculation · no model call ·{" "}
                  {auditStatus === "verified"
                    ? "server audit matches"
                    : auditStatus === "pending"
                      ? "auditing snapshot"
                      : "local calculation"}
                </span>
                <span className="mono">
                  INPUT v{activeResult.inputVersion} ·{" "}
                  {activeResult.inputHash.replace(/^snapshot-/, "")}
                </span>
              </div>
            </>
          )}
          {view === "evidence" && (
            <EvidenceView
              input={input}
              fixture={fixture}
              selectedId={selectedEvidence}
              onSelect={setSelectedEvidence}
            />
          )}
          {view === "lab" && <ImprovementLab />}
          <footer className="workspace-footer">
            <span>
              Headroom <span className="muted">/</span> Growth with your eyes
              open.
            </span>
            <span>
              Synthetic accounting data + disclosed scenario extensions.
            </span>
            <a
              href="https://github.com/ManagementMO/headroom"
              target="_blank"
              rel="noreferrer"
            >
              View project <Icon name="arrow-up-right" size={12} />
            </a>
          </footer>
        </main>
      </div>
      {notice && (
        <div className="toast" role="status">
          <Icon name="check" size={16} />
          <span>{notice}</span>
          <button
            disabled={!ready}
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Dismiss notification"
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
      {helpOpen && (
        <Dialog
          title="From opportunity to a grounded decision"
          onClose={() => setHelpOpen(false)}
        >
          <div className="tour-intro">
            <HeadroomMark size={44} />
            <p>
              Headroom asks one practical question: can this job fit the cash
              you actually have, while protecting payroll?
            </p>
          </div>
          <ol className="tour-steps">
            <li>
              <span>1</span>
              <div>
                <strong>Start with a confirmed cash plan.</strong>
                <p>
                  Available funds, upcoming commitments, job costs, and
                  collection dates become a versioned snapshot.
                </p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>Follow the cash bridge.</strong>
                <p>
                  The fixed calculator tests joint timing and cost conditions.
                  The chart exposes the low point and the reserve gap.
                </p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>Find the condition that matters.</strong>
                <p>
                  Evidence and Jev judgments help interpret repeatable
                  conditions. Eligibility to invoice and actual cash collection
                  remain separate.
                </p>
              </div>
            </li>
            <li>
              <span>4</span>
              <div>
                <strong>Compare a proposal, then agree it.</strong>
                <p>
                  Try a bounded deposit adjustment that preserves the contract
                  total. Headroom prepares a draft; it does not execute a
                  contract or move money.
                </p>
              </div>
            </li>
            <li>
              <span>5</span>
              <div>
                <strong>Measure what the system learns.</strong>
                <p>
                  The improvement lab records fine-tuning, provider runs, and
                  candidate experiments against a fixed evaluator.
                </p>
              </div>
            </li>
          </ol>
          <div className="tour-note">
            This public workspace uses disclosed synthetic fixtures. Local
            interactions run the deterministic engine. Provider results in the
            lab carry their actual run origin.
          </div>
          <button
            disabled={!ready}
            type="button"
            className="button button-primary tour-start"
            onClick={() => {
              setHelpOpen(false);
              setView("decision");
            }}
          >
            Explore the decision <Icon name="arrow-right" size={16} />
          </button>
        </Dialog>
      )}
      {requestOpen && (
        <Dialog
          title="Prepare the payment request"
          onClose={() => setRequestOpen(false)}
          wide
        >
          <div className="draft-notice">
            <Icon name="document" size={17} />
            <span>
              Draft only · review and obtain written agreement before changing
              confirmed terms.
            </span>
          </div>
          <pre className="request-draft">{requestText}</pre>
          <div className="dialog-actions">
            <button
              disabled={!ready}
              type="button"
              className="button button-secondary"
              onClick={() => setRequestOpen(false)}
            >
              Close draft
            </button>
            <button
              disabled={!ready}
              type="button"
              className="button button-primary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(requestText);
                  setCopied(true);
                } catch {
                  setCopied(false);
                  setNotice(
                    "Clipboard access is unavailable. Select and copy the draft text directly.",
                  );
                }
              }}
            >
              {copied ? "Draft copied" : "Copy draft"}
              <Icon name={copied ? "check" : "document"} size={15} />
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
