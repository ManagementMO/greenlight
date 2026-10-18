/** Prompts shared by every LLM contestant. Same documents, same definitions, same output rules. */
import type { BenchCase } from "./core";

export const SYSTEM = "You are a careful small-business finance analyst. Follow the definitions exactly. Reply with a single JSON object and nothing else.";

const DEFINITIONS = `DEFINITIONS
- Cash path: start from the settled cash balance. Apply every dated cash movement in date order. On the same date, payments out apply before payments in. Minimum cash is the lowest balance reached at any point, including the starting balance.
- Open items are facts that are uncertain. Each open item with a stated set of possibilities can resolve any of those ways, independently of the others. Evaluate every combination.
- A combination PASSES when minimum cash is at least the reserve.
- An open item with no stated possibilities (an unknown amount, or a disputed or unconfirmed fact) cannot be evaluated.`;

function itemsBlock(c: BenchCase) {
  return c.items.map((i) => `- ${i.id}: ${i.question}`).join("\n") || "- (none)";
}

export function directPrompt(c: BenchCase) {
  return `${DEFINITIONS}

STATUS (choose one)
- SUPPORTED: every combination passes.
- SHORTFALL: no combination passes.
- CONDITIONAL: some combinations pass and some fail.
- NEEDS_INPUT: any needed amount or condition is unknown, disputed or unconfirmed. This takes precedence over the other statuses.

DOCUMENTS
${c.documents}

OPEN ITEMS (the only valid ids for criticalItem)
${itemsBlock(c)}

QUESTION
Can the company take this job without cash falling below the reserve?

Return JSON with exactly these keys:
{"reasoning": "<at most 120 words>", "status": "SUPPORTED|SHORTFALL|CONDITIONAL|NEEDS_INPUT", "worstCaseMinimumCashUsd": <number, whole dollars, lowest minimum cash over all combinations; null if NEEDS_INPUT>, "criticalItem": "<id>"}
criticalItem: for CONDITIONAL, an open item such that one of its possibilities makes every remaining combination pass while another still leaves a failing combination. For NEEDS_INPUT, the item that blocks a verdict. Otherwise "none".`;
}

export const SLOTS = `existing-rent (baseline outflow), existing-payroll (baseline outflow), legacy-supplier (baseline outflow), job-deposit (job inflow), materials-one (job outflow, air-handler delivery), job-labor-one (job outflow), phase-receipt (job inflow, phase-one payment), job-labor-two (job outflow), materials-two (job outflow, controls and ductwork delivery), final-receipt (job inflow)`;

export function extractPrompt(c: BenchCase) {
  return `Extract the facts below into structured JSON. Do not compute balances, minimums or a verdict; a separate calculator will do that.

DOCUMENTS
${c.documents}

OPEN ITEMS
${itemsBlock(c)}

Fixed event slots (use exactly these ids, one entry each): ${SLOTS}.
Use whole US dollars as plain positive numbers (never negative; the slot already fixes whether money comes in or goes out) and ISO dates (YYYY-MM-DD). Use the year 2026.
- For an event whose date or amount is uncertain, put the FIRST stated possibility in "events" and list all possibilities in "uncertainties", using the open item id as the uncertainty id and "eventId" as the affected slot. Each option needs an "id", and a "date" and/or "amount" that differs.
- List in "blockers" the ids of open items that have no stated possibilities (unknown amount, or disputed or unconfirmed fact).

Return JSON exactly like:
{"opening": <number>, "reserve": <number>, "events": [{"id": "<slot>", "date": "YYYY-MM-DD", "amount": <number>}], "uncertainties": [{"id": "<open item id>", "eventId": "<slot>", "options": [{"id": "<short id>", "date": "YYYY-MM-DD", "amount": <number>}]}], "blockers": ["<open item id>"]}
"opening" is the settled cash balance; "reserve" is the minimum cash policy.`;
}
