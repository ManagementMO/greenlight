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
import { GuidedDemo } from "@/components/guided-demo";
import type { LandingEvidence } from "@/lib/landing-evidence";

type View = "tour" | "decision" | "evidence" | "lab";

// Explain the engine's statuses without changing the underlying decision or export.
const decisionCopy: Record<DecisionStatus, { title: string; explanation: string }> = {
  NEEDS_INPUT: {
    title: "More information is needed",
    explanation: "A missing or disputed fact prevents a complete calculation. Review the sources before deciding whether this job works.",
  },
  SHORTFALL: {
    title: "The plan falls below the cash buffer",
    explanation: "Every case tested leaves less cash than the business wants to keep aside. Try getting paid earlier or review the costs.",
  },
  CONDITIONAL: {
    title: "It works in some cases, but not all",
    explanation: "Some payment or cost outcomes leave too little cash. Compare an earlier payment, or confirm which outcome to plan for.",
  },
  SUPPORTED_IN_TESTED_SCENARIOS: {
    title: "Enough cash in every case tested",
    explanation: "These payment dates and costs leave the planned cash buffer intact. The result still depends on the assumptions below.",
  },
};

const paymentStatus = {
  observed: "Confirmed in records",
  assumed: "Expected, not received",
  committed: "Bill to pay",
} as const;

const exampleDescriptions: Record<string, string> = {
  "ductline-phase-delay": "The company must pay workers and buy materials before a $30,000 customer payment arrives. Try the two payment dates or a larger upfront deposit.",
  "ductline-joint-stress": "Two materials orders might each cost $4,000 extra. Check whether the company can afford one increase, both, or neither.",
  "ductline-missing-evidence": "A tax bill has no confirmed amount, and documents disagree about the inspection. Headroom needs those facts before it can support a decision.",
};

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
        : "Sample document added for this demo"}
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
          <span className="eyebrow">The documents behind the numbers</span>
          <h1>Where did this answer come from?</h1>
          <p className="view-intro">
            Open a source to see which payments it supports. Sample documents
            and assumptions are labeled so they can be checked.
          </p>
        </div>
        <span className="outline-label">
          <Icon name="shield" size={15} />
          Original sources kept
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
                          {dateLabel(event.date)} · {paymentStatus[event.settlement]}
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
                Add the documents and confirm upcoming payments before
                relying on the calculation.
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

