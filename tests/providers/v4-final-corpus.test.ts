import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateExtraction, type ExtractedClause, type ExtractionContext, type Trigger } from "../../lib/providers/extraction";
import { resolvePaymentClock } from "../../lib/domain/terms";

interface Case { id: string; family: string; companyId: string; context: ExtractionContext; expected: ExtractedClause; labelRationale: string }
const root = new URL("../../data/evaluation/v4-schema-contract/", import.meta.url);
const sourcePath = new URL("evaluation.frozen.jsonl", root);
const readRows = (path: URL): Case[] => existsSync(path) ? readFileSync(path, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line)) : [];
const rows = readRows(sourcePath);
const legacy = [...readRows(new URL("../../data/training/train-labels.jsonl", import.meta.url)), ...readRows(new URL("../../data/training/evaluation.frozen.jsonl", import.meta.url)), ...readRows(new URL("../../data/training/v4-schema-contract/train-labels.jsonl", import.meta.url))];
const logic = (node: Trigger): string => node.op === "ATOM" ? node.condition : `${node.op}(${node.children.map(logic).sort().join(",")})`;
function satisfied(node: Trigger, states: string[]): boolean { return node.op === "ATOM" ? states.includes(node.condition) : node.op === "ALL" ? node.children.every(child => satisfied(child, states)) : node.children.some(child => satisfied(child, states)); }

