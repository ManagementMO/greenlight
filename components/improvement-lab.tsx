"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "./icons";

type ArtifactOrigin = "live" | "recorded" | "deterministic";
type ProviderArtifact = {
  provider: string;
  status: "verified" | "pending" | "failed";
  origin: ArtifactOrigin;
  checkedAt?: string;
  model?: string;
  latencyMs?: number;
  detail?: string;
};
type EvaluationArtifact = {
  id: string;
  name: string;
  model?: string;
  origin: ArtifactOrigin;
  sampleCount?: number;
  metrics?: Record<string, number>;
  detail?: string;
};
type ExperimentArtifact = {
  id: string;
  name: string;
  status: "promoted" | "rejected" | "pending";
  baseline?: unknown;
  candidate?: unknown;
  metrics?: Record<string, number>;
  detail?: string;
};
type ReplayResult = {
  id: string;
  origin: "recorded";
  replayedAt: string;
  baseline: Record<string, number>;
  candidate: Record<string, number>;
  evaluator: { sampleCount?: number; [key: string]: unknown };
  gate: { promoted: boolean; reasons: string[] };
  detail: string;
};
type TrainingArtifact = {
  status: "not_started" | "running" | "completed" | "failed" | "blocked";
  baseModel?: string;
  modelRepo?: string;
  modelRevision?: string;
  jobId?: string;
  stages?: { name: string; status: string; detail?: string }[];
  detail?: string;
};
type Artifacts = {
  schemaVersion: number;
  generatedAt?: string;
  providers: ProviderArtifact[];
  training: TrainingArtifact;
  evaluations: EvaluationArtifact[];
  experiments: ExperimentArtifact[];
  budget?: { capUsd: number; spentUsd: number; reservedUsd: number };
  observability?: {
    issueUrl: string;
    traceUrl: string;
    firstPartyFrame: string;
    verifiedAt: string;
    environment: string;
  };
  provenance?: unknown[];
};

