"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  Clock3,
  Cpu,
  FileText,
  FlaskConical,
  GitBranch,
  Layers3,
  Mail,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  ReceiptText,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";
import type { SourceEvidence } from "@/lib/domain";
import type { LandingEvidence } from "@/lib/landing-evidence";
import {
  decisionResultsMatch,
  demoMoney as money,
  getJourneyCase,
} from "@/lib/demo-journey";
import { HeadroomMark } from "./icons";
import { Dialog } from "./dialog";
import { JourneyChart } from "./journey-chart";

const chapters = [
  {
    label: "Opportunity",
    icon: Wallet,
    title: "A good job. A harder cash question.",
    note: "Headroom helps a small business decide which work it can afford to take.",
  },
  {
    label: "Evidence",
    icon: Layers3,
    title: "Every decision starts with a source.",
    note: "The books show today. Contracts and commitments explain what happens next.",
  },
  {
    label: "Conditions",
    icon: ScanLine,
    title: "Approved to bill ≠ money in the bank.",
    note: "Turn a contract clause into separate, reviewable conditions and dates.",
  },
  {
    label: "Cash path",
    icon: GitBranch,
    title: "Profitable on paper. Short on payday.",
    note: "Code evaluates every declared scenario, keeping each cash movement in order.",
  },
  {
    label: "Better terms",
    icon: ReceiptText,
    title: "Change the timing. Keep the opportunity.",
    note: "Test an earlier deposit against the same obligations and the same total revenue.",
  },
  {
    label: "Learning",
    icon: FlaskConical,
    title: "Improve the workflow. Make it prove itself.",
    note: "A meta-harness proposes a change, replays the workload, then applies a fixed gate.",
  },
  {
    label: "Trust",
    icon: ShieldCheck,
    title: "A useful answer knows its limits.",
    note: "Combine risks. Keep unknowns unknown. Make the calculation inspectable.",
  },
] as const;

type WorkspaceView = "decision" | "evidence" | "lab";
type Audit = { hash: string; status: "verified" | "local" } | null;

function Gem({
  children,
  tone = "mint",
  size = "",
}: {
  children: ReactNode;
  tone?: string;
  size?: string;
}) {
  return (
    <span aria-hidden="true" className={`j-gem ${tone} ${size}`}>
      {children}
    </span>
  );
}

function Node({
  icon,
  title,
  sub,
  tone = "mint",
}: {
  icon: ReactNode;
  title: string;
  sub: string;
  tone?: string;
}) {
  return (
    <div className="j-flow-node">
      <Gem tone={tone}>{icon}</Gem>
      <strong>{title}</strong>
      <span>{sub}</span>
    </div>
  );
}

function Connector() {
  return (
    <span className="j-connector" aria-hidden="true">
      <i />
      <ChevronRight size={16} />
    </span>
  );
}

