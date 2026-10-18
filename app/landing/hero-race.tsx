"use client";

import { useEffect, useRef } from "react";
import { createTimeline, type Timeline } from "animejs";

// bench/results/REPORT.md, all 90 constructed cases (dev 40 · test 30 · heldout 20).
// Direct = arm A (Claude answers directly). Routed = arm C (Claude extracts, engine decides).
// Jev = the separate per-call measurement; it is not part of arm C's totals.
export const DIRECT = { secs: 12.86, cost: 0.01359, exact: 72 }; // p50 12.86s; 49/68 exact
export const ROUTED = { secs: 5.4, readSecs: 5.35, cost: 0.0105, exact: 97 }; // per-split p50 5.35–5.58s; 66/68 exact
export const JEV = { secs: 0.121, cost: 0.000063 };

const SCALE = 0.3; // animation ms per real ms, so the 12.9s lane plays in under 4s

const secs = (v: number) => `${v.toFixed(1)}s`;
const usd = (v: number) => `$${v.toFixed(4)}`;

export function HeroRace() {
  const root = useRef<HTMLDivElement>(null);
  const tl = useRef<Timeline | null>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const q = <T extends HTMLElement>(s: string) => el.querySelector<T>(s)!;
    const state = { a: 0, b: 0 };
    const render = () => {
      q(".is-direct .lp-race-fill").style.width = `${state.a * 100}%`;
      q(".is-direct .lp-race-time").textContent = secs(state.a * DIRECT.secs);
      q(".is-direct .lp-race-cost").textContent = usd(state.a * DIRECT.cost);
      const lane = (ROUTED.secs / DIRECT.secs) * 100;
      const read = Math.min(state.b, ROUTED.readSecs / ROUTED.secs) / (ROUTED.readSecs / ROUTED.secs);
      q(".is-routed .lp-race-read").style.width = `${read * lane * (ROUTED.readSecs / ROUTED.secs)}%`;
      q(".is-routed .lp-race-engine").classList.toggle("is-on", state.b >= 0.995);
      q(".is-routed .lp-race-time").textContent = secs(state.b * ROUTED.secs);
      q(".is-routed .lp-race-cost").textContent = usd(state.b * ROUTED.cost);
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      Object.assign(state, { a: 1, b: 1 });
      render();
      el.querySelectorAll<HTMLElement>(".lp-race-result").forEach((r) => (r.style.opacity = "1"));
      return;
    }

    const directMs = DIRECT.secs * 1000 * SCALE;
    const routedMs = ROUTED.secs * 1000 * SCALE;
    // Results start hidden; each lane's result is its only tween (two tweens on one element clash).
    el.querySelectorAll<HTMLElement>(".lp-race-result").forEach((r) => (r.style.opacity = "0"));
    render();
    tl.current = createTimeline({ autoplay: false, onUpdate: render })
      .add(state, { b: [0, 1], duration: routedMs, ease: "linear" }, 0)
      .add(state, { a: [0, 1], duration: directMs, ease: "linear" }, 0)
      .add(".is-routed .lp-race-result", { opacity: [0, 1], y: [8, 0], duration: 500, ease: "outExpo" }, routedMs)
      .add(".is-direct .lp-race-result", { opacity: [0, 1], y: [8, 0], duration: 500, ease: "outExpo" }, directMs);
    // Start after the headline has flipped in.
    const start = window.setTimeout(() => tl.current?.play(), 1400);
    return () => { window.clearTimeout(start); tl.current?.revert(); };
  }, []);

  return (
    <div className="lp-race" ref={root} data-hero-fade>
      <div className="lp-race-head">
        <span>Same task · median per decision</span>
        <button type="button" onClick={() => tl.current?.restart()}>Run again</button>
      </div>

      <div className="lp-race-lane is-direct">
        <div className="lp-race-top"><b>One LLM call does everything</b><span className="lp-race-time">0.0s</span><span className="lp-race-cost">$0.0000</span></div>
        <div className="lp-race-track"><i className="lp-race-fill" /></div>
        <div className="lp-race-result">Exact cash figures <b>{DIRECT.exact}%</b></div>
      </div>

      <div className="lp-race-lane is-routed">
        <div className="lp-race-top"><b>Greenlight: the LLM only reads</b><span className="lp-race-time">0.0s</span><span className="lp-race-cost">$0.0000</span></div>
        <div className="lp-race-track">
          <i className="lp-race-read" />
          <i className="lp-race-engine" />
        </div>
        <div className="lp-race-result">Exact cash figures <b>{ROUTED.exact}%</b></div>
      </div>
    </div>
  );
}