describe("new protected v4 schema-contract final corpus", () => {
  it("has the predeclared 40 independent clauses and 24/8/8 status split", () => {
    expect(rows).toHaveLength(40);
    expect(rows.filter(row => row.expected.status === "PROPOSED")).toHaveLength(24);
    expect(rows.filter(row => row.expected.status === "AMBIGUOUS")).toHaveLength(8);
    expect(rows.filter(row => row.expected.status === "UNSUPPORTED")).toHaveLength(8);
    expect(new Set(rows.map(row => row.id)).size).toBe(40);
    expect(new Set(rows.map(row => row.context.text)).size).toBe(40);
    expect(new Set(rows.map(row => row.companyId)).size).toBe(40);
  });
  it("binds every expected label to the actual schema and visible references", () => {
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(validateExtraction(row.expected, row.context)).toEqual(row.expected);
      expect(row.labelRationale.length).toBeGreaterThan(30);
      if (row.expected.status === "PROPOSED") expect(row.expected.issues).toEqual([]);
      else expect(row.expected.issues.length).toBeGreaterThan(0);
    }
  });
  it("keeps all identities, company/subject namespaces, text and family names disjoint from existing train/final data", () => {
    expect(legacy.length).toBeGreaterThan(0); expect(rows).toHaveLength(40);
    const oldIds = new Set(legacy.map(row => row.id)); const oldSources = new Set(legacy.map(row => row.context.sourceId));
    const oldCompanies = new Set(legacy.map(row => row.companyId)); const oldSubjects = new Set(legacy.flatMap(row => row.context.subjects));
    const oldTexts = new Set(legacy.map(row => row.context.text)); const oldFamilies = new Set(legacy.map(row => row.family.replace(/^(train|eval)__/, "")));
    const oldAmounts = new Set(legacy.flatMap(row => row.context.amountRefs.map(amount => amount.id)));
    for (const row of rows) {
      expect(oldIds.has(row.id)).toBe(false); expect(oldSources.has(row.context.sourceId)).toBe(false);
      expect(oldCompanies.has(row.companyId)).toBe(false); expect(oldTexts.has(row.context.text)).toBe(false);
      expect(oldFamilies.has(row.family)).toBe(false);
      expect(row.context.subjects.some(subject => oldSubjects.has(subject))).toBe(false);
      expect(row.context.amountRefs.some(amount => oldAmounts.has(amount.id))).toBe(false);
    }
  });
  it("introduces twelve genuinely new supported Boolean compositions rather than renamed legacy templates", () => {
    const supported = rows.filter(row => row.expected.status === "PROPOSED");
    const oldLogic = new Set(legacy.filter(row => row.expected.trigger).map(row => logic(row.expected.trigger!)));
    const families = new Map<string, Set<string>>();
    for (const row of supported) {
      const signature = logic(row.expected.trigger!); expect(oldLogic.has(signature)).toBe(false);
      const signatures = families.get(row.family) ?? new Set(); signatures.add(signature); families.set(row.family, signatures);
    }
    expect(families.size).toBe(12); expect(new Set([...families.values()].flatMap(value => [...value])).size).toBe(12);
    expect([...families.values()].every(value => value.size === 1)).toBe(true);
  });
  it("preserves the frozen bytes, counts and PUBLIC_SYNTHETIC policy", () => {
    expect(existsSync(new URL("manifest.json", root))).toBe(true);
    if (!existsSync(new URL("manifest.json", root))) return;
    const manifest = JSON.parse(readFileSync(new URL("manifest.json", root), "utf8"));
    expect(manifest.dataClassification).toBe("PUBLIC_SYNTHETIC"); expect(manifest.evaluationCount).toBe(40);
    expect(manifest.promptProfile).toBe("json-schema-v4");
    if (manifest.frozen) {
      expect(manifest.reviewStatus).toBe("independently-audited-before-query");
      expect(manifest.independentAudit.evaluationSha256).toBe(manifest.hashes["evaluation.frozen.jsonl"]);
      expect(manifest.independentAudit.auditor.length).toBeGreaterThan(0);
      expect(Number.isFinite(Date.parse(manifest.independentAudit.checkedAt))).toBe(true);
    } else expect(manifest.requiresIndependentAuditBeforeQuery).toBe(true);
    expect(createHash("sha256").update(readFileSync(sourcePath)).digest("hex")).toBe(manifest.hashes["evaluation.frozen.jsonl"]);
  });
  it("matches hand-checked route counterexamples across every supported composition", () => {
    const condition: Record<string, string> = { S: "AGREEMENT_SIGNED", D: "DELIVERY_CONFIRMED", A: "PHASE_ACCEPTED", I: "INSPECTION_PASSED", C: "CUSTOMER_CERTIFICATE_RECEIVED", V: "INVOICE_ACCEPTED" };
    const examples: [string, string[], string[]][] = [
      ["parallel_complete_routes", ["IC", "AD"], ["ID", "CA"]],
      ["two_separate_alternative_gates", ["DC", "IA"], ["DI", "CA"]],
      ["prior_invoice_certificate_or_acceptance", ["VC", "A"], ["V", "C"]],
      ["signature_with_compound_or_prior_invoice", ["SID", "SV"], ["ID", "SC"]],
      ["signed_prior_invoice_or_inspected_acceptance", ["SV", "IA"], ["SI", "VA"]],
      ["two_independent_credit_gates", ["SV", "CD"], ["SC", "VD"]],
      ["delivery_certificate_or_acceptance_invoice", ["DC", "AV"], ["DV", "CA"]],
      ["inspection_and_two_complete_document_routes", ["ISC", "IAV"], ["SC", "IA", "IV"]],
      ["customer_certificate_or_three_part_route", ["C", "SDV"], ["SD", "DV"]],
      ["three_gates_with_two_alternatives", ["ISC", "VAC"], ["IS", "IVC", "SAC"]],
      ["signed_inspected_certificate_or_delivered_invoice", ["SIC", "DV"], ["SI", "IC", "DC"]],
      ["acceptance_with_two_complete_clearance_routes", ["SDA", "IVA"], ["SD", "IV", "AS"]],
    ];
    for (const [family, pass, fail] of examples) {
      const members = rows.filter(row => row.family === family); expect(members).toHaveLength(2);
      for (const row of members) {
        for (const truth of pass) expect(satisfied(row.expected.trigger!, [...truth].map(key => condition[key]))).toBe(true);
        for (const truth of ["", ...fail]) expect(satisfied(row.expected.trigger!, [...truth].map(key => condition[key]))).toBe(false);
      }
    }
  });
  it("preserves recipient authority gaps and independently grounded clocks on negative cases", () => {
    const liaison = rows.find(row => row.id === "v4final-case-29")!;
    const escrow = rows.find(row => row.id === "v4final-case-39")!;
    expect(liaison.expected.status).toBe("AMBIGUOUS"); expect(liaison.expected.trigger).toBeNull();
    expect(liaison.expected.due?.kind).toBe("CALENDAR_DAYS_AFTER_INVOICE_ISSUED");
    expect(escrow.expected.status).toBe("UNSUPPORTED"); expect(escrow.expected.trigger).toBeNull();
    expect(escrow.expected.due).toEqual({ kind: "ON_DATE", date: "2027-12-02" });
  });
  it("keeps invoice-issuance clocks distinct from eligibility and never derives settlement", () => {
    const invoiceRows = rows.filter(row => row.expected.due?.kind === "CALENDAR_DAYS_AFTER_INVOICE_ISSUED");
    expect(invoiceRows.length).toBeGreaterThanOrEqual(12);
    for (const row of invoiceRows) {
      const due = row.expected.due!;
      if (due.kind !== "CALENDAR_DAYS_AFTER_INVOICE_ISSUED") throw new Error("Unexpected due kind");
      expect(row.context.subjects).toContain(due.invoiceSubject);
      expect(resolvePaymentClock(due, { eligibilityDate: "2027-04-10" }).dueDate).toBeNull();
      expect(resolvePaymentClock(due, { eligibilityDate: "2027-04-10", invoiceIssuedDate: "2027-04-12" }).anchorDate).toBe("2027-04-12");
    }
  });
});