export function GuidedDemo({
  evidence,
  chapter,
  setChapter,
  onOpenWorkspace,
}: {
  evidence: LandingEvidence;
  chapter: number;
  setChapter: Dispatch<SetStateAction<number>>;
  onOpenWorkspace: (view: WorkspaceView, scenarioId?: string) => void;
}) {
  const reference = useMemo(() => getJourneyCase(), []);
  const stress = useMemo(() => getJourneyCase("ductline-joint-stress"), []);
  const incomplete = useMemo(
    () => getJourneyCase("ductline-missing-evidence"),
    [],
  );
  const [playing, setPlaying] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [proposed, setProposed] = useState(false);
  const [stressMode, setStressMode] = useState<"combined" | "missing">(
    "combined",
  );
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [audit, setAudit] = useState<Audit>(null);
  const [retry, setRetry] = useState(0);
  const stage = useRef<HTMLElement>(null);
  const chapterNav = useRef<HTMLElement>(null);
  const { input, story } = reference;
  const source = input.evidence.find((item) => item.id === sourceId);
  const activeCase =
    chapter === 6
      ? stressMode === "combined"
        ? stress
        : incomplete
      : reference;
  const isProposal =
    chapter === 4 &&
    proposed &&
    reference.proposedInput &&
    reference.proposedResult;
  const activeInput = isProposal ? reference.proposedInput! : activeCase.input;
  const activeResult = isProposal
    ? reference.proposedResult!
    : activeCase.result;
  const auditStatus =
    audit?.hash === activeResult.inputHash ? audit.status : "pending";

  const go = useCallback(
    (index: number) => {
      setPlaying(false);
      setChapter(Math.max(0, Math.min(chapters.length - 1, index)));
    },
    [setChapter],
  );

  useEffect(() => {
    const nav = chapterNav.current;
    const active = nav?.querySelector<HTMLElement>("[aria-current=step]");
    if (!nav || !active || nav.scrollWidth <= nav.clientWidth) return;
    nav.scrollTo({
      left:
        active.getBoundingClientRect().left -
        nav.getBoundingClientRect().left +
        nav.scrollLeft -
        nav.clientWidth / 2 +
        active.clientWidth / 2,
      behavior: "instant",
    });
  }, [chapter]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/decision", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(activeInput),
          signal: controller.signal,
        });
        const matches =
          response.ok &&
          decisionResultsMatch(activeResult, await response.json());
        if (!controller.signal.aborted)
          setAudit({
            hash: activeResult.inputHash,
            status: matches ? "verified" : "local",
          });
      } catch {
        if (!controller.signal.aborted)
          setAudit({ hash: activeResult.inputHash, status: "local" });
      }
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [activeInput, activeResult, retry]);

  useEffect(() => {
    if (!playing || sourceId) return;
    const timer = setTimeout(() => {
      if (chapter === chapters.length - 1) setPlaying(false);
      else setChapter((value) => value + 1);
    }, 9500);
    return () => clearTimeout(timer);
  }, [playing, chapter, sourceId, setChapter]);

  useEffect(() => {
    if (!playing || (chapter !== 4 && chapter !== 6)) return;
    if (chapter === 4) setProposed(false);
    else setStressMode("combined");
    const timer = setTimeout(() => {
      if (chapter === 4) setProposed(true);
      else setStressMode("missing");
    }, 4500);
    return () => clearTimeout(timer);
  }, [playing, chapter]);

  useEffect(() => {
    const pauseWhenHidden = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("visibilitychange", pauseWhenHidden);
    return () =>
      document.removeEventListener("visibilitychange", pauseWhenHidden);
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        sourceId ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        target.closest(
          "input, textarea, select, [contenteditable=true], dialog",
        )
      )
        return;
      if (event.key === "Escape") {
        setPresenting(false);
        setPlaying(false);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        go(chapter + 1);
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        go(chapter - 1);
      }
      if (event.key === "Home" && presenting) {
        event.preventDefault();
        go(0);
      }
      if (event.key === "End" && presenting) {
        event.preventDefault();
        go(chapters.length - 1);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [chapter, go, presenting, sourceId]);

  useEffect(() => {
    if (!presenting) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [presenting]);

  const openSource = (id: string) => {
    setPlaying(false);
    setSourceId(id);
  };
  const openWorkspace = (view: WorkspaceView, scenarioId?: string) => {
    setPlaying(false);
    onOpenWorkspace(view, scenarioId);
  };
  const next = () => {
    go(chapter + 1);
    if (window.innerWidth < 760)
      stage.current?.scrollIntoView({ block: "start", behavior: "instant" });
  };
  const jobSurplus = input.job.priceCents - reference.jobCostsCents;

  return (
    <div
      className={`journey ${presenting ? "is-presenting" : ""}`}
      data-guided-demo="true"
    >
      <a className="skip-link" href="#journey-stage">
        Skip to walkthrough
      </a>
      <div className="j-ambient" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div className="j-shell">
        <header className="j-header">
          <a className="j-brand" href="/landing" aria-label="Headroom home">
            <HeadroomMark size={31} />
            <span>
              headroom<span>.</span>
            </span>
          </a>
          <div className="j-header-label">
            <span className="j-live-dot" />
            Interactive walkthrough<span className="j-divider">/</span>
            <span>Synthetic case</span>
          </div>
          <div className="j-header-actions">
            <button
              className="j-text-button"
              onClick={() => openWorkspace("decision")}
            >
              Open workspace <ArrowUpRight size={15} />
            </button>
            <button
              className="j-icon-button"
              aria-label={
                presenting
                  ? "Exit presentation mode"
                  : "Enter presentation mode"
              }
              title={
                presenting ? "Exit presentation · Esc" : "Presentation mode"
              }
              onClick={() => setPresenting(!presenting)}
            >
              {presenting ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
          </div>
        </header>

        <nav
          ref={chapterNav}
          className="j-chapters"
          aria-label="Walkthrough chapters"
        >
          {chapters.map((item, index) => {
            const ChapterIcon = item.icon;
            return (
              <button
                key={item.label}
                className={`j-chapter ${index === chapter ? "is-active" : ""} ${index < chapter ? "is-past" : ""}`}
                onClick={() => go(index)}
                aria-current={index === chapter ? "step" : undefined}
                aria-label={`Step ${index + 1}: ${item.label}`}
              >
                <span className="j-chapter-node">
                  {index < chapter ? (
                    <Check size={16} />
                  ) : (
                    <ChapterIcon size={16} />
                  )}
                </span>
                <span>
                  <small>0{index + 1}</small>
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>

        <main id="journey-stage" ref={stage} className="j-stage" tabIndex={-1}>
          <div className="j-scene-heading" key={`heading-${chapter}`}>
            <div>
              <p className="j-eyebrow">
                <span>SYNTHETIC CASE / HEADROOM</span>
                <i />
                {chapter === 5
                  ? "Recorded experiment"
                  : chapter === 2
                    ? "Reviewed extraction flow"
                    : "Live deterministic calculation"}
              </p>
              <h1>{chapters[chapter].title}</h1>
              <p className="j-subtitle">{chapters[chapter].note}</p>
            </div>
            <span className="j-scene-number" aria-hidden="true">
              0{chapter + 1}
              <small>/ 07</small>
            </span>
          </div>

          <div
            className={`j-scene j-scene-${chapter}`}
            key={`scene-${chapter}`}
          >
            {chapter === 0 && (
              <>
                <div className="j-opening-copy">
                  <span className="j-tag">
                    <Wallet size={14} />
                    {input.company.name}
                  </span>
                  <h2>
                    “Can we take this
                    <br />
                    <em>{money(input.job.priceCents)} job</em>
                    <br />
                    and still make payroll?”
                  </h2>
                  <p>
                    A contractor’s next big opportunity. One late customer
                    payment could put the rest of the business at risk.
                  </p>
                  <button className="j-primary" onClick={next}>
                    Follow the decision <ArrowRight size={17} />
                  </button>
                  <span className="j-micro">
                    Seven scenes. Every number has a trail.
                  </span>
                </div>
                <div className="j-opportunity-art">
                  <div className="j-orbit j-orbit-one" aria-hidden="true" />
                  <div className="j-orbit j-orbit-two" aria-hidden="true" />
                  <div className="j-floating-label j-float-top">
                    <Gem tone="lavender">
                      <FileText size={18} />
                    </Gem>
                    <span>
                      New opportunity<strong>Northstar Clinic</strong>
                    </span>
                    <span className="j-small-pill">HVAC retrofit</span>
                  </div>
                  <div className="j-contract-card">
                    <div className="j-contract-top">
                      <span>CONTRACT / 001</span>
                      <ReceiptText size={23} />
                    </div>
                    <span className="j-contract-label">The opportunity</span>
                    <strong className="j-contract-amount">
                      {money(input.job.priceCents)}
                    </strong>
                    <div className="j-contract-rule" />
                    <div className="j-contract-metrics">
                      <div>
                        <span>Modeled job costs</span>
                        <strong>{money(reference.jobCostsCents)}</strong>
                      </div>
                      <div>
                        <span>Modeled job surplus</span>
                        <strong>{money(jobSurplus)}</strong>
                      </div>
                    </div>
                    <div className="j-contract-foot">
                      <CheckCheck size={17} />
                      The margin looks good. The timing needs a check.
                    </div>
                  </div>
                  <div className="j-floating-label j-float-bottom">
                    <Gem tone="amber">
                      <CalendarDays size={18} />
                    </Gem>
                    <span>
                      Payroll can’t wait
                      <strong>Does the cash arrive in time?</strong>
                    </span>
                    <ArrowRight size={19} />
                  </div>
                </div>
              </>
            )}

            {chapter === 1 && (
              <>
                <div className="j-evidence-flow">
                  <div className="j-source-stack">
                    {[
                      {
                        id: "intuit-bank",
                        icon: BookOpen,
                        title: "The books",
                        detail: `${money(input.openingCashCents!)} bank balance`,
                        tone: "mint",
                        badge: "Intuit dataset",
                      },
                      {
                        id: "signed-contract",
                        icon: FileText,
                        title: "The agreement",
                        detail: "Milestones, conditions & payment terms",
                        tone: "lavender",
                        badge: "Scenario addition",
                      },
                      {
                        id: "forward-calendar",
                        icon: CalendarDays,
                        title: "The commitments",
                        detail: "Payroll, suppliers & the forward calendar",
                        tone: "amber",
                        badge: "Scenario addition",
                      },
                    ].map((item, index) => (
                      <button
                        className="j-source-card"
                        key={item.id}
                        onClick={() => openSource(item.id)}
                        style={{ "--order": index } as CSSProperties}
                      >
                        <Gem tone={item.tone}>
                          <item.icon size={21} />
                        </Gem>
                        <span>
                          <strong>{item.title}</strong>
                          <span>{item.detail}</span>
                          <small>{item.badge}</small>
                        </span>
                        <ArrowUpRight size={17} />
                      </button>
                    ))}
                  </div>
                  <div className="j-stream" aria-hidden="true">
                    <svg viewBox="0 0 150 280">
                      <path d="M0 40H42Q65 40 65 65V118Q65 140 90 140H150M0 140H150M0 240H42Q65 240 65 215V162Q65 140 90 140" />
                      <circle r="4">
                        <animateMotion
                          dur="2.6s"
                          repeatCount="2"
                          path="M0 40H42Q65 40 65 65V118Q65 140 90 140H150"
                        />
                      </circle>
                      <circle r="4">
                        <animateMotion
                          dur="2.4s"
                          repeatCount="2"
                          path="M0 140H150"
                        />
                      </circle>
                      <circle r="4">
                        <animateMotion
                          dur="2.8s"
                          repeatCount="2"
                          path="M0 240H42Q65 240 65 215V162Q65 140 90 140H150"
                        />
                      </circle>
                    </svg>
                  </div>
                  <div className="j-snapshot-card">
                    <Gem size="large">
                      <Layers3 size={30} />
                    </Gem>
                    <span className="j-eyebrow">REVIEWED SNAPSHOT</span>
                    <h2>
                      One decision.
                      <br />
                      {input.evidence.length} source records.
                    </h2>
                    <div>
                      <span>As of</span>
                      <strong>06 Oct 2026</strong>
                    </div>
                    <div>
                      <span>Forward calendar</span>
                      <strong>Through 25 Nov</strong>
                    </div>
                    <div>
                      <span>Reserve policy</span>
                      <strong>{money(input.reserveCents!)}</strong>
                    </div>
                    <span className="j-soft-note">
                      Sources + assumptions travel with the calculation.
                    </span>
                  </div>
                </div>
                <div className="j-scene-ribbon">
                  <CircleHelp size={17} />
                  <p>
                    Intuit supplies the synthetic company and opening ledger.
                    Future commitments, unrestricted-cash assumptions and
                    contract documents are disclosed demo additions.
                  </p>
                  <button onClick={() => openSource("customer-email")}>
                    Read the payment email <ArrowUpRight size={15} />
                  </button>
                </div>
              </>
            )}

            {chapter === 2 && (
              <>
                <div className="j-condition-layout">
                  <div className="j-clause-card">
                    <div className="j-card-label">
                      <FileText size={16} /> CONTRACT · §8{" "}
                      <button
                        aria-label="Read full contract source"
                        onClick={() => openSource("signed-contract")}
                      >
                        <ArrowUpRight size={17} />
                      </button>
                    </div>
                    <blockquote>
                      “{money(story!.phaseCents)} becomes invoice-eligible after{" "}
                      <mark>both</mark> phase-one inspection has passed{" "}
                      <mark>and</mark> the customer’s project manager has
                      received the insurance certificate.”
                    </blockquote>
                    <span className="j-clause-note">
                      Highlighted clause from the disclosed demo contract.
                    </span>
                    <div className="j-clause-dates">
                      <span>
                        <Clock3 size={16} />
                        14 calendar days after invoice issuance
                      </span>
                      <small>
                        That is the due-date rule, not a guarantee of
                        settlement.
                      </small>
                    </div>
                  </div>
                  <div className="j-predicates">
                    <div className="j-card-label">
                      <ScanLine size={16} /> NARROW EVIDENCE CHECKS{" "}
                      <span className="j-small-pill">Jev’s role</span>
                    </div>
                    <div className="j-predicate">
                      <span className="j-predicate-icon">
                        <CheckCheck size={22} />
                      </span>
                      <div>
                        <strong>Did the inspection pass?</strong>
                        <span>Expected 20 Oct · not observed as of 06 Oct</span>
                      </div>
                      <small>Not observed</small>
                    </div>
                    <div className="j-and">AND</div>
                    <div className="j-predicate">
                      <span className="j-predicate-icon">
                        <Mail size={22} />
                      </span>
                      <div>
                        <strong>
                          Did the customer receive the certificate?
                        </strong>
                        <span>Expected 20 Oct · not observed as of 06 Oct</span>
                      </div>
                      <small>Not observed</small>
                    </div>
                    <p className="j-soft-note">
                      Qwen proposes typed terms → source validation and owner
                      review. Jev checks narrow evidence questions. This
                      illustration uses reviewed fixture inputs, with no live
                      model call.
                    </p>
                  </div>
                </div>
                <div className="j-date-chain">
                  <div>
                    <span>01</span>
                    <strong>Eligibility</strong>
                    <small>Conditions permit an invoice</small>
                  </div>
                  <Connector />
                  <div>
                    <span>02</span>
                    <strong>Invoice issued</strong>
                    <small>Starts the payment clock</small>
                  </div>
                  <Connector />
                  <div>
                    <span>03</span>
                    <strong>Due date</strong>
                    <small>Contractual obligation</small>
                  </div>
                  <Connector />
                  <div className="j-chain-last">
                    <span>04</span>
                    <strong>Bank settlement</strong>
                    <small>Cash the engine can model</small>
                  </div>
                </div>
              </>
            )}

            {chapter === 3 && story && (
              <>
                <div className="j-cash-layout">
                  <div className="j-cash-narrator">
                    <Gem tone="amber">
                      <GitBranch size={23} />
                    </Gem>
                    <span className="j-eyebrow">THE TIMING GAP</span>
                    <h2>
                      {money(story.current.minimumCents)}
                      <span>lowest modeled cash</span>
                    </h2>
                    <p>
                      The {money(story.phaseCents)} phase payment may land on 24
                      Oct or 20 Nov. In the later path, materials and crew costs
                      arrive first.
                    </p>
                    <div className="j-verdict amber">
                      <span>
                        {story.current.passing} / {story.current.total}
                      </span>
                      <div>
                        <strong>Declared paths preserve the reserve</strong>
                        <small>
                          Every path must cover the {money(story.reserveCents)}{" "}
                          floor.
                        </small>
                      </div>
                    </div>
                    <button
                      className="j-text-button"
                      onClick={() => openSource("customer-email")}
                    >
                      Inspect the settlement assumption{" "}
                      <ArrowUpRight size={15} />
                    </button>
                  </div>
                  <div className="j-chart-card">
                    <JourneyChart story={story} />
                    <div className="j-event-strip">
                      <div>
                        <span>07 OCT</span>
                        <strong>Deposit arrives</strong>
                        <small>
                          +{money(story.current.depositCents, true)}
                        </small>
                      </div>
                      <ChevronRight size={16} />
                      <div>
                        <span>12 OCT → 04 NOV</span>
                        <strong>Materials + crew</strong>
                        <small>−{money(reference.jobCostsCents, true)}</small>
                      </div>
                      <ChevronRight size={16} />
                      <div>
                        <span>20 NOV · LATE PATH</span>
                        <strong>Phase payment</strong>
                        <small>+{money(story.phaseCents, true)}</small>
                      </div>
                    </div>
                    <p className="j-chart-caption">
                      The full curve also includes existing payroll, overhead,
                      supplier commitments and the final receipt.
                    </p>
                  </div>
                </div>
                <div className="j-scene-ribbon">
                  <Cpu size={17} />
                  <p>
                    AI interprets language. Deterministic code calculates cash
                    in cents. This is a bounded scenario analysis, not a
                    probability forecast.
                  </p>
                </div>
              </>
            )}

            {chapter === 4 && story && (
              <>
                <div className="j-proposal-layout">
                  <div className="j-proposal-narrator">
                    <div className="j-segment" aria-label="Payment schedule">
                      <button
                        aria-pressed={!proposed}
                        onClick={() => {
                          setPlaying(false);
                          setProposed(false);
                        }}
                      >
                        Current terms
                      </button>
                      <button
                        aria-pressed={proposed}
                        onClick={() => {
                          setPlaying(false);
                          setProposed(true);
                        }}
                      >
                        Proposed terms
                      </button>
                    </div>
                    <h2>
                      Move <em>{money(story.advanceCents)}</em>
                      <br />
                      earlier in the job.
                    </h2>
                    <p>
                      Advance part of the final receipt into the deposit. The
                      contract stays at {money(story.contractCents)}; more cash
                      is available when the work needs it.
                    </p>
                    <div className={`j-verdict ${proposed ? "mint" : "amber"}`}>
                      <span>
                        {proposed
                          ? story.proposed.passing
                          : story.current.passing}{" "}
                        / {story.current.total}
                      </span>
                      <div>
                        <strong>Paths preserve the reserve</strong>
                        <small>
                          {money(
                            proposed
                              ? story.proposed.minimumCents
                              : story.current.minimumCents,
                          )}{" "}
                          lowest cash
                        </small>
                      </div>
                    </div>
                    {!proposed && (
                      <button
                        className="j-primary"
                        onClick={() => {
                          setPlaying(false);
                          setProposed(true);
                        }}
                      >
                        Apply the what-if <ArrowRight size={17} />
                      </button>
                    )}
                    {proposed && (
                      <span className="j-applied">
                        <Check size={17} />
                        Recalculated with proposed terms
                      </span>
                    )}
                  </div>
                  <div className="j-chart-card">
                    <JourneyChart story={story} proposed={proposed} />
                    <div
                      className="j-allocation"
                      aria-label="Contract payment allocation"
                    >
                      <div className="j-allocation-bar">
                        <span
                          style={{
                            flex: proposed
                              ? story.proposed.depositCents
                              : story.current.depositCents,
                          }}
                        />
                        <span style={{ flex: story.phaseCents }} />
                        <span
                          style={{
                            flex: proposed
                              ? story.proposed.finalCents
                              : story.current.finalCents,
                          }}
                        />
                      </div>
                      <div className="j-allocation-labels">
                        <span>
                          <i />
                          Deposit
                          <strong>
                            {money(
                              proposed
                                ? story.proposed.depositCents
                                : story.current.depositCents,
                            )}
                          </strong>
                        </span>
                        <span>
                          <i />
                          Phase payment
                          <strong>{money(story.phaseCents)}</strong>
                        </span>
                        <span>
                          <i />
                          Final receipt
                          <strong>
                            {money(
                              proposed
                                ? story.proposed.finalCents
                                : story.current.finalCents,
                            )}
                          </strong>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="j-scene-ribbon">
                  <ReceiptText size={17} />
                  <p>
                    A proposed agreement, not an executed transaction. The
                    customer must agree and the deposit must settle on time. All
                    declared scenario assumptions still apply.
                  </p>
                  <button onClick={() => openSource("negotiation-bounds")}>
                    View bounds <ArrowUpRight size={15} />
                  </button>
                </div>
              </>
            )}

            {chapter === 5 && (
              <>
                <div className="j-learning-layout">
                  <div className="j-learning-main">
                    <div className="j-card-label">
                      <Sparkles size={16} /> META-HARNESS{" "}
                      <span className="j-small-pill">Recorded replay</span>
                    </div>
                    <div className="j-learning-flow">
                      <Node
                        icon={<Cpu size={22} />}
                        title="Propose"
                        sub="Agent suggests a workflow"
                        tone="lavender"
                      />
                      <Connector />
                      <Node
                        icon={<RefreshCw size={22} />}
                        title="Replay"
                        sub={`${evidence.updates} frozen evidence updates`}
                        tone="amber"
                      />
                      <Connector />
                      <Node
                        icon={<ShieldCheck size={22} />}
                        title="Gate"
                        sub="Compare quality + work"
                      />
                      <Connector />
                      <Node
                        icon={<Check size={22} />}
                        title="Keep"
                        sub="Only if the gate passes"
                      />
                    </div>
                    <div className="j-learning-result">
                      <div>
                        <span>Model requests</span>
                        <strong>
                          <s>{evidence.baseline.requests}</s>
                          <ArrowRight size={22} />
                          {evidence.candidate.requests}
                        </strong>
                        <small>Recheck the affected evidence only</small>
                      </div>
                      <div>
                        <span>Input tokens</span>
                        <strong>
                          <s>
                            {evidence.baseline.inputTokens.toLocaleString(
                              "en-US",
                            )}
                          </s>
                          <ArrowRight size={20} />
                          {evidence.candidate.inputTokens.toLocaleString(
                            "en-US",
                          )}
                        </strong>
                        <small>Less repeated context</small>
                      </div>
                      <div>
                        <span>Correct checks</span>
                        <strong>
                          {evidence.candidate.correct}
                          <small> / {evidence.candidate.total}</small>
                        </strong>
                        <small>
                          Unchanged from baseline · one error remains
                        </small>
                      </div>
                    </div>
                    <div className="j-gate-result">
                      <Check size={17} />
                      <span>
                        {evidence.workflowPromoted
                          ? "Workflow candidate passed the fixed replay gate."
                          : "Workflow candidate did not pass the replay gate."}{" "}
                        Results apply to this frozen synthetic workload.
                      </span>
                    </div>
                  </div>
                  <div className="j-finetune-card">
                    <Gem tone="lavender">
                      <FlaskConical size={24} />
                    </Gem>
                    <span className="j-eyebrow">SEPARATE MODEL EXPERIMENT</span>
                    <h2>
                      A better reader.
                      <br />
                      Still held to the gate.
                    </h2>
                    <div className="j-tune-score">
                      <span>{evidence.v5.baseExact}</span>
                      <ArrowRight size={25} />
                      <strong>{evidence.v5.tunedExact}</strong>
                      <small>
                        / {evidence.v5.count}
                        <br />
                        exact extractions
                      </small>
                    </div>
                    <p>
                      Fine-tuning improved extraction, but left{" "}
                      {evidence.v5.incorrectProposals} incorrect validated
                      proposals.
                    </p>
                    <span className="j-hold-badge">
                      {evidence.v5.promoted
                        ? "Promoted by evaluation"
                        : "Not promoted · human review stays"}
                    </span>
                    <button
                      className="j-text-button"
                      onClick={() => openWorkspace("lab")}
                    >
                      Inspect the full experiments <ArrowUpRight size={15} />
                    </button>
                  </div>
                </div>
                <div className="j-scene-ribbon">
                  <GitBranch size={17} />
                  <p>
                    Two distinct experiments: optimize which checks the agent
                    runs; train a reader to extract better terms. Neither
                    changes the deterministic cash engine.
                  </p>
                </div>
              </>
            )}

            {chapter === 6 && (
              <>
                <div className="j-trust-layout">
                  <div className="j-stress-card">
                    <div className="j-segment">
                      <button
                        aria-pressed={stressMode === "combined"}
                        onClick={() => {
                          setPlaying(false);
                          setStressMode("combined");
                        }}
                      >
                        Two risks together
                      </button>
                      <button
                        aria-pressed={stressMode === "missing"}
                        onClick={() => {
                          setPlaying(false);
                          setStressMode("missing");
                        }}
                      >
                        Missing evidence
                      </button>
                    </div>
                    {stressMode === "combined" ? (
                      <>
                        <h2>Safe alone doesn’t mean safe together.</h2>
                        <p>
                          Two suppliers can each add a $4,000 surcharge. These
                          four paths assume the phase payment arrives on 24 Oct.
                        </p>
                        <div className="j-risk-matrix">
                          {stress.result.outcomes.map((outcome) => (
                            <div
                              key={outcome.id}
                              className={outcome.passes ? "is-safe" : "is-risk"}
                            >
                              <span>
                                {Object.values(outcome.answers).filter(
                                  (answer) => answer === "surcharge",
                                ).length === 0
                                  ? "Both quotes honored"
                                  : Object.values(outcome.answers).filter(
                                        (answer) => answer === "surcharge",
                                      ).length === 2
                                    ? "Both surcharges"
                                    : "One surcharge"}
                              </span>
                              <strong>
                                {money(outcome.withJob.minimumCents)}
                              </strong>
                              <small>
                                {outcome.passes
                                  ? "Reserve preserved"
                                  : `${money(stress.result.reserveGapCents)} below reserve`}
                              </small>
                            </div>
                          ))}
                        </div>
                        <span className="j-soft-note">
                          {stress.result.passingScenarioCount}/
                          {stress.result.scenarioCount} declared paths preserve
                          the reserve. The combined overrun is the one that
                          matters.
                        </span>
                      </>
                    ) : (
                      <>
                        <h2>A missing number stays missing.</h2>
                        <p>
                          Payroll-tax cash is unconfirmed. The inspection
                          acceptance is also disputed.
                        </p>
                        <div className="j-unknown-card">
                          <CircleHelp size={34} />
                          <span>
                            Employer payroll taxes<strong>Unknown</strong>
                          </span>
                          <span className="j-hold-badge">Needs input</span>
                        </div>
                        <div className="j-unknown-outcome">
                          <ShieldCheck size={20} />
                          <div>
                            <strong>Supported verdict withheld</strong>
                            <p>
                              Partial cash paths omit the unknown tax amount.
                              They cannot establish coverage.
                            </p>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="j-receipt">
                    <div className="j-receipt-heading">
                      <Gem>
                        <ShieldCheck size={25} />
                      </Gem>
                      <span>
                        DECISION RECEIPT<strong>Built to be inspected.</strong>
                      </span>
                    </div>
                    <div className="j-receipt-row">
                      <span>Scenario</span>
                      <strong>
                        {stressMode === "combined"
                          ? "Two supplier risks"
                          : "Evidence gap"}
                      </strong>
                    </div>
                    <div className="j-receipt-row">
                      <span>Evidence + assumptions</span>
                      <strong>Attached to snapshot</strong>
                    </div>
                    <div className="j-receipt-row">
                      <span>Calculation</span>
                      <strong>Deterministic · integer cents</strong>
                    </div>
                    <div className="j-receipt-row">
                      <span>Server recomputation</span>
                      <strong
                        className={
                          auditStatus === "verified"
                            ? "j-text-mint"
                            : "j-text-amber"
                        }
                      >
                        {auditStatus === "verified"
                          ? "Matches local result"
                          : auditStatus === "pending"
                            ? "Checking…"
                            : "Not verified"}
                      </strong>
                    </div>
                    <div className="j-receipt-hash">
                      <span>SNAPSHOT FINGERPRINT</span>
                      <code>{activeResult.inputHash.slice(0, 24)}…</code>
                    </div>
                    <div className="j-sentry-note">
                      <span className="j-sentry-mark">
                        <ScanLine size={19} />
                      </span>
                      <p>
                        <strong>Sentry-instrumented evaluation</strong>Span:{" "}
                        <code>decision.evaluate</code>, with snapshot, verdict
                        and scenario metadata.
                      </p>
                    </div>
                    <button
                      className="j-primary"
                      onClick={() => openWorkspace("decision", activeInput.id)}
                    >
                      Explore this case in the workspace{" "}
                      <ArrowUpRight size={17} />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="j-stage-status">
            <span className={`j-audit ${auditStatus}`}>
              <i />
              {auditStatus === "verified"
                ? "Server recomputation matches"
                : auditStatus === "pending"
                  ? "Verifying calculation…"
                  : "Local calculation · server not verified"}
            </span>
            {auditStatus === "local" && (
              <button
                className="j-text-button"
                onClick={() => {
                  setAudit(null);
                  setRetry((value) => value + 1);
                }}
              >
                Retry <RefreshCw size={12} />
              </button>
            )}
            <span className="j-status-context">
              {chapter === 6
                ? stressMode === "combined"
                  ? "Two-risk case"
                  : "Evidence-gap case"
                : chapter === 4 && proposed
                  ? "Proposed payment terms"
                  : "Reference case · current terms"}
            </span>
            <span className="j-motion-note">
              Animations explain the flow; they are not model execution timers.
            </span>
          </div>
        </main>

        <footer className="j-controls">
          <div className="j-control-left">
            <button
              className={`j-play ${playing ? "is-playing" : ""}`}
              aria-label={
                playing
                  ? "Pause walkthrough"
                  : chapter === 6
                    ? "Replay walkthrough"
                    : "Play walkthrough"
              }
              onClick={() => {
                if (chapter === 6) setChapter(0);
                setPlaying(!playing);
              }}
            >
              {playing ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <div>
              <strong>
                {playing ? "Playing walkthrough" : "Your pace. Your decision."}
              </strong>
              <span>
                {playing
                  ? "Each chapter stays for 9.5 seconds"
                  : "Use the arrow keys or jump to any chapter"}
              </span>
            </div>
          </div>
          <div className="j-progress-dots" aria-hidden="true">
            {chapters.map((item, index) => (
              <span
                key={item.label}
                className={
                  index === chapter
                    ? "is-active"
                    : index < chapter
                      ? "is-past"
                      : ""
                }
              />
            ))}
          </div>
          <div className="j-control-right">
            <button
              className="j-back"
              disabled={chapter === 0}
              onClick={() => go(chapter - 1)}
              aria-label="Previous chapter"
            >
              <ArrowLeft size={18} />
            </button>
            {chapter === 6 ? (
              <button
                className="j-primary"
                onClick={() => openWorkspace("decision", activeInput.id)}
              >
                Try this case <ArrowUpRight size={16} />
              </button>
            ) : (
              <button className="j-next" onClick={next}>
                Next: {chapters[chapter + 1].label}
                <ArrowRight size={17} />
              </button>
            )}
          </div>
        </footer>
        <div className="j-screenreader" aria-live="polite" aria-atomic="true">
          Step {chapter + 1} of 7: {chapters[chapter].title}
        </div>
      </div>
      {source && (
        <SourceDialog source={source} onClose={() => setSourceId(null)} />
      )}
    </div>
  );
}

function SourceDialog({
  source,
  onClose,
}: {
  source: SourceEvidence;
  onClose: () => void;
}) {
  return (
    <Dialog title={source.title} onClose={onClose} wide>
      <div className="j-source-dialog">
        <span className="j-source-provenance">
          {source.provenance === "sponsor_dataset"
            ? "Intuit synthetic dataset"
            : "Disclosed Headroom scenario addition"}
        </span>
        <p>{source.text}</p>
        <dl>
          <div>
            <dt>Observed date</dt>
            <dd>{source.observedDate}</dd>
          </div>
          <div>
            <dt>Source record</dt>
            <dd>{source.spanId ?? source.id}</dd>
          </div>
          {source.sha256 && (
            <div>
              <dt>SHA-256</dt>
              <dd>
                <code>{source.sha256}</code>
              </dd>
            </div>
          )}
        </dl>
        {source.url && (
          <a href={source.url} target="_blank" rel="noreferrer">
            Open original dataset <ArrowUpRight size={15} />
          </a>
        )}
      </div>
    </Dialog>
  );
}
