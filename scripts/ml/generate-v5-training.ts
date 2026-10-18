import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { CONDITIONS, type ExtractedClause, type ExtractionContext, type Trigger, validateExtraction } from "../../lib/providers/extraction";
import { extractionPromptV5, EXTRACTION_PROMPT_PROFILE_V5 } from "../../lib/providers/extraction-v5";
import type { LabeledExample } from "./generate-data";

export const sha = (text: string) => createHash("sha256").update(text).digest("hex");
export const jsonl = (rows: unknown[]) => rows.map(row => JSON.stringify(row)).join("\n") + "\n";
const atom = (i: number, subject: string): Trigger => ({ op: "ATOM", condition: CONDITIONS[i], subject });
const all = (...children: Trigger[]): Trigger => ({ op: "ALL", children });
const any = (...children: Trigger[]): Trigger => ({ op: "ANY", children });

// The family is review metadata only. No category name is visible in a model's context.
export const patterns: ((a: string, b: string) => Trigger)[] = [
  ...CONDITIONS.map((_, i) => (a: string) => atom(i, a)),
  a => all(atom(3, a), atom(4, a)),
  a => any(atom(1, a), atom(2, a)),
  (a,b) => all(atom(0, a), any(atom(1, b), atom(3, b))),
  (a,b) => any(all(atom(3, a), atom(4, a)), all(atom(1, b), atom(2, b))),
  (a,b) => all(any(atom(1, a), atom(3, a)), any(atom(2, b), atom(4, b))),
  (a,b) => any(atom(4, a), all(atom(0, b), atom(1, b), atom(5, b))),
  (a,b) => all(atom(3, a), any(all(atom(0, b), atom(4, b)), all(atom(2, a), atom(5, a)))),
  (a,b) => any(all(atom(0, a), atom(5, a)), all(atom(3, b), atom(2, b))),
  (a,b) => all(atom(2, a), any(all(atom(0, b), atom(1, b)), all(atom(3, a), atom(5, a)))),
  (a,b) => all(any(atom(0, a), atom(3, a)), any(atom(2, b), atom(5, b)), atom(4, a)),
  (a,b) => any(all(atom(0, a), atom(3, a), atom(4, a)), all(atom(1, b), atom(5, b))),
  (a,b) => all(atom(0, a), any(atom(2, a), all(atom(3, b), atom(4, b)))),
  (a,b) => any(all(atom(1, a), atom(4, a)), all(atom(2, b), atom(5, b))),
  (a,b) => all(any(atom(0, a), atom(4, a)), any(atom(1, b), atom(5, b))),
];

export function contextFor(namespace: string, index: number) {
  const key = sha(namespace + ":" + index).slice(0, 8);
  const names = ["work_" + key, "stage_" + key];
  if (parseInt(key.slice(2, 4), 16) % 2) names.reverse();
  const subjects = [...names, "other_" + key, "bill_" + key, "prior_" + key];
  const cents = 800_000 + (parseInt(key.slice(0, 4), 16) % 1800) * 3700;
  const id = "sum_" + sha(key + "target").slice(0, 7);
  const rank = parseInt(key.slice(4, 6), 16) % 3;
  const amountRefs: ExtractionContext["amountRefs"] = [
    { id, cents, currency: "USD" },
    { id: "sum_" + sha(key + "other").slice(0, 7), cents: cents + (rank === 2 ? -170_000 : 530_000), currency: "USD" },
    { id: "sum_" + sha(key + "deposit").slice(0, 7), cents: cents + (rank === 0 ? 210_000 : -320_000), currency: "USD" },
  ];
  const context: ExtractionContext = {
    sourceId: "doc_" + sha(key + namespace).slice(0, 12), text: "",
    amountRefs: index % 3 === 0 ? amountRefs : index % 3 === 1 ? [amountRefs[1], amountRefs[0], amountRefs[2]] : [...amountRefs].reverse(),
    subjects: index % 2 ? [subjects[2], subjects[0], subjects[4], subjects[1], subjects[3]] : [...subjects].reverse(),
  };
  const amount = "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const days = [0, 7, 10, 14, 21, 30, 45, 60][parseInt(key.slice(6, 8), 16) % 8];
  const date = `2027-${String(1 + index % 12).padStart(2,"0")}-${String(4 + index % 22).padStart(2,"0")}`;
  return { context, a: subjects[0], b: subjects[1], other: subjects[2], invoice: subjects[3], priorInvoice: subjects[4], amount, amountRef: id, days, date };
}

