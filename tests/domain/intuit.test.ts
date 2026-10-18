import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseIntuitBankLedgerYaml, reconcileIntuitSnapshot } from "../../lib/domain/intuit";
import { getScenario, listScenarios } from "../../lib/domain/fixtures";
import { evaluateDecision } from "../../lib/domain/engine";
import { validateDecisionInput } from "../../lib/domain/schema";

describe("Intuit source adapter", () => {
  it("reconciles the actual sponsor ledger and keeps availability a separate explicit assumption", () => {
    const yaml = readFileSync(new URL("../../data/scenarios/source/bank_transactions.yaml", import.meta.url), "utf8");
    const rows = parseIntuitBankLedgerYaml(yaml);
    const snapshot = reconcileIntuitSnapshot({ companyId: "company-047", asOfDate: "2026-10-06", rows });
    expect(snapshot.bankBalanceCents).toBe(7_488_238);
    expect(snapshot.lastBankEventId).toBe("bank-002419");
    expect(snapshot.availableCashCents).toBeNull();
    expect(snapshot.reconciledRowCount).toBe(2419);
    expect(reconcileIntuitSnapshot({ companyId: "company-047", asOfDate: "2026-10-06", rows, restrictedFundsCents: 0 }).availableCashCents).toBe(7_488_238);
  });
  it("reconstructs earlier snapshots without leaking later balances and uses signed amounts rather than debit labels", () => {
    const rows = [
      { id: "first", date: "2026-10-05", amount: "10.03", running_balance_amount: "110.03" },
      { id: "second", date: "2026-10-06", amount: "-0.02", running_balance_amount: "110.01" },
    ];
    const snapshot = reconcileIntuitSnapshot({ companyId: "company-047", asOfDate: "2026-10-05", rows, restrictedFundsCents: 3 });
    expect(snapshot.bankBalanceCents).toBe(11003); expect(snapshot.availableCashCents).toBe(11000);
    expect(snapshot.lastBankEventId).toBe("first");
  });
  it("rejects broken balance links and insufficient data instead of inventing zero cash", () => {
    const rows = [{ id: "first", date: "2026-10-05", amount: "10.00", running_balance_amount: "110.00" }, { id: "second", date: "2026-10-06", amount: "-2.00", running_balance_amount: "109.00" }];
    expect(() => reconcileIntuitSnapshot({ companyId: "company-047", asOfDate: "2026-10-06", rows })).toThrow(/reconcile/i);
    expect(() => reconcileIntuitSnapshot({ companyId: "company-047", asOfDate: "2026-10-01", rows })).toThrow(/snapshot/i);
  });
  it("rejects an invalid-date record instead of silently dropping the latest balance", () => {
    const rows = [{ id: "first", date: "2026-10-05", amount: "10.00", running_balance_amount: "110.00" }, { id: "second", date: "2026-13-06", amount: "-2.00", running_balance_amount: "108.00" }];
    expect(() => reconcileIntuitSnapshot({ companyId: "company-047", asOfDate: "2026-10-06", rows })).toThrow(/date/i);
  });
});

describe("disclosed demo snapshots and input boundary", () => {
  it("exercises three genuine financial paths from independently calculated source-backed fixtures", () => {
    const fixtures = listScenarios(); expect(fixtures).toHaveLength(3);
    const phase = evaluateDecision(fixtures[0]); expect(phase.passingScenarioCount).toBe(1); expect(phase.scenarioCount).toBe(2); expect(phase.proposal!.additionalDepositCents).toBe(2_300_000);
    const stress = evaluateDecision(fixtures[1]); expect(stress.passingScenarioCount).toBe(3); expect(stress.scenarioCount).toBe(4); expect(stress.withJob.minimumCents).toBe(900_000);
    expect(evaluateDecision(fixtures[2]).status).toBe("NEEDS_INPUT");
    fixtures[0].evidence[0].text = "changed";
    expect(getScenario(fixtures[0].id)!.evidence[0].text).not.toBe("changed");
  });
  it("rejects malformed, oversized, invalid-date, enum, and fractional-money requests at the public boundary", () => {
    expect(validateDecisionInput({}).success).toBe(false);
    for (const mutate of [
      (x: ReturnType<typeof listScenarios>[number]) => { x.commitments = Array(129).fill(x.commitments[0]); },
      (x: ReturnType<typeof listScenarios>[number]) => { x.snapshotDate = "2026-02-30"; },
      (x: ReturnType<typeof listScenarios>[number]) => { x.reserveCents = -1; },
      (x: ReturnType<typeof listScenarios>[number]) => { x.reserveCents = 0.5; },
    ]) { const x = listScenarios()[0]; mutate(x); expect(validateDecisionInput(x).success).toBe(false); }
    expect(listScenarios().every(f => validateDecisionInput(f).success)).toBe(true);
  });
});
