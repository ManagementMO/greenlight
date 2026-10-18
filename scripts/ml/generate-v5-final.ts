import { mkdir, readFile, writeFile } from "node:fs/promises";
import { type ExtractedClause, type Trigger, validateExtraction } from "../../lib/providers/extraction";
import { V5_GATE, v5PromptHash } from "../../lib/providers/evaluation-v5";
import { contextFor, jsonl, sha } from "./generate-v5-training";
import type { LabeledExample } from "./generate-data";

const atom=(condition:string,subject:string)=>({op:"ATOM",condition,subject}) as Trigger;
const all=(...children:Trigger[]):Trigger=>({op:"ALL",children}), any=(...children:Trigger[]):Trigger=>({op:"ANY",children});
const I=(s:string)=>atom("INSPECTION_PASSED",s),C=(s:string)=>atom("CUSTOMER_CERTIFICATE_RECEIVED",s),D=(s:string)=>atom("DELIVERY_CONFIRMED",s),
  A=(s:string)=>atom("PHASE_ACCEPTED",s),S=(s:string)=>atom("AGREEMENT_SIGNED",s),V=(s:string)=>atom("INVOICE_ACCEPTED",s);
type P=ReturnType<typeof contextFor>;
type Draft={text:string;trigger:Trigger|null;due?:ExtractedClause["due"];status?:ExtractedClause["status"];amountMissing?:boolean;issue?:string};

// Separately authored source wording; never call training's recursive prose renderer.
const simple:((p:P)=>Draft)[]=[
  p=>({text:`Release the ${p.amount} installment once the agreement covering ${p.a} bears the required signatures.`,trigger:S(p.a)}),
  p=>({text:`The billing milestone for ${p.amount} is confirmation that ${p.a} has been delivered.`,trigger:D(p.a)}),
  p=>({text:`Customer sign-off accepting the work on ${p.a} authorizes billing of ${p.amount}.`,trigger:A(p.a)}),
  p=>({text:`An inspection result marked PASSED for ${p.a} authorizes the ${p.amount} installment. Merely booking an inspection is insufficient.`,trigger:I(p.a)}),
  p=>({text:`For the ${p.amount} installment, the customer must have received the certificate covering ${p.a}. A copy reaching a supplier alone does not satisfy this contract.`,trigger:C(p.a)}),
  p=>({text:`The ${p.amount} installment becomes eligible once the customer accepts the earlier invoice ${p.priorInvoice}. This prerequisite concerns that earlier invoice, not issuance of the installment's new invoice.`,trigger:V(p.priorInvoice)}),
  p=>({text:`The customer's project manager is expressly authorized to receive certificates on the customer's behalf. Receipt by that manager of ${p.a}'s certificate makes ${p.amount} invoiceable.`,trigger:C(p.a)}),
  p=>({text:`The ${p.amount} milestone is unlocked when the customer confirms acceptance of ${p.a}. A draft invoice and a delivery estimate do not add further prerequisites.`,trigger:A(p.a)}),
];

