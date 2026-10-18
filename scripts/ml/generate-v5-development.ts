import { mkdir, readFile, writeFile } from "node:fs/promises";
import { type ExtractedClause, type Trigger, validateExtraction } from "../../lib/providers/extraction";
import { extractionPromptV5 } from "../../lib/providers/extraction-v5";
import { contextFor, sha, jsonl } from "./generate-v5-training";
import type { LabeledExample } from "./generate-data";

const atom = (condition: string, subject: string) => ({ op: "ATOM", condition, subject }) as Trigger;
const all = (...children: Trigger[]): Trigger => ({ op:"ALL", children });
const any = (...children: Trigger[]): Trigger => ({ op:"ANY", children });
type P = ReturnType<typeof contextFor>;
type Draft = { text: string; trigger: Trigger | null; due?: ExtractedClause["due"]; status?: ExtractedClause["status"]; missingAmount?: boolean; issue?: string };
const I = (s: string) => atom("INSPECTION_PASSED",s), C = (s: string) => atom("CUSTOMER_CERTIFICATE_RECEIVED",s),
  D = (s: string) => atom("DELIVERY_CONFIRMED",s), A = (s: string) => atom("PHASE_ACCEPTED",s),
  S = (s: string) => atom("AGREEMENT_SIGNED",s), V = (s: string) => atom("INVOICE_ACCEPTED",s);

// These full-clause renderers are authored separately from training's recursive verbalizer.
const drafts: ((p: P) => Draft)[] = [
  p => ({text:`The ${p.amount} retainer for ${p.a} is released ${p.days} calendar days following signature of its agreement.`,trigger:S(p.a),due:{kind:"CALENDAR_DAYS_AFTER_TRIGGER",days:p.days}}),
  p => ({text:`The customer is to pay ${p.amount} for ${p.a} on ${p.date}, subject to the customer's acceptance of the work.`,trigger:A(p.a),due:{kind:"ON_DATE",date:p.date}}),
  p => ({text:`For ${p.amount} to become invoiceable, ${p.a} must pass inspection and its insurance certificate must reach the customer. Neither requirement alone suffices.`,trigger:all(I(p.a),C(p.a))}),
  p => ({text:`${p.amount} may be invoiced when delivery of ${p.a} is confirmed or the customer accepts ${p.a}. Either event alone is enough.`,trigger:any(D(p.a),A(p.a))}),
  p => ({text:`The agreement for ${p.a} must first be signed. In addition, either delivery of ${p.b} must be confirmed or ${p.b} must pass inspection to invoice ${p.amount}.`,trigger:all(S(p.a),any(D(p.b),I(p.b)))}),
  p => ({text:`There are two independent ways to invoice ${p.amount}: a passed inspection of ${p.a} together with customer receipt of its certificate; OR confirmed delivery of ${p.b} together with customer acceptance of that work. Complete either route.`,trigger:any(all(I(p.a),C(p.a)),all(D(p.b),A(p.b)))}),
  p => ({text:`Invoicing ${p.amount} requires clearance from both lists: list one is delivery confirmation or passed inspection for ${p.a}; list two is customer acceptance of ${p.b} or customer receipt of its certificate. Select at least one event from each list.`,trigger:all(any(D(p.a),I(p.a)),any(A(p.b),C(p.b)))}),
  p => ({text:`A customer-held certificate for ${p.a} alone authorizes the ${p.amount} invoice. Alternatively, ${p.b} needs its agreement signed, delivery confirmed, and invoice accepted by the customer.`,trigger:any(C(p.a),all(S(p.b),D(p.b),V(p.b)))}),
  p => ({text:`${p.a} must pass inspection in every case. For the ${p.amount} invoice, also complete either the pair of agreement signature and customer certificate receipt for ${p.b}, or the pair of work acceptance and invoice acceptance by the customer for ${p.a}.`,trigger:all(I(p.a),any(all(S(p.b),C(p.b)),all(A(p.a),V(p.a))))}),
  p => ({text:`To invoice ${p.amount}, either sign ${p.a}'s agreement and obtain customer acceptance of its invoice, or have ${p.b} pass inspection and receive customer acceptance of that work. The two pairs are alternatives.`,trigger:any(all(S(p.a),V(p.a)),all(I(p.b),A(p.b)))}),
  p => ({text:`Customer acceptance of ${p.a} is mandatory for the ${p.amount} invoice. Alongside it, require either a signed agreement plus confirmed delivery for ${p.b}, or a passed inspection plus customer invoice acceptance for ${p.a}.`,trigger:all(A(p.a),any(all(S(p.b),D(p.b)),all(I(p.a),V(p.a))))}),
  p => ({text:`Invoice ${p.amount} only after all three gates clear: (1) agreement signature or passed inspection for ${p.a}; (2) customer work acceptance or customer invoice acceptance for ${p.b}; (3) customer receipt of ${p.a}'s certificate.`,trigger:all(any(S(p.a),I(p.a)),any(A(p.b),V(p.b)),C(p.a))}),
  p => ({text:`The ${p.amount} invoice can follow the three-part ${p.a} route (agreement signed, inspection passed, certificate received by customer), or the two-part ${p.b} route (delivery confirmed and invoice accepted by customer).`,trigger:any(all(S(p.a),I(p.a),C(p.a)),all(D(p.b),V(p.b)))}),
  p => ({text:`Signature of ${p.a}'s agreement is always needed to invoice ${p.amount}. After that, either customer acceptance of ${p.a} alone, or both inspection clearance and customer certificate receipt for ${p.b}, is sufficient.`,trigger:all(S(p.a),any(A(p.a),all(I(p.b),C(p.b))))}),
  p => ({text:`Invoice ${p.amount} on either of two complete pairs: confirmed delivery with customer certificate receipt for ${p.a}; or customer work acceptance with customer invoice acceptance for ${p.b}.`,trigger:any(all(D(p.a),C(p.a)),all(A(p.b),V(p.b)))}),
  p => ({text:`${p.amount} becomes invoiceable after meeting both requirements: either the agreement for ${p.a} is signed or its certificate reaches the customer; AND either delivery of ${p.b} is confirmed or its invoice is accepted by the customer.`,trigger:all(any(S(p.a),C(p.a)),any(D(p.b),V(p.b)))}),
  p => ({text:`The ${p.amount} installment requires inspection clearance for ${p.a} together with either customer acceptance or confirmed delivery of ${p.b}. The document omits the payment deadline.`,trigger:all(I(p.a),any(A(p.b),D(p.b))),due:null,status:"AMBIGUOUS",issue:"Payment timing is absent."}),
  p => ({text:`The payment for ${p.a} may be invoiced after its inspection passes. Its amount is not stated; none of the listed sums is linked to this payment.`,trigger:I(p.a),status:"AMBIGUOUS",missingAmount:true,issue:"No amount is linked to this installment."}),
  p => ({text:`The ${p.amount} invoice for ${p.a} becomes eligible when we receive the insurance certificate. The sender uses 'we' without identifying the receiving party.`,trigger:null,status:"AMBIGUOUS",issue:"The recipient is unidentified."}),
  p => ({text:`The ${p.amount} invoice for ${p.a} is eligible after a passed inspection and customer receipt of its certificate. One unsigned rider says 7 calendar days after issuance of ${p.invoice}; another equally effective rider says 21. No document has precedence.`,trigger:all(I(p.a),C(p.a)),due:null,status:"AMBIGUOUS",issue:"Payment deadlines conflict."}),
  p => ({text:`The ${p.amount} payment is due 8 business days after ${p.a} passes inspection and either ${p.b}'s delivery is confirmed or its work is accepted by the customer.`,trigger:all(I(p.a),any(D(p.b),A(p.b))),due:null,status:"UNSUPPORTED",issue:"Business-day counting is unsupported."}),
  p => ({text:`A supplier's receipt of the certificate for ${p.a}, without customer receipt, is the sole condition for invoicing ${p.amount}.`,trigger:null,status:"UNSUPPORTED",issue:"Supplier receipt is unsupported."}),
  p => ({text:`The ${p.amount} invoice for ${p.a} is permitted only after the contractor's bank approves a credit line.`,trigger:null,status:"UNSUPPORTED",issue:"Credit approval is outside the event vocabulary."}),
  p => ({text:`The ${p.amount} payment for ${p.a} is pay-if-paid and remains contingent on the general contractor first being paid by the owner. The deadline likewise depends on that payment.`,trigger:null,due:null,status:"UNSUPPORTED",issue:"Pay-if-paid is unsupported."}),
];

