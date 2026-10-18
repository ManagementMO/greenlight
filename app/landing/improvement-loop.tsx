"use client";

// "It found a cheaper way to run itself": one before/after card that plays once on entry.
// A one-time recorded experiment (scripts/harness/experiment.ts), not something live runs do continuously.
// Numbers: the recorded MetaHarness run in README.md ("What the MetaHarness experiment actually measured").

import { useEffect, useRef } from "react";
import { createScope, createTimeline, onScroll, stagger } from "animejs";

const TOTAL = 21;
const ROWS: { key: string; label: string; before: number; after: number; fmt: (v: number) => string }[] = [
  { key: "checks", label: "Jev requests, same questions", before: 18, after: 6, fmt: (v) => String(Math.round(v)) },
  { key: "time", label: "Time to finish", before: 2_771, after: 832, fmt: (v) => `${(v / 1000).toFixed(1)}s` },
  { key: "right", label: "Answers right", before: 20, after: 20, fmt: (v) => `${Math.round(v)} / ${TOTAL}` },
];

// Which dots fade is illustrative; the count (12 of 18 requests dropped) is measured.
const DOTS = Array.from({ length: 18 }, (_, i) => i % 3 !== 0);

export function ImprovementLoop() {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const state = Object.fromEntries(ROWS.map((r) => [r.key, r.before])) as Record<string, number>;
    const paint = () =>
      ROWS.forEach((r) => {
        el.querySelector<HTMLElement>(`[data-row="${r.key}"]`)!.textContent = r.fmt(state[r.key]);
      });

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      ROWS.forEach((r) => (state[r.key] = r.after));
      paint();
      el.querySelectorAll<HTMLElement>(".lp-save-dot.is-cut").forEach((d) => d.classList.add("is-gone"));
      return;
    }

    const scope = createScope({ root: el }).add(() => {
      createTimeline({ autoplay: onScroll({ target: el, enter: "bottom-=180 top" }), onUpdate: paint })
        .add(".lp-save-dot.is-cut", { opacity: [1, 0.12], scale: [1, 0.55], duration: 700, delay: stagger(45), ease: "outExpo" }, 200)
        .add(state, { ...Object.fromEntries(ROWS.map((r) => [r.key, r.after])), duration: 1400, ease: "outExpo" }, 500)
        .add(".lp-save-after", { color: ["#ffffff", "#32d17b"], duration: 600 }, 900);
    });
    return () => scope.revert();
  }, []);

  return (
    <section className="lp-save" ref={root}>
      <div className="lp-save-copy">
        <p className="lp-eyebrow">It found a cheaper way to run itself</p>
        <h2>Same answers. A third of the Jev requests.</h2>
        <p>
          We let the AI redesign how Greenlight runs its Jev checks: only re-check what a new document affects, and
          ask related questions together. A fixed test it couldn&apos;t edit decided whether to switch: no condition
          wrongly marked as met, no drop in accuracy, and fewer requests. It passed.
        </p>
      </div>

      <div className="lp-save-card">
        <div className="lp-save-dots" aria-hidden="true">
          {DOTS.map((cut, i) => <span key={i} className={`lp-save-dot${cut ? " is-cut" : ""}`} />)}
        </div>
        <table>
          <thead>
            <tr><th scope="col"><span className="sr-only">Measure</span></th><th scope="col">Before</th><th scope="col">After</th></tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.key}>
                <th scope="row">{r.label}</th>
                <td>{r.fmt(r.before)}</td>
                <td className="lp-save-after" data-row={r.key}>{r.fmt(r.before)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="lp-save-note">Measured once on 7 sample document updates, 21 questions. Live runs don&apos;t use these settings yet.</p>
      </div>
    </section>
  );
}
