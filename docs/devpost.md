# Headroom — Devpost copy

**Project name:** Headroom

**Tagline:** Take the next job. Keep room for payday. Headroom turns books, contracts and evidence into a tested cash plan—and improves its evidence workflow against fixed checks.

**Demo:** https://headroom-lahacks.vercel.app

**Repository:** https://github.com/ManagementMO/headroom

**Public submission:** https://devpost.com/software/headroom-dcu618

**Cover image:** [Headroom banner](../public/brand/headroom-banner.png)

**Logo:** [Transparent Headroom mark](../public/brand/headroom-mark.png)

This is the repository's submission narrative. The Devpost entry exists and is submitted; the team is replacing its placeholder video with the finished film. Track, sponsor-prize and AI-tool selections are owned by the team and are preserved during result updates.

## Inspiration

A small contractor wins a $120,000 job. It looks like growth. But materials must be bought now, payroll lands on Friday, and the customer pays after an inspection, an invoice, and a collection delay.

The owner does not need another chart saying revenue is up. They need an answer to one consequential question: **“Can we take this job without borrowing or missing payroll?”** And if the answer is conditional, they need to know what would make it work.

We built Headroom around that moment. The name is the promise: help a business create room for its next yes.

## What it does

Headroom connects a company's books, upcoming commitments, payment terms and supporting evidence into an inspectable job-funding decision. It shows where cash falls short, which assumption drives the gap, and the smallest supported payment change within the allowed options.

In our default demonstration, a $120,000 job reaches **negative $13,000** under the delayed collection path. Headroom proposes moving **$23,000 from the final payment to the deposit**. The payment schedule changes from **$42k / $30k / $48k** to **$65k / $30k / $25k**. Total revenue stays $120,000, and the worst modeled cash balance becomes **$10,000** across both declared scenarios.

The system also handles the uncomfortable cases. Two supplier overruns can each look affordable while their combination breaches the reserve. Missing payroll-tax information can prevent a supported verdict. Approval to invoice is not treated as money already in the bank.

## How we built it

We gave interpretation, arithmetic and learning separate responsibilities.

- **Books and deterministic cash engine:** Intuit's synthetic data anchors the starting cash position. A TypeScript engine uses integer cents, explicit dated obligations and bounded joint scenarios to calculate the cash path. Proposed changes preserve the contract total and are rechecked against every declared scenario.
- **Typed clause extraction:** Qwen is fine-tuned through Veri to propose bounded payment rules, including nested AND/OR conditions, source and amount references, invoice clocks, and explicit ambiguity. Schema and reference validation run before a proposal can be considered. Owner review remains required.
- **Evidence evaluation with Jev:** small, repeatable questions ask whether a particular prerequisite is met, not met, unknown or conflicting. Eligibility, actual invoice issuance, contractual due date and bank settlement remain separate events.
- **A measured MetaHarness:** Anthropic proposes a constrained workflow configuration for evidence selection, batching and dependency-aware caching. A separate evaluator compares it on the same fixed workload. The candidate cannot change the expected answers or financial rules.
- **Sentry:** errors, traces, AI spans, logs and masked replay make the full path inspectable. A real response-expansion defect led us to bound inputs, computation and output while preserving the worst-case timeline.

The public application is built with Next.js, React and TypeScript and deployed on Vercel. It runs deterministic decisions and replays genuine recorded provider experiments; public visitors do not allocate GPUs or spend model credits.

## Challenges we ran into

The hardest problems were the details that make a financial answer trustworthy. “Eligible to invoice,” “invoice issued,” “payment due,” and “cash received” sound similar in a chat response but can be weeks apart in a business. A misplaced OR in a payment condition can also change when an invoice is allowed.

Our V4 extractor improved JSON formatting but failed to produce useful supported interpretations. We kept every output, rejected it, and diagnosed gaps in nested logic and reference selection. V5 completed 300 training steps on a new 336-example corpus, with separately reviewed development and final sets and an exact tokenizer audit. Its first export regressed. Rematerializing the same saved adapter on the pinned BF16 base improved matched development material accuracy from 9/24 to 15/24. We froze that candidate before final queries.

