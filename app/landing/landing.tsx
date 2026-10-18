"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";
import { animate, createScope, onScroll, stagger } from "animejs";
import { Icon } from "@/components/icons";
import { HeroRace } from "./hero-race";
import type { LandingEvidence } from "@/lib/landing-evidence";
import { RouteSection, routeTimeline } from "./route-section";
import { ImprovementLoop } from "./improvement-loop";
import { CashStory } from "./cash-story";
import type { LandingCashStory } from "@/lib/landing-cash-story";

const Gradient = dynamic(() => import("./gradient-background"), { ssr: false });

const DEMO = "/";
const SOURCE = "https://github.com/ManagementMO/headroom";

// Actual source IDs in the reviewed demo fixture; future plans stay labeled as plans.
const SOURCES = [
  { value: "$30,000", what: "payment after the first stage", from: "Demo contract · section 8" },
  { value: "Oct 20", what: "planned inspection date", from: "Demo inspection plan" },
  { value: "$18,000", what: "upcoming employee wages", from: "Demo payment calendar" },
  { value: "Nov 3", what: "bill due if sent Oct 20", from: "Demo contract · 14-day rule" },
];

function Chars({ text, attr = "data-char" }: { text: string; attr?: string }) {
  return (
    <>
      {text.split(" ").map((word, w) => (
        <span key={w} className="lp-word" aria-hidden="true">
          {[...word].map((c, i) => (
            <span key={i} className="lp-char" {...{ [attr]: "" }}>
              {c}
            </span>
          ))}
        </span>
      ))}
    </>
  );
}

function DockGlyph({ kind }: { kind: "workspace" | "evidence" | "lab" }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {kind === "workspace" && <>
        <rect x="3.5" y="4" width="17" height="16" rx="3" fill="currentColor" fillOpacity=".09" />
        <path d="m6.5 14.5 3.5-4 3 2.5 4.5-5" />
        <path d="M6.5 17h11" opacity=".4" />
      </>}
      {kind === "evidence" && <>
        <path d="M6.5 6.5H5a2 2 0 0 0-2 2V19a2 2 0 0 0 2 2h10" opacity=".45" />
        <rect x="7" y="3" width="14" height="16" rx="2.5" fill="currentColor" fillOpacity=".09" />
        <path d="M10.5 7h7M10.5 10h4m-3 4 1.5 1.5 3.5-3.5" />
      </>}
      {kind === "lab" && <>
        <path d="M7.5 14h9l2.6 4.4a1.7 1.7 0 0 1-1.5 2.6H6.4a1.7 1.7 0 0 1-1.5-2.6Z" fill="currentColor" fillOpacity=".18" stroke="none" />
        <path d="M8.5 3h7M10 3v6.5l-5.1 8.9A1.7 1.7 0 0 0 6.4 21h11.2a1.7 1.7 0 0 0 1.5-2.6L14 9.5V3M7.5 14h9" />
        <circle cx="10" cy="17.5" r=".75" fill="currentColor" stroke="none" />
      </>}
    </svg>
  );
}

function Dock({ label = "Open live demo" }: { label?: string }) {
  return (
    <div className="lp-dock">
      <a className="lp-dock-icon" href={DEMO} aria-label="Decision workspace" title="Decision workspace"><DockGlyph kind="workspace" /></a>
      <a className="lp-dock-icon" href="/#evidence" aria-label="Evidence" title="Evidence"><DockGlyph kind="evidence" /></a>
      <a className="lp-dock-icon" href="/#lab" aria-label="Improvement lab" title="Improvement lab"><DockGlyph kind="lab" /></a>
      <a className="lp-dock-cta" href={DEMO}>{label} <Icon name="arrow-right" size={16} /></a>
    </div>
  );
}

