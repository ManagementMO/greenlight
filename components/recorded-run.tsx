"use client";

// The real recorded pipeline behind the Ductline / C120 sample: the extractor's actual output on the
// contract's phase clause, Jev's actual judgments, and the V5 fine-tuning experiment's final numbers.
// Everything here is read from data/artifacts; nothing is re-run or edited.

import type { DecisionInput, DecisionResult } from "@/lib/domain";
import artifacts from "@/data/artifacts/current.json";
import evidenceRun from "@/data/artifacts/evidence-judgments.json";

const demo = artifacts.extractionDemo;
const final = artifacts.extractionV5Final;
const training = artifacts.training;
const short = (repo: string) => repo.split("/").at(-1)!;
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" }) + " UTC";
const VERDICT: Record<string, string> = { MET: "Met", NOT_MET: "Not met", UNKNOWN: "Unknown", CONFLICTING: "Conflicting" };

export function RecordedRun({ input, result }: { input: DecisionInput; result: DecisionResult }) {
  const contract = input.evidence.find((e) => e.id === demo.sourceId)?.text ?? "";
  const clause = contract.match(/USD 30,000 becomes invoice-eligible[\s\S]*?fourteen calendar days after invoice issuance\./)?.[0] ?? contract;
  const output = JSON.stringify(JSON.parse(demo.rawOutput), null, 2);
  const b = final.base.summary;
  const t = final.tuned.summary;
  const rows = [
    { label: "Exactly right", base: `${b.materialExact} / ${b.count}`, tuned: `${t.materialExact} / ${t.count}`, better: t.materialExact > b.materialExact },
    { label: "Correct payment rules", base: `${b.correctSupportedProposals} / ${b.expectedProposed}`, tuned: `${t.correctSupportedProposals} / ${t.expectedProposed}`, better: t.correctSupportedProposals > b.correctSupportedProposals },
    { label: "Confidently wrong", base: String(b.unsafeProposed), tuned: String(t.unsafeProposed), better: t.unsafeProposed < b.unsafeProposed },
  ];

  return (
    <section className="av-card av-run">
      <div className="av-card-head">
        <p className="av-eyebrow">How this was answered</p>
        <span className="av-run-tag">Recorded run · not live</span>
      </div>

      <ol className="av-steps">
        <li className="is-llm">
          <div className="av-step-head"><b>1 · Extractor reads the contract</b><em>{short(demo.modelRepo)} · V5 prompt · {when(demo.generatedAt)}</em></div>
          <blockquote>{clause}</blockquote>
          <pre>{output}</pre>
          <p className="av-step-note">
            {demo.materialExact ? "✓ Matches the reviewed answer." : "✗ Differs from the reviewed answer."} Both conditions must happen (ALL), and the 14 days count from the invoice being issued, not from the inspection.
            The {demo.selectedByGate === "base" ? "base model was used because the fine-tuned V5 didn't pass its release gate (below)" : "fine-tuned V5 was selected by its release gate"}.
          </p>
        </li>

        <li className="is-jev">
          <div className="av-step-head"><b>2 · Jev checks what has actually happened</b><em>{evidenceRun.model} · {evidenceRun.latencyMs} ms · {when(evidenceRun.generatedAt)}</em></div>
          <ul className="av-checks">
            {demo.judgments.map((j) => (
              <li key={j.predicate}>
                <span className={`av-jv is-${j.verdict.toLowerCase()}`}>{VERDICT[j.verdict]}</span>
                <span>{j.predicate.replace(/^As of [\d-]+, /, "").replace(/;.*|\. .*/, "")}</span>
                <em>{Math.round(j.confidence * 100)}%</em>
              </li>
            ))}
          </ul>
          <p className="av-step-note">So on Oct 6 the $30,000 isn&apos;t in the bank yet. That&apos;s why the answer depends on when it arrives.</p>
        </li>

        <li className="is-code">
          <div className="av-step-head"><b>3 · Fixed code does the math</b><em>$0 · instant</em></div>
          <p className="av-step-note" style={{ marginTop: 0 }}>
            Every dollar and date above: {result.withJob.timeline.filter((p) => p.scope !== "snapshot").length} cash movements,{" "}
            {result.scenarioCount} case{result.scenarioCount === 1 ? "" : "s"} tested. The models never do arithmetic.
          </p>
        </li>
      </ol>

      <div className="av-experiment">
        <p className="av-eyebrow">The fine-tuning experiment</p>
        <p>
          We fine-tuned {training.baseModel.split("/")[1]} on {training.detail.match(/^\d+/)?.[0]} synthetic payment clauses (20 condition patterns and
          12 &ldquo;don&apos;t guess&rdquo; cases like pay-if-paid and business-day deadlines), {training.detail.match(/(\d+) optimizer steps/)?.[1]} steps on Veri
          (job {training.jobId}). Then we scored it on {t.count} held-out clauses it never saw:
        </p>
        <table>
          <thead><tr><th /><th>Base model</th><th>Fine-tuned V5</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}><td>{r.label}</td><td>{r.base}</td><td className={r.better ? "is-better" : ""}>{r.tuned}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="av-step-note">
          V5 more than doubled the exact answers, but it wasn&apos;t promoted: the release gate allows zero confidently wrong payment rules.{" "}
          <a href={`https://huggingface.co/${training.modelRepo}`} target="_blank" rel="noreferrer">Model on Hugging Face ↗</a>
        </p>
      </div>
    </section>
  );
}
