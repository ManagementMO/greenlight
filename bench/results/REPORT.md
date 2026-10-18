# Greenlight benchmark report

Constructed cases. Ground truth is an independent oracle (bench/core.ts), checked against the engine by bench/check-oracle.ts. Invalid or missing output counts as wrong.

## dev

| Arm | Valid output | Status correct | False-safe | Verdict on NEEDS_INPUT case | Min-cash exact | Critical item | p50 / p95 latency | Cost / case |
|---|---|---|---|---|---|---|---|---|
| A. Base Claude, direct answer | 100% (40/40) | 98% (39/40) | 3% (1/30) | 0% (0/10) | 67% (20/30) | 85% (17/20) | 11.75s / 16.65s | $0.0127 |
| B. Base Qwen3-4B on Veri GPU (serving failed; not usable) | 33% (13/40) | 5% (2/40) | 23% (7/30) | 20% (2/10) | 0% (0/30) | 10% (2/20) | 0.16s / 9.99s | $0.0036 |
| G. Base Qwen3-4B (local), Qwen answers | 100% (40/40) | 33% (13/40) | 70% (21/30) | 90% (9/10) | 0% (0/30) | 30% (6/20) | 5.75s / 8.33s | $0 |
| H. Base Qwen3-4B (local) reads, Jev answers | 98% (39/40) | 48% (19/40) | 30% (9/30) | 0% (0/10) | 0% (0/30) | 55% (11/20) | 2.50s / 3.07s | $0.0001 |
| E. Claude + Jev (Claude answers, Jev attached) | 100% (40/40) | 98% (39/40) | 3% (1/30) | 0% (0/10) | 67% (20/30) | 85% (17/20) | 11.86s / 16.80s | $0.0127 |
| F. Jev answers directly | 100% (40/40) | 53% (21/40) | 7% (2/30) | 0% (0/10) | 0% (0/30) | 10% (2/20) | 0.09s / 0.17s | $0.0000 |
| C. Claude extracts, Greenlight engine decides | 100% (40/40) | 100% (40/40) | 0% (0/30) | 0% (0/10) | 100% (30/30) | 100% (20/20) | 5.37s / 7.20s | $0.0104 |
| D. Gold structure + Greenlight engine (ceiling) | 100% (40/40) | 100% (40/40) | 0% (0/30) | 0% (0/10) | 100% (30/30) | 100% (20/20) | 0.00s / 0.00s | $0 |

Columns: false-safe = said SUPPORTED when the truth was not, out of all not-SUPPORTED cases. Verdict on NEEDS_INPUT = gave a definite SUPPORTED/SHORTFALL verdict when evidence was missing. Min-cash exact is over cases with a computable minimum.

## test

| Arm | Valid output | Status correct | False-safe | Verdict on NEEDS_INPUT case | Min-cash exact | Critical item | p50 / p95 latency | Cost / case |
|---|---|---|---|---|---|---|---|---|
| A. Base Claude, direct answer | 100% (30/30) | 100% (30/30) | 0% (0/22) | 0% (0/7) | 83% (19/23) | 100% (15/15) | 14.18s / 19.78s | $0.0145 |
| B. Base Qwen3-4B on Veri GPU (serving failed; not usable) | 0% (0/30) | 0% (0/30) | 0% (0/22) | 0% (0/7) | 0% (0/23) | 0% (0/15) | 0.09s / 0.12s | $0.0036 |
| G. Base Qwen3-4B (local), Qwen answers | 100% (30/30) | 27% (8/30) | 55% (12/22) | 57% (4/7) | 0% (0/23) | 27% (4/15) | 5.32s / 7.62s | $0 |
| H. Base Qwen3-4B (local) reads, Jev answers | 97% (29/30) | 37% (11/30) | 45% (10/22) | 0% (0/7) | 0% (0/23) | 53% (8/15) | 2.42s / 3.02s | $0.0000 |
| E. Claude + Jev (Claude answers, Jev attached) | 100% (30/30) | 100% (30/30) | 0% (0/22) | 0% (0/7) | 83% (19/23) | 100% (15/15) | 14.29s / 19.91s | $0.0145 |
| F. Jev answers directly | 100% (30/30) | 37% (11/30) | 36% (8/22) | 57% (4/7) | 0% (0/23) | 0% (0/15) | 0.09s / 0.17s | $0.0000 |
| C. Claude extracts, Greenlight engine decides | 100% (30/30) | 100% (30/30) | 0% (0/22) | 0% (0/7) | 100% (23/23) | 100% (15/15) | 5.35s / 6.63s | $0.0104 |
| D. Gold structure + Greenlight engine (ceiling) | 100% (30/30) | 100% (30/30) | 0% (0/22) | 0% (0/7) | 100% (23/23) | 100% (15/15) | 0.00s / 0.00s | $0 |

