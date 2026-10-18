"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { LandingCashStory } from "@/lib/landing-cash-story";

const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100).replace("-", "−");
const shortMoney = (cents: number) => `${cents < 0 ? "−" : ""}$${Math.abs(cents) / 100_000}k`;
const dateLabel = (date: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
const day = (date: string) => Date.parse(`${date}T12:00:00Z`);

export function CashStory({ story }: { story: LandingCashStory }) {
  const [proposed, setProposed] = useState(false);
  const chart = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const id = useId().replaceAll(":", "");
  useEffect(() => {
    const element = chart.current;
    if (!element) return;
    const resize = () => setWidth(Math.max(240, Math.round(element.clientWidth)));
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const selected = proposed ? story.proposed : story.current;
  const allPoints = [...story.current.points, ...story.proposed.points];
  const minDate = Math.min(...allPoints.map(p => day(p.date)));
  const maxDate = Math.max(...allPoints.map(p => day(p.date)));
  const minCash = Math.floor(Math.min(0, ...allPoints.map(p => p.cashCents)) / 2_500_000) * 2_500_000;
  const maxCash = Math.ceil(Math.max(story.reserveCents, ...allPoints.map(p => p.cashCents)) / 2_500_000) * 2_500_000;
  const height = width < 500 ? 240 : 300;
  const left = width < 500 ? 46 : 56;
  const right = width - 20;
  const bottom = height - 34;
  const x = (date: string) => left + ((day(date) - minDate) / Math.max(maxDate - minDate, 86_400_000)) * (right - left);
  const y = (cents: number) => 24 + ((maxCash - cents) / Math.max(maxCash - minCash, 1)) * (bottom - 24);
  // Preserve every event and its order, including conservative same-day outflows.
  const path = (points: LandingCashStory["current"]["points"]) => points.map((p, i) => `${i ? "H" : "M"} ${x(p.date)}${i ? " V" : ""} ${y(p.cashCents)}`).join(" ");
  const pathBefore = path(story.current.points);
  const pathAfter = path(story.proposed.points);
  const first = selected.points[0];
  const last = selected.points.at(-1)!;
  const minimumX = x(selected.minimumDate);
  const ticks = Array.from({ length: Math.floor(maxCash / 5_000_000) + 1 }, (_, i) => i * 5_000_000);
  const payments = [
    { label: "Deposit", cents: selected.depositCents, start: 0, color: "var(--accent)" },
    { label: "Phase payment", cents: story.phaseCents, start: selected.depositCents, color: "var(--amber)" },
    { label: "Final payment", cents: selected.finalCents, start: selected.depositCents + story.phaseCents, color: "var(--lavender)" },
  ];

  return (
    <div className="lp-cash-story" data-proposed={proposed}>
      <div className="lp-story-toolbar">
        <span>Ductline’s $120k clinic retrofit</span>
        <div className="lp-story-switch" role="group" aria-label="Compare payment terms">
          <button type="button" aria-pressed={!proposed} onClick={() => setProposed(false)}>Current terms</button>
          <button type="button" aria-pressed={proposed} onClick={() => setProposed(true)}>Proposed terms</button>
        </div>
      </div>

      <div className="lp-story-main">
        <div className="lp-story-plot">
          <div className="lp-story-legend"><span><i />{proposed ? "Proposed terms" : "Current terms"}</span><span>Worst declared collection path</span></div>
          <div className="lp-story-chart" ref={chart}>
            <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-title ${id}-desc`}>
              <title id={`${id}-title`}>{proposed ? "Proposed" : "Current"} cash path</title>
              <desc id={`${id}-desc`}>Lowest modeled cash {money(selected.minimumCents)} on {dateLabel(selected.minimumDate)}. Reserve {money(story.reserveCents)}. The chart covers {dateLabel(first.date)} to {dateLabel(last.date)}. {proposed ? "The faint dashed line shows the current terms for comparison." : "Select proposed terms to compare the deposit advance."}</desc>
              <defs>
                <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--story-color)" stopOpacity=".16" />
                  <stop offset="100%" stopColor="var(--story-color)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {ticks.map(tick => <g key={tick} className="lp-story-axis"><line x1={left} x2={right} y1={y(tick)} y2={y(tick)} /><text x={left - 10} y={y(tick) + 4} textAnchor="end">{shortMoney(tick)}</text></g>)}
              <path d={`${pathBefore} L ${right} ${bottom} L ${left} ${bottom} Z`} fill={`url(#${id}-fill)`} className="lp-story-area lp-story-before" />
              <path d={`${pathAfter} L ${right} ${bottom} L ${left} ${bottom} Z`} fill={`url(#${id}-fill)`} className="lp-story-area lp-story-after" />
              <path d={pathBefore} className="lp-story-path lp-story-before" />
              <path d={pathAfter} className="lp-story-path lp-story-after" />
              <line className="lp-story-reserve" x1={left} x2={right} y1={y(story.reserveCents)} y2={y(story.reserveCents)} />
              <text className="lp-story-reserve-label" x={left + 6} y={y(story.reserveCents) - 9}>{shortMoney(story.reserveCents)} reserve</text>
              <line className="lp-story-marker" x1={minimumX} x2={minimumX} y1="24" y2={bottom} />
              <circle className="lp-story-minimum" cx={minimumX} cy="0" style={{ transform: `translateY(${y(selected.minimumCents)}px)` }} r="6" />
              <text className="lp-story-date" x={left} y={height - 8}>{dateLabel(first.date)}</text>
              <text className="lp-story-date" x={minimumX} y={height - 8} textAnchor="middle">{dateLabel(selected.minimumDate)}</text>
              <text className="lp-story-date" x={right} y={height - 8} textAnchor="end">{dateLabel(last.date)}</text>
            </svg>
          </div>
          <p className="lp-story-chart-note">Every step is a dated cash event from the engine. Both plans end at {money(selected.endingCents)}; the timing changes the low point.</p>
        </div>

        <div className="lp-story-readout" aria-live="polite" aria-atomic="true">
          <p className="lp-eyebrow">{proposed ? "02 · Change the timing" : "01 · Find the gap"}</p>
          <strong>{money(selected.minimumCents)}</strong>
          <span>lowest modeled cash · {dateLabel(selected.minimumDate)}</span>
          <p>{proposed ? `Move ${money(story.advanceCents)} from the final payment into the deposit. The reserve survives every declared path.` : "Materials and crew are paid before the late customer payment. A profitable job still runs out of cash."}</p>
          <div className="lp-story-coverage"><b>{selected.passing}/{selected.total}</b><span>declared paths preserve the reserve</span></div>
        </div>
      </div>

      <div className="lp-story-payments">
        <div className="lp-payment-heading"><span>Same {money(story.contractCents)} contract</span><span>{proposed ? `← ${money(story.advanceCents)} brought forward` : "Try proposed terms to see the shift →"}</span></div>
        <div className="lp-payment-bar" aria-hidden="true">
          {payments.map(p => <i key={p.label} style={{ background: p.color, transform: `translateX(${p.start / story.contractCents * 100}%) scaleX(${p.cents / story.contractCents})` }} />)}
        </div>
        <dl className="lp-payment-labels">
          {payments.map(p => <div key={p.label}><dt><i style={{ background: p.color }} />{p.label}</dt><dd>{money(p.cents)}</dd></div>)}
        </dl>
      </div>
      <p className="lp-story-scope">Synthetic demo. Proposed terms require customer agreement and collection on the modeled dates. This is a comparison, not an executed payment change.</p>
    </div>
  );
}
