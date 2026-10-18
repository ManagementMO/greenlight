"use client";

// Published workflow results, distinct from the extractor's failed promotion gate.

import { useEffect, useRef } from "react";
import { createScope, createTimeline, onScroll, stagger } from "animejs";
import type { LandingEvidence } from "@/lib/landing-evidence";

export function ImprovementLoop({ evidence }: { evidence: LandingEvidence }) {
  const root = useRef<HTMLElement>(null);
  const rows = [
    { key: "checks", label: "Provider requests", before: evidence.baseline.requests, after: evidence.candidate.requests, fmt: (v: number) => String(Math.round(v)) },
    { key: "tokens", label: "Input tokens", before: evidence.baseline.inputTokens, after: evidence.candidate.inputTokens, fmt: (v: number) => Math.round(v).toLocaleString('en-US') },
    { key: "right", label: "Correct judgments", before: evidence.baseline.correct, after: evidence.candidate.correct, fmt: (v: number) => `${Math.round(v)} / ${evidence.candidate.total}` },
  ];
  const dots = Array.from({ length: evidence.baseline.requests }, (_, i) => i >= evidence.candidate.requests);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const state = Object.fromEntries(rows.map((r) => [r.key, r.before])) as Record<string, number>;
    const paint = () =>
      rows.forEach((r) => {
        el.querySelector<HTMLElement>(`[data-row="${r.key}"]`)!.textContent = r.fmt(state[r.key]);
      });

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      rows.forEach((r) => (state[r.key] = r.after));
      paint();
      el.querySelectorAll<HTMLElement>(".lp-save-dot.is-cut").forEach((d) => d.classList.add("is-gone"));
      return;
    }

    const scope = createScope({ root: el }).add(() => {
      createTimeline({ autoplay: onScroll({ target: el, enter: "bottom-=180 top" }), onUpdate: paint })
        .add(".lp-save-dot.is-cut", { opacity: [1, 0.12], scale: [1, 0.55], duration: 700, delay: stagger(45), ease: "outExpo" }, 200)
        .add(state, { ...Object.fromEntries(rows.map((r) => [r.key, r.after])), duration: 1400, ease: "outExpo" }, 500)
        .add(".lp-save-after", { color: ["#ffffff", "#32d17b"], duration: 600 }, 900);
    });
    return () => scope.revert();
  }, []);

  return (
    <section className="lp-save" ref={root}>
      <div className="lp-save-copy">
        <p className="lp-eyebrow">Measured workflow improvement</p>
        <h2>Same measured quality. Fewer AI calls.</h2>
        <p>
          Headroom&apos;s MetaHarness tests evidence scoping, batching, and dependency-aware caching against
          fixed quality gates. This recorded candidate used fewer calls while preserving measured correctness,
          decisive coverage, and zero false MET judgments on this workload.
        </p>
      </div>

      <div className="lp-save-card">
        <div className="lp-save-dots" aria-hidden="true">
          {dots.map((cut, i) => <span key={i} className={`lp-save-dot${cut ? " is-cut" : ""}`} />)}
        </div>
        <table>
          <thead>
            <tr><th scope="col"><span className="sr-only">Measure</span></th><th scope="col">Before</th><th scope="col">After</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <th scope="row">{r.label}</th>
                <td>{r.fmt(r.before)}</td>
                <td className="lp-save-after" data-row={r.key}>{r.fmt(r.after)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="lp-save-note">Recorded test: {evidence.updates} synthetic evidence updates, {evidence.candidate.total} judgments. One conflicting-evidence error remains. This is one workload, not a general production benchmark. <a href="/#lab">Inspect the experiment →</a></p>
        <p className="lp-save-note">Separate V5 extractor: {evidence.v5.baseExact}/{evidence.v5.count} → {evidence.v5.tunedExact}/{evidence.v5.count} material-exact outputs. {evidence.v5.incorrectProposals} incorrect validated proposals remain; {evidence.v5.promoted ? 'promoted under the published gate' : 'not promoted'}. The cash demo uses reviewed inputs.</p>
      </div>
    </section>
  );
}