function verbalize(node: Trigger, style: number): string {
  if (node.op === "ATOM") {
    const s = node.subject;
    const wording: Record<typeof CONDITIONS[number], string[]> = {
      AGREEMENT_SIGNED: [`the agreement for ${s} is signed`, `${s}'s agreement has been signed`, `signature of the agreement covering ${s} is complete`],
      DELIVERY_CONFIRMED: [`delivery of ${s} is confirmed`, `${s} has confirmed delivery`, `confirmation of delivery for ${s} is recorded`],
      PHASE_ACCEPTED: [`the customer accepts ${s}`, `${s} receives the customer's acceptance`, `the customer has accepted the work on ${s}`],
      INSPECTION_PASSED: [`${s} passes inspection`, `a passing inspection result for ${s} is recorded`, `inspection of ${s} has passed`],
      CUSTOMER_CERTIFICATE_RECEIVED: [`the customer receives the certificate for ${s}`, `the insurance certificate covering ${s} reaches the customer`, `the customer's expressly authorized representative receives ${s}'s certificate`],
      INVOICE_ACCEPTED: [`the customer accepts the invoice for ${s}`, `${s}'s invoice has been accepted by the customer`, `customer acceptance of the invoice covering ${s} is recorded`],
    };
    return wording[node.condition][style % 3];
  }
  const items = node.children.map(child => "(" + verbalize(child, style + 1) + ")");
  if (style % 2 === 0) return (node.op === "ALL" ? "all of " : "at least one of ") + items.join(node.op === "ALL" ? " AND " : " OR ");
  return (node.op === "ALL" ? "each requirement is met: " : "one complete alternative is met: ") + items.join(node.op === "ALL" ? "; AND " : "; OR ");
}

function positive(index: number, pattern: number): LabeledExample {
  const p = contextFor("v5-training-positive", index);
  const trigger = patterns[pattern](p.a, p.b);
  const style = Math.floor(index / patterns.length);
  const invoiceSubject = index % 2 ? p.invoice : p.a;
  const invoiceName = index % 2 ? `invoice ${p.invoice} for ${p.a}` : `invoice for ${p.a}`;
  const due: ExtractedClause["due"] = style % 4 === 0 ? { kind: "ON_DATE", date: p.date }
    : style % 4 === 1 ? { kind: "CALENDAR_DAYS_AFTER_TRIGGER", days: p.days }
    : { kind: "CALENDAR_DAYS_AFTER_INVOICE_ISSUED", days: p.days, invoiceSubject };
  const clock = due.kind === "ON_DATE" ? `Once eligible, the contractual due date is ${p.date}; there is no additional offset.`
    : due.kind === "CALENDAR_DAYS_AFTER_TRIGGER" ? `The payment deadline is ${p.days} calendar days after those eligibility requirements are met.`
    : `The eligible ${invoiceName} may be issued later. Payment is due ${p.days} calendar days after the actual issuance of that invoice, not after eligibility.`;
  const clause = `The ${p.amount} installment for ${p.a} is eligible when ${verbalize(trigger, style)}. ${clock}`;
  const noise = style % 3 === 0 ? `Background only: ${p.other} is a separate future project, prior invoice ${p.priorInvoice} is already paid, and the other listed amounts are unrelated payments. ` : "";
  p.context.text = style % 3 === 2 ? `PAYMENT RIDER\n${clause}\nAdministrative note: eligibility is not proof of invoice issuance or cash settlement.` : noise + clause;
  const expected: ExtractedClause = { schemaVersion: 1, amountRef: p.amountRef, trigger, due, sourceIds: [p.context.sourceId], status: "PROPOSED", issues: [] };
  return { id: `v5-train-p-${index}`, family: `composition-${pattern}`, companyId: `v5-company-${index}`, context: p.context, expected, provenance: "PUBLIC_SYNTHETIC typed scenario with developer-reviewed rendering; no final or customer data." };
}

