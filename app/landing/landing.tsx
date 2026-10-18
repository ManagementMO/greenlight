"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";
import { animate, createScope, onScroll, scrambleText, stagger } from "animejs";
import { Icon } from "@/components/icons";
import { DIRECT, HeroRace, ROUTED } from "./hero-race";
import { RouteSection, routeTimeline } from "./route-section";
import { ImprovementLoop } from "./improvement-loop";

const Gradient = dynamic(() => import("./gradient-background"), { ssr: false });

const DEMO = "https://greenlight-two-psi.vercel.app";
const SOURCE = "https://github.com/ManagementMO/greenlight";

// Hero proof row, derived from the same benchmark numbers as the race.
// The race already shows exact-figure accuracy, so it is not repeated here.
const PROOF = [
  { value: `${(DIRECT.secs / ROUTED.secs).toFixed(1)}× faster`, label: "per decision" },
  { value: `${Math.round((1 - ROUTED.cost / DIRECT.cost) * 100)}% cheaper`, label: "model cost per decision" },
  { value: "215× cheaper", label: "a Jev yes/no check vs one Claude call" },
];

// Feature 2: each figure the engine uses, and the line it was read from.
const SOURCES = [
  { value: "$30,000", what: "phase payment", from: "contract.pdf · §4.2" },
  { value: "Oct 20", what: "inspection date", from: "email · Oct 3" },
  { value: "$18,400", what: "payroll run", from: "ledger.csv · row 88" },
  { value: "Nov 20", what: "invoice due", from: "invoice.pdf · net 30" },
];

// Feature 1: pins on the product screenshot, as % of the 1440×1000 image.
const PINS = [
  { x: 18.6, y: 49.8, label: "Lowest cash, to the day", flip: true },
  { x: 51.9, y: 72.3, label: "Where the reserve breaks" },
  { x: 88.6, y: 61.2, label: "The smallest fix that works" },
];