function complex(p:P,k:number,style:number):Draft {
  const a=p.a,b=p.b,m=p.amount;
  switch(k){
    case 0:return {trigger:all(S(a),any(I(b),D(b))),text:style?`The ${m} milestone has a nonwaivable agreement-signature gate for ${a}. Its other gate is met by either a passed inspection or confirmed delivery of ${b}.`:`Do not bill ${m} until ${a}'s agreement is signed. Then either a passed inspection of ${b} or confirmation of its delivery clears the remaining requirement.`};
    case 1:return {trigger:any(all(I(a),C(a)),all(A(b),D(b))),text:style?`Billing ${m} is allowed by either complete route: ${a} has passed inspection with its certificate received by the customer; or ${b} has both customer work acceptance and delivery confirmation.`:`For ${m}, route one needs a passing inspection of ${a} plus customer receipt of its certificate. Route two needs customer acceptance of ${b} plus confirmed delivery. Either route alone suffices; mixing halves does not.`};
    case 2:return {trigger:all(any(D(a),I(a)),any(C(b),A(b))),text:style?`To invoice ${m}, clear a first gate with delivery confirmation or inspection passage for ${a}, and a second gate with customer certificate receipt or customer work acceptance for ${b}. Both gates are compulsory.`:`One of delivery confirmation/inspection passage for ${a} AND one of customer certificate receipt/work acceptance for ${b} are required before billing ${m}.`};
    case 3:return {trigger:any(C(a),all(S(b),D(b),V(b))),text:style?`There is a short route to the ${m} milestone: the customer has ${a}'s certificate. Otherwise complete all three for ${b}: signed agreement, confirmed delivery and customer acceptance of its invoice.`:`The customer receiving the certificate for ${a} is sufficient for ${m}. The alternative is a signed agreement, confirmed delivery, and customer-accepted invoice for ${b}; all three are necessary on that route.`};
    case 4:return {trigger:all(I(a),any(all(S(b),C(b)),all(A(a),V(a)))),text:style?`A passed inspection of ${a} is required for ${m} on every route. The additional route is either signature plus customer certificate receipt for ${b}, or customer acceptance of both the work and its invoice for ${a}.`:`Bill ${m} only if ${a} passes inspection AND either (${b}'s agreement is signed and the customer has its certificate) OR (${a}'s work and its invoice are both accepted by the customer). The inspection requirement applies to either alternative.`};
    case 5:return {trigger:any(all(S(a),V(a)),all(I(b),A(b))),text:style?`Either the signed-agreement/customer-accepted-invoice pair for ${a}, or the passed-inspection/customer-accepted-work pair for ${b}, unlocks ${m}. A complete pair is required.`:`For ${m}, the first option is signature of ${a}'s agreement together with customer acceptance of its invoice. The second option is inspection passage and customer acceptance of ${b}'s work. One option is enough.`};
    case 6:return {trigger:all(A(a),any(all(S(b),D(b)),all(I(a),V(a)))),text:style?`The ${m} invoice always needs customer acceptance of ${a}'s work. Beyond that, either ${b} has a signed agreement and confirmed delivery, or ${a} has a passed inspection and customer-accepted invoice.`:`Obtain customer acceptance of ${a} for ${m}. Also satisfy one pair: signature and delivery confirmation for ${b}; or inspection passage and invoice acceptance for ${a}.`};
    case 7:return {trigger:all(any(S(a),I(a)),any(A(b),V(b)),C(a)),text:style?`Three gates authorize ${m}: customer receipt of ${a}'s certificate; either agreement signature or inspection passage for ${a}; and either customer work acceptance or customer invoice acceptance for ${b}.`:`Customer receipt of the certificate for ${a} is mandatory for ${m}. Also obtain a signature or passing inspection for ${a}, and obtain either work acceptance or invoice acceptance by the customer for ${b}.`};
    case 8:return {trigger:any(all(S(a),I(a),C(a)),all(D(b),V(b))),text:style?`The ${m} billing milestone accepts a complete three-event route for ${a} (agreement signed, inspection passed, customer received certificate) or a complete two-event route for ${b} (delivery confirmed, customer accepted invoice).`:`Bill ${m} after either all of signature, inspection passage and customer certificate receipt for ${a}, or both delivery confirmation and customer invoice acceptance for ${b}.`};
    case 9:return {trigger:all(S(a),any(A(a),all(I(b),C(b)))),text:style?`First sign the agreement for ${a}; this is mandatory for ${m}. The remaining requirement is satisfied by customer acceptance of ${a}, or by a passed inspection and customer receipt of the certificate for ${b} together.`:`The ${m} invoice requires signature of ${a}'s agreement. On top of signature, customer acceptance of ${a} suffices; otherwise both inspection passage and customer certificate receipt for ${b} are required.`};
    case 10:return {trigger:any(all(D(a),C(a)),all(A(b),V(b))),text:style?`Complete one route to bill ${m}: confirmed delivery and customer receipt of the certificate for ${a}; OR customer acceptance of the work and of its invoice for ${b}.`:`${m} may be billed once ${a} has both delivery confirmation and customer certificate receipt. Independently, customer acceptance of both ${b}'s work and invoice can authorize the same billing.`};
    default:return {trigger:all(any(S(a),C(a)),any(D(b),V(b))),text:style?`Billing ${m} requires a choice from EACH pair: signature of ${a}'s agreement or customer receipt of its certificate; and delivery confirmation for ${b} or customer acceptance of its invoice.`:`For ${m}, meet both of these requirements. First, either sign ${a}'s agreement or have the customer receive its certificate. Second, either confirm delivery of ${b} or have the customer accept its invoice.`};
  }
}