export function buildV5Development() {
  return drafts.map((make,index) => {
    const p=contextFor("v5-development",index), d=make(p);
    const due = d.due === undefined ? {kind:"CALENDAR_DAYS_AFTER_INVOICE_ISSUED" as const,days:p.days,invoiceSubject:p.invoice} : d.due;
    p.context.text=d.text + (d.due === undefined ? ` The relevant invoice is ${p.invoice} for ${p.a}; it can be issued later. Its payment deadline is ${p.days} calendar days after that invoice's issuance. Earlier invoice ${p.priorInvoice} is already settled.` : "");
    const expected: ExtractedClause={schemaVersion:1,amountRef:d.missingAmount?null:p.amountRef,trigger:d.trigger,due,sourceIds:[p.context.sourceId],status:d.status??"PROPOSED",issues:d.issue?[d.issue]:[]};
    validateExtraction(expected,p.context);
    return {id:`v5-dev-${index+1}`,family:`development-prose-${index+1}`,companyId:`v5-dev-company-${index+1}`,context:p.context,expected,provenance:"PUBLIC_SYNTHETIC separately authored development prose; not final evaluation or training.",labelRationale:d.issue??"Literal prerequisite grouping, amount selection and stated clock anchor."} satisfies LabeledExample & {labelRationale:string};
  });
}
async function main(){
  const dir="data/evaluation/v5-development"; const rows=buildV5Development(), bytes=jsonl(rows);
  try {
    const prior=JSON.parse(await readFile(dir+"/manifest.json","utf8"));
    if(prior.frozen) {
      if(prior.hashes["evaluation.frozen.jsonl"]!==sha(bytes)) throw new Error("Frozen development corpus differs; create a new version.");
      console.log(JSON.stringify({directory:dir,count:rows.length,sha:sha(bytes),preservedFrozenManifest:true})); return;
    }
  } catch(error) { if((error as NodeJS.ErrnoException).code!=="ENOENT") throw error; }
  await mkdir(dir,{recursive:true}); await writeFile(dir+"/evaluation.frozen.jsonl",bytes);
  await writeFile(dir+"/manifest.json",JSON.stringify({schemaVersion:1,version:"greenlight-v5-development",promptProfile:"reference-contract-v5",promptContractSha256:sha(extractionPromptV5({sourceId:"PROMPT_CONTRACT",text:"",amountRefs:[],subjects:[]})),dataClassification:"PUBLIC_SYNTHETIC",purpose:"development-only",evaluationCount:rows.length,frozen:false,reviewStatus:"pending-review",hashes:{"evaluation.frozen.jsonl":sha(bytes)}},null,2)+"\n");
  console.log(JSON.stringify({directory:dir,count:rows.length,sha:sha(bytes)}));
}
if(process.argv[1]?.endsWith("generate-v5-development.ts")) main().catch(error=>{console.error(error.message);process.exitCode=1;});
