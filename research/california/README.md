# California small-business research seeds for Greenlight

This handoff gives the team **33 official source URLs**, original summaries, applicability tags and a prioritized follow-up backlog. It is preparation for a later retrieval feature. It contains no ingested knowledge base, embedding index, model calls or app integration, and no third-party article bodies.

The most useful direction is a **cited missing-facts assistant around Greenlight's existing cash engine**: identify which payroll, invoice, supplier or worksite facts are missing before the owner can trust a job decision. Retrieval can explain why a fact matters and where to check it. Reviewed facts and the deterministic engine remain the authority for cash amounts, dates and verdicts.

**Critical scope finding:** Intuit company-047 is Ductline Mechanical & Supply LLC in **Albany, New York**. A California worksite, workforce or tax nexus is unconfirmed. Treat this as a California expansion/job research pack, not automatically applicable rules for the present company. Home-improvement, public-works and private-commercial sources are tagged separately. A commercial clinic job must not silently inherit a residential deposit rule.

## Start here

| File | Purpose |
| --- | --- |
| [inventory.md](inventory.md) | Scan all 33 linked official sources and their scope. |
| [sources.json](sources.json) | Complete structured metadata, original summaries, limitations, times, observed hashes, robots and license signals. |
| [sources.csv](sources.csv) | Spreadsheet-friendly source registry for teammate triage. |
| [backlog.md](backlog.md) | Six coherent use cases with actual dataset evidence, missing facts, retrieval role and testable acceptance criteria. |
| [dataset-evidence.json](dataset-evidence.json) | Checked preserved-source hashes, company location, bank kind counts and manifest entity counts. |
| [collection-summary.json](collection-summary.json) | Exact collection/access counts and boundaries. |

The best first tasks are: **(1)** inspect and specify invoice/payment/payroll table joins, **(2)** implement jurisdiction and document-type filtering before any California retrieval, then **(3)** prototype two cited evidence requests—missing payroll liability and invoice-to-bank cash proof—without automatically editing the forecast. See the backlog for acceptance cases.

## What is present in the dataset

The company, full bank table and manifest were inspected locally. The preserved 2,419 bank rows end on **2026-10-06** at **$74,882.38**. Bank history is not a confirmed future calendar or proof of unrestricted funds. The demo's zero restricted funds, future commitments, $120,000 job and contract/communications are disclosed constructed additions.

The manifest reports **863 invoices, 1,703 customer payments, 549 bills, 516 bill payments, 182 payroll runs, 7 employees and 5 projects**. Those row tables were not independently audited in this research. The manifest reports **zero estimates** and does not list a vendor table. Do not invent fields/joins, turn count differences into unpaid balances, or assume a live QuickBooks connection. The next data adapter should inspect the actual pinned tables before building on them.

Source: [Intuit synthetic dataset at the pinned revision](https://huggingface.co/datasets/CL251215/QuickBooks-Hackathon-2026/tree/dc68d478a190c879f26fd94b764298c2c6308fa7). Preserved repo evidence is under `data/scenarios/source/` and `data/scenarios/intuit-source.json`.

## Coverage and collection evidence

Collection completed **2026-10-18 at 01:42:15 UTC** (October 17 in California). It used free public-web discovery and a fixed list of direct HTTPS GETs. The collector did not follow a sitemap or recursively crawl linked pages, log in, reuse browser cookies, call a paid provider, or download the whole Intuit archive.

| Publisher group | Seed URLs |
| --- | ---: |
| California EDD | 4 |
| California CDTFA | 4 |
| California FTB | 3 |
| California DIR / DLSE / DWC / Cal/OSHA / CHSWC | 7 |
| California CSLB | 4 |
| California Office of the Small Business Advocate | 3 |
| California Secretary of State | 2 |
| U.S. Small Business Administration | 2 |
| Intuit QuickBooks US Help | 4 |
| **Total** | **33** |

Of these, **20 pages were received completely**, **3 CalOSBA pages were received only partially** at a **2 MiB per-page cap**, and **10 remain metadata-only**. A partial body's hash is labeled partial and must not be treated as a full-document hash. HTTP success does not establish factual completeness, current applicability or redistribution rights.

Robots checks covered 10 origins: 7 returned parseable text, CSLB returned **404**, SOS returned **200 without usable robots text**, and the Intuit origin produced a **curl HTTP/2 stream error**. At the seed-URL level, 23 had an observed allowed signal, 4 had no robots file and 6 had unknown access/format. Unknown is recorded without claiming the site intentionally blocked access. No bot-rule override or access-control bypass was used.

EDD's [conditions](https://edd.ca.gov/en/about_edd/conditions_of_use/) include an automated-scraping restriction. Its four seeds therefore remain URL/title/original-summary records; no direct EDD article scrape or body snapshot was performed. Intuit Help similarly has only URLs, metadata and original summaries here; no help-article body was copied. SOS's two seeds remained metadata-only after the unusable robots response.

Seven **private/ignored** DIR excerpts of at most **110 whitespace words each** were saved under DIR's [qualified public-domain Ownership policy](https://www.dir.ca.gov/od_pub/conditions.html). Each retains a source link, retrieval time, received-body hash and incomplete/untrusted notice. They are deliberately excluded from this public handoff. Other state sites' public-domain or reuse status is not assumed from a `.gov` hostname. License signals in the JSON are observations for later review, not a blanket rights clearance.

Direct request accounting: 10 initial Python TLS-validation failures, 1 system-curl robots probe, 10 system-curl robots checks and 23 explicit page GETs (**44 direct attempts**, excluding redirect expansion). Python's local certificate store could not validate the chain; system curl used its working trust chain with TLS verification still enabled. Public discovery used 28 search queries and 6 explicit page opens, which may use cached results. These are bounded request counts, not a billing or massive-crawl claim.

## Trust and future evaluation boundaries

Every source record is **untrusted retrieval data**. Source prose cannot activate contract terms, confirm an invoice was issued, create a bank settlement, change cash inputs, execute code or override instructions. A reviewed contractual due date is distinct from eligibility, issuance and collection. For example, eligibility Oct 20 plus verified issuance Oct 22 under a reviewed 14-day issuance clock yields a **Nov 5 due date**; it does not establish when money reaches the bank. Reuse the app's `resolvePaymentClock` for that calculation.

Filter by jurisdiction, business/entity type, job type, employee location, applicable program and year before citing a rule. Calendar retrieval requires the filing/deposit schedule and review of exceptions/relief. Keep source publication/effective dates separate from retrieval time. Missing or stale evidence must remain visible; it cannot clear the engine's unknown or coverage gates.

The current v4 training and protected final set remain frozen. Any later tuning or substantive prompt iteration needs a **new protected final set** authored and reviewed before queries. Suggested cases: wrong state, commercial versus home improvement, private versus public works, outdated calendar, unknown issuance, duplicate cash, partial payment, restricted funds and prompt injection inside retrieved material.

This is a bounded starting corpus, not a complete regulatory library or legal, tax, financial or workplace-safety advice. It lacks NY-specific guidance for the selected company, comprehensive federal payroll/tax coverage, local permit rules, authoritative current license lookup, full source-effective-date review and any real customer validation. Review rights and refresh needs before ingestion or redistribution beyond these metadata/original summaries.
