import type { CSSProperties } from "react";

type IconName =
  | "arrow-right"
  | "arrow-up-right"
  | "check"
  | "chevron-down"
  | "close"
  | "document"
  | "evidence"
  | "flask"
  | "help"
  | "link"
  | "play"
  | "refresh"
  | "shield"
  | "spark"
  | "timeline"
  | "warning";

const paths: Record<IconName, React.ReactNode> = {
  "arrow-right": (
    <>
      <path d="M4 12h15m-6-6 6 6-6 6" />
    </>
  ),
  "arrow-up-right": (
    <>
      <path d="M6 18 18 6M6 6h12v12" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  "chevron-down": <path d="m6 9 6 6 6-6" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  document: (
    <>
      <path d="M13 3H5v18h14V9l-6-6Z" />
      <path d="M13 3v6h6M8 13h8M8 17h6" />
    </>
  ),
  evidence: (
    <>
      <path d="M6 3h12v18H6zM9 7h6M9 11h6M9 15h2" />
      <path d="m14 16 2 2 4-4" />
    </>
  ),
  flask: (
    <>
      <path d="M9 3h6M10 3v7L5 19a1.4 1.4 0 0 0 1.2 2h11.6a1.4 1.4 0 0 0 1.2-2l-5-9V3M8 15h8" />
      <path d="M10 18h.01" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4M12 17h.01" />
    </>
  ),
  link: (
    <>
      <path d="m10 13 4-4M8 15l-1 1a3.5 3.5 0 0 1-5-5l4-4a3.5 3.5 0 0 1 5 0M13 9l1-1a3.5 3.5 0 0 1 5 5l-4 4a3.5 3.5 0 0 1-5 0" />
    </>
  ),
  play: <path d="m8 5 11 7-11 7V5Z" />,
  refresh: (
    <>
      <path d="M20 7v5h-5M4 17v-5h5" />
      <path d="M6.5 6.5A7.8 7.8 0 0 1 20 12M4 12a7.8 7.8 0 0 0 13.5 5.5" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  spark: (
    <>
      <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" />
    </>
  ),
  timeline: (
    <>
      <path d="M4 4v16h16M7 15l4-6 4 4 5-7" />
      <circle cx="11" cy="9" r="1" />
      <circle cx="15" cy="13" r="1" />
    </>
  ),
  warning: (
    <>
      <path d="m12 3 10 18H2L12 3Z" />
      <path d="M12 9v5M12 17h.01" />
    </>
  ),
};

export function Icon({
  name,
  size = 18,
  className,
  style,
}: {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={style}
    >
      {paths[name]}
    </svg>
  );
}

export function HeadroomMark({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
    >
      <rect width="40" height="40" rx="12" fill="currentColor" />
      <path d="M10 9h7v10c2-2 4-3 7-3h2c4 0 6 3 6 7v8h-7V21h-4v5h-4v5h-7V9Z" fill="white" />
    </svg>
  );
}
