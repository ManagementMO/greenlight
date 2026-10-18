// "Routing": a small card opens to full screen, then the Ductline job's questions
// arrive one at a time and drop into the lane that can answer them most cheaply.
// Answers come from the same fixture as the Hidden gap; lane costs from bench/results/REPORT.md.

import { createTimeline, type ScrollObserver } from "animejs";
import dynamic from "next/dynamic";
import { JEV, ROUTED } from "./hero-race";

const Gradient = dynamic(() => import("./gradient-background"), { ssr: false });

type Lane = "llm" | "jev" | "code";

const LANES: { id: Lane; name: string; job: string; cost: string }[] = [
  { id: "llm", name: "Language model", job: "Reads the documents", cost: `~${ROUTED.readSecs.toFixed(1)}s · ~$${ROUTED.cost.toFixed(2)} per case` },
  { id: "jev", name: "Jev", job: "Answers yes/no checks", cost: `${JEV.secs.toFixed(2)}s · $${JEV.cost.toFixed(5)} per check` },
  { id: "code", name: "Fixed code", job: "Does the math and dates", cost: "Instant · $0" },
];

// Arrival order interleaves the lanes so the sorting is visible.
const QUESTIONS: { lane: Lane; q: string; a: string }[] = [
  { lane: "llm", q: "What does the contract say about the phase payment?", a: "$30,000 at phase completion" },
  { lane: "jev", q: "Did the inspection pass?", a: "MET" },
  { lane: "code", q: "Lowest cash if the phase payment lands Nov 20?", a: "−$13,000 on Nov 4" },
  { lane: "llm", q: "Which costs belong to this job?", a: "4 supplier and crew payments" },
  { lane: "jev", q: "Has the phase payment reached the bank?", a: "UNKNOWN" },
  { lane: "code", q: "How much more deposit keeps the $10,000 reserve?", a: "$23,000" },
  { lane: "code", q: "Does the contract total stay $120,000?", a: "Yes" },
];

const OPEN = 220; // timeline units spent opening the card
const STEP = 100; // per question

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const inOutQuad = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

// Every card is a pure function of one progress value, so a fast scroll that skips
// frames still lands each card exactly where it belongs (no half-finished tweens).
function renderCards(cards: { el: HTMLElement; answer: HTMLElement; dx: number; dy: number }[], q: number) {
  cards.forEach(({ el, answer, dx, dy }, i) => {
    const t = q - i; // 0..1 is this card's turn
    const move = inOutQuad(clamp((t - 0.45) / 0.45)); // waits in the inbox, then drops
    const rest = 1 - move;
    el.style.opacity = String(clamp(t / 0.2));
    el.style.transform = `translate3d(${dx * rest}px, ${dy * rest}px, 0) scale(${1 + 0.08 * rest})`;
    answer.style.opacity = String(clamp((t - 0.85) / 0.15));
  });
}

// Returns a cleanup for the resize listener; the timeline itself is reverted by the scope.
export function routeTimeline(root: Element, autoplay: ScrollObserver) {
  // Cards in DOM order are lane by lane; sort them back into arrival order.
  const els = [...root.querySelectorAll<HTMLElement>(".lp-route-card")].sort((a, b) => Number(a.style.order) - Number(b.style.order));
  const cards = els.map((el) => ({ el, answer: el.querySelector<HTMLElement>(".lp-route-answer")!, dx: 0, dy: 0 }));
  const state = { q: 0 };

  // Offsets from each card's resting place to the inbox slot, measured untransformed.
  const measure = () => {
    const slot = root.querySelector(".lp-route-slot")!.getBoundingClientRect();
    cards.forEach((c) => {
      const prev = c.el.style.transform;
      c.el.style.transform = "none";
      const r = c.el.getBoundingClientRect();
      c.el.style.transform = prev;
      c.dx = slot.left + slot.width / 2 - (r.left + r.width / 2);
      c.dy = slot.top + slot.height / 2 - (r.top + r.height / 2);
    });
    renderCards(cards, state.q);
  };
  measure();
  window.addEventListener("resize", measure);

  createTimeline({ autoplay, defaults: { ease: "inOutQuad" }, onUpdate: () => renderCards(cards, state.q) })
    .add(".lp-route-caption", { opacity: [1, 0], y: [0, -20], duration: 80 }, 0)
    .add(".lp-route-clip", { clipPath: ["inset(30% 28% round 18px)", "inset(0% 0% round 0px)"], duration: OPEN }, 0)
    .add(".lp-route-ui", { opacity: [0, 1], duration: 80 }, OPEN - 60)
    .add(state, { q: [0, QUESTIONS.length], duration: QUESTIONS.length * STEP, ease: "linear" }, OPEN + 40)
    .add(".lp-route-foot", { opacity: [0, 1], y: [12, 0], duration: 60 }, OPEN + 40 + QUESTIONS.length * STEP);

  return () => window.removeEventListener("resize", measure);
}

export function RouteSection() {
  return (
    <section className="lp-route">
      <div className="lp-sticky">
        <div className="lp-route-clip">
          <Gradient colors={["#5b48c9", "#0b8a63", "#f6c57a"]} />
          <div className="lp-route-shade" />
        </div>
        <p className="lp-route-caption">Where does each question go?</p>

        <div className="lp-route-ui">
          <header>
            <p className="lp-eyebrow">Routing</p>
            <h2>Each question goes to the cheapest thing that can answer it correctly.</h2>
          </header>
          <div className="lp-route-slot" aria-hidden="true">Incoming question</div>
          <div className="lp-route-lanes">
            {LANES.map((lane) => (
              <div key={lane.id} className={`lp-route-lane is-${lane.id}`}>
                <div className="lp-route-lane-head">
                  <b>{lane.name}</b>
                  <span>{lane.job}</span>
                  <em>{lane.cost}</em>
                </div>
                {QUESTIONS.filter((x) => x.lane === lane.id).map((x) => (
                  <div key={x.q} className="lp-route-card" style={{ order: QUESTIONS.indexOf(x) }}>
                    <span>{x.q}</span>
                    <b className="lp-route-answer">{x.a}</b>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <p className="lp-route-foot">The model never does arithmetic. Every dollar figure comes from tested code.</p>
        </div>
      </div>
    </section>
  );
}