function negative(index: number, kind: number): LabeledExample {
  const p = contextFor("v5-training-negative", index);
  const repeat = Math.floor(index / 12);
  let trigger: Trigger | null = repeat % 2 ? patterns[8 + (kind + repeat) % 12](p.a, p.b) : atom(3, p.a);
  const conditionText = verbalize(trigger, repeat);
  const invoiceSubject = repeat % 2 ? p.invoice : p.a;
  let due: ExtractedClause["due"] = { kind: "CALENDAR_DAYS_AFTER_INVOICE_ISSUED", days: p.days, invoiceSubject };
  let amountRef: string | null = p.amountRef;
  let status: ExtractedClause["status"] = "AMBIGUOUS";
  let issue = "";
  let text = "";
  const invoiceClock = `The deadline is ${p.days} calendar days after issuance of the invoice ${repeat % 2 ? p.invoice + " " : ""}for ${p.a}.`;
  switch (kind) {
    case 0: text = `The installment for ${p.a} becomes invoice-eligible when ${conditionText}. The amount of this installment is absent; all listed sums refer to other payments. ${invoiceClock}`; amountRef = null; issue = "The installment amount is missing."; break;
    case 1: text = `The ${p.amount} installment for ${p.a} becomes eligible when ${conditionText}. No payment deadline or timing is specified.`; due = null; issue = "The payment deadline is missing."; break;
    case 2: text = `The ${p.amount} installment for ${p.a} has no stated eligibility prerequisite. ${invoiceClock}`; trigger = null; issue = "The eligibility condition is missing."; break;
    case 3: text = `The ${p.amount} installment for ${p.a} becomes invoice-eligible when we receive its certificate. The document does not identify who 'we' are. ${invoiceClock}`; trigger = null; issue = "The certificate recipient is not identified."; break;
    case 4: text = `The ${p.amount} installment for ${p.a} is invoice-eligible when ${conditionText}. Two equally effective clauses set its due date at ${p.days} and ${p.days + 9} calendar days after invoice issuance. Neither overrides the other.`; due = null; issue = "Conflicting deadlines have no precedence rule."; break;
    case 5: text = `The ${p.amount} installment concerns either ${p.a} or ${p.b}; the document does not identify which. The relevant work must pass inspection. Payment is due on ${p.date}.`; trigger = null; due = { kind: "ON_DATE", date: p.date }; issue = "The work subject is not identified."; break;
    case 6: text = `Pay ${p.amount} ${p.days + 2} business days after (${conditionText}).`; due = null; status = "UNSUPPORTED"; issue = "Business-day calendars are unsupported."; break;
    case 7: text = `The ${p.amount} installment for ${p.a} is subject to pay-if-paid: the contractor owes it only if the owner first pays the contractor; timing depends on that external payment.`; trigger = null; due = null; status = "UNSUPPORTED"; issue = "Pay-if-paid is outside the supported vocabulary."; break;
    case 8: text = `The contractor's receipt of the certificate for ${p.a} makes its ${p.amount} invoice eligible. Customer receipt is not required. ${invoiceClock}`; trigger = null; status = "UNSUPPORTED"; issue = "Contractor receipt is outside the supported predicate."; break;
    case 9: text = `The supplier must receive the certificate covering ${p.a} to authorize its ${p.amount} invoice. It is supplier receipt that counts, not customer receipt. ${invoiceClock}`; trigger = null; status = "UNSUPPORTED"; issue = "Supplier receipt is outside the supported predicate."; break;
    case 10: text = `The ${p.amount} payment for ${p.a} is eligible when ${conditionText}. Its deadline must be calculated under applicable statutory prompt-payment rules; no explicit calendar date or interval is given.`; due = null; status = "UNSUPPORTED"; issue = "A statutory payment calendar requires separate interpretation."; break;
    case 11: text = `The ${p.amount} payment for ${p.a} becomes invoice-eligible only after a bank approves the contractor's credit application. ${invoiceClock}`; trigger = null; status = "UNSUPPORTED"; issue = "Credit-application approval is outside the supported event vocabulary."; break;
  }
  p.context.text = text;
  const expected: ExtractedClause = { schemaVersion: 1, amountRef, trigger, due, sourceIds: [p.context.sourceId], status, issues: [issue] };
  return { id: `v5-train-n-${index}`, family: `uncertainty-${kind}`, companyId: `v5-negative-company-${index}`, context: p.context, expected, provenance: "PUBLIC_SYNTHETIC typed uncertainty case with developer-reviewed rendering." };
}