export default function Landing({ evidence, cashStory }: { evidence: LandingEvidence; cashStory: LandingCashStory | null }) {
  const root = useRef<HTMLElement>(null);
  const reduced = useRef(false);
  const proof = [
    { value: `${Math.round((1 - evidence.candidate.requests / evidence.baseline.requests) * 100)}% fewer calls`, label: "requests sent to the AI checker" },
    { value: `${Math.round((1 - evidence.candidate.inputTokens / evidence.baseline.inputTokens) * 100)}% less input`, label: "text sent to AI, measured in tokens" },
    { value: `${evidence.candidate.correct}/${evidence.candidate.total} correct`, label: "same score before and after" },
  ];

  // Page-wide motion. Scroll-synced animations render their first frame on creation.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce), (max-width: 900px)").matches;
    if (reduced.current) return;
    el.classList.add("lp-ready");

    let stopRoute = () => {};
    const scope = createScope({ root: el }).add(() => {
      // Progress pill.
      animate(".lp-progress i", { scaleX: [0.08, 1], ease: "linear", autoplay: onScroll({ target: el, enter: "top top", leave: "bottom bottom", sync: true }) });

      // Hero: a short, overlapping reveal keeps the demo immediately within reach.
      animate("[data-hero-fade]", { opacity: [0, 1], y: [12, 0], duration: 460, delay: stagger(50, { start: 140 }), ease: "outCubic" });

      // Short entrance reveals finish on their own, including after an anchor jump.
      el.querySelectorAll<HTMLElement>(".lp-feature").forEach((row) => {
        animate(row.querySelectorAll("[data-char]"), {
          opacity: [0, 1],
          y: [8, 0],
          duration: 420,
          delay: stagger(10),
          ease: "outCubic",
          autoplay: onScroll({ target: row, enter: "bottom-=80 top" }),
        });
        animate(row.querySelectorAll("[data-fade]"), {
          opacity: [0, 1],
          y: [20, 0],
          duration: 700,
          ease: "outExpo",
          autoplay: onScroll({ target: row, enter: "bottom-=120 top" }),
        });
      });

      // Each figure connects to a legible source label; never scramble the evidence.
      const row = el.querySelector(".lp-sources-row")!;
      const sourceIn = () => onScroll({ target: row, enter: "bottom-=120 top" });
      animate(".lp-source b", { opacity: [0, 1], y: [24, 0], duration: 800, delay: stagger(160), ease: "outExpo", autoplay: sourceIn() });
      animate(".lp-source span", { opacity: [0, 0.7], duration: 600, delay: stagger(160, { start: 200 }), autoplay: sourceIn() });
      animate(".lp-source i", { scaleY: [0, 1], duration: 500, delay: stagger(160, { start: 350 }), ease: "outQuad", autoplay: sourceIn() });
      animate(".lp-source code", {
        opacity: [0, 1],
        duration: 400,
        delay: stagger(100, { start: 350 }),
        autoplay: sourceIn(),
      });

      // A short entrance explains the three roles without pinning the scroll.
      const route = el.querySelector(".lp-route")!;
      stopRoute = routeTimeline(route, onScroll({ target: route, enter: "center top" }));

      // Finale.
      animate(".lp-finale [data-char]", {
        opacity: [0, 1],
        y: ["0.6em", "0em"],
        rotateX: [-80, 0],
        delay: stagger(22),
        duration: 600,
        ease: "outExpo",
        autoplay: onScroll({ target: ".lp-finale", enter: "bottom-=200 top" }),
      });
    });

    return () => { scope.revert(); stopRoute(); el.classList.remove("lp-ready"); };
  }, []);

  // Hero title: letters flip in in 3D from a blur.
  useEffect(() => {
    const chars = root.current?.querySelectorAll("[data-hero-char]");
    if (!chars?.length || reduced.current) return;
    const a = animate(chars, {
      opacity: [0, 1],
      rotateY: [-55, 0],
      rotateX: [16, 0],
      z: [-60, 0],
      filter: ["blur(6px)", "blur(0px)"],
      duration: 640,
      delay: stagger(15),
      ease: "outExpo",
    });
    return () => { a.revert(); };
  }, []);

  return (
    <main className="lp" ref={root}>
      <nav className="lp-topnav" aria-label="Landing navigation">
        <a href="#top">Headroom</a>
        <a className="lp-nav-detail" href="#decision">The decision</a>
        <a className="lp-nav-detail" href="#how-it-works">How it works</a>
        <a href="#results">Results</a>
        <a href={DEMO}>Open demo ↗</a>
      </nav>
      <div className="lp-progress" aria-hidden="true"><i /></div>

      {/* Hero */}
      <section className="lp-hero" id="top">
        <Gradient colors={["#5866a8", "#356e78", "#171a2c"]} />
        <div className="lp-hero-inner">
          <div className="lp-hero-copy">
            <p className="lp-eyebrow" data-hero-fade>Headroom · plan the cash before taking the job</p>
            <h1 aria-label="Can a business afford its next big job?">
              <Chars text="Can a business afford its next big job?" attr="data-hero-char" />
            </h1>
            <p className="lp-hero-description" data-hero-fade>A $120,000 job sounds great—until wages and materials are due before the customer pays. Headroom shows the cash shortfall and tests a better payment schedule.</p>
            <div data-hero-fade><Dock /></div>
          </div>
          <HeroRace evidence={evidence} />
        </div>
        <div className="lp-proof" data-hero-fade>
          <dl>
            {proof.map((p) => (
              <div key={p.label}><dt>{p.label}</dt><dd>{p.value}</dd></div>
            ))}
          </dl>
          <p>Results from a recorded Jev test with {evidence.updates} simulated document updates and {evidence.candidate.total} checks; one error remains. The demo recalculates cash live using reviewed sample data.</p>
        </div>
      </section>

      {/* A reversible comparison uses the same cash engine as the workspace. */}
      <section className="lp-feature lp-demo" id="decision">
        <p className="lp-eyebrow">01 · The decision</p>
        <h2 aria-label="See the gap before you sign"><Chars text="See the gap before you sign" /></h2>
        <p className="lp-section-lede">Earning more than a job costs is only half the story. The money has to arrive in time to pay people and bills.</p>
        {cashStory ? <CashStory story={cashStory} /> : <p className="lp-section-note">The comparison needs complete reviewed inputs. Open the workspace to inspect the decision.</p>}
        <a className="lp-workspace-peek" href={DEMO}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing/decision-workspace.png" width={1440} height={1000} loading="lazy" alt="Headroom decision workspace" />
          <span><strong>Follow the $120,000 example</strong><small>See the documents, the cash shortfall, and the proposed fix.</small></span>
          <Icon name="arrow-right" size={20} />
        </a>
      </section>

      <RouteSection />

      <ImprovementLoop evidence={evidence} />

      {/* Feature 2: figures tied to their sources */}
      <section className="lp-feature lp-sources">
        <p className="lp-eyebrow">04 · Trace the evidence</p>
        <h2 aria-label="Every number has a source"><Chars text="Every number has a source" /></h2>
        <div className="lp-sources-row">
          {SOURCES.map((x) => (
            <div key={x.what} className="lp-source">
              <b>{x.value}</b>
              <span>{x.what}</span>
              <i />
              <code>{x.from}</code>
            </div>
          ))}
        </div>
        <p className="lp-section-note">These dates and amounts come from the sample documents. A planned inspection still needs to happen. A bill’s due date still needs to become an actual payment.</p>
        <a className="lp-sources-link" href="/#evidence" data-fade>Inspect the evidence →</a>
      </section>


      {/* Finale */}
      <section className="lp-finale">
        <Gradient colors={["#4f6098", "#a27e60", "#203944"]} wave />
        <div className="lp-finale-inner">
          <h2 aria-label="See what makes the job work"><Chars text="See what makes the job work" /></h2>
          <p>Same job. Same price. A better payment schedule.</p>
          <Dock label="Try the demo" />
        </div>
      </section>

      <footer className="lp-footer">
        <div>
          <h3>Built at LA Hacks 2026</h3>
          <p><a href={SOURCE}>Source on GitHub ↗</a></p>
          <p><a href={DEMO}>Live demo ↗</a></p>
          <p>Built with Intuit data, Jev, Veri, Anthropic, Sentry, and Paper.</p>
        </div>
        <div>
          <h3>What you’re trying</h3>
          <p>The company and bank balance come from Intuit’s synthetic dataset. We added the sample job, bills, and documents. Cash calculations run live; AI results come from recorded experiments. This demo is not connected to a live QuickBooks account and does not move money.</p>
        </div>
      </footer>
    </main>
  );
}
