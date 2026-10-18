# Greenlight — Signal system & launch

The design is authored and reviewed in [Paper](https://app.paper.design/file/01M56AKCMG8WN1327280QA4TJK). The earlier “Greenlight — Decision workspace” file is unchanged. This handoff contains design artifacts only; it does not change the deployed frontend.

- [Product directions](https://app.paper.design/file/01M56AKCMG8WN1327280QA4TJK/p-1-0): hero, owner-review workspace, evidence/clock story, and mobile decision.
- [Six launch frames](https://app.paper.design/file/01M56AKCMG8WN1327280QA4TJK/p-2-0): a 36-second film storyboard.
- [Design and motion specification](https://app.paper.design/file/01M56AKCMG8WN1327280QA4TJK/p-3-0): palette, typography, interaction rules, and timing notes.

## Direction

**Signal on a ledger.** The financial path is the central visual idea. A stepped cash path becomes a payment transfer and eventually resolves into the brand mark. Large exact amounts carry the story; labels and source references provide its authority. The interface stays white for work. Ink-green scenes are reserved for explaining evidence and measured learning.

Use the decision workspace as the first implementation reference. It puts the question, cash consequence, and proposed change on one surface. The right rail contains a proposal, not an accepted agreement. The first next question belongs below the chart because it explains which missing fact changes the decision.

## Product boards

| Export | Purpose | Details to preserve |
| --- | --- | --- |
| `01-brand-hero.png` | Introduce the business problem | “Take the job. Protect payroll.”; −$13k → $10k; a $23k timing change; same $120k total |
| `02-decision-workspace.png` | Main working direction | Actual engine-derived cash steps, labeled current/proposed paths, conserved payment rows, 2/2 scoped coverage, highest-value question, review boundary |
| `03-evidence-learning.png` | Explain the evidence and learning system | Verbatim synthetic contract excerpt, explicit AND structure, four distinct clock states, real measured MetaHarness result |
| `04-mobile-decision.png` | A focused 390px decision | Readable cash floor, compact labeled paths, payment schedule, one review action; no squeezed desktop table |

All eleven PNG exports have verified PNG signatures and dimensions in `export-integrity.json`. The clean Paper JSX exports live in `jsx/`; exact exported tokens are in `tokens.css`, and representative computed styles are in `computed-styles.json`. The JSX is a design reference, not production-ready app code. Keep the team’s existing state, accessibility, calculation, and hydration logic when translating it.

## Visual system

| Role | Value | Use |
| --- | --- | --- |
| Ink | `#10251C` | Primary text, evidence/story night scenes |
| Paper | `#FFFFFF` | Everyday workspace canvas |
| Ledger fog | `#EEF3EF` | Controls, grouped evidence surfaces |
| Deep green | `#176644` | Supported modeled paths, review actions |
| Signal green | `#32D17B` | One deliberate emphasis, conserved transfer, brand signal |
| Risk red | `#A53B43` | Current path breach; always paired with a readable label |
| Muted text | `#4A6053` | Secondary labels on white |
| Rule | `#D5DFD8` | Data lanes and quiet dividers |

Manrope is the display and interface family; IBM Plex Mono is for source labels, dates, and exact values. Both families were verified through Paper’s font tool. Explicit text family bindings were checked through computed styles, since typography written into a child does not automatically inherit an artboard’s font.

The broad scale is 88/94 display, 36/46 title, 16/26 body, and 11–13px labels. Specific boards use deliberate optical variations: the hero is 84/90, the mobile title is 33/38, and the launch opportunity figure is 202/218. Use the exact board export when reproducing a screen. Main spacing follows an 8px base, 24px panel padding, and 48–64px desktop outer space. Mobile uses 24px outer space. Rounded controls use a full pill; panels use concentric 32/24px or 26/20px enclosures only when they form a meaningful review surface.

## Numerical and evidence provenance

The workspace and mobile chart points were taken directly from `getScenario("ductline-phase-delay")`, `evaluateDecision`, and `applyProposal`, saved in `verified-cash-states.json`. They use stepped event-time interpolation. No smoothed curve or invented intermediate balances was substituted.

The original late-collection case reaches −$13,000 on November 4. Its $10,000 reserve requirement creates a $23,000 gap. The proposed deposit changes $42k → $65k, while the final receipt changes $48k → $25k; the $30k phase receipt remains unchanged. Total revenue stays $120k. The proposed minimum is $10k, and 2/2 declared scenarios preserve the reserve under the disclosed assumptions. This is a bounded proposal requiring agreement and actual collection, not a payment guarantee.

The source fixture’s current job is **Northstar Clinic HVAC retrofit**. Ductline’s source company is in Albany, New York. The prior “Harbor Exchange” design copy was corrected to Northstar Clinic so the proposed frontend direction matches the actual fixture.

The evidence and film clock deliberately use **illustrative separate inputs**: eligibility October 20, issuance October 22, and due date November 5, fourteen calendar days later. The existing default fixture has October 20 issuance and November 3 due date. Do not silently replace the fixture dates with the illustration. Its purpose is to show that invoice issuance is a separate observed event and a due date does not establish settlement. Settlement stays Unknown until collection evidence exists.

The shown AND tree is a target structure for explaining the source clause. It is not labeled as a successful generated v4 output. Root reported v4 training complete at 138/138 steps with 276 examples; the protected base/tuned comparison was still pending at design freeze. No fine-tuning quality improvement is claimed in these boards.

The MetaHarness numbers are from the actual recorded `data/artifacts/harness-experiment.json`: 18 → 6 provider requests, 20/21 correct in both runs, 15/21 decisive in both runs, and 0 false MET. Both workflows cache and use the same pinned Jev model, propositions, and available evidence. These results cover one predeclared synthetic localized-update workload of seven updates and 21 judgments. They are not a general production speedup claim.

## 36-second launch brief

Produce at 1920×1080, 30fps. The Paper frames are 1440×810, the same 16:9 ratio. Keep the 64px source safe area proportional when scaling. Use a calm, precise delivery, with one transition doing the explanatory work at each beat.

| Time | Visual action | Suggested spoken line |
| --- | --- | --- |
| 00–05 | Reveal $120,000 with a 12px rise and opacity. Introduce the signal path. | “One great job. Can your cash keep up?” |
| 05–11 | Carry the signal into the actual stepped cash path. Hold −$13k and its $23k reserve gap. | “A late payment can turn this job into a twenty-three-thousand-dollar reserve gap.” |
| 11–17 | Highlight AND in the clause, then reveal eligibility, issuance, due date, and settlement. Hold Unknown. | “Read the terms. Keep eligibility, issuance, due date, and collection separate.” |
| 17–24 | Transfer the $23k segment from final receipt to deposit. Anchor the unchanged $120k total. | “Bring twenty-three thousand forward. Same total. Ten thousand stays protected in both modeled cases.” |
| 24–30 | Compact eighteen request marks into six. Keep the quality figures anchored and unchanged. | “Learn a cheaper routine, then test it behind the same fixed gates.” |
| 30–36 | Resolve the cash path into the brand mark. Hold the URL for at least 2.8 seconds. | “Greenlight. Take the job. Protect payroll.” |

Default curve: `cubic-bezier(0.32, 0.72, 0, 1)`. Enter over 500ms, exit over 240ms, and stagger related labels by 80ms. Animate transform and opacity. For payment bars, use a dedicated transfer layer and anchored scale transforms rather than animating page layout width. For chart reveals, reveal the fixed factual geometry with a mask rather than altering data endpoints. The frame counter captions are storyboard navigation; they may be removed from a final public video. Keep the synthetic and review boundaries readable in the final film.

Hold each key numerical fact for at least two seconds. Avoid a fabricated money counter, fake typing, random glow, frantic agent-network effects, or implying that success metrics improve while the request count falls. Reduced motion should retain each scene’s final, readable state. This handoff is a storyboard, not a rendered motion video.

## Frontend translation priorities

1. Implement the decision hierarchy first: question → modeled cash floor → current/proposed paths → conserved proposal → highest-value question.
2. Preserve explicit review and source states. Unknown, conflicting, unsupported, and proposed should remain legible product states.
3. Keep current/proposed labels visible, alongside color. Maintain at least 44px touch targets for real mobile controls, readable focus states, and the current hydration safety behavior.
4. Expose the source clause and structured proposal on demand; do not turn every source into another dashboard card.
5. Use the evidence screen as an explanatory flow, while keeping the actual working screen focused on the next decision.

For the planned small-business knowledge feature, a source brief should carry jurisdiction, source, publication/effective date, and retrieval time beside each answer. Place it under Evidence or a contextual drawer. Confirm job location and nexus before selecting California guidance; do not infer them from an owner’s request for California research or from a New York source company. Retrieved guidance should remain distinct from book balances, contractual facts, and authorized changes. The current boards make no live QuickBooks connection or California-compliance claim.

Optional technical-demo proof, outside the core launch story: Sentry captured the response-amplification defect at 83,662,869 development output bytes; the later production regression returned 428,167 bytes while retaining 256 scenarios. These are separate environment runs and do not establish a latency improvement. Keep that precision if the team adds an engineering proof slide.

## Export notes

- `manifest.json` maps all Paper pages and artboards to exported files.
- `index.html` is an offline gallery of the exported boards; it is outside the app.
- Native Paper PNG and JSX exports succeeded. Native combined and single-board PDF export both returned “Error assembling PDF page.” No PDF was fabricated or substituted.
- All task artifacts are under ignored `work/design-paper/`. No frontend source, repo branch, paid-provider operation, or model budget was changed by this design task.
