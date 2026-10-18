"use client";

import { useId } from "react";
import { demoMoney } from "@/lib/demo-journey";
import type { LandingCashStory } from "@/lib/landing-cash-story";

export function JourneyChart({
  story,
  proposed = false,
}: {
  story: LandingCashStory;
  proposed?: boolean;
}) {
  const id = useId();
  const active = proposed ? story.proposed : story.current;
  const width = 780,
    height = 220,
    left = 62,
    right = 30,
    top = 25,
    bottom = 32;
  const values = [...story.current.points, ...story.proposed.points].map(
    (point) => point.cashCents,
  );
  const low = Math.min(0, ...values) - 1_000_000;
  const high = Math.max(...values) + 1_400_000;
  const x = (index: number, count: number) =>
    left + (index / Math.max(1, count - 1)) * (width - left - right);
  const y = (value: number) =>
    top + ((high - value) / (high - low)) * (height - top - bottom);
  const path = (points: typeof active.points) =>
    points
      .map(
        (point, i) =>
          `${i === 0 ? "M" : "H"}${x(i, points.length).toFixed(2)}${i === 0 ? "," : "V"}${y(point.cashCents).toFixed(2)}`,
      )
      .join(" ");
  const d = path(active.points);
  const minimumIndex = active.points.findIndex(
    (point) => point.cashCents === active.minimumCents,
  );
  const minimum = active.points[minimumIndex];
  const dates = new Set([
    0,
    Math.floor(active.points.length / 2),
    minimumIndex,
    active.points.length - 1,
  ]);
  const dateLabel = (date: string) =>
    new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${date}T12:00:00Z`));
  return (
    <div className={`j-chart ${proposed ? "is-proposed" : ""}`}>
      <div className="j-chart-top">
        <span>
          <i />
          {proposed ? "Proposed terms" : "Current terms"} · if payment is late
        </span>
        <span>Available cash</span>
      </div>
      <div className="j-chart-plot" tabIndex={0} role="region" aria-label="Cash chart; scroll horizontally on small screens">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby={`${id}-title ${id}-desc`}
      >
        <title id={`${id}-title`}>
          {proposed ? "Proposed" : "Current"} cash timeline
        </title>
        <desc id={`${id}-desc`}>
          Lowest cash in this forecast: {demoMoney(active.minimumCents)} on{" "}
          {active.minimumDate}. Target cash buffer:{" "}
          {demoMoney(story.reserveCents)}. Ordered events preserve same-day cash
          movements. {active.passing} of {active.total} tested cases
          keep the cash buffer.
        </desc>
        <defs>
          <linearGradient id={`${id}-fill`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity=".16" />
            <stop offset="100%" stopColor="currentColor" stopOpacity=".01" />
          </linearGradient>
        </defs>
        {[0, 5_000_000, 10_000_000].map((value) => (
          <g key={value}>
            <line
              className="j-gridline"
              x1={left}
              x2={width - right}
              y1={y(value)}
              y2={y(value)}
            />
            <text
              className="j-axis"
              x={left - 12}
              y={y(value) + 4}
              textAnchor="end"
            >
              {demoMoney(value, true)}
            </text>
          </g>
        ))}
        <rect
          x={left}
          y={y(story.reserveCents)}
          width={width - left - right}
          height={height - bottom - y(story.reserveCents)}
          className="j-reserve-zone"
        />
        <line
          x1={left}
          x2={width - right}
          y1={y(story.reserveCents)}
          y2={y(story.reserveCents)}
          className="j-reserve-line"
        />
        <text
          x={left + 9}
          y={y(story.reserveCents) - 9}
          className="j-reserve-label"
        >
          {demoMoney(story.reserveCents, true)} cash buffer
        </text>
        {proposed && (
          <path d={path(story.current.points)} className="j-previous-path" />
        )}
        <path
          d={`${d} V${height - bottom} H${left} Z`}
          fill={`url(#${id}-fill)`}
        />
        <path
          key={String(proposed)}
          d={d}
          className="j-cash-path"
          pathLength="1"
        />
        <circle
          cx={x(minimumIndex, active.points.length)}
          cy={y(minimum.cashCents)}
          r="9"
          className="j-min-halo"
        />
        <circle
          cx={x(minimumIndex, active.points.length)}
          cy={y(minimum.cashCents)}
          r="4.5"
          fill="currentColor"
          stroke="#191b25"
          strokeWidth="2"
        />
        {active.points.map(
          (point, i) =>
            dates.has(i) && (
              <text
                key={point.eventId}
                x={x(i, active.points.length)}
                y={height - 13}
                textAnchor={
                  i === 0
                    ? "start"
                    : i === active.points.length - 1
                      ? "end"
                      : "middle"
                }
                className="j-axis"
              >
                {dateLabel(point.date)}
              </text>
            ),
        )}
      </svg>
      </div>
      <span className="j-chart-scroll-hint">Scroll sideways for the full timeline →</span>
      <div className="j-chart-bottom">
        <span>Each step is a payment or bill, in date order</span>
        <strong>
          {demoMoney(active.minimumCents)} <span>lowest cash</span>
        </strong>
      </div>
    </div>
  );
}
