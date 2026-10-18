import type { PublicV5Evaluation } from "@/lib/public-extraction-evaluation";
import { Icon } from "./icons";

export function ExtractionV5ComparisonPanel({ value }: { value: PublicV5Evaluation }) {
  const final = value.purpose === "final-evaluation";
  const rows = [
    { label: "Material fields match", values: [value.base, value.tuned].map(({summary: s}) => `${s.materialExact} / ${s.count}`) },
    { label: "Fully validated outputs", values: [value.base, value.tuned].map(({summary: s}) => `${s.valid} / ${s.count}`) },
    { label: "Correct supported proposals", values: [value.base, value.tuned].map(({summary: s}) => `${s.correctSupportedProposals} / ${s.expectedProposed}`) },
    { label: "Incorrect validated proposals", lowerIsBetter: true, values: [value.base, value.tuned].map(({summary: s}) => String(s.unsafeProposed)) },
    ...(["AMBIGUOUS", "UNSUPPORTED"] as const).map((status) => ({
      label: status === "AMBIGUOUS" ? "Ambiguous cases identified" : "Unsupported cases identified",
      values: [value.base, value.tuned].map(({summary: s}) => `${s.byExpectedStatus[status].statusCorrect} / ${s.byExpectedStatus[status].count}`),
    })),
  ];
  const verdict = !final ? "Development only · no promotion" :
    value.comparison.promoted ? "Final gate passed" : "V5 candidate not promoted";
  const artifactFile = final ? "extraction-v5-evaluation.json" : "extraction-v5-development.json";
  return (
    <section className="extraction-comparison" aria-label={`V5 ${final ? "final" : "development"} extraction comparison`}>
      <div className="section-heading">
        <div>
          <span className="eyebrow">V5 · recorded inference · synthetic clauses</span>
          <h2>{final ? "Final evaluation" : "Development comparison"}</h2>
        </div>
        <span className={`state-badge state-${final ? value.comparison.promoted ? "promoted" : "blocked" : "pending"}`}>
          {verdict}
        </span>
      </div>
      <p className="comparison-intro">
        {value.caseCount} frozen cases. {final
          ? "The final comparison applies the predeclared usefulness and safety gate."
          : "Development results guide candidate selection. They do not establish held-out quality or authorize promotion."}
      </p>
      {final && value.comparison.qualityImprovementMeasured && !value.comparison.promoted && (
        <p className="comparison-intro">
          Improvement over the base was measured, but the candidate did not pass
          the full release gate. Relative improvement alone is not enough for promotion.
        </p>
      )}
      <div className="comparison-table-scroll">
        <table className="comparison-table">
          <thead><tr><th>Measured outcome</th><th>Base model</th><th>V5 tuned candidate</th></tr></thead>
          <tbody>{rows.map((row) => (
            <tr key={row.label}>
              <td>{row.label}{"lowerIsBetter" in row && row.lowerIsBetter && <small>lower is better</small>}</td>
              {row.values.map((result, index) => <td className="mono" key={index}>{result}</td>)}
            </tr>
          ))}</tbody>
        </table>
      </div>
      <details className="comparison-provenance">
        <summary>Verdict & provenance <Icon name="chevron-down" size={13} /></summary>
        <div><span>Recorded verdict</span><code>{value.comparison.status}</code></div>
        {value.comparison.gateVersion && <div><span>Fixed gate version</span><code>{value.comparison.gateVersion}</code></div>}
        <p>{value.comparison.gate ?? value.comparison.detail}</p>
        {value.comparison.methodology && <p>{value.comparison.methodology}</p>}
        <div><span>Evaluation SHA-256</span><code>{value.evaluationSha256}</code></div>
        <div><span>Prompt SHA-256</span><code>{value.promptContractSha256}</code></div>
        {([ ["Base", value.base], ["Tuned", value.tuned] ] as const).map(([label, run]) => (
          <div key={label}>
            <span>{label} artifact · observed repository revision</span>
            <a href={`https://huggingface.co/${run.artifact.repo}/tree/${run.artifact.revision}`} target="_blank" rel="noreferrer">
              {run.artifact.repo}<br /><code>{run.artifact.revision}</code>
            </a>
          </div>
        ))}
        <p>Repository revision is observed identity evidence, not provider attestation of loaded weights.</p>
        <a href={`https://github.com/ManagementMO/headroom/blob/main/data/artifacts/${artifactFile}`} target="_blank" rel="noreferrer">
          Inspect actual predictions and scores <Icon name="arrow-up-right" size={13} />
        </a>
      </details>
      <div className="comparison-boundary">
        <Icon name="shield" size={14} />
        <span>Recorded evaluation, not a live extractor deployment. Public decisions use fixed code and saved evidence. Every proposed term still requires owner review.</span>
      </div>
    </section>
  );
}