function humanize(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function metric(value: number, label: string) {
  if (!Number.isFinite(value)) return "Unavailable";
  if (/accuracy|coverage|rate$/i.test(label) && value >= 0 && value <= 1)
    return new Intl.NumberFormat("en-US", {
      style: "percent",
      maximumFractionDigits: 1,
    }).format(value);
  if (/usd|cost|spend/i.test(label))
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 4,
    }).format(value);
  if (/latency.*ms|milliseconds|ms$/i.test(label))
    return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value)} ms`;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(
    value,
  );
}

function time(value?: string) {
  if (!value || Number.isNaN(Date.parse(value))) return "Time not recorded";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function Origin({ value }: { value: ArtifactOrigin }) {
  return (
    <span className={`origin origin-${value}`}>
      <span />
      {value === "live"
        ? "Live provider check"
        : value === "recorded"
          ? "Recorded provider run"
          : "Deterministic run"}
    </span>
  );
}

export function ImprovementLab() {
  const [data, setData] = useState<Artifacts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replaying, setReplaying] = useState(false);
  const [replay, setReplay] = useState<ReplayResult | null>(null);
  const [replayError, setReplayError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/artifacts", { cache: "no-store" });
      if (!response.ok)
        throw new Error(`Artifact service returned ${response.status}.`);
      const value = await response.json();
      if (
        value.schemaVersion !== 1 ||
        !Array.isArray(value.providers) ||
        !Array.isArray(value.evaluations) ||
        !Array.isArray(value.experiments) ||
        !value.training
      )
        throw new Error(
          "The saved run file does not match the supported artifact format.",
        );
      setData(value);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The run artifacts could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function replayExperiment() {
    setReplaying(true);
    setReplayError(null);
    try {
      const response = await fetch("/api/experiments/replay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok)
        throw new Error(`Experiment replay returned ${response.status}.`);
      const result = await response.json();
      if (
        result.origin !== "recorded" ||
        typeof result.gate?.promoted !== "boolean" ||
        !Array.isArray(result.gate.reasons)
      )
        throw new Error(
          "The replay did not return a valid release-gate result.",
        );
      setReplay(result);
    } catch (cause) {
      setReplayError(
        cause instanceof Error
          ? cause.message
          : "Experiment replay could not be completed.",
      );
    } finally {
      setReplaying(false);
    }
  }

  return (
    <section className="lab-view" aria-label="Improvement lab">
      <div className="view-title-row">
        <div>
          <span className="eyebrow">The work behind the decision</span>
          <h1>Better with evidence.</h1>
          <p className="view-intro">
            A measured loop for teaching the repeatable work—and keeping the
            hard decisions accountable.
          </p>
        </div>
        <button
          type="button"
          className="button button-secondary button-small"
          onClick={() => void load()}
          disabled={loading}
        >
          <Icon name="refresh" size={15} className={loading ? "spin" : ""} />
          {loading ? "Loading runs" : "Refresh runs"}
        </button>
      </div>
      <div className="lab-principle">
        <Icon name="shield" size={20} />
        <p>
          <strong>The cash engine stays fixed.</strong> The harness can improve
          extraction, context, and evidence questions. Every candidate must pass
          the same independent checks.
        </p>
        <span className="mono">EVALUATE → REVIEW → RELEASE</span>
      </div>
      {error && (
        <div className="inline-error" role="alert">
          <Icon name="warning" />
          <div>
            <strong>Run artifacts could not be loaded</strong>
            <p>
              {error} The decision workspace still works. Refresh to try again.
            </p>
          </div>
        </div>
      )}
      {loading && !data && (
        <div className="lab-loading" aria-busy="true">
          <div className="skeleton skeleton-line" />
          <div className="skeleton skeleton-block" />
          <div className="skeleton skeleton-line" />
          <span>Loading saved runs and model evidence…</span>
        </div>
      )}
      {data && (
        <>
          <div className="lab-overview">
            <div className="lab-overview-primary">
              <span className="eyebrow">Specialization pipeline</span>
              <div className="learning-flow">
                <div>
                  <span className="flow-symbol">
                    <Icon name="document" size={20} />
                  </span>
                  <strong>Reviewed examples</strong>
                  <p>Source-grounded terms and adjudicated corrections.</p>
                </div>
                <span className="flow-connector">→</span>
                <div>
                  <span className="flow-symbol">
                    <Icon name="spark" size={20} />
                  </span>
                  <strong>Fine-tuned extractor</strong>
                  <p>Veri training, merged weights, versioned model export.</p>
                </div>
                <span className="flow-connector">→</span>
                <div>
                  <span className="flow-symbol">
                    <Icon name="shield" size={20} />
                  </span>
                  <strong>Jev + fixed code</strong>
                  <p>Atomic evidence judgments and exact cash calculations.</p>
                </div>
              </div>
            </div>
            <div className="budget-summary">
              <span className="eyebrow">Project spending</span>
              {data.budget ? (
                <>
                  <div className="budget-amount mono">
                    ${data.budget.spentUsd.toFixed(2)}
                    <span> / ${data.budget.capUsd.toFixed(2)}</span>
                  </div>
                  <div className="budget-track">
                    <span
                      style={{
                        width: `${Math.min(100, data.budget.capUsd > 0 ? (data.budget.spentUsd / data.budget.capUsd) * 100 : 0)}%`,
                      }}
                    />
                  </div>
                  <p>
                    <span className="mono">
                      ${data.budget.reservedUsd.toFixed(2)}
                    </span>{" "}
                    reserved for in-flight work
                  </p>
                </>
              ) : (
                <p>Budget ledger unavailable in this artifact.</p>
              )}
              <span className="tiny-label">
                Public decisions use no paid model calls.
              </span>
            </div>
          </div>
          <div className="lab-columns">
            <section className="lab-section">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">01 · Artifact identity</span>
                  <h2>Training & serving</h2>
                </div>
                <span className={`state-badge state-${data.training.status}`}>
                  {humanize(data.training.status)}
                </span>
              </div>
              {data.training.detail && (
                <p className="section-description">{data.training.detail}</p>
              )}
              {data.training.baseModel && (
                <div className="identity-row">
                  <span>Base model</span>
                  <code>{data.training.baseModel}</code>
                </div>
              )}
              {data.training.modelRepo && (
                <div className="identity-row">
                  <span>Model repository</span>
                  <a
                    href={`https://huggingface.co/${data.training.modelRepo}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {data.training.modelRepo}
                    <Icon name="arrow-up-right" size={13} />
                  </a>
                </div>
              )}
              {data.training.modelRevision && (
                <div className="identity-row">
                  <span>Observed repository revision</span>
                  <code>{data.training.modelRevision}</code>
                </div>
              )}
              {data.training.jobId && (
                <div className="identity-row">
                  <span>Training job</span>
                  <code>{data.training.jobId}</code>
                </div>
              )}
              {data.training.stages?.length ? (
                <ol className="training-stages">
                  {data.training.stages.map((stage, index) => (
                    <li key={`${stage.name}-${index}`}>
                      <span
                        className={`stage-dot ${/complete|verified|passed|success/i.test(stage.status) ? "stage-done" : /fail|block/i.test(stage.status) ? "stage-failed" : ""}`}
                      >
                        {/complete|verified|passed|success/i.test(
                          stage.status,
                        ) ? (
                          <Icon name="check" size={12} />
                        ) : (
                          <span />
                        )}
                      </span>
                      <div>
                        <strong>{stage.name}</strong>
                        <p>{stage.detail ?? humanize(stage.status)}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="empty-run">
                  <Icon name="flask" size={24} />
                  <strong>No training stages recorded yet</strong>
                  <p>
                    Training completion, merged export, and serving inference
                    are separate verification steps. Their results appear here
                    as they are recorded.
                  </p>
                </div>
              )}
            </section>
            <section className="lab-section">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">02 · Actual connections</span>
                  <h2>Provider runs</h2>
                </div>
                <span className="count-label mono">
                  {data.providers.length} records
                </span>
              </div>
              {data.providers.length ? (
                <div className="provider-runs">
                  {data.providers.map((provider, index) => (
                    <div
                      className="provider-run"
                      key={`${provider.provider}-${index}`}
                    >
                      <div className="provider-run-head">
                        <strong>{provider.provider}</strong>
                        <span
                          className={`state-badge state-${provider.status}`}
                        >
                          {humanize(provider.status)}
                        </span>
                      </div>
                      <Origin value={provider.origin} />
                      {provider.model && (
                        <code className="provider-model">{provider.model}</code>
                      )}
                      {provider.detail && <p>{provider.detail}</p>}
                      <div className="provider-run-meta">
                        <span>{time(provider.checkedAt)}</span>
                        {typeof provider.latencyMs === "number" && (
                          <span className="mono">
                            {metric(provider.latencyMs, "latencyMs")}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-run">
                  <Icon name="link" size={24} />
                  <strong>No provider runs recorded yet</strong>
                  <p>
                    Saved provider responses and their origin will appear here.
                    Credential configuration alone is not an inference result.
                  </p>
                </div>
              )}
            </section>
          </div>
          {data.observability && (
            <section
              className="observability-proof"
              aria-label="Sentry operational proof"
            >
              <span className="observability-symbol">
                <Icon name="timeline" size={22} />
              </span>
              <div className="observability-content">
                <span className="eyebrow">
                  Sentry · recorded operational evidence
                </span>
                <h2>From an issue to its cause.</h2>
                <p>
                  A captured application defect, its first-party stack frame,
                  and the trace with related logs.
                </p>
                <div className="observability-frame">
                  <code>{data.observability.firstPartyFrame}</code>
                  <span>
                    {data.observability.environment} · verified{" "}
                    {time(data.observability.verifiedAt)}
                  </span>
                </div>
                <div className="observability-links">
                  <a
                    href={data.observability.issueUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Inspect captured defect{" "}
                    <Icon name="arrow-up-right" size={13} />
                  </a>
                  <a
                    href={data.observability.traceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Trace & related log <Icon name="arrow-up-right" size={13} />
                  </a>
                </div>
              </div>
            </section>
          )}
          <section className="lab-section lab-wide-section">
            <div className="section-heading">
              <div>
                <span className="eyebrow">03 · Same facts, same evaluator</span>
                <h2>Evaluation results</h2>
              </div>
              <span className="count-label mono">
                {data.evaluations.length} runs
              </span>
            </div>
            {data.evaluations.length ? (
              <div className="evaluation-list">
                {data.evaluations.map((run) => (
                  <article className="evaluation-run" key={run.id}>
                    <div className="evaluation-run-title">
                      <div>
                        <h3>{run.name}</h3>
                        {run.model && <code>{run.model}</code>}
                      </div>
                      <Origin value={run.origin} />
                    </div>
                    <div className="evaluation-metrics">
                      {typeof run.sampleCount === "number" && (
                        <div>
                          <span>Samples</span>
                          <strong className="mono">{run.sampleCount}</strong>
                        </div>
                      )}
                      {Object.entries(run.metrics ?? {}).map(
                        ([label, value]) => (
                          <div key={label}>
                            <span>{humanize(label)}</span>
                            <strong className="mono">
                              {metric(value, label)}
                            </strong>
                          </div>
                        ),
                      )}
                    </div>
                    {run.detail && <p>{run.detail}</p>}
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-run empty-run-horizontal">
                <Icon name="timeline" size={27} />
                <div>
                  <strong>Measured results belong here.</strong>
                  <p>
                    No evaluation run is published yet. Accuracy, speed, and
                    cost improvements will only be shown after a recorded
                    comparison.
                  </p>
                </div>
              </div>
            )}
          </section>
          <section className="lab-section lab-wide-section">
            <div className="section-heading">
              <div>
                <span className="eyebrow">04 · The MetaHarness loop</span>
                <h2>Candidate experiments</h2>
              </div>
              <button
                type="button"
                className="button button-secondary button-small"
                onClick={() => void replayExperiment()}
                disabled={replaying || !data.experiments.length}
              >
                <Icon
                  name={replaying ? "refresh" : "play"}
                  size={14}
                  className={replaying ? "spin" : ""}
                />
                {replaying ? "Replaying saved run" : "Replay experiment"}
              </button>
            </div>
            {data.experiments.length ? (
              data.experiments.map((experiment) => (
                <article className="experiment-row" key={experiment.id}>
                  <span className={`experiment-icon ${experiment.status}`}>
                    <Icon
                      name={
                        experiment.status === "promoted"
                          ? "check"
                          : experiment.status === "rejected"
                            ? "close"
                            : "flask"
                      }
                      size={20}
                    />
                  </span>
                  <div>
                    <h3>{experiment.name}</h3>
                    {experiment.detail && <p>{experiment.detail}</p>}
                    {experiment.metrics && (
                      <div className="experiment-metrics">
                        {Object.entries(experiment.metrics).map(
                          ([key, value]) => (
                            <span key={key}>
                              {humanize(key)}{" "}
                              <strong className="mono">
                                {metric(value, key)}
                              </strong>
                            </span>
                          ),
                        )}
                      </div>
                    )}
                  </div>
                  <span className={`state-badge state-${experiment.status}`}>
                    {humanize(experiment.status)}
                  </span>
                </article>
              ))
            ) : (
              <div className="empty-run empty-run-horizontal">
                <Icon name="flask" size={27} />
                <div>
                  <strong>A candidate earns its release.</strong>
                  <p>
                    No experiment has been recorded. Rejected candidates will
                    stay visible alongside any promoted workflow.
                  </p>
                </div>
              </div>
            )}
            {replayError && (
              <div className="inline-error" role="alert">
                <Icon name="warning" size={18} />
                <div>
                  <strong>Replay unavailable</strong>
                  <p>
                    {replayError} Refresh and try again; the saved experiment
                    remains visible above.
                  </p>
                </div>
              </div>
            )}
            {replay && (
              <div className="replay-result" role="status">
                <div className="replay-result-title">
                  <span
                    className={`state-badge state-${replay.gate.promoted ? "promoted" : "rejected"}`}
                  >
                    {replay.gate.promoted
                      ? "Release gate passed"
                      : "Release gate rejected"}
                  </span>
                  <span className="mono">
                    Replayed {time(replay.replayedAt)}
                  </span>
                </div>
                <h3>
                  {replay.gate.promoted
                    ? "Same evidence. Less repeated work."
                    : "The candidate stays under review."}
                </h3>
                <p>{replay.detail}</p>
                <div className="replay-table-scroll">
                  <table className="replay-table">
                    <thead>
                      <tr>
                        <th>Measured on this workload</th>
                        <th>Baseline</th>
                        <th>Candidate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        "correct",
                        "total",
                        "decisive",
                        "falseSatisfied",
                        "modelCalls",
                        "latencyMs",
                        "costUsd",
                      ]
                        .filter(
                          (key) =>
                            typeof replay.baseline[key] === "number" &&
                            typeof replay.candidate[key] === "number",
                        )
                        .map((key) => (
                          <tr key={key}>
                            <td>{humanize(key)}</td>
                            <td className="mono">
                              {metric(replay.baseline[key], key)}
                            </td>
                            <td className="mono">
                              {metric(replay.candidate[key], key)}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                {replay.gate.reasons.length > 0 && (
                  <ul>
                    {replay.gate.reasons.map((reason, index) => (
                      <li key={index}>{reason}</li>
                    ))}
                  </ul>
                )}
                <span className="replay-boundary">
                  A fixed, synthetic localized-update workload. This rechecks
                  saved genuine provider results; it invokes no new inference or
                  training. No general production speedup is established.
                </span>
              </div>
            )}
          </section>
          <div className="artifact-footer">
            <span className="mono">Artifact schema v{data.schemaVersion}</span>
            <span>Generated {time(data.generatedAt)}</span>
            <span>
              Deterministic decisions remain available independently of provider
              runs.
            </span>
          </div>
        </>
      )}
    </section>
  );
}