export function buildV5Training() {
  const labels: LabeledExample[] = [];
  for (let repeat = 0; repeat < 12; repeat++) for (let pattern = 0; pattern < patterns.length; pattern++) labels.push(positive(repeat * patterns.length + pattern, pattern));
  for (let repeat = 0; repeat < 8; repeat++) for (let kind = 0; kind < 12; kind++) labels.push(negative(repeat * 12 + kind, kind));
  // Deterministic shuffle prevents batches ordered by class or template.
  labels.sort((a,b) => sha(a.id).localeCompare(sha(b.id)));
  for (const row of labels) validateExtraction(row.expected, row.context);
  const rows = labels.map(row => ({ prompt: [{ role: "user", content: extractionPromptV5(row.context) }], completion: [{ role: "assistant", content: JSON.stringify(row.expected) }] }));
  const files = { "train.jsonl": jsonl(rows), "train-labels.jsonl": jsonl(labels), "proof.jsonl": jsonl(rows.slice(0, 8)) };
  const manifest = {
    schemaVersion: 1, version: "greenlight-clauses-v5-reference-contract", promptProfile: EXTRACTION_PROMPT_PROFILE_V5,
    promptContractSha256: sha(extractionPromptV5({ sourceId: "PROMPT_CONTRACT", text: "", amountRefs: [], subjects: [] })),
    dataClassification: "PUBLIC_SYNTHETIC", publicationPolicy: "Fictional generated clauses only; no customer, sponsor-record, credential or production-trace data.",
    trainingCount: labels.length, statusCounts: Object.fromEntries(["PROPOSED", "AMBIGUOUS", "UNSUPPORTED"].map(s => [s, labels.filter(row => row.expected.status === s).length])),
    compositionFamilies: patterns.length, uncertaintyFamilies: 12,
    labelAuthority: "Typed synthetic scenarios rendered into reviewed language; developer review, not independent customer adjudication.",
    splitPolicy: "Training generator never reads development or final cases. Opaque IDs and shuffled multi-reference tables remove old category/position shortcuts. Separate authored development and final prose is required.",
    hashes: Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, sha(bytes)])),
  };
  return { labels, files, manifest };
}

async function main() {
  const target = resolve("data/training/v5-reference-contract");
  const { files, manifest } = buildV5Training();
  try {
    const old = JSON.parse(await readFile(resolve(target, "manifest.json"), "utf8"));
    if (JSON.stringify(old) !== JSON.stringify(manifest)) throw new Error("Frozen v5 data differs; use a new data version.");
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  await mkdir(target, { recursive: true });
  for (const [name, bytes] of Object.entries(files)) await writeFile(resolve(target, name), bytes);
  await writeFile(resolve(target, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(JSON.stringify(manifest, null, 2));
}
if (process.argv[1]?.endsWith("generate-v5-training.ts")) main().catch(error => { console.error(error.message); process.exitCode = 1; });