On the same 48 untouched final cases, material-exact outputs improved **13 → 28**, fully valid outputs **41 → 45**, and correct supported proposals **9/32 → 19/32**. Incorrect validated proposals decreased **21 → 14**, but ambiguous-status accuracy regressed **7/8 → 6/8**. The stricter usefulness and safety gate rejected promotion. We report measured learning and remaining errors separately; financial decisions continue to use reviewed inputs. [All 96 actual final predictions](../data/artifacts/extraction-v5-evaluation.json) are public.

We also had to make experimentation affordable and recoverable. Local owner tooling reserves a bounded budget, checks active resources, keeps a durable spending ledger, and verifies that GPU resources are permanently stopped after a run.

## Accomplishments we're proud of

- A concrete path from a negative cash point to a reserve-preserving payment proposal, with the same contract revenue and a visible source trail.
- A real MetaHarness experiment that reduced **Jev requests from 18 to 6** while preserving **20/21 correct judgments, 15/21 decisive judgments and zero false `MET` judgments** on seven synthetic evidence updates. The remaining error is published too.
- Real fine-tuning, repaired export and matched final evaluation: **13/48 → 28/48** material-exact outputs, with every response preserved and the stricter gate still enforced.
- A real Sentry-discovered defect: an **83,662,869-byte** development response became a **428,167-byte** production regression response while retaining all 256 scenario summaries and the worst-case timeline. These are separate-environment size measurements, not a latency benchmark.
- A public, reproducible repository with the training data, frozen evaluation cases, actual predictions, source provenance, budget controls and a no-key demo rehearsal command.

## What we learned

Self-improvement needs a fixed definition of better. More valid JSON is not necessarily more correct interpretation, and fewer model calls are only valuable if correctness and useful coverage survive.

We also learned that a useful financial agent should make its uncertainty actionable. “We need the payroll-tax amount” or “this collection date depends on the customer's acceptance” helps an owner move forward. An unexplained confident number does not.

## What's next for Headroom

The team will refine the frontend, presentation and launch film around the new Headroom identity. Product work will focus on verified QuickBooks ingestion, invoice-to-bank matching and cited obligation discovery. We have prepared a 33-source California research pack, but retrieval is not yet integrated, and jurisdiction must be checked before applying it to a business.

For the model, the next milestone is stronger Boolean-condition fidelity and uncertainty handling on a broader independently adjudicated corpus, with a new untouched final set for the next candidate. The exposed V5 final is now historical evidence. We will preserve the reviewed financial engine and owner-approval boundary as the learning components improve.

## Built with

TypeScript · Next.js · React · Anthropic Claude · TypeSafe Jev · Qwen · QLoRA / TRL · Veri · Hugging Face · Intuit synthetic data · Sentry · Vercel · Paper

## Submission facts to keep accurate

The company books are supplied synthetic data; the future job, commitments, contract text and bounds are disclosed constructed additions. There is no live QuickBooks connection or customer outcome claim. The two collection scenarios are declared cases, not an exhaustive probability forecast. Payment changes are drafts requiring agreement. Fine-tuning quality claims use the latest completed, verified evaluation; [V5 results](extractor-v5-results.md) record completed training, development and final status separately. The Paper launch frames are a storyboard, not a finished video.

## Track-specific explanations

**Intuit:** We turn the provided company data into an actionable decision for a small-business owner. The adapter reconstructs 2,419 ledger rows to a $74,882.38 starting balance, with provenance and the available-cash assumption exposed. Headroom then asks whether a new job fits the existing obligations, identifies the collection bottleneck, and calculates a conserved payment change. It gives the owner a specific next action backed by inspectable arithmetic.

**Veri:** Veri runs the actual QLoRA/SFT, merged export and model-serving experiments. We version the training data and prompts, audit the actual tokenizer, separate development from final evaluation, and retain invalid outputs in the denominator. The contribution is an accountable learning loop whose release gate can reject a trained model.

**Sentry:** Sentry changed the implementation. A readable source-mapped error, trace and log exposed an oversized-response path, and the fix now bounds request size, scenario work and serialized output. Decision traces, AI spans and separately verified masked Replay make the workflow inspectable across the financial and model layers.

**Paper:** We used Paper for a separate design file with 11 artboards: four product directions, six film-storyboard frames and a design/motion handoff. Exported JSX, tokens and engine-derived cash coordinates let teammates implement the next iteration without turning a financial chart into decorative invented data.