Columns: false-safe = said SUPPORTED when the truth was not, out of all not-SUPPORTED cases. Verdict on NEEDS_INPUT = gave a definite SUPPORTED/SHORTFALL verdict when evidence was missing. Min-cash exact is over cases with a computable minimum.

## heldout

| Arm | Valid output | Status correct | False-safe | Verdict on NEEDS_INPUT case | Min-cash exact | Critical item | p50 / p95 latency | Cost / case |
|---|---|---|---|---|---|---|---|---|
| A. Base Claude, direct answer | 100% (20/20) | 90% (18/20) | 13% (2/15) | 20% (1/5) | 67% (10/15) | 80% (8/10) | 13.00s / 17.97s | $0.0141 |
| B. Base Qwen3-4B on Veri GPU (serving failed; not usable) | 0% (0/20) | 0% (0/20) | 0% (0/15) | 0% (0/5) | 0% (0/15) | 0% (0/10) | 0.10s / 0.12s | $0.0036 |
| G. Base Qwen3-4B (local), Qwen answers | 100% (20/20) | 35% (7/20) | 53% (8/15) | 60% (3/5) | 0% (0/15) | 40% (4/10) | 7.64s / 10.27s | $0 |
| H. Base Qwen3-4B (local) reads, Jev answers | 100% (20/20) | 30% (6/20) | 73% (11/15) | 60% (3/5) | 0% (0/15) | 20% (2/10) | 2.93s / 3.46s | $0.0001 |
| E. Claude + Jev (Claude answers, Jev attached) | 100% (20/20) | 90% (18/20) | 13% (2/15) | 20% (1/5) | 67% (10/15) | 80% (8/10) | 13.10s / 18.31s | $0.0142 |
| F. Jev answers directly | 100% (20/20) | 35% (7/20) | 7% (1/15) | 0% (0/5) | 0% (0/15) | 0% (0/10) | 0.09s / 0.18s | $0.0000 |
| C. Claude extracts, Greenlight engine decides | 100% (20/20) | 90% (18/20) | 13% (2/15) | 0% (0/5) | 87% (13/15) | 90% (9/10) | 5.58s / 6.79s | $0.0109 |
| D. Gold structure + Greenlight engine (ceiling) | 100% (20/20) | 100% (20/20) | 0% (0/15) | 0% (0/5) | 100% (15/15) | 100% (10/10) | 0.00s / 0.00s | $0 |

Columns: false-safe = said SUPPORTED when the truth was not, out of all not-SUPPORTED cases. Verdict on NEEDS_INPUT = gave a definite SUPPORTED/SHORTFALL verdict when evidence was missing. Min-cash exact is over cases with a computable minimum.

## Speed and cost: Claude vs Claude + Jev (all splits)

n = 90 cases. Accuracy of both is identical (Jev's judgments are attached, Claude's answer is unchanged).

| Pipeline | p50 latency | p95 latency | mean latency | cost / case | cost / 1,000 cases |
|---|---|---|---|---|---|
| Claude alone | 12.86s | 18.75s | 12.63s | $0.01359 | $13.59 |
| Claude + Jev | 12.95s | 18.88s | 12.77s | $0.01366 | $13.66 |
| Jev alone (the added step) | 0.121s | 0.267s | 0.139s | $0.000063 | $0.063 |

Jev adds 1.1% latency and 0.46% cost on top of Claude. A Jev call is 91x faster and 215x cheaper than one Claude reasoning call, but it answers a different, narrower question (one proposition against evidence), so this is not an accuracy-equal substitute.

