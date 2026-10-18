import type { PublicV5Evaluation } from "@/lib/public-extraction-evaluation";
import { Icon } from "./icons";

export function ExtractionV5ComparisonPanel({ value }: { value: PublicV5Evaluation }) {
  const final = value.purpose === "final-evaluation";
  const rows = [
    { label: "Payment rules match the expected answer", values: [value.base, value.tuned].map(({summary: s}) => `${s.materialExact} / ${s.count}`) },
    { label: "Responses passing automatic checks", values: [value.base, value.tuned].map(({summary: s}) => `${s.valid} / ${s.count}`) },
    { label: "Correct proposals for supported clauses", values: [value.base, value.tuned].map(({summary: s}) => `${s.correctSupportedProposals} / ${s.expectedProposed}`) },
    { label: "Wrong proposals that passed automatic checks", lowerIsBetter: true, values: [value.base, value.tuned].map(({summary: s}) => String(s.unsafeProposed)) },
    ...(["AMBIGUOUS", "UNSUPPORTED"] as const).map((status) => ({
      label: status === "AMBIGUOUS" ? "Unclear clauses correctly flagged" : "Unsupported clauses correctly flagged",
      values: [value.base, value.tuned].map(({summary: s}) => `${s.byExpectedStatus[status].statusCorrect} / ${s.byExpectedStatus[status].count}`),
    })),
  ];
  const verdict = !final ? "Development test only" :
    value.comparison.promoted ? "Release checks passed" : "V5 not approved for automatic use";
  const artifactFile = final ? "extraction-v5-evaluation.json" : "extraction-v5-development.json";
  return (
    <section className="extraction-comparison" aria-label={`V5 ${final ? "final" : "development"} extraction comparison`}>
      <div className="section-heading">
        <div>
          <span className="eyebrow">V5 contract reader · recorded test on sample clauses</span>
          <h2>{final ? "Final test on unseen examples" : "Earlier development test"}</h2>
        </div>
        <span className={`state-badge state-${final ? value.comparison.promoted ? "promoted" : "blocked" : "pending"}`}>
          {verdict}
        </span>
      </div>
      <p className="comparison-intro">
        {value.caseCount} fixed examples. {final
          ? "Both models answer the same clauses. We check amounts, conditions, recipients, and when the payment countdown starts. The pass criteria were set in advance."
          : "These examples helped us choose what to change. Only the separate final test measures performance on unseen examples."}
      </p>
      {final && value.comparison.qualityImprovementMeasured && !value.comparison.promoted && (
        <p className="comparison-intro">
          The trained model got more answers right, but it still failed the preset
          quality checks. It was not approved for automatic use.
        </p>
      )}
      <div className="comparison-table-scroll">
        <table className="comparison-table">
          <thead><tr><th>What we measured</th><th>Before training</th><th>After training (V5)</th></tr></thead>
          <tbody>{rows.map((row) => (
            <tr key={row.label}>
              <td>{row.label}{"lowerIsBetter" in row && row.lowerIsBetter && <small>lower is better</small>}</td>
              {row.values.map((result, index) => <td className="mono" key={index}>{result}</td>)}
            </tr>
          ))}</tbody>
        </table>
      </div>
      <details className="comparison-provenance">
        <summary>Test rules, model versions & original results <Icon name="chevron-down" size={13} /></summary>
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
        <span>These results are from a recorded test. The public demo calculates cash from reviewed inputs; every AI-proposed contract rule still needs a person to check it.</span>
      </div>
    </section>
  );
}
