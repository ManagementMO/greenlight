"use client";

import { useEffect, useRef } from "react";
import { createTimeline, type Timeline } from "animejs";
import type { LandingEvidence } from "@/lib/landing-evidence";

// Animation progress represents request counts, not measured execution time.
const requests = (v: number) => `${Math.round(v)} calls`;
const tokens = (v: number) => Math.round(v).toLocaleString('en-US');

export function HeroRace({ evidence }: { evidence: LandingEvidence }) {
  const root = useRef<HTMLDivElement>(null);
  const tl = useRef<Timeline | null>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const { baseline, candidate } = evidence;
    const q = <T extends HTMLElement>(s: string) => el.querySelector<T>(s)!;
    const state = { a: 0, b: 0 };
    const render = () => {
      q(".is-direct .lp-race-fill").style.transform = `scaleX(${state.a})`;
      q(".is-direct .lp-race-time").textContent = requests(state.a * baseline.requests);
      q(".is-direct .lp-race-cost").textContent = `${tokens(state.a * baseline.inputTokens)} tokens`;
      const lane = candidate.requests / baseline.requests;
      q(".is-routed .lp-race-read").style.transform = `scaleX(${state.b * lane})`;
      q(".is-routed .lp-race-time").textContent = requests(state.b * candidate.requests);
      q(".is-routed .lp-race-cost").textContent = `${tokens(state.b * candidate.inputTokens)} tokens`;
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      Object.assign(state, { a: 1, b: 1 });
      render();
      el.querySelectorAll<HTMLElement>(".lp-race-result").forEach((r) => (r.style.opacity = "1"));
      return;
    }

    const directMs = 1250;
    const routedMs = directMs * candidate.requests / baseline.requests;
    // Results start hidden; each lane's result is its only tween (two tweens on one element clash).
    el.querySelectorAll<HTMLElement>(".lp-race-result").forEach((r) => (r.style.opacity = "0"));
    render();
    tl.current = createTimeline({ autoplay: false, onUpdate: render })
      .add(state, { b: [0, 1], duration: routedMs, ease: "outCubic" }, 0)
      .add(state, { a: [0, 1], duration: directMs, ease: "outCubic" }, 0)
      .add(q(".is-routed .lp-race-result"), { opacity: [0, 1], y: [5, 0], duration: 220, ease: "outCubic" }, routedMs)
      .add(q(".is-direct .lp-race-result"), { opacity: [0, 1], y: [5, 0], duration: 220, ease: "outCubic" }, directMs);
    // Begin with the hero reveal; the full illustrated replay settles in 1.77s.
    const start = window.setTimeout(() => tl.current?.play(), 300);
    return () => { window.clearTimeout(start); tl.current?.revert(); };
  }, [evidence]);

  return (
    <div className="lp-race" ref={root} data-hero-fade>
      <div className="lp-race-head">
        <span>Less repeated AI work · recorded test</span>
        <button type="button" onClick={() => tl.current?.restart()}>Replay</button>
      </div>

      <div className="lp-race-lane is-direct">
        <div className="lp-race-top"><b>Before: recheck each update</b><span className="lp-race-time">{requests(evidence.baseline.requests)}</span><span className="lp-race-cost">{tokens(evidence.baseline.inputTokens)} tokens</span></div>
        <div className="lp-race-track" aria-hidden="true"><i className="lp-race-fill" /></div>
        <div className="lp-race-result">Correct checks <b>{evidence.baseline.correct}/{evidence.baseline.total}</b></div>
      </div>

      <div className="lp-race-lane is-routed">
        <div className="lp-race-top"><b>After: reuse unchanged answers</b><span className="lp-race-time">{requests(evidence.candidate.requests)}</span><span className="lp-race-cost">{tokens(evidence.candidate.inputTokens)} tokens</span></div>
        <div className="lp-race-track" aria-hidden="true">
          <i className="lp-race-read" style={{ transform: `scaleX(${evidence.candidate.requests / evidence.baseline.requests})` }} />
        </div>
        <div className="lp-race-result">Correct checks <b>{evidence.candidate.correct}/{evidence.candidate.total}</b></div>
      </div>
      <p className="lp-race-note">Jev checks facts in documents. Tokens measure text sent to it. Bar length shows request count, not speed. <a href="/#lab">See the test →</a></p>
    </div>
  );
}
