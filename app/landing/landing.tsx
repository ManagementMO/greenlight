"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";
import { animate, createScope, onScroll, stagger } from "animejs";
import { Icon } from "@/components/icons";
import { HeroRace } from "./hero-race";
import type { LandingEvidence } from "@/lib/landing-evidence";
import { RouteSection, routeTimeline } from "./route-section";
import { ImprovementLoop } from "./improvement-loop";

const Gradient = dynamic(() => import("./gradient-background"), { ssr: false });

const DEMO = "/";
const SOURCE = "https://github.com/ManagementMO/headroom";

// Actual source IDs in the reviewed demo fixture; future plans stay labeled as plans.
const SOURCES = [
  { value: "$30,000", what: "phase payment", from: "C-120:s8 · contract" },
  { value: "Oct 20", what: "inspection expected", from: "inspection-plan" },
  { value: "$18,000", what: "planned business payroll", from: "forward-calendar" },
  { value: "Nov 3", what: "due if issued Oct 20", from: "C-120:s8 · 14 days" },
];

// Feature 1: pins on the product screenshot, as % of the 1440×1000 image.
const PINS = [
  { x: 18.6, y: 49.8, label: "Lowest cash, to the day", flip: true },
  { x: 51.9, y: 72.3, label: "Where the reserve breaks" },
  { x: 88.6, y: 61.2, label: "A proposed payment change" },
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

function Dock({ label = "Open live demo" }: { label?: string }) {
  return (
    <div className="lp-dock">
      <a href={DEMO} aria-label="Decision workspace"><Icon name="timeline" size={18} /></a>
      <a href="/#evidence" aria-label="Evidence"><Icon name="evidence" size={18} /></a>
      <a href="/#lab" aria-label="Improvement lab"><Icon name="flask" size={18} /></a>
      <a className="lp-dock-cta" href={DEMO}>{label} <Icon name="arrow-right" size={16} /></a>
    </div>
  );
}

export default function Landing({ evidence }: { evidence: LandingEvidence }) {
  const root = useRef<HTMLElement>(null);
  const reduced = useRef(false);
  const proof = [
    { value: `${Math.round((1 - evidence.candidate.requests / evidence.baseline.requests) * 100)}% fewer calls`, label: "recorded evidence workflow" },
    { value: `${Math.round((1 - evidence.candidate.inputTokens / evidence.baseline.inputTokens) * 100)}% fewer tokens`, label: "input tokens on the same workload" },
    { value: `${evidence.candidate.correct}/${evidence.candidate.total} correct`, label: "unchanged measured correctness" },
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

      // Feature 1: the screenshot settles into place, then the pins drop in one by one.
      const frame = el.querySelector(".lp-demo-frame")!;
      animate(frame, {
        scale: [0.96, 1],
        y: [24, 0],
        opacity: [0, 1],
        duration: 650,
        ease: "outCubic",
        autoplay: onScroll({ target: frame, enter: "bottom-=80 top" }),
      });
      animate(".lp-pin", {
        opacity: [0, 1],
        y: [-12, 0],
        duration: 700,
        delay: stagger(260),
        ease: "outBack",
        autoplay: onScroll({ target: frame, enter: "bottom-=320 top" }),
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
            <p className="lp-eyebrow" data-hero-fade>Headroom · cash decisions for small businesses</p>
            <h1 aria-label="Stop paying an AI to do arithmetic.">
              <Chars text="Stop paying an AI to do arithmetic." attr="data-hero-char" />
            </h1>
            <p className="lp-hero-description" data-hero-fade>Can you take a $120,000 job and still make payroll? Headroom connects your books, commitments, and contract terms to show the cash gap—and a payment change you can review.</p>
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
          <p>Recorded Jev test: {evidence.updates} synthetic updates, {evidence.candidate.total} judgments; one error remains. Demo cash calculations run live on reviewed inputs; model results are recorded.</p>
        </div>
      </section>

      {/* Feature 1: the product, annotated */}
      <section className="lp-feature lp-demo" id="decision">
        <p className="lp-eyebrow">01 · The decision</p>
        <h2 aria-label="See the gap before you sign"><Chars text="See the gap before you sign" /></h2>
        <p className="lp-section-lede">A profitable job can still leave payroll unfunded. Test the timing before you commit.</p>
        <dl className="lp-decision-summary">
          <div><dt>Current terms</dt><dd>−$13,000<span>lowest modeled cash</span></dd></div>
          <div><dt>Move to the deposit</dt><dd>+$23,000<span>from the final payment</span></dd></div>
          <div><dt>Proposed terms</dt><dd>$10,000<span>lowest modeled cash</span></dd></div>
        </dl>
        <div className="lp-demo-frame">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing/decision-workspace.png" width={1440} height={1000} loading="lazy" alt="Headroom decision workspace: lowest modeled cash −$13,000 on Nov 4 and a proposed $65,000 deposit" />
          {PINS.map((p) => (
            <div key={p.label} className={`lp-pin${p.flip ? " is-flip" : ""}`} style={{ left: `${p.x}%`, top: `${p.y}%` }}>
              <i /><span>{p.label}</span>
            </div>
          ))}
        </div>
        <p className="lp-section-note">Same $120,000 contract. The proposal requires customer agreement and the modeled collection dates. Explore the actual workspace below.</p>
        <div className="lp-btns" data-fade>
          <a className="lp-btn lp-btn-solid" href={DEMO}>Open live demo →</a>
          <a className="lp-btn lp-btn-light" href="#how-it-works">How it works ↓</a>
        </div>
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
        <p className="lp-section-note">These are disclosed demo plans. An expected inspection is not a passed inspection; an invoice due date is not money in the bank.</p>
        <a className="lp-sources-link" href="/#evidence" data-fade>Inspect the evidence →</a>
      </section>


      {/* Finale */}
      <section className="lp-finale">
        <Gradient colors={["#4f6098", "#a27e60", "#203944"]} wave />
        <div className="lp-finale-inner">
          <h2 aria-label="Take the next job"><Chars text="Take the next job" /></h2>
          <p>Keep room for payday.</p>
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
          <p>Intuit’s synthetic books plus disclosed demo jobs, commitments, and documents. Cash calculations run live; model results are recorded. No live QuickBooks connection, automatic payments, or agreements.</p>
        </div>
      </footer>
    </main>
  );
}