function uncertainty(p:P,k:number):Draft{
  const a=p.a,b=p.b,m=p.amount;
  switch(k){
    case 0:return {text:`A passed inspection and customer receipt of the certificate for ${a} permit billing. The installment amount was omitted, and the supplied sums are not assigned to it.`,trigger:all(I(a),C(a)),amountMissing:true,status:"AMBIGUOUS",issue:"The installment amount is unidentified."};
    case 1:return {text:`${m} is eligible after signature of ${a}'s agreement and either customer acceptance or confirmed delivery of ${b}. The payment date and interval are both absent.`,trigger:all(S(a),any(A(b),D(b))),due:null,status:"AMBIGUOUS",issue:"The deadline is missing."};
    case 2:return {text:`The ${m} installment for ${a} has a payment deadline but no eligibility condition in the provided document.`,trigger:null,status:"AMBIGUOUS",issue:"Eligibility is unstated."};
    case 3:return {text:`The ${m} installment for ${a} becomes eligible when 'we' receive its insurance certificate. Nothing identifies the speaker or recipient of 'we'.`,trigger:null,status:"AMBIGUOUS",issue:"The certificate recipient is unidentified."};
    case 4:return {text:`The ${m} installment requires both inspection passage and customer receipt of ${a}'s certificate. Two equally effective clauses specify 10 and 30 calendar days after the same invoice issuance, with no precedence rule.`,trigger:all(I(a),C(a)),due:null,status:"AMBIGUOUS",issue:"The due intervals conflict."};
    case 5:return {text:`The ${m} installment follows passing inspection of either ${a} or ${b}, but the form fails to identify which work the payment concerns; this is an unresolved subject identity, not permission to choose either. Payment is due on ${p.date}.`,trigger:null,due:{kind:"ON_DATE",date:p.date},status:"AMBIGUOUS",issue:"The inspection subject is unresolved."};
    case 6:return {text:`After ${a} passes inspection, either delivery confirmation or customer acceptance of ${b} also is required. No figure identifies the installment amount; all three listed figures are for other payments.`,trigger:all(I(a),any(D(b),A(b))),amountMissing:true,status:"AMBIGUOUS",issue:"No listed amount binds to this installment."};
    case 7:return {text:`${m} is invoiceable after customer acceptance of ${a}. It is due ${p.days} calendar days after the relevant invoice is issued. Two invoices, ${p.invoice} and ${p.priorInvoice}, both concern this payment; the document fails to identify which issuance starts the clock.`,trigger:A(a),due:null,status:"AMBIGUOUS",issue:"The invoice anchor is unresolved."};
    case 8:return {text:`Pay ${m} eight business days after ${a}'s agreement is signed and either inspection of ${b} passes or its delivery is confirmed.`,trigger:all(S(a),any(I(b),D(b))),due:null,status:"UNSUPPORTED",issue:"Business-day calendars are unsupported."};
    case 9:return {text:`The ${m} installment is eligible after ${a} passes inspection and the customer has its certificate. Determine the deadline solely under statutory prompt-payment law; no contractual interval is supplied.`,trigger:all(I(a),C(a)),due:null,status:"UNSUPPORTED",issue:"Statutory timing needs separate interpretation."};
    case 10:return {text:`The ${m} payment for ${a} is contingent on the general contractor first receiving the owner's payment, under an express pay-if-paid term. Its timing depends on that receipt.`,trigger:null,due:null,status:"UNSUPPORTED",issue:"Pay-if-paid is unsupported."};
    case 11:return {text:`The only eligibility condition for ${m} is that the supplier receives the certificate for ${a}. Customer receipt is expressly unnecessary.`,trigger:null,status:"UNSUPPORTED",issue:"Supplier receipt is outside the supported condition vocabulary."};
    case 12:return {text:`The contractor, acting for itself rather than for the customer, must receive the certificate for ${a} to invoice ${m}.`,trigger:null,status:"UNSUPPORTED",issue:"Contractor receipt is outside the supported condition vocabulary."};
    case 13:return {text:`${m} is due on ${p.date}, provided the bank approves the contractor's credit application for ${a}.`,trigger:null,due:{kind:"ON_DATE",date:p.date},status:"UNSUPPORTED",issue:"Credit approval is an unsupported event."};
    case 14:return {text:`Once the customer accepts ${a}, ${m} must be paid within fifteen banking days.`,trigger:A(a),due:null,status:"UNSUPPORTED",issue:"Banking-day calendars are unsupported."};
    default:return {text:`The ${m} invoice for ${a} is eligible only after the customer's architect grants a design waiver. No inspection, delivery or work acceptance condition is substituted for that waiver.`,trigger:null,status:"UNSUPPORTED",issue:"A design waiver is outside the supported event vocabulary."};
  }
}

