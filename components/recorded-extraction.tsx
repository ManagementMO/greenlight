"use client";

import { useEffect, useState } from "react";
import type { SourceEvidence } from "@/lib/domain";
import { Icon } from "./icons";

type ExtractionDemo = {
  sourceId: string;
  sourceSha256: string;
  modelRepo: string;
  modelRevision: string;
  generatedAt: string;
  origin: "recorded";
  candidate: Record<string, unknown> | null;
  materialExact: boolean;
  detail: string;
  judgments?: { predicate: string; verdict: string; confidence?: number }[];
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

const conditionLabels: Record<string, string> = {
  AGREEMENT_SIGNED: "Agreement signed",
  DELIVERY_CONFIRMED: "Delivery confirmed",
  PHASE_ACCEPTED: "Phase accepted",
  INSPECTION_PASSED: "Inspection passed",
  CERTIFICATE_RECEIVED: "Insurance certificate received",
  INVOICE_ACCEPTED: "Invoice accepted",
};

function TriggerTree({ value, depth = 0 }: { value: unknown; depth?: number }) {
  const node = record(value);
  if (!node || depth > 4)
    return <span className="extraction-unknown">Not represented</span>;
  if (node.op === "ATOM")
    return (
      <span className="predicate-atom">
        <i aria-hidden="true" />
        <span>
          {typeof node.condition === "string"
            ? (conditionLabels[node.condition] ?? node.condition)
            : "Condition not provided"}
          {typeof node.subject === "string" && <code>{node.subject}</code>}
        </span>
      </span>
    );
  if ((node.op === "ALL" || node.op === "ANY") && Array.isArray(node.children))
    return (
      <div className="predicate-tree">
        <span className="predicate-operator">
          {node.op === "ALL"
            ? "ALL conditions required"
            : "ANY condition sufficient"}
        </span>
        <div>
          {node.children.map((child, index) => (
            <TriggerTree key={index} value={child} depth={depth + 1} />
          ))}
        </div>
      </div>
    );
  return (
    <span className="extraction-unknown">
      Unsupported condition shape · inspect the raw output
    </span>
  );
}

function InvoiceClock({ value }: { value: unknown }) {
  const due = record(value);
  if (!due) return <span className="extraction-unknown">Not established</span>;
  if (
    due.kind === "CALENDAR_DAYS_AFTER_INVOICE_ISSUED" &&
    typeof due.days === "number" &&
    typeof due.invoiceSubject === "string"
  )
    return (
      <>
        <strong>{due.days} calendar days after invoice issuance</strong>
        <span className="extraction-clock-subject">
          Invoice subject <code>{due.invoiceSubject}</code>
        </span>
      </>
    );
  if (
    due.kind === "CALENDAR_DAYS_AFTER_TRIGGER" &&
    typeof due.days === "number"
  )
    return (
      <>
        <strong>{due.days} calendar days after trigger completion</strong>
        <span className="extraction-anchor-warning">
          This anchor differs from invoice issuance. Review the source before
          activating the term.
        </span>
      </>
    );
  if (due.kind === "ON_DATE" && typeof due.date === "string")
    return <strong>On {due.date}</strong>;
  return (
    <span className="extraction-unknown">
      Clock anchor requires review · inspect the raw output
    </span>
  );
}

export function RecordedExtraction({ source }: { source: SourceEvidence }) {
  const [demo, setDemo] = useState<ExtractionDemo | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setDemo(null);
    async function load() {
      try {
        const response = await fetch("/api/artifacts", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const data = await response.json();
        const candidate = data.extractionDemo as ExtractionDemo | undefined;
        if (
          !candidate ||
          candidate.origin !== "recorded" ||
          candidate.sourceId !== source.id ||
          typeof candidate.sourceSha256 !== "string"
        )
          return;
        const digest = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(source.text),
        );
        const hash = Array.from(new Uint8Array(digest))
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");
        if (hash !== candidate.sourceSha256.toLowerCase()) return;
        if (!controller.signal.aborted) setDemo(candidate);
      } catch {
        /* An optional recorded model result must never interrupt source review. */
      }
    }
    void load();
    return () => controller.abort();
  }, [source.id, source.text]);

  if (!demo) return null;
  const candidate = record(demo.candidate);
  const generated = Number.isNaN(Date.parse(demo.generatedAt))
    ? demo.generatedAt
    : new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(demo.generatedAt));

  return (
    <section
      className="recorded-extraction"
      aria-label="Recorded specialist extraction"
    >
      <div className="extraction-panel-heading">
        <span className="extraction-symbol">
          <Icon name="spark" size={17} />
        </span>
        <div>
          <span className="eyebrow">Recorded specialist output</span>
          <h3>What the extractor found.</h3>
        </div>
        <span className="state-badge state-blocked">Owner review required</span>
      </div>
      <p className="extraction-panel-detail">{demo.detail}</p>
      {candidate ? (
        <div className="extracted-terms">
          <div className="extracted-term">
            <span>Amount reference</span>
            <code>
              {typeof candidate.amountRef === "string"
                ? candidate.amountRef
                : "Not established"}
            </code>
          </div>
          <div className="extracted-term">
            <span>Invoice eligibility</span>
            <TriggerTree value={candidate.trigger} />
          </div>
          <div className="extracted-term">
            <span>Payment clock</span>
            <div className="extraction-clock">
              <InvoiceClock value={candidate.due} />
            </div>
          </div>
        </div>
      ) : (
        <p className="extraction-unknown">
          This recorded response did not produce a valid term candidate. The
          original source remains available above.
        </p>
      )}
      {demo.judgments?.length ? (
        <div className="recorded-judgments">
          <span className="eyebrow">Recorded predicate judgments</span>
          {demo.judgments.map((judgment, index) => (
            <div key={index}>
              <span>{judgment.predicate}</span>
              <span className="mono">
                {judgment.verdict}
                {typeof judgment.confidence === "number" && (
                  <small>confidence {judgment.confidence.toFixed(3)}</small>
                )}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      <div className="extraction-check">
        <Icon name={demo.materialExact ? "check" : "warning"} size={13} />
        <span>
          {demo.materialExact
            ? "Material fields match the fixed case check."
            : "Material fields did not match the fixed case check."}{" "}
          A passing check still requires owner review.
        </span>
      </div>
      <div className="extraction-boundary">
        <Icon name="shield" size={14} />
        <span>
          These are proposed terms. Invoice eligibility and due dates do not
          establish when cash will reach the bank; collection remains a separate
          forecast.
        </span>
      </div>
      <details className="extraction-raw">
        <summary>
          Inspect model output & identity <Icon name="chevron-down" size={13} />
        </summary>
        <pre>{JSON.stringify(demo.candidate, null, 2)}</pre>
        <div>
          <span>Served model</span>
          <a
            href={`https://huggingface.co/${demo.modelRepo}`}
            target="_blank"
            rel="noreferrer"
          >
            {demo.modelRepo} <Icon name="arrow-up-right" size={12} />
          </a>
        </div>
        <div>
          <span>Pinned revision</span>
          <code>{demo.modelRevision}</code>
        </div>
        <div>
          <span>Source SHA-256</span>
          <code>{demo.sourceSha256}</code>
        </div>
        <div>
          <span>Recorded</span>
          <span>{generated}</span>
        </div>
      </details>
      <span className="extraction-origin">
        <span />
        Recorded inference · no new model call from this page
      </span>
    </section>
  );
}