function Chars({ text, attr = "data-char" }: { text: string; attr?: string }) {
  return (
    <>
      {text.split(" ").map((word, w) => (
        <span key={w} className="lp-word">
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
      <a href={DEMO} aria-label="Evidence"><Icon name="evidence" size={18} /></a>
      <a href={DEMO} aria-label="Improvement lab"><Icon name="flask" size={18} /></a>
      <a className="lp-dock-cta" href={DEMO}>{label} <Icon name="arrow-right" size={16} /></a>
    </div>
  );
}

export default function Landing() {
  const root = useRef<HTMLElement>(null);
  const reduced = useRef(false);

  // Page-wide motion. Scroll-synced animations render their first frame on creation.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.classList.add("lp-ready");
    if (reduced.current) return;

    let stopRoute = () => {};
    const scope = createScope({ root: el }).add(() => {
      const sync = (target: Element, enter = "top top", leave = "bottom bottom") =>
        onScroll({ target, enter, leave, sync: 0.2 });

      // Progress pill.
      animate(".lp-progress i", { scaleX: [0.08, 1], ease: "linear", autoplay: onScroll({ target: el, enter: "top top", leave: "bottom bottom", sync: true }) });

      // Hero: copy and dock rise in after the title.
      animate("[data-hero-fade]", { opacity: [0, 1], y: [24, 0], duration: 1000, delay: stagger(120, { start: 900 }), ease: "outExpo" });

      // Feature headlines: letters fill in as you scroll.
      el.querySelectorAll<HTMLElement>(".lp-feature").forEach((row) => {
        animate(row.querySelectorAll("[data-char]"), {
          opacity: [0.12, 1],
          filter: ["blur(6px)", "blur(0px)"],
          delay: stagger(12),
          ease: "linear",
          autoplay: onScroll({ target: row, enter: "bottom top", leave: "center center", sync: 0.3 }),
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
        scale: [0.86, 1],
        y: [80, 0],
        opacity: [0.3, 1],
        ease: "outQuad",
        autoplay: onScroll({ target: frame, enter: "bottom top", leave: "center center", sync: 0.3 }),
      });
      animate(".lp-pin", {
        opacity: [0, 1],
        y: [-12, 0],
        duration: 700,
        delay: stagger(260),
        ease: "outBack",
        autoplay: onScroll({ target: frame, enter: "bottom-=320 top" }),
      });

      // Feature 2: each figure drops a line to its source, which decodes.
      const row = el.querySelector(".lp-sources-row")!;
      const sourceIn = () => onScroll({ target: row, enter: "bottom-=120 top" });
      animate(".lp-source b", { opacity: [0, 1], y: [24, 0], duration: 800, delay: stagger(160), ease: "outExpo", autoplay: sourceIn() });
      animate(".lp-source span", { opacity: [0, 0.7], duration: 600, delay: stagger(160, { start: 200 }), autoplay: sourceIn() });
      animate(".lp-source i", { scaleY: [0, 1], duration: 500, delay: stagger(160, { start: 350 }), ease: "outQuad", autoplay: sourceIn() });
      animate(".lp-source code", {
        innerHTML: scrambleText({ chars: "0123456789§ABCDEFX#" }),
        opacity: [0, 1],
        duration: 900,
        delay: stagger(160, { start: 650 }),
        autoplay: sourceIn(),
      });

      // Routing: the card opens, then questions drop into the LLM, Jev or code lane.
      const route = el.querySelector(".lp-route")!;
      stopRoute = routeTimeline(route, sync(route));

      // Finale.
      animate(".lp-finale [data-char]", {
        opacity: [0, 1],
        y: ["0.6em", "0em"],
        rotateX: [-80, 0],
        delay: stagger(40),
        duration: 900,
        ease: "outExpo",
        autoplay: onScroll({ target: ".lp-finale", enter: "bottom-=200 top" }),
      });
    });

    return () => { scope.revert(); stopRoute(); };
  }, []);

  // Hero title: letters flip in in 3D from a blur.
  useEffect(() => {
    const chars = root.current?.querySelectorAll("[data-hero-char]");
    if (!chars?.length || reduced.current) return;
    const a = animate(chars, {
      opacity: [0, 1],
      rotateY: [-95, 0],
      rotateX: [40, 0],
      z: [-200, 0],
      filter: ["blur(14px)", "blur(0px)"],
      letterSpacing: ["0.3em", "0em"],
      duration: 1400,
      delay: stagger(45),
      ease: "outExpo",
    });
    return () => { a.revert(); };
  }, []);

  return (
    <main className="lp" ref={root}>
      <div className="lp-topnav"><a href="#top">Greenlight</a></div>
      <div className="lp-progress" aria-hidden="true"><i /></div>

      {/* Hero */}
      <section className="lp-hero" id="top">
        <Gradient colors={["#0b8a63", "#5b48c9", "#101412"]} />
        <div className="lp-hero-inner">
          <div className="lp-hero-copy">
            <h1 aria-label="Stop paying an AI to do arithmetic.">
              <Chars text="Stop paying an AI to do arithmetic." attr="data-hero-char" />
            </h1>
          </div>
          <HeroRace />
        </div>
        <div className="lp-proof" data-hero-fade>
          <dl>
            {PROOF.map((p) => (
              <div key={p.label}><dt>{p.label}</dt><dd>{p.value}</dd></div>
            ))}
          </dl>
          <p>90 constructed cases, independent oracle. Jev answers narrow yes/no checks only.</p>
        </div>
      </section>

      {/* Card opens to full screen */}
      <RouteSection />

      {/* Feature 1: the product, annotated */}
      <section className="lp-feature lp-demo">
        <h2><Chars text="See the gap before you sign" /></h2>
        <div className="lp-demo-frame">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing/decision-workspace.png" alt="Greenlight decision workspace: lowest cash −$13,000 on Nov 4, and a proposed $65,000 deposit" />
          {PINS.map((p) => (
            <div key={p.label} className={`lp-pin${p.flip ? " is-flip" : ""}`} style={{ left: `${p.x}%`, top: `${p.y}%` }}>
              <i /><span>{p.label}</span>
            </div>
          ))}
        </div>
        <div className="lp-btns" data-fade>
          <a className="lp-btn lp-btn-solid" href={DEMO}>Open live demo →</a>
          <a className="lp-btn lp-btn-light" href={SOURCE}>Source</a>
        </div>
      </section>

      <ImprovementLoop />

      {/* Feature 2: figures tied to their sources */}
      <section className="lp-feature lp-sources">
        <h2><Chars text="Every number has a source" /></h2>
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
        <a className="lp-sources-link" href={DEMO} data-fade>Inspect the evidence →</a>
      </section>


      {/* Finale */}
      <section className="lp-finale">
        <Gradient colors={["#0b8a63", "#f6c57a", "#b9a7ff"]} wave />
        <div className="lp-finale-inner">
          <h2 aria-label="Take the job"><Chars text="Take the job" /></h2>
          <Dock label="Try the demo" />
        </div>
      </section>

      <footer className="lp-footer">
        <div>
          <h3>Built at LA Hacks 2026</h3>
          <p><a href={SOURCE}>Source on GitHub ↗</a></p>
          <p><a href={DEMO}>Live demo ↗</a></p>
        </div>
        <div>
          <h3>Read this first</h3>
          <p>Demonstration scenarios use synthetic data. Greenlight does not send messages, execute agreements, or move funds.</p>
        </div>
      </footer>
    </main>
  );
}