export function buildV5Final(){
  return Array.from({length:48},(_,index)=>{
    const p=contextFor("v5-final-protected",index);
    const d=index<8?simple[index](p):index<32?complex(p,(index-8)%12,Math.floor((index-8)/12)):uncertainty(p,index-32);
    const anchor=index%2?p.invoice:p.a;
    const due=d.due!==undefined?d.due:index<32&&index%5===0?{kind:"ON_DATE" as const,date:p.date}:index<32&&index%5===1?{kind:"CALENDAR_DAYS_AFTER_TRIGGER" as const,days:p.days}:{kind:"CALENDAR_DAYS_AFTER_INVOICE_ISSUED" as const,days:p.days,invoiceSubject:anchor};
    let clock="";
    if(d.due===undefined){
      if(due?.kind==="ON_DATE") clock=` Once eligible, the contractual due date is ${due.date}, with no additional offset.`;
      else if(due?.kind==="CALENDAR_DAYS_AFTER_TRIGGER") clock=` Payment is due ${due.days} calendar days after these eligibility conditions are met.`;
      else clock=` The relevant ${index%2?"invoice "+p.invoice+" for ":"invoice for "}${p.a} can be issued after eligibility. Payment comes due ${p.days} calendar days from that issuance, not eligibility. Invoice issuance alone does not mean customer acceptance or settlement.`;
    }
    p.context.text=d.text+clock;
    const expected:ExtractedClause={schemaVersion:1,amountRef:d.amountMissing?null:p.amountRef,trigger:d.trigger,due,sourceIds:[p.context.sourceId],status:d.status??"PROPOSED",issues:d.issue?[d.issue]:[]};
    validateExtraction(expected,p.context);
    return {id:`v5-final-${String(index+1).padStart(2,"0")}`,family:index<8?"final-atomic-"+index:index<32?"final-composition-"+(index-8)%12:"final-uncertainty-"+(index-32),companyId:`v5-final-company-${index}`,context:p.context,expected,provenance:"PUBLIC_SYNTHETIC fresh final prose, distinct namespaces and complete texts; no inference outputs used in authorship.",difficulty:index<8?"atomic":index<32?"nested":"uncertainty",labelRationale:d.issue??"Preserve the stated complete route structure, exact amount reference, and separately stated contractual clock."} satisfies LabeledExample&{difficulty:string;labelRationale:string};
  });
}
async function main(){
  const dir="data/evaluation/v5-final",rows=buildV5Final(),bytes=jsonl(rows);
  try{const prior=JSON.parse(await readFile(dir+"/manifest.json","utf8"));if(prior.frozen){if(prior.hashes["evaluation.frozen.jsonl"]!==sha(bytes))throw new Error("Frozen final changed; use a new final version.");console.log("Frozen final preserved");return;}}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}
  await mkdir(dir,{recursive:true});await writeFile(dir+"/evaluation.frozen.jsonl",bytes);
  await writeFile(dir+"/manifest.json",JSON.stringify({schemaVersion:1,version:"greenlight-v5-final",purpose:"final-evaluation",dataClassification:"PUBLIC_SYNTHETIC",promptProfile:"reference-contract-v5",promptContractSha256:v5PromptHash(),evaluationCount:48,statusCounts:{PROPOSED:32,AMBIGUOUS:8,UNSUPPORTED:8},strata:{atomic:8,nested:24,uncertainty:16},frozen:false,reviewStatus:"pending-review",gate:V5_GATE,hashes:{"evaluation.frozen.jsonl":sha(bytes)},boundary:"Fresh separately authored prose and identities, with overlapping abstract logic families. Not a new-logic-family or customer-contract benchmark."},null,2)+"\n");
  console.log(JSON.stringify({directory:dir,count:48,sha:sha(bytes)}));
}
if(process.argv[1]?.endsWith("generate-v5-final.ts"))main().catch(error=>{console.error(error.message);process.exitCode=1;});
