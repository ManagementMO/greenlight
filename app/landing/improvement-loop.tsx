"use client";

// Published workflow results, distinct from the extractor's failed promotion gate.

import { useEffect, useRef } from "react";
import { createScope, createTimeline, onScroll, stagger } from "animejs";
import type { LandingEvidence } from "@/lib/landing-evidence";

export function ImprovementLoop({ evidence }: { evidence: LandingEvidence }) {
  const root = useRef<HTMLElement>(null);
  const rows = [
    { key: "checks", label: "AI requests", before: evidence.baseline.requests, after: evidence.candidate.requests, fmt: (v: number) => String(Math.round(v)) },
    { key: "tokens", label: "Text sent to AI (tokens)", before: evidence.baseline.inputTokens, after: evidence.candidate.inputTokens, fmt: (v: number) => Math.round(v).toLocaleString('en-US') },
    { key: "right", label: "Correct checks", before: evidence.baseline.correct, after: evidence.candidate.correct, fmt: (v: number) => `${Math.round(v)} / ${evidence.candidate.total}` },
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
        <h2>New document. Fewer repeated checks.</h2>
        <p>
          When a new insurance email arrives, the inspection report hasn’t changed.
          Headroom can recheck the email and reuse the inspection result. Our
          meta-harness is an AI improvement loop that tests better ways to group
          these checks and reuse answers.
        </p>
        <ol className="lp-learning-flow" aria-label="The workflow improvement process">
          <li><i>1</i><b>Suggest</b><span>Change which checks run</span></li>
          <li><i>2</i><b>Test</b><span>Use the same examples</span></li>
          <li><i>3</i><b>Compare</b><span>Check answers and effort</span></li>
          <li><i>4</i><b>Keep</b><span>Only if the tests pass</span></li>
        </ol>
        <p className="lp-gate-verdict" data-passed={evidence.workflowPromoted}><i />{evidence.workflowPromoted ? "This workflow passed the quality checks set before the test." : "This workflow still needs review before use."}</p>
        <div className="lp-tuning-result">
          <h3>A separate improvement: teach the reader.</h3>
          <p>Fine-tuning means training Qwen on examples of contract clauses and their correct payment rules. On {evidence.v5.count} unseen synthetic examples, results with every key payment field correct rose from <strong>{evidence.v5.baseExact} to {evidence.v5.tunedExact}</strong>.</p>
          <p>But {evidence.v5.incorrectProposals} wrong proposals still passed the automatic checks. <b>{evidence.v5.promoted ? 'It passed the published release test.' : 'It wasn’t approved for automatic use.'}</b> The demo uses inputs reviewed by a person.</p>
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
        <p className="lp-save-note">Recorded Jev test: {evidence.updates} simulated updates, {evidence.candidate.total} checks. One conflicting-document case was still misread. These are request and token savings on this test, not measured dollar or speed savings. <a href="/#lab">Inspect the experiment →</a></p>
      </div>
    </section>
  );
}
