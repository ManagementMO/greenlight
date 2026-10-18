import type {
  CashEvent,
  CashPath,
  DecisionInput,
  DecisionReason,
  DecisionResult,
  DecisionStatus,
  EventPatch,
  NextQuestion,
  Proposal,
  ScenarioOutcome,
  UncertaintyOption,
} from "./types";
import { resolvePaymentClock } from "./terms";

export const SCENARIO_LIMIT = 256;
const statusLabels: Record<DecisionStatus, string> = {
  NEEDS_INPUT: "Needs input",
  SHORTFALL: "Cash shortfall",
  CONDITIONAL: "Conditional",
  SUPPORTED_IN_TESTED_SCENARIOS: "Supported in tested scenarios",
};
const isMoney = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const validDate = (value: string | null | undefined): value is string => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
};
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
/** Stable browser-compatible snapshot identity, not a cryptographic signature. */
export function hashDecisionInput(input: DecisionInput): string {
  const body = canonical(input);
  let hash = 2166136261;
  for (let i = 0; i < body.length; i++)
    hash = Math.imul(hash ^ body.charCodeAt(i), 16777619);
  return `snapshot-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
function addReason(
  reasons: DecisionReason[],
  code: string,
  message: string,
  sourceIds: string[] = [],
) {
  if (!reasons.some((r) => r.code === code && r.message === message))
    reasons.push({ code, message, sourceIds });
}
function normalizeEvents(
  input: DecisionInput,
  reasons: DecisionReason[],
): CashEvent[] {
  const byId = new Map<string, CashEvent>();
  for (const event of [...input.commitments, ...input.job.events]) {
    const prior = byId.get(event.id);
    if (prior && canonical(prior) !== canonical(event))
      addReason(
        reasons,
        "CONFLICTING_EVENT",
        `Event ${event.id} was delivered with conflicting content. Supply an explicit correction with a new identity.`,
        event.sourceIds,
      );
    else if (!prior) byId.set(event.id, structuredClone(event));
  }
  const replaced = new Set<string>();
  const corrections = new Map<string, number>();
  for (const event of byId.values())
    if (event.supersedes) {
      corrections.set(
        event.supersedes,
        (corrections.get(event.supersedes) ?? 0) + 1,
      );
      const prior = byId.get(event.supersedes);
      if (
        !prior ||
        prior.id === event.id ||
        prior.scope !== event.scope ||
        byId.get(prior.supersedes ?? "")?.id === event.id
      )
        addReason(
          reasons,
          "INVALID_CORRECTION",
          `Correction ${event.id} does not identify a valid prior event in the same scope.`,
          event.sourceIds,
        );
      else replaced.add(prior.id);
    }
  for (const [identity, count] of corrections)
    if (count > 1)
      addReason(
        reasons,
        "CONFLICTING_CORRECTION",
        `Multiple corrections supersede ${identity}; their precedence must be adjudicated.`,
      );
  for (const event of byId.values()) {
    const chain = new Set<string>();
    let current: CashEvent | undefined = event;
    while (current) {
      if (chain.has(current.id)) {
        addReason(
          reasons,
          "INVALID_CORRECTION",
          `Correction chain through ${event.id} contains a cycle.`,
          event.sourceIds,
        );
        break;
      }
      chain.add(current.id);
      current = current.supersedes ? byId.get(current.supersedes) : undefined;
    }
  }
  return [...byId.values()].filter((event) => !replaced.has(event.id));
}
function inputProblems(
  input: DecisionInput,
  events: CashEvent[],
  reasons: DecisionReason[],
) {
  const sourceIds = new Set(input.evidence.map((e) => e.id));
  const checkSources = (refs: string[], label: string) => {
    if (!refs.length || refs.some((ref) => !sourceIds.has(ref)))
      addReason(
        reasons,
        "MISSING_SOURCE",
        `${label} needs a valid evidence reference.`,
        refs,
      );
  };
  if (
    input.evidence.some(
      (e, i, all) => all.findIndex((v) => v.id === e.id) !== i,
    )
  )
    addReason(
      reasons,
      "CONFLICTING_SOURCE",
      "Evidence identities must be unique.",
    );
  if (
    input.evidence.some(
      (e) => !validDate(e.observedDate) || e.observedDate > input.snapshotDate,
    )
  )
    addReason(
      reasons,
      "FUTURE_EVIDENCE",
      "Source observations after the snapshot cannot be used in an as-of decision.",
    );
  if (
    input.commitments.some((e) => e.scope !== "baseline") ||
    input.job.events.some((e) => e.scope !== "job")
  )
    addReason(
      reasons,
      "INVALID_EVENT_SCOPE",
      "Existing-business commitments and job events must retain their respective scopes.",
    );
  if (!isMoney(input.openingCashCents))
    addReason(
      reasons,
      "UNKNOWN_OPENING_CASH",
      "Confirm available settled cash in integer cents; unknown cash is not zero.",
    );
  if (!isMoney(input.reserveCents))
    addReason(
      reasons,
      "UNKNOWN_RESERVE",
      "Confirm the required cash reserve in integer cents.",
    );
  if (!isMoney(input.job.priceCents))
    addReason(
      reasons,
      "INVALID_PRICE",
      "Contract price must be a nonnegative safe integer number of cents.",
    );
  if (
    ![input.snapshotDate, input.horizonDate, input.calendarCoverageEnd].every(
      validDate,
    ) ||
    input.horizonDate < input.snapshotDate
  )
    addReason(
      reasons,
      "INVALID_HORIZON",
      "The snapshot, horizon and calendar coverage must be valid, ordered ISO dates.",
    );
  if (!input.forwardCalendarConfirmed)
    addReason(
      reasons,
      "UNCONFIRMED_CALENDAR",
      "The existing-business forward calendar still needs confirmation.",
    );
  if (input.calendarCoverageEnd < input.horizonDate)
    addReason(
      reasons,
      "INCOMPLETE_CALENDAR",
      "Existing-business commitments are not covered through the selected horizon.",
    );
  for (const term of input.unresolvedTerms)
    addReason(reasons, "UNSUPPORTED_TERM", term);
  for (const event of events) {
    checkSources(event.sourceIds, event.label);
    if (!isMoney(event.amountCents))
      addReason(
        reasons,
        "UNKNOWN_EVENT_AMOUNT",
        `${event.label} has an unknown or invalid amount.`,
        event.sourceIds,
      );
    if (!validDate(event.date))
      addReason(
        reasons,
        "UNKNOWN_EVENT_DATE",
        `${event.label} has no defensible finite collection/payment date.`,
        event.sourceIds,
      );
    else {
      if (
        event.date > input.horizonDate ||
        event.date > input.calendarCoverageEnd
      )
        addReason(
          reasons,
          "INCOMPLETE_HORIZON",
          `${event.label} falls on ${event.date}, beyond declared horizon/calendar coverage. Its known cash movement is still shown.`,
          event.sourceIds,
        );
      if (event.date < input.snapshotDate && !event.includedInOpeningCash)
        addReason(
          reasons,
          "UNRECONCILED_PAST_EVENT",
          `${event.label} predates the snapshot and needs reconciliation against opening cash.`,
          event.sourceIds,
        );
    }
    if (
      event.includedInOpeningCash &&
      (event.settlement !== "observed" ||
        (event.date && event.date > input.snapshotDate))
    )
      addReason(
        reasons,
        "INVALID_OPENING_LINK",
        `${event.label} cannot already be in opening cash without observed settlement by the snapshot.`,
        event.sourceIds,
      );
    if (
      event.settlement === "observed" &&
      event.date &&
      event.date > input.snapshotDate
    )
      addReason(
        reasons,
        "FUTURE_OBSERVED_SETTLEMENT",
        `${event.label} cannot be observed settled after the decision snapshot.`,
        event.sourceIds,
      );
  }
  const receiptTotal = events
    .filter((e) => e.scope === "job" && e.direction === "inflow")
    .reduce((sum, e) => sum + (isMoney(e.amountCents) ? e.amountCents : 0), 0);
  if (receiptTotal !== input.job.priceCents)
    addReason(
      reasons,
      "REVENUE_MISMATCH",
      "Modeled job receipts must conserve the full contract price.",
    );
  const magnitude = events.reduce(
    (sum, e) => sum + (isMoney(e.amountCents) ? e.amountCents : 0),
    (isMoney(input.openingCashCents) ? input.openingCashCents : 0) +
      (isMoney(input.reserveCents) ? input.reserveCents : 0),
  );
  if (!Number.isSafeInteger(magnitude))
    addReason(
      reasons,
      "ARITHMETIC_OVERFLOW",
      "The aggregate cash bounds exceed exact safe-integer arithmetic.",
    );
  for (const milestone of input.job.milestones) {
    checkSources(milestone.sourceIds, milestone.label);
    const event = events.find((e) => e.id === milestone.eventId);
    if (
      !event ||
      event.direction !== "inflow" ||
      event.scope !== "job" ||
      event.amountCents !== milestone.amountCents
    )
      addReason(
        reasons,
        "INVALID_MILESTONE",
        `${milestone.label} must identify its matching job receipt.`,
        milestone.sourceIds,
      );
    if (["UNKNOWN", "CONFLICTING", "NOT_MET"].includes(milestone.judgment))
      addReason(
        reasons,
        "UNRESOLVED_MILESTONE",
        `${milestone.label}: ${milestone.judgment.toLowerCase().replace("_", " ")} evidence cannot activate this receipt.`,
        milestone.sourceIds,
      );
    if (!validDate(milestone.assumedCollectionDate))
      addReason(
        reasons,
        "UNBOUNDED_COLLECTION",
        `${milestone.label} needs an explicit bounded collection assumption.`,
        milestone.sourceIds,
      );
    if (milestone.dueRule) {
      const eligibilityDate = [
        milestone.conditionDate,
        milestone.invoiceEligibleDate,
      ]
        .filter(validDate)
        .sort()
        .at(-1);
      const clock = resolvePaymentClock(milestone.dueRule, {
        eligibilityDate,
        invoiceIssuedDate: milestone.invoiceIssuedDate,
      });
      if (clock.diagnostics.length || !clock.dueDate)
        addReason(
          reasons,
          "UNRESOLVED_PAYMENT_CLOCK",
          `${milestone.label}: ${clock.diagnostics.map((d) => d.message).join(" ") || "The contractual due clock is unresolved."}`,
          milestone.sourceIds,
        );
      else if (
        milestone.dueDate !== undefined &&
        milestone.dueDate !== clock.dueDate
      )
        addReason(
          reasons,
          "STALE_DUE_DATE",
          `${milestone.label} has stored due date ${milestone.dueDate}, but its reviewed clock resolves to ${clock.dueDate}. Review the date without substituting it for bank collection.`,
          milestone.sourceIds,
        );
    }
  }
  const seen = new Set<string>();
  for (const u of input.uncertainties) {
    if (
      seen.has(u.id) ||
      !u.options.length ||
      new Set(u.options.map((o) => o.id)).size !== u.options.length
    )
      addReason(
        reasons,
        "INVALID_UNCERTAINTY",
        `Uncertainty ${u.id} has duplicate identities or no options.`,
        u.sourceIds,
      );
    seen.add(u.id);
    checkSources(u.sourceIds, u.question);
    for (const option of u.options) {
      for (const p of option.patches)
        if (!events.some((e) => e.id === p.eventId))
          addReason(
            reasons,
            "INVALID_PATCH",
            `Uncertainty ${u.id} references missing event ${p.eventId}.`,
            u.sourceIds,
          );
      for (const [id, answer] of Object.entries(option.requires ?? {}))
        if (
          !input.uncertainties
            .find((other) => other.id === id)
            ?.options.some((o) => o.id === answer)
        )
          addReason(
            reasons,
            "INVALID_DEPENDENCY",
            `Uncertainty ${u.id} has an invalid dependency.`,
            u.sourceIds,
          );
    }
  }
  for (const [id, answer] of Object.entries(input.answers ?? {}))
    if (
      !input.uncertainties
        .find((u) => u.id === id)
        ?.options.some((o) => o.id === answer)
    )
      addReason(
        reasons,
        "INVALID_ANSWER",
        `Answer ${id}:${answer} is not part of the supported scenario family.`,
      );
}
interface JointCase {
  answers: Record<string, string>;
  labels: string[];
  options: UncertaintyOption[];
}
function enumerateCases(input: DecisionInput) {
  const results: JointCase[] = [];
  let visits = 0;
  let truncated = false;
  const visit = (
    index: number,
    answers: Record<string, string>,
    labels: string[],
    options: UncertaintyOption[],
  ) => {
    if (results.length > SCENARIO_LIMIT || ++visits > 100_000) {
      truncated = true;
      return;
    }
    if (index === input.uncertainties.length) {
      if (
        options.every((option) =>
          Object.entries(option.requires ?? {}).every(
            ([id, answer]) => answers[id] === answer,
          ),
        )
      )
        results.push({ answers, labels, options });
      return;
    }
    const u = input.uncertainties[index];
    for (const option of u.options) {
      if (
        input.answers?.[u.id] !== undefined &&
        input.answers[u.id] !== option.id
      )
        continue;
      if (
        Object.entries(option.requires ?? {}).some(
          ([id, answer]) => answers[id] !== undefined && answers[id] !== answer,
        )
      )
        continue;
      visit(
        index + 1,
        { ...answers, [u.id]: option.id },
        [...labels, option.label],
        [...options, option],
      );
      if (results.length > SCENARIO_LIMIT || visits > 100_000) {
        truncated = true;
        break;
      }
    }
  };
  visit(0, {}, [], []);
  const independent = input.uncertainties.every((u) =>
    u.options.every((o) => !o.requires),
  );
  const rawCount = input.uncertainties.reduce(
    (n, u) => n * (input.answers?.[u.id] ? 1 : u.options.length),
    1,
  );
  return {
    cases: results.slice(0, SCENARIO_LIMIT),
    complete: !truncated && results.length <= SCENARIO_LIMIT,
    possibleCount: independent ? rawCount : results.length,
  };
}
function patchEvents(
  events: CashEvent[],
  options: UncertaintyOption[],
  reasons: DecisionReason[],
): CashEvent[] {
  const patches = new Map<string, Record<string, unknown>>();
  const removed = new Set<string>();
  for (const option of options)
    for (const p of option.patches) {
      const original = events.find((e) => e.id === p.eventId);
      if (
        original &&
        (original.includedInOpeningCash ||
          original.settlement === "observed") &&
        (p.excluded ||
          (p.date !== undefined && p.date !== original.date) ||
          (p.amountCents !== undefined &&
            p.amountCents !== original.amountCents))
      )
        addReason(
          reasons,
          "SETTLED_EVENT_MUTATION",
          `A scenario cannot rewrite observed settlement ${original.id}; reconcile a new snapshot instead.`,
          original.sourceIds,
        );
      const prior = patches.get(p.eventId) ?? {};
      for (const field of ["date", "amountCents", "excluded"] as const)
        if (p[field] !== undefined) {
          if (Object.hasOwn(prior, field) && prior[field] !== p[field])
            addReason(
              reasons,
              "CONFLICTING_PATCH",
              `Joint scenario assigns conflicting ${field} values to ${p.eventId}.`,
            );
          prior[field] = p[field];
        }
      patches.set(p.eventId, prior);
      if (p.excluded) removed.add(p.eventId);
    }
  return events
    .filter((e) => !removed.has(e.id))
    .map((e) => ({ ...e, ...patches.get(e.id) }));
}
function cashPath(
  input: DecisionInput,
  events: CashEvent[],
  baselineOnly: boolean,
): CashPath {
  let cash = isMoney(input.openingCashCents) ? input.openingCashCents : 0;
  const initial = cash;
  const usable = events.filter(
    (e) =>
      (!baselineOnly || e.scope === "baseline") &&
      !e.includedInOpeningCash &&
      validDate(e.date) &&
      e.date >= input.snapshotDate &&
      isMoney(e.amountCents),
  );
  const dayHasKnownOrder = new Map<string, boolean>();
  for (const e of usable)
    dayHasKnownOrder.set(
      e.date!,
      (dayHasKnownOrder.get(e.date!) ?? true) &&
        Number.isInteger(e.intradayOrder),
    );
  usable.sort(
    (a, b) =>
      a.date!.localeCompare(b.date!) ||
      (dayHasKnownOrder.get(a.date!)
        ? a.intradayOrder! - b.intradayOrder!
        : 0) ||
      (a.direction === "outflow" ? 0 : 1) -
        (b.direction === "outflow" ? 0 : 1) ||
      a.id.localeCompare(b.id),
  );
  const timeline: CashPath["timeline"] = [
    {
      eventId: "snapshot",
      date: input.snapshotDate,
      label: "Available cash at snapshot",
      deltaCents: 0,
      cashCents: initial,
      scope: "snapshot",
      sourceIds: input.evidence
        .filter((e) => e.kind === "dataset")
        .map((e) => e.id),
      assumed: false,
    },
  ];
  let minimumCents = initial;
  let minimumDate = input.snapshotDate;
  for (const e of usable) {
    const delta = e.direction === "inflow" ? e.amountCents! : -e.amountCents!;
    if (!Number.isSafeInteger(cash + delta)) continue;
    cash += delta;
    timeline.push({
      eventId: e.id,
      date: e.date!,
      label: e.label,
      deltaCents: delta,
      cashCents: cash,
      scope: e.scope,
      sourceIds: e.sourceIds,
      assumed: e.settlement !== "observed",
    });
    if (cash < minimumCents) {
      minimumCents = cash;
      minimumDate = e.date!;
    }
  }
  if (
    validDate(input.horizonDate) &&
    input.horizonDate > timeline[timeline.length - 1].date
  )
    timeline.push({
      eventId: "horizon",
      date: input.horizonDate,
      label: "End of declared forecast coverage",
      deltaCents: 0,
      cashCents: cash,
      scope: "baseline",
      sourceIds: [],
      assumed: true,
    });
  return {
    timeline,
    minimumCents,
    minimumDate,
    endingCashCents: cash,
    reserveGapCents: Math.max(
      0,
      (isMoney(input.reserveCents) ? input.reserveCents : 0) - minimumCents,
    ),
  };
}
function outcomesFor(
  input: DecisionInput,
  events: CashEvent[],
  cases: JointCase[],
  reasons: DecisionReason[],
): ScenarioOutcome[] {
  return cases.map((joint, index) => {
    const modified = patchEvents(events, joint.options, reasons);
    for (const e of modified) {
      if (!isMoney(e.amountCents) || !validDate(e.date))
        addReason(
          reasons,
          "INVALID_SCENARIO_EVENT",
          `A scenario leaves ${e.label} without a valid amount/date.`,
          e.sourceIds,
        );
      else if (e.date > input.horizonDate || e.date > input.calendarCoverageEnd)
        addReason(
          reasons,
          "INCOMPLETE_HORIZON",
          `A scenario places ${e.label} beyond declared horizon/calendar coverage.`,
          e.sourceIds,
        );
      else if (e.date < input.snapshotDate && !e.includedInOpeningCash)
        addReason(
          reasons,
          "UNRECONCILED_PAST_EVENT",
          `A scenario moves ${e.label} before the snapshot without reconciling observed settlement.`,
          e.sourceIds,
        );
    }
    const magnitude = modified.reduce(
      (sum, e) => sum + (isMoney(e.amountCents) ? e.amountCents : 0),
      (input.openingCashCents ?? 0) + (input.reserveCents ?? 0),
    );
    if (!Number.isSafeInteger(magnitude))
      addReason(
        reasons,
        "ARITHMETIC_OVERFLOW",
        "A joint scenario exceeds exact safe-integer arithmetic bounds.",
      );
    for (const milestone of input.job.milestones) {
      const receipt = modified.find((e) => e.id === milestone.eventId);
      const earliestDate = [
        milestone.conditionDate,
        milestone.invoiceEligibleDate,
      ]
        .filter(validDate)
        .sort()
        .at(-1);
      if (receipt?.date && earliestDate && receipt.date < earliestDate)
        addReason(
          reasons,
          "PREMATURE_COLLECTION",
          `${milestone.label} collection precedes its required condition/eligibility date in a joint scenario.`,
          milestone.sourceIds,
        );
    }
    const receipts = modified
      .filter((e) => e.scope === "job" && e.direction === "inflow")
      .reduce((n, e) => n + (e.amountCents ?? 0), 0);
    if (receipts !== input.job.priceCents)
      addReason(
        reasons,
        "SCENARIO_REVENUE_MISMATCH",
        "A joint scenario changes or excludes contract revenue without a conserved schedule.",
      );
    const baseline = cashPath(input, modified, true);
    const withJob = cashPath(input, modified, false);
    return {
      id: `scenario-${index + 1}`,
      answers: joint.answers,
      labels: joint.labels,
      baseline,
      withJob,
      passes: withJob.reserveGapCents === 0,
    };
  });
}
function rankQuestions(
  input: DecisionInput,
  outcomes: ScenarioOutcome[],
): NextQuestion[] {
  return input.uncertainties
    .filter((u) => !input.answers?.[u.id])
    .map((u) => {
      const branches = u.options.map((option) => {
        const matching = outcomes.filter((o) => o.answers[u.id] === option.id);
        const worst = [...matching].sort(
          (a, b) =>
            b.withJob.reserveGapCents - a.withJob.reserveGapCents ||
            a.withJob.minimumDate.localeCompare(b.withJob.minimumDate),
        )[0];
        return {
          optionId: option.id,
          label: option.label,
          scenarioCount: matching.length,
          passingCount: matching.filter((o) => o.passes).length,
          worstReserveGapCents: worst?.withJob.reserveGapCents ?? 0,
          witnessScenarioId: worst?.id ?? null,
        };
      });
      const active = branches.filter((b) => b.scenarioCount > 0);
      const gaps = active.map((b) => b.worstReserveGapCents);
      const dates = u.options.flatMap((o) =>
        o.patches
          .map(
            (p) =>
              p.date ??
              [...input.commitments, ...input.job.events].find(
                (e) => e.id === p.eventId,
              )?.date,
          )
          .filter(validDate),
      );
      return {
        id: u.id,
        question: u.question,
        owner: u.owner,
        requiredBy: u.requiredBy,
        sourceIds: u.sourceIds,
        distinguishesFeasibility:
          active.some((b) => b.passingCount === b.scenarioCount) &&
          active.some((b) => b.passingCount < b.scenarioCount),
        reserveGapImpactCents: gaps.length
          ? Math.max(...gaps) - Math.min(...gaps)
          : 0,
        earliestAffectedDate: dates.sort()[0] ?? u.requiredBy,
        branches,
      };
    })
    .sort(
      (a, b) =>
        Number(b.distinguishesFeasibility) -
          Number(a.distinguishesFeasibility) ||
        b.reserveGapImpactCents - a.reserveGapImpactCents ||
        a.earliestAffectedDate.localeCompare(b.earliestAffectedDate) ||
        a.id.localeCompare(b.id),
    );
}
function fundingProposal(
  input: DecisionInput,
  events: CashEvent[],
  cases: JointCase[],
  outcomes: ScenarioOutcome[],
  complete: boolean,
): Proposal | null {
  const negotiation = input.job.negotiation;
  if (!negotiation) return null;
  const deposit = events.find((e) => e.id === negotiation.depositEventId);
  const final = events.find((e) => e.id === negotiation.offsetReceiptEventId);
  if (
    deposit?.settlement === "observed" ||
    deposit?.includedInOpeningCash ||
    final?.settlement === "observed" ||
    final?.includedInOpeningCash
  )
    return null;
  if (
    !deposit ||
    !final ||
    deposit.id === final.id ||
    deposit.direction !== "inflow" ||
    final.direction !== "inflow" ||
    deposit.scope !== "job" ||
    final.scope !== "job" ||
    !isMoney(deposit.amountCents) ||
    !isMoney(final.amountCents) ||
    !validDate(deposit.date) ||
    !validDate(final.date)
  )
    return null;
  const worst = [...outcomes].sort(
    (a, b) => a.withJob.minimumCents - b.withJob.minimumCents,
  )[0];
  const initialMinimum = worst?.withJob.minimumCents ?? 0;
  const base: Proposal = {
    kind: "deposit_advance",
    status: "UNAVAILABLE",
    label: "No supported deposit-only repair",
    additionalDepositCents: 0,
    originalDepositCents: deposit.amountCents,
    proposedDepositCents: deposit.amountCents,
    originalFinalReceiptCents: final.amountCents,
    proposedFinalReceiptCents: final.amountCents,
    originalCollectionDate: deposit.date,
    proposedCollectionDate: deposit.date,
    totalRevenueCents: input.job.priceCents,
    minimumCashCents: initialMinimum,
    reserveGapCents: worst?.withJob.reserveGapCents ?? 0,
    requiredAgreements: [],
    sourceIds: negotiation.sourceIds,
    limitation:
      "Minimum within this allowed deposit/date proposal family; requires customer agreement and actual collection. Not an executed amendment.",
  };
  base.inputHash = hashDecisionInput(input);
  if (!complete)
    return {
      ...base,
      limitation:
        "Resolve material inputs and scenario coverage before claiming a supported funding proposal.",
    };
  if (outcomes.every((o) => o.passes))
    return {
      ...base,
      status: "NOT_NEEDED",
      label: "Current plan passes the declared scenarios",
    };
  const max = Math.min(negotiation.maxAdditionalCents, final.amountCents);
  let best: {
    cents: number;
    date: string;
    outcomes: ScenarioOutcome[];
  } | null = null;
  for (const date of negotiation.allowedCollectionDates.filter(
    (d) =>
      validDate(d) &&
      d >= input.snapshotDate &&
      d <= deposit.date! &&
      d < final.date!,
  )) {
    // The proposal rewrites the deposit's amount and date and the final receipt's amount. A case that also
    // touches those fields would conflict with it, so skip. A case that only moves the final receipt's date
    // (customer pays late) composes with it: the amounts still total the contract price.
    if (
      cases.some((c) =>
        c.options.some((o) =>
          o.patches.some(
            (p) =>
              p.eventId === deposit.id ||
              (p.eventId === final.id &&
                (p.excluded !== undefined || p.amountCents !== undefined)),
          ),
        ),
      )
    )
      continue;
    const run = (cents: number) => {
      // Trial the complete versioned candidate, including synchronized milestone amounts/dates.
      // Cash success alone is insufficient: moving a receipt can violate its material preconditions.
      const candidate = reviseDeposit(input, {
        depositCents: deposit.amountCents! + cents,
        collectionDate: date,
      });
      const diagnostics: DecisionReason[] = [];
      const candidateEvents = normalizeEvents(candidate, diagnostics);
      inputProblems(candidate, candidateEvents, diagnostics);
      const candidateOutcomes = outcomesFor(
        candidate,
        candidateEvents,
        cases,
        diagnostics,
      );
      return {
        outcomes: candidateOutcomes,
        supported:
          diagnostics.length === 0 &&
          candidateOutcomes.length === cases.length &&
          candidateOutcomes.every((o) => o.passes),
      };
    };
    if (!run(max).supported) continue;
    let lo = 0;
    let hi = max;
    while (lo < hi) {
      const mid = lo + Math.floor((hi - lo) / 2);
      if (run(mid).supported) hi = mid;
      else lo = mid + 1;
    }
    if (!best || lo < best.cents || (lo === best.cents && date < best.date))
      best = { cents: lo, date, outcomes: run(lo).outcomes };
  }
  if (!best) return base;
  const minimum = Math.min(...best.outcomes.map((o) => o.withJob.minimumCents));
  return {
    ...base,
    status: "AVAILABLE",
    label: "Smallest supported deposit advance",
    additionalDepositCents: best.cents,
    proposedDepositCents: deposit.amountCents + best.cents,
    proposedFinalReceiptCents: final.amountCents - best.cents,
    proposedCollectionDate: best.date,
    minimumCashCents: minimum,
    reserveGapCents: Math.max(0, input.reserveCents! - minimum),
    requiredAgreements: [
      `Customer signs a revised deposit of $${((deposit.amountCents + best.cents) / 100).toFixed(2)}, collected by ${best.date}.`,
      `Reduce the final receipt by $${(best.cents / 100).toFixed(2)}; total contract revenue remains $${(input.job.priceCents / 100).toFixed(2)}.`,
      "Confirm the entire business calendar and the modeled future settlement assumptions.",
    ],
  };
}
export function evaluateDecision(input: DecisionInput): DecisionResult {
  const reasons: DecisionReason[] = [];
  const events = normalizeEvents(input, reasons);
  inputProblems(input, events, reasons);
  const enumeration = enumerateCases(input);
  if (!enumeration.complete)
    addReason(
      reasons,
      "SCENARIO_LIMIT",
      `Exact scenario coverage exceeds the ${SCENARIO_LIMIT}-scenario limit. Displayed paths are partial and cannot support a green verdict.`,
    );
  if (!enumeration.cases.length)
    addReason(
      reasons,
      "NO_ADMISSIBLE_SCENARIOS",
      "The supplied answers and dependencies admit no joint scenarios.",
    );
  const outcomes = outcomesFor(input, events, enumeration.cases, reasons);
  const complete =
    reasons.length === 0 && enumeration.complete && outcomes.length > 0;
  const fallback = cashPath(input, events, false);
  const worst = [...outcomes].sort(
    (a, b) =>
      a.withJob.minimumCents - b.withJob.minimumCents ||
      a.withJob.minimumDate.localeCompare(b.withJob.minimumDate),
  )[0];
  const baseline =
    [...outcomes].sort(
      (a, b) => a.baseline.minimumCents - b.baseline.minimumCents,
    )[0]?.baseline ?? cashPath(input, events, true);
  const withJob = worst?.withJob ?? fallback;
  const passing = outcomes.filter((o) => o.passes).length;
  const status: DecisionStatus = !complete
    ? "NEEDS_INPUT"
    : passing === 0
      ? "SHORTFALL"
      : passing < outcomes.length
        ? "CONDITIONAL"
        : "SUPPORTED_IN_TESTED_SCENARIOS";
  if (baseline.reserveGapCents > 0)
    addReason(
      reasons,
      "BASELINE_SHORTFALL",
      "Existing-business commitments breach the reserve even without the new job.",
    );
  if (complete)
    addReason(
      reasons,
      status === "SHORTFALL"
        ? "ALL_SCENARIOS_FAIL"
        : status === "CONDITIONAL"
          ? "MIXED_SCENARIOS"
          : "DECLARED_SCENARIOS_PASS",
      status === "SHORTFALL"
        ? "Every declared admissible scenario breaches the reserve under the current payment terms."
        : status === "CONDITIONAL"
          ? "Some declared scenarios preserve the reserve and others breach it. Confirm the deciding evidence or negotiate the separate proposal."
          : "Every declared admissible scenario preserves the reserve under the disclosed assumptions.",
    );
  return {
    inputId: input.id,
    inputVersion: input.version,
    inputHash: hashDecisionInput(input),
    status,
    statusLabel: statusLabels[status],
    reasons,
    baseline,
    withJob,
    scenarioCount: outcomes.length,
    possibleScenarioCount: enumeration.possibleCount,
    passingScenarioCount: passing,
    coverageComplete: complete,
    scenarioLimit: SCENARIO_LIMIT,
    outcomes,
    minimumCashRange: {
      worstCents: withJob.minimumCents,
      bestCents: outcomes.length
        ? Math.max(...outcomes.map((o) => o.withJob.minimumCents))
        : withJob.minimumCents,
    },
    reserveGapCents: withJob.reserveGapCents,
    incrementalReserveGapCents: Math.max(
      0,
      withJob.reserveGapCents - baseline.reserveGapCents,
    ),
    proposal: fundingProposal(
      input,
      events,
      enumeration.cases,
      outcomes,
      complete,
    ),
    nextQuestions: rankQuestions(input, outcomes),
    evidenceIds: [...new Set(events.flatMap((e) => e.sourceIds))],
    assumptions: [
      ...input.assumptions,
      "When intraday settlement order is unknown, outflows precede receipts on the same day.",
      "All-scenarios statements refer only to this finite disclosed scenario family; no probabilities or payment guarantee are inferred.",
    ],
  };
}
function revised(input: DecisionInput): DecisionInput {
  return { ...structuredClone(input), version: input.version + 1 };
}
export function withScenarioAnswer(
  input: DecisionInput,
  id: string,
  optionId?: string,
): DecisionInput {
  const uncertainty = input.uncertainties.find((u) => u.id === id);
  if (
    !uncertainty ||
    (optionId && !uncertainty.options.some((o) => o.id === optionId))
  )
    throw new Error("Unsupported scenario answer");
  const next = revised(input);
  next.answers = { ...next.answers };
  if (optionId) next.answers[id] = optionId;
  else delete next.answers[id];
  return next;
}
export function reviseCashPolicy(
  input: DecisionInput,
  edit: { openingCashCents?: number; reserveCents?: number },
): DecisionInput {
  for (const value of Object.values(edit))
    if (!isMoney(value))
      throw new Error("Cash policy needs nonnegative safe integer cents");
  return { ...revised(input), ...edit };
}
export function reviseEvent(
  input: DecisionInput,
  id: string,
  patch: Omit<EventPatch, "eventId">,
): DecisionInput {
  if (patch.excluded)
    throw new Error(
      "Removing a confirmed obligation requires explicit review; use bounded scenario options",
    );
  if (patch.amountCents !== undefined && !isMoney(patch.amountCents))
    throw new Error("Event amount needs safe integer cents");
  if (patch.date !== undefined && !validDate(patch.date))
    throw new Error("Event date needs an ISO calendar date");
  const next = revised(input);
  const event = [...next.commitments, ...next.job.events].find(
    (e) => e.id === id,
  );
  if (!event) throw new Error("Unknown event identity");
  if (event.settlement === "observed" || event.includedInOpeningCash)
    throw new Error(
      "Already settled events require a reconciled snapshot correction",
    );
  if (
    event.scope === "job" &&
    event.direction === "outflow" &&
    patch.date &&
    patch.date !== event.date
  )
    throw new Error(
      "Changing job spending dates requires a reviewed downstream dependency schedule, which this edit helper does not support",
    );
  if (
    event.direction === "inflow" &&
    patch.amountCents !== undefined &&
    patch.amountCents !== event.amountCents
  )
    throw new Error("Use reviseDeposit to conserve job revenue");
  Object.assign(event, patch);
  for (const milestone of next.job.milestones.filter((m) => m.eventId === id)) {
    if (patch.date) milestone.assumedCollectionDate = patch.date;
  }
  return next;
}
export function reviseDeposit(
  input: DecisionInput,
  edit: { depositCents: number; collectionDate?: string },
): DecisionInput {
  const next = revised(input);
  const n = next.job.negotiation;
  if (!n) throw new Error("This plan has no supported deposit negotiation");
  const deposit = next.job.events.find((e) => e.id === n.depositEventId);
  const final = next.job.events.find((e) => e.id === n.offsetReceiptEventId);
  if (
    !deposit ||
    !final ||
    !isMoney(deposit.amountCents) ||
    !isMoney(final.amountCents) ||
    !isMoney(edit.depositCents)
  )
    throw new Error("Deposit and final receipts need valid cents");
  if (
    deposit.settlement === "observed" ||
    deposit.includedInOpeningCash ||
    final.settlement === "observed" ||
    final.includedInOpeningCash
  )
    throw new Error(
      "Already settled receipts require a reconciled snapshot correction",
    );
  const delta = edit.depositCents - deposit.amountCents;
  if (delta > n.maxAdditionalCents || delta > final.amountCents)
    throw new Error("Deposit exceeds the conserved negotiation bound");
  if (
    edit.collectionDate &&
    (!n.allowedCollectionDates.includes(edit.collectionDate) ||
      edit.collectionDate >= final.date!)
  )
    throw new Error(
      "Collection date is outside the allowed negotiation family",
    );
  deposit.amountCents = edit.depositCents;
  final.amountCents -= delta;
  n.maxAdditionalCents -= delta;
  if (delta !== 0) deposit.label = "Job deposit collected";
  if (edit.collectionDate) deposit.date = edit.collectionDate;
  for (const m of next.job.milestones)
    if (m.eventId === deposit.id || m.eventId === final.id) {
      const event = m.eventId === deposit.id ? deposit : final;
      m.amountCents = event.amountCents!;
      m.assumedCollectionDate = event.date;
    }
  return next;
}
export function applyProposal(
  input: DecisionInput,
  proposal: Proposal,
): DecisionInput {
  if (proposal.status !== "AVAILABLE")
    throw new Error("Only an available proposal can be simulated");
  const current = evaluateDecision(input).proposal;
  if (!current || canonical(current) !== canonical(proposal))
    throw new Error("Proposal is stale for this snapshot");
  return reviseDeposit(input, {
    depositCents: proposal.proposedDepositCents,
    collectionDate: proposal.proposedCollectionDate,
  });
}
