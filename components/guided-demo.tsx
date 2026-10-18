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
    label: "The problem",
    icon: Wallet,
    title: "More work doesn’t always mean enough cash.",
    note: "Headroom checks whether a business can take a new job and still pay its people and bills.",
  },
  {
    label: "The inputs",
    icon: Layers3,
    title: "Start with the money, the job, and the bills.",
    note: "Bring the bank balance, customer agreement, and upcoming expenses into one calculation.",
  },
  {
    label: "The checks",
    icon: ScanLine,
    title: "Approved to bill ≠ money in the bank.",
    note: "AI reads the payment rules and checks the proof. A person reviews the results.",
  },
  {
    label: "The shortfall",
    icon: GitBranch,
    title: "Profitable on paper. Short on payday.",
    note: "Test two possible payment dates. Add each payment and subtract each bill in date order.",
  },
  {
    label: "The fix",
    icon: ReceiptText,
    title: "Same price. More of it paid upfront.",
    note: "Test whether receiving part of the final payment earlier would cover the cash shortfall.",
  },
  {
    label: "The learning",
    icon: FlaskConical,
    title: "Less repeated AI work. Measured results.",
    note: "Our improvement loop tests which checks to rerun and which answers can be reused.",
  },
  {
    label: "The limits",
    icon: ShieldCheck,
    title: "What if two things go wrong?",
    note: "Test higher costs together, or remove a key number to see when Headroom needs more information.",
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
      // Let a focused chart scroll horizontally without changing the chapter.
      if (
        (event.key === "ArrowRight" || event.key === "ArrowLeft") &&
        target.closest(".j-chart-plot")
      ) return;
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
            <span>Sample business</span>
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
                <span>SAMPLE BUSINESS / HEADROOM</span>
                <i />
                {chapter === 5
                  ? "Recorded experiment"
                  : chapter === 2
                    ? "How the AI checks work"
                    : "Cash recalculated live"}
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
                    and still pay our team?”
                  </h2>
                  <p>
                    A heating and cooling company is offered work at a clinic.
                    Workers and materials need paying before the customer pays.
                  </p>
                  <button className="j-primary" onClick={next}>
                    Follow the decision <ArrowRight size={17} />
                  </button>
                  <span className="j-micro">
                    Seven steps, from the documents to a payment plan.
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
                    <span className="j-small-pill">Heating & cooling</span>
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
                        <span>Planned job costs</span>
                        <strong>{money(reference.jobCostsCents)}</strong>
                      </div>
                      <div>
                        <span>Price minus job costs</span>
                        <strong>{money(jobSurplus)}</strong>
                      </div>
                    </div>
                    <div className="j-contract-foot">
                      <CheckCheck size={17} />
                      The job earns more than it costs. But when is it paid?
                    </div>
                  </div>
                  <div className="j-floating-label j-float-bottom">
                    <Gem tone="amber">
                      <CalendarDays size={18} />
                    </Gem>
                    <span>
                      Wages are due on time
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
                        title: "Money in the bank",
                        detail: `${money(input.openingCashCents!)} bank balance`,
                        tone: "mint",
                        badge: "Intuit sample data",
                      },
                      {
                        id: "signed-contract",
                        icon: FileText,
                        title: "The customer’s contract",
                        detail: "How much they owe and when they pay",
                        tone: "lavender",
                        badge: "Added for this demo",
                      },
                      {
                        id: "forward-calendar",
                        icon: CalendarDays,
                        title: "Upcoming bills",
                        detail: "Employee wages, materials & running costs",
                        tone: "amber",
                        badge: "Added for this demo",
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
                    <span className="j-eyebrow">INPUTS REVIEWED BY A PERSON</span>
                    <h2>
                      One decision.
                      <br />
                      {input.evidence.length} source documents.
                    </h2>
                    <div>
                      <span>As of</span>
                      <strong>06 Oct 2026</strong>
                    </div>
                    <div>
                      <span>Payments planned</span>
                      <strong>Through 25 Nov</strong>
                    </div>
                    <div>
                      <span>Cash to keep aside</span>
                      <strong>{money(input.reserveCents!)}</strong>
                    </div>
                    <span className="j-soft-note">
                      This cash buffer is money kept aside for ongoing bills.
                    </span>
                  </div>
                </div>
                <div className="j-scene-ribbon">
                  <CircleHelp size={17} />
                  <p>
                    Intuit’s synthetic dataset supplies the company and bank balance.
                    We added the example job, future bills, and payment dates,
                    and assume the starting cash is available to spend.
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
                        Payment due 14 days after the bill is sent
                      </span>
                      <small>
                        A due date says when payment is owed. It doesn’t prove
                        the money has arrived.
                      </small>
                    </div>
                  </div>
                  <div className="j-predicates">
                    <div className="j-card-label">
                      <ScanLine size={16} /> CHECK THE PROOF{" "}
                      <span className="j-small-pill">Jev’s role</span>
                    </div>
                    <div className="j-predicate">
                      <span className="j-predicate-icon">
                        <CheckCheck size={22} />
                      </span>
                      <div>
                        <strong>Did the inspection pass?</strong>
                        <span>Planned for Oct 20 · no proof yet as of Oct 6</span>
                      </div>
                      <small>Unknown</small>
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
                        <span>Expected Oct 20 · no proof yet as of Oct 6</span>
                      </div>
                      <small>Unknown</small>
                    </div>
                    <p className="j-soft-note">
                      Qwen reads the contract’s amounts and rules. Jev checks
                      whether documents prove each condition. Here, both are
                      still unknown. This step illustrates reviewed sample inputs;
                      it does not call a model live.
                    </p>
                  </div>
                </div>
                <div className="j-date-chain">
                  <div>
                    <span>01</span>
                    <strong>Allowed to bill</strong>
                    <small>Contract conditions are met</small>
                  </div>
                  <Connector />
                  <div>
                    <span>02</span>
                    <strong>Bill sent</strong>
                    <small>The 14-day countdown starts</small>
                  </div>
                  <Connector />
                  <div>
                    <span>03</span>
                    <strong>Due date</strong>
                    <small>Customer is expected to pay</small>
                  </div>
                  <Connector />
                  <div className="j-chain-last">
                    <span>04</span>
                    <strong>Money arrives</strong>
                    <small>Now it can pay the bills</small>
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
                      <span>lowest cash if payment is late</span>
                    </h2>
                    <p>
                      A {money(story.phaseCents)} payment for the first stage of
                      work may arrive on Oct 24 or Nov 20. If it arrives later,
                      wages and materials must be paid first.
                    </p>
                    <div className="j-verdict amber">
                      <span>
                        {story.current.passing} / {story.current.total}
                      </span>
                      <div>
                        <strong>Tested cases keep the cash buffer</strong>
                        <small>
                          The goal: keep {money(story.reserveCents)} aside for
                          ongoing bills.
                        </small>
                      </div>
                    </div>
                    <button
                      className="j-text-button"
                      onClick={() => openSource("customer-email")}
                    >
                      Why these payment dates?{" "}
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
                        <strong>Materials + workers</strong>
                        <small>−{money(reference.jobCostsCents, true)}</small>
                      </div>
                      <ChevronRight size={16} />
                      <div>
                        <span>20 NOV · LATE PATH</span>
                        <strong>Customer pays</strong>
                        <small>+{money(story.phaseCents, true)}</small>
                      </div>
                    </div>
                    <p className="j-chart-caption">
                      The chart also includes wages and other bills the company
                      already owes, plus the customer’s final payment.
                    </p>
                  </div>
                </div>
                <div className="j-scene-ribbon">
                  <Cpu size={17} />
                  <p>
                    Code calculates the balance in exact cents. It tests the
                    dates entered here; it does not predict how likely they are.
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
                      Ask the customer to pay part of the final bill upfront
                      instead. The total stays {money(story.contractCents)}.
                      The company has more cash when wages and materials are due.
                    </p>
                    <div className={`j-verdict ${proposed ? "mint" : "amber"}`}>
                      <span>
                        {proposed
                          ? story.proposed.passing
                          : story.current.passing}{" "}
                        / {story.current.total}
                      </span>
                      <div>
                        <strong>Tested cases keep the cash buffer</strong>
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
                        Test the earlier payment <ArrowRight size={17} />
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
                          Upfront deposit
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
                          After first stage
                          <strong>{money(story.phaseCents)}</strong>
                        </span>
                        <span>
                          <i />
                          Final payment
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
                    This is a proposal to discuss with the customer. They must
                    agree and pay on time. It works for the cases tested here;
                    it is not a guarantee against every possible delay.
                  </p>
                  <button onClick={() => openSource("negotiation-bounds")}>
                    Allowed changes <ArrowUpRight size={15} />
                  </button>
                </div>
              </>
            )}

            {chapter === 5 && (
              <>
                <div className="j-learning-layout">
                  <div className="j-learning-main">
                    <div className="j-card-label">
                      <Sparkles size={16} /> THE AI IMPROVEMENT LOOP{" "}
                      <span className="j-small-pill">Recorded replay</span>
                    </div>
                    <div className="j-learning-flow">
                      <Node
                        icon={<Cpu size={22} />}
                        title="Suggest"
                        sub="AI changes which checks run"
                        tone="lavender"
                      />
                      <Connector />
                      <Node
                        icon={<RefreshCw size={22} />}
                        title="Test"
                        sub={`${evidence.updates} identical document updates`}
                        tone="amber"
                      />
                      <Connector />
                      <Node
                        icon={<ShieldCheck size={22} />}
                        title="Compare"
                        sub="Same score with fewer calls?"
                      />
                      <Connector />
                      <Node
                        icon={<Check size={22} />}
                        title="Keep"
                        sub="Only if quality checks pass"
                      />
                    </div>
                    <div className="j-learning-result">
                      <div>
                        <span>AI requests</span>
                        <strong>
                          <s>{evidence.baseline.requests}</s>
                          <ArrowRight size={22} />
                          {evidence.candidate.requests}
                        </strong>
                        <small>Reuse answers when their sources haven’t changed</small>
                      </div>
                      <div>
                        <span>Text sent to AI (tokens)</span>
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
                        <small>Send less of the same text again</small>
                      </div>
                      <div>
                        <span>Correct checks</span>
                        <strong>
                          {evidence.candidate.correct}
                          <small> / {evidence.candidate.total}</small>
                        </strong>
                        <small>
                          Same score as before · one error remains
                        </small>
                      </div>
                    </div>
                    <div className="j-gate-result">
                      <Check size={17} />
                      <span>
                        {evidence.workflowPromoted
                          ? "The new workflow passed the preset quality checks."
                          : "The new workflow failed the preset quality checks."}{" "}
                        Measured on these simulated updates, not every business.
                      </span>
                    </div>
                  </div>
                  <div className="j-finetune-card">
                    <Gem tone="lavender">
                      <FlaskConical size={24} />
                    </Gem>
                    <span className="j-eyebrow">FINE-TUNING THE CONTRACT READER</span>
                    <h2>
                      More correct terms.
                      <br />
                      Still needs review.
                    </h2>
                    <div className="j-tune-score">
                      <span>{evidence.v5.baseExact}</span>
                      <ArrowRight size={25} />
                      <strong>{evidence.v5.tunedExact}</strong>
                      <small>
                        / {evidence.v5.count}
                        <br />
                        payment rules correct
                      </small>
                    </div>
                    <p>
                      Training Qwen on 336 sample clauses improved its answers.
                      But {evidence.v5.incorrectProposals} wrong proposals still
                      passed the automatic checks on this unseen test.
                    </p>
                    <span className="j-hold-badge">
                      {evidence.v5.promoted
                        ? "Passed the release test"
                        : "Not approved for automatic use"}
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
                    A new insurance email should trigger a certificate check,
                    without rechecking an unchanged inspection report. The
                    meta-harness tests that reuse. Fine-tuning separately teaches
                    Qwen to read contracts; neither changes the cash arithmetic.
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
                        <h2>Two small surprises can add up.</h2>
                        <p>
                          Two materials orders can each cost $4,000 extra.
                          Test neither, one, or both increases. In this example,
                          the $30,000 customer payment arrives on Oct 24.
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
                                  ? "No extra costs"
                                  : Object.values(outcome.answers).filter(
                                        (answer) => answer === "surcharge",
                                      ).length === 2
                                    ? "Both orders cost more"
                                    : "One order costs more"}
                              </span>
                              <strong>
                                {money(outcome.withJob.minimumCents)}
                              </strong>
                              <small>
                                {outcome.passes
                                  ? "Cash buffer kept"
                                  : `${money(stress.result.reserveGapCents)} below buffer`}
                              </small>
                            </div>
                          ))}
                        </div>
                        <span className="j-soft-note">
                          {stress.result.passingScenarioCount}/
                          {stress.result.scenarioCount} tested cases keep the
                          cash buffer. Together, the extra costs push cash below it.
                        </span>
                      </>
                    ) : (
                      <>
                        <h2>A missing number stays missing.</h2>
                        <p>
                          The amount owed in employee-related taxes is missing.
                          Two documents also disagree on whether the inspection passed.
                        </p>
                        <div className="j-unknown-card">
                          <CircleHelp size={34} />
                          <span>
                            Tax payment amount<strong>Unknown</strong>
                          </span>
                          <span className="j-hold-badge">Needs input</span>
                        </div>
                        <div className="j-unknown-outcome">
                          <ShieldCheck size={20} />
                          <div>
                            <strong>Not enough information to decide</strong>
                            <p>
                              The calculation is missing a bill. Headroom asks
                              for the amount before saying the plan works.
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
                        CHECK THE RESULT<strong>See how we got here.</strong>
                      </span>
                    </div>
                    <div className="j-receipt-row">
                      <span>Scenario</span>
                      <strong>
                        {stressMode === "combined"
                          ? "Two materials cost increases"
                          : "Missing tax amount"}
                      </strong>
                    </div>
                    <div className="j-receipt-row">
                      <span>Evidence + assumptions</span>
                      <strong>Saved with this calculation</strong>
                    </div>
                    <div className="j-receipt-row">
                      <span>Calculation</span>
                      <strong>Code adds and subtracts cents</strong>
                    </div>
                    <div className="j-receipt-row">
                      <span>Server double-check</span>
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
                      <span>INPUT ID · IDENTIFIES THIS EXACT VERSION</span>
                      <code>{activeResult.inputHash.slice(0, 24)}…</code>
                    </div>
                    <div className="j-sentry-note">
                      <span className="j-sentry-mark">
                        <ScanLine size={19} />
                      </span>
                      <p>
                        <strong>Sentry helps trace bugs</strong>The calculation
                        is instrumented with <code>decision.evaluate</code>, so
                        developers can trace the inputs and result if it fails.
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
                ? "Server calculation matches this result"
                : auditStatus === "pending"
                  ? "Verifying calculation…"
                  : "Calculated here · server check unavailable"}
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
                  : "Example job · current payment terms"}
            </span>
            <span className="j-motion-note">
              Animation shows the steps, not AI processing time.
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
                {playing ? "Playing walkthrough" : "Follow the example at your pace"}
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
            : "Sample document added for this demo"}
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
