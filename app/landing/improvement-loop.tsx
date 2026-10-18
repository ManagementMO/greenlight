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
    const palette = getComputedStyle(el);
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
        .add(".lp-save-after", { color: [palette.getPropertyValue("--fg").trim(), palette.getPropertyValue("--accent").trim()], duration: 300 }, 900);
    });
    return () => scope.revert();
  }, []);

  return (
    <section className="lp-save" ref={root} id="results">
      <div className="lp-save-copy">
        <p className="lp-eyebrow">03 · Learn, test, improve</p>
        <h2>Improve the workflow. Prove the difference.</h2>
        <p>
          The MetaHarness improves how evidence is checked: read only what changed,
          batch related questions, and reuse unaffected answers.
        </p>
        <ol className="lp-learning-flow" aria-label="The workflow improvement process">
          <li><i>1</i><b>Propose</b><span>A bounded change</span></li>
          <li><i>2</i><b>Replay</b><span>The same cases</span></li>
          <li><i>3</i><b>Evaluate</b><span>Fixed quality gates</span></li>
          <li><i>4</i><b>Keep</b><span>Only if it passes</span></li>
        </ol>
        <p className="lp-gate-verdict" data-passed={evidence.workflowPromoted}><i />{evidence.workflowPromoted ? "This workflow passed its fixed gate." : "This workflow remains held for review."}</p>
        <div className="lp-tuning-result">
          <h3>Fine-tuning the contract reader.</h3>
          <p>We trained a model to turn clauses into payment terms: <strong>{evidence.v5.baseExact}/{evidence.v5.count} → {evidence.v5.tunedExact}/{evidence.v5.count}</strong> outputs with every material field correct on a separate synthetic test.</p>
          <p>V5 still made {evidence.v5.incorrectProposals} incorrect validated proposals: <b>{evidence.v5.promoted ? 'promoted under the published gate' : 'not promoted'}</b>. The demo keeps reviewed inputs.</p>
          <a href="https://github.com/ManagementMO/headroom/blob/main/docs/extractor-v5-results.md">Read the fine-tuning results ↗</a>
        </div>
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
        <p className="lp-save-note">Recorded Jev test: {evidence.updates} synthetic updates, {evidence.candidate.total} judgments. No false “met” judgments; one conflicting-evidence error remains. Results apply to this workload. <a href="/#lab">Inspect the experiment →</a></p>
      </div>
    </section>
  );
}