export default function Headroom({ evidence }: { evidence: LandingEvidence }) {
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
  const [view, setCurrentView] = useState<View>("tour");
  const [tourChapter, setTourChapter] = useState(0);
  const setView = (nextView: View) => {
    setCurrentView(nextView);
    if (window.location.hash !== `#${nextView}`) {
      window.history.pushState(window.history.state, "", `#${nextView}`);
    }
  };
  useEffect(() => {
    const readView = () => {
      const hash = window.location.hash.slice(1);
      if (
        hash === "evidence" ||
        hash === "lab" ||
        hash === "decision" ||
        hash === "tour"
      )
        setCurrentView(hash);
      else if (!hash || hash === "journey-stage") setCurrentView("tour");
    };
    readView();
    window.addEventListener("hashchange", readView);
    window.addEventListener("popstate", readView);
    return () => {
      window.removeEventListener("hashchange", readView);
      window.removeEventListener("popstate", readView);
    };
  }, []);
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
    if (view === "tour") return;
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
  }, [input, proposalSnapshot, activeResult.inputHash, view]);
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
    setNotice("Example updated. The original documents are unchanged.");
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
        "Deposit updated. The final payment changed by the same amount, so the total price stays the same.",
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

  if (view === "tour") {
    return (
      <GuidedDemo
        evidence={evidence}
        chapter={tourChapter}
        setChapter={setTourChapter}
        onOpenWorkspace={(next, scenarioId) => {
          if (scenarioId) changeFixture(scenarioId);
          setView(next);
        }}
      />
    );
  }

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
            setView("decision");
          }}
          aria-label="Headroom decision workspace"
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
            aria-label="Open guided demo"
            onClick={() => setView("tour")}
          >
            <Icon name="play" size={17} />
            <span>Guided demo</span>
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
                <span>Learning & results</span>
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
            <strong>A new job. The same bills.</strong>
            <p>Check whether the cash arrives in time to cover both.</p>
            <button
              disabled={!ready}
              type="button"
              onClick={() => setHelpOpen(true)}
            >
              Workspace tips <Icon name="help" size={14} />
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
                    A new job, without running out of cash
                  </span>
                  <h1>Can the company afford this job?</h1>
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
              <p className="workspace-explainer">
                Headroom compares when the customer pays with when wages and
                other bills are due. The <strong>cash buffer</strong> is the
                {" "}{money(input.reserveCents)} the company wants to keep aside
                for ongoing expenses. Change an assumption below to see the effect.
              </p>
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
                    <strong>{decisionCopy[activeResult.status].title}</strong>
                    {(proposalResult || isEdited) && (
                      <span className="draft-tag">
                        {proposalResult
                          ? "Proposed terms · what-if"
                          : "Local what-if · not agreed terms"}
                      </span>
                    )}
                  </div>
                  <p>
                    {decisionCopy[activeResult.status].explanation}
                  </p>
                </div>
                <span className="signal-state">
                  {activeResult.status === "SUPPORTED_IN_TESTED_SCENARIOS"
                    ? "CASH BUFFER KEPT"
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
                        <span className="eyebrow">Money in, bills out</span>
                        <h2 id="cash-heading">Cash available over time</h2>
                      </div>
                      <span className="currency-note mono">USD</span>
                    </div>
                    <div className="cash-metrics">
                      <div>
                        <span>Lowest cash in the forecast</span>
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
                          tested case
                        </small>
                      </div>
                      <div>
                        <span>Shortfall below the buffer</span>
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
                              ? "This much more is needed earlier"
                              : "Enough cash in the cases tested"}
                        </small>
                      </div>
                      <div>
                        <span>Cases that keep the buffer</span>
                        <strong className="mono">
                          {activeResult.status === "NEEDS_INPUT" ? "—" : (
                            <>
                              {activeResult.passingScenarioCount}
                              <span className="metric-denominator">
                                {" "}/ {activeResult.scenarioCount}
                              </span>
                            </>
                          )}
                        </strong>
                        <small>
                          {activeResult.coverageComplete
                            ? "Every combination entered was tested"
                            : "More information is needed"}
                        </small>
                      </div>
                    </div>
                    {activeResult.status === "NEEDS_INPUT" && (
                      <div className="provisional-note">
                        <Icon name="warning" size={14} />
                        <span>
                          This chart is missing information. Its balances cannot
                          show whether the plan works until those gaps are filled.
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
                        Without this job
                      </span>
                      {proposalResult && (
                        <span>
                          <i className="legend-line legend-comparison" />
                          Original terms
                        </span>
                      )}
                      <span>
                        <i className="legend-envelope" />
                        Other cases tested
                      </span>
                    </div>
                    <div className="chart-policy">
                      <Icon name="shield" size={15} />
                      <span>
                        {money(input.reserveCents)} cash buffer ·{" "}
                        {money(input.openingCashCents)} starting cash · through{" "}
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
                      <span>Choose an example</span>
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
                      {exampleDescriptions[fixture.id] ?? fixture.description}
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
                          Assumption to confirm with {uncertainty.owner} by{" "}
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
                          Ask for part of the final payment upfront instead.
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
                          Largest deposit allowed in this example:{" "}
                          {money(
                            (originalDeposit?.amountCents ?? 0) +
                              (fixture.job.negotiation?.maxAdditionalCents ??
                                0),
                          )}
                          . The customer would still need to agree.
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
                      <span className="eyebrow">A possible fix</span>
                      <span className="tiny-green-dot" />
                    </div>
                    {proposal?.status === "AVAILABLE" ? (
                      <>
                        <h2>
                          Get part of the payment
                          <br />
                          earlier.
                        </h2>
                        <p>
                          Collect{" "}
                          <strong>
                            {money(proposal.additionalDepositCents)} more
                          </strong>{" "}
                          upfront to keep the cash buffer in the cases tested.
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
                          <span>Final payment</span>
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
                            Same total price:{" "}
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
                          A draft to discuss. The customer must agree and the
                          payment must reach the bank on time.
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
                          {result.status === "NEEDS_INPUT"
                            ? "Confirm missing amounts, dates, or disputed documents before testing a new payment schedule."
                            : result.status === "SUPPORTED_IN_TESTED_SCENARIOS"
                              ? "No larger deposit is needed for the cases tested. Confirm that the payment dates and bills match the real agreement."
                              : "No earlier-payment proposal is available for this example. Review the costs, payment dates, and assumptions below."}
                        </p>
                        <div className="next-move-note">
                          <Icon name="shield" size={22} />
                          <span>
                            {input.forwardCalendarConfirmed
                              ? "Upcoming payments reviewed through"
                              : "Confirm upcoming payments through"}
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
                          ? "This answer can change whether enough cash is left for the buffer."
                          : "This answer helps narrow how much cash the plan will need."}
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
                    <h2 id="calendar-heading">Upcoming payments and bills</h2>
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
                        <th>Money in or out</th>
                        <th>Source</th>
                        <th>Payment status</th>
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
                              {paymentStatus[event.settlement]}
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
                    Assumptions and calculation details
                  </span>
                  <span className="count-label">
                    {activeResult.assumptions.length} assumptions{" "}
                    <Icon name="chevron-down" size={13} />
                  </span>
                </summary>
                <div className="assumptions-body">
                  <p>
                    Tested {activeResult.scenarioCount} of{" "}
                    {activeResult.possibleScenarioCount} combinations of the
                    dates and costs entered.{" "}
                    {activeResult.coverageComplete
                      ? "All those combinations were checked."
                      : "The check is incomplete and cannot support a decision yet."}{" "}
                    Actual payments still depend on what the customer agrees
                    and when the money arrives.
                  </p>
                  <strong>Calculation notes</strong>
                  <ul>
                    {activeResult.reasons.map((reason, index) => (
                      <li key={`${reason.code}-${index}`}>{reason.message}</li>
                    ))}
                  </ul>
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
                    </>
                  )}
                  {proposal?.limitation && <p>{proposal.limitation}</p>}
                </div>
              </details>
              <div className="decision-footer">
                <span>
                  <span className="small-status-dot" />
                  Calculated in code · no AI call ·{" "}
                  {auditStatus === "verified"
                    ? "server calculation matches"
                    : auditStatus === "pending"
                      ? "checking with the server"
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
              Headroom <span className="muted">/</span> Plan the cash before
              taking the job.
            </span>
            <span>
              Intuit sample data + example jobs and bills we added.
            </span>
            <a href="/landing">
              About Headroom <Icon name="arrow-up-right" size={12} />
            </a>
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
          title="How to try this example"
          onClose={() => setHelpOpen(false)}
        >
          <div className="tour-intro">
            <HeadroomMark size={44} />
            <p>
              Headroom checks whether a company can afford a new job and still
              pay workers and bills while waiting for the customer’s money.
            </p>
          </div>
          <ol className="tour-steps">
            <li>
              <span>1</span>
              <div>
                <strong>Start with the money and the bills.</strong>
                <p>
                  The example combines a starting bank balance, existing bills,
                  new job costs, and dates the customer might pay.
                </p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>Find where cash runs short.</strong>
                <p>
                  Code adds and subtracts each payment. The chart shows the
                  lowest balance and how far it falls below the cash buffer.
                </p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>Check what must happen before payment.</strong>
                <p>
                  Qwen reads the contract’s rules. Jev checks whether documents
                  prove them. Being allowed to send a bill does not mean the
                  customer has paid it.
                </p>
              </div>
            </li>
            <li>
              <span>4</span>
              <div>
                <strong>Try getting part of the payment earlier.</strong>
                <p>
                  Increase the deposit and reduce the final payment by the same
                  amount. Compare the chart, then open a draft payment request.
                  It is not sent and no money moves.
                </p>
              </div>
            </li>
            <li>
              <span>5</span>
              <div>
                <strong>See what we improved.</strong>
                <p>
                  Learning & results shows the recorded tests: fewer repeated
                  Jev calls and a more accurate Qwen reader that still needs review.
                </p>
              </div>
            </li>
          </ol>
          <div className="tour-note">
            This is sample business data. The cash calculation updates live.
            AI experiment results are saved from earlier runs and labeled.
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
