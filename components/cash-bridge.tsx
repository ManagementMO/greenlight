"use client";

import { useId, useState } from "react";

export type CashChartPoint = {
  date: string;
  balanceCents: number;
  label: string;
  id?: string;
};

export type CashChartSeries = {
  id: string;
  label: string;
  points: CashChartPoint[];
};

const money = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);

const shortMoney = (cents: number) => {
  const dollars = cents / 100;
  return Math.abs(dollars) >= 1000
    ? `${dollars < 0 ? "−" : ""}$${Math.abs(dollars) / 1000}k`
    : `${dollars < 0 ? "−" : ""}$${Math.abs(dollars)}`;
};

const shortDate = (date: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date.slice(0, 10)}T12:00:00Z`));

export function CashBridge({
  current,
  baseline,
  comparison,
  scenarios = [],
  reserveCents,
  currency = "USD",
  incomplete = false,
  interactive = true,
}: {
  current: CashChartSeries;
  baseline?: CashChartSeries;
  comparison?: CashChartSeries;
  scenarios?: CashChartSeries[];
  reserveCents: number;
  currency?: string;
  incomplete?: boolean;
  interactive?: boolean;
}) {
  const gradientId = useId().replaceAll(":", "");
  const [activePoint, setActivePoint] = useState<CashChartPoint | null>(null);
  const allSeries = [current, baseline, comparison, ...scenarios].filter(
    (series): series is CashChartSeries => Boolean(series?.points.length),
  );
  const allPoints = allSeries.flatMap((series) => series.points);
  if (!allPoints.length || !current.points.length) {
    return (
      <div className="chart-empty">
        <span className="eyebrow">Cash timeline unavailable</span>
        <p>Complete the dated cash calendar to draw a reliable funding path.</p>
      </div>
    );
  }

  const width = 1000;
  const height = 300;
  const left = 62;
  const right = 26;
  const top = 33;
  const bottom = 39;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const dates = allPoints.map((point) =>
    new Date(`${point.date.slice(0, 10)}T12:00:00Z`).getTime(),
  );
  const minDate = Math.min(...dates);
  const maxDate = Math.max(...dates);
  const balances = allPoints.map((point) => point.balanceCents);
  const rawMin = Math.min(0, reserveCents, ...balances);
  const rawMax = Math.max(reserveCents, ...balances);
  const span = Math.max(rawMax - rawMin, 100_000);
  const magnitude = 10 ** Math.floor(Math.log10(span / 4));
  const rough = span / 4 / magnitude;
  const step =
    (rough <= 1 ? 1 : rough <= 2 ? 2 : rough <= 5 ? 5 : 10) * magnitude;
  const yMin = Math.floor((rawMin - span * 0.09) / step) * step;
  const yMax = Math.ceil((rawMax + span * 0.17) / step) * step;
  const x = (date: string) =>
    left +
    ((new Date(`${date.slice(0, 10)}T12:00:00Z`).getTime() - minDate) /
      Math.max(maxDate - minDate, 86_400_000)) *
      plotWidth;
  const y = (value: number) =>
    top + ((yMax - value) / (yMax - yMin)) * plotHeight;
  const path = (points: CashChartPoint[]) =>
    points
      .map(
        (point, index) =>
          `${index === 0 ? "M" : "H"} ${x(point.date)}${index === 0 ? ` ${y(point.balanceCents)}` : ` V ${y(point.balanceCents)}`}`,
      )
      .join(" ");
  const currentPath = path(current.points);
  const last = current.points[current.points.length - 1];
  const first = current.points[0];
  const fillPath = current.points.length
    ? `${currentPath} L ${x(last.date)} ${height - bottom} L ${x(first.date)} ${height - bottom} Z`
    : "";
  const minimum = current.points.reduce(
    (min, point) => (point.balanceCents < min.balanceCents ? point : min),
    current.points[0],
  );
  const displayPoint = activePoint ?? minimum;
  const ticks = [];
  for (let amount = yMin; amount <= yMax + 1; amount += step)
    ticks.push(amount);
  const dateTicks = Array.from({ length: 5 }, (_, index) => {
    const time = minDate + ((maxDate - minDate) * index) / 4;
    return new Date(time).toISOString().slice(0, 10);
  });
  const reserveY = y(reserveCents);
  const minimumIsBelow = minimum.balanceCents < reserveCents;

  return (
    <div className={`cash-chart ${incomplete ? "is-incomplete" : ""}`}>
      <div className="chart-scroll">
        <svg
          className="cash-chart-svg"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`${current.label}. Lowest modeled cash ${money(minimum.balanceCents)} on ${shortDate(minimum.date)}. Reserve ${money(reserveCents)}. Values in ${currency}.`}
        >
          <defs>
            <linearGradient
              id={`cash-fill-${gradientId}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor="#087F5B" stopOpacity=".1" />
              <stop offset="100%" stopColor="#087F5B" stopOpacity=".005" />
            </linearGradient>
            <clipPath id={`cash-clip-${gradientId}`}>
              <rect x={left} y={top} width={plotWidth} height={plotHeight} />
            </clipPath>
          </defs>
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={left}
                y1={y(tick)}
                x2={width - right}
                y2={y(tick)}
                stroke={tick === 0 ? "#C4D0D5" : "#E8EEF0"}
                strokeWidth={tick === 0 ? 1.25 : 1}
              />
              <text
                x={left - 14}
                y={y(tick) + 4}
                textAnchor="end"
                className="chart-axis"
              >
                {shortMoney(tick)}
              </text>
            </g>
          ))}
          {dateTicks.map((date, index) => (
            <text
              key={`${date}-${index}`}
              x={x(date)}
              y={height - 13}
              textAnchor={
                index === 0 ? "start" : index === 4 ? "end" : "middle"
              }
              className="chart-axis"
            >
              {shortDate(date)}
            </text>
          ))}
          <g clipPath={`url(#cash-clip-${gradientId})`}>
            <path d={fillPath} fill={`url(#cash-fill-${gradientId})`} />
            {scenarios.map((series) => (
              <path
                key={series.id}
                d={path(series.points)}
                fill="none"
                stroke="#92BDAE"
                strokeWidth="1.2"
                strokeOpacity=".35"
              />
            ))}
            {baseline && (
              <path
                d={path(baseline.points)}
                fill="none"
                stroke="#83949D"
                strokeWidth="1.5"
                strokeDasharray="5 5"
              />
            )}
            <line
              x1={left}
              y1={reserveY}
              x2={width - right}
              y2={reserveY}
              stroke="#B76E1D"
              strokeWidth="1.2"
              strokeDasharray="3 5"
            />
            <path
              d={currentPath}
              fill="none"
              stroke="#087F5B"
              strokeWidth="2.8"
              strokeLinejoin="round"
            />
            {comparison && (
              <path
                d={path(comparison.points)}
                fill="none"
                stroke="#266E8A"
                strokeWidth="2.3"
                strokeDasharray="5 3"
                strokeLinejoin="round"
              />
            )}
          </g>
          <rect
            x={left + 8}
            y={reserveY - 19}
            width="144"
            height="17"
            rx="3"
            fill="#FFFFFF"
            fillOpacity=".93"
          />
          <text x={left + 14} y={reserveY - 7} className="chart-reserve-label">
            {money(reserveCents)} reserve
          </text>
          <line
            x1={x(displayPoint.date)}
            x2={x(displayPoint.date)}
            y1={top}
            y2={height - bottom}
            stroke="#9CAFBA"
            strokeWidth="1"
            strokeDasharray="3 4"
            opacity=".7"
          />
          <circle
            cx={x(displayPoint.date)}
            cy={y(displayPoint.balanceCents)}
            r="7"
            fill="white"
            stroke={
              displayPoint.balanceCents < reserveCents ? "#BC4A45" : "#087F5B"
            }
            strokeWidth="2.5"
          />
          {current.points.map((point, index) => (
            <circle
              key={`${point.id ?? point.date}-${index}`}
              cx={x(point.date)}
              cy={y(point.balanceCents)}
              r="10"
              fill="transparent"
              tabIndex={interactive ? 0 : -1}
              role="button"
              aria-disabled={!interactive}
              style={{ pointerEvents: interactive ? "auto" : "none" }}
              aria-label={`${shortDate(point.date)}, ${point.label}, cash ${money(point.balanceCents)}`}
              onMouseEnter={() => setActivePoint(point)}
              onMouseLeave={() => setActivePoint(null)}
              onFocus={() => setActivePoint(point)}
              onBlur={() => setActivePoint(null)}
              onClick={() => setActivePoint(point)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setActivePoint(point);
                }
              }}
              className="chart-point-target"
            />
          ))}
        </svg>
      </div>
      <span className="chart-swipe-hint" aria-hidden="true">
        Swipe to explore the full timeline →
      </span>
      <div className="chart-readout" aria-live="polite">
        <span
          className={`chart-readout-dot ${displayPoint.balanceCents < reserveCents ? "is-negative" : ""}`}
        />
        <strong className="mono">{shortDate(displayPoint.date)}</strong>
        <span className="chart-readout-event">{displayPoint.label}</span>
        <strong
          className={`mono ${displayPoint.balanceCents < reserveCents ? "negative-text" : ""}`}
        >
          {money(displayPoint.balanceCents)}
        </strong>
        {!activePoint && (
          <span className="chart-readout-caption">
            {minimumIsBelow
              ? "Lowest point · below reserve"
              : "Lowest point · reserve protected"}
          </span>
        )}
      </div>
    </div>
  );
}
