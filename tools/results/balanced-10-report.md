# Balanced mode: 10-player simulation

Run date: 2026-09-12. Master seed: `20260912`. Total: **5,180 simulated games**.

The primary model produced **820 crew wins out of 1,000 games (82%)**. Its 95% Wilson interval is **79.5–84.3%**. This interval measures random sampling uncertainty within this bot model; it does not measure uncertainty about human behavior. The profile called `typical` is a chosen rules-aware, moderately coordinated scenario, not a profile fitted to actual players.

## Requested batches

Each row is a separate batch with unique game seeds, rather than a prefix of the same 1,000 games. Small batches can fluctuate sharply.

| Games | Crew wins | Mimic wins | Crew win rate | 95% Wilson interval |
|---:|---:|---:|---:|---:|
| 10 | 10 | 0 | 100% | 72.2–100% |
| 20 | 13 | 7 | 65% | 43.3–81.9% |
| 50 | 41 | 9 | 82% | 69.2–90.2% |
| 100 | 86 | 14 | 86% | 77.9–91.5% |
| 1,000 | 820 | 180 | **82%** | **79.5–84.3%** |

## Sensitivity to behavior

Each scenario has 1,000 games. The primary 1,000-game batch is reused in this table.

| Crew behavior | Mimic behavior | Crew win rate | 95% Wilson interval |
|---|---|---:|---:|
| Casual | Casual | 42.0% | 39.0–45.1% |
| Rules-aware, moderate coordination | Same | 82.0% | 79.5–84.3% |
| Highly coordinated | Highly coordinated | 88.3% | 86.2–90.1% |
| Casual | Highly coordinated | 18.1% | 15.8–20.6% |
| Highly coordinated | Casual | 91.0% | 89.1–92.6% |

These are scenario comparisons, not bounds on possible human results or proof of optimal play. There is no defensible single human win rate without playtest data. For equally skilled groups in these models, the results span roughly **42–88%**. A group that coordinates the repair roster and reads production reports reliably should be compared to the primary scenario; a loose party table is better represented by the casual scenario.

## Rules and engine fidelity

The harness calls the current TypeScript engine compiled into `packages/engine/dist`, including role assignment, round resolution, fuse ticks, first ballots, runoffs, scan costs, verification, elimination, and terminal checks. It uses `defaultSettings()` and `resolveSettings(..., 10)` directly:

- 7 crew and 3 Mimics; 10 rounds.
- X-ray target: 6 repairs; 60% success per eligible repair attempt.
- Scan cost: 5 cells; reactor output capped at 6 cells per round.
- Starting resources: 2 scrap, 0 cells; cargo produces 2 scrap per worker.
- One team sabotage per round; fuse length 3.
- Current Med bay smash rule, including same-round repair, is active.
- Public votes, no customized settings.

The old `tools/balance_sim.py` is not used: it implements older rules and does not model the current X-ray smash mechanic. The existing settings UI's hard-coded 58% estimate was not used to tune these bots and was not changed.

## Bot decisions

Crew starts from a publicly agreed roster. Broken rooms get repair assignments first. The remaining allocation weighs X-ray progress, scrap funding, and cells for scans. Once the scanner is online, the main profile reserves two Med bay workers so a same-round smash can be repaired. Every round the assignment is shuffled, with verified players prioritized for early slots. Actual crew actions can deviate from the plan.

Each player has a separate suspicion memory, persistent subjective biases, decision noise, and evidence decay. Bots infer sabotage from public room production, legal break reachability, and scan results. A poor Med bay result is only weak evidence because repairs are random. Reactor output at the production cap is not mistaken for evidence of sabotage. Bots propose scan targets, give verified speakers more influence, and may follow the group's preferred target. They favor scanning an unverified player whenever possible; this model has very little deliberate scan skipping.

Mimics know their own team and coordinate one saboteur per round. They compare legal breaks, Med bay corruption/smashing, and theft; account for predicted crew staffing, production loss, exposure, and voting heat; and sometimes choose a lower-ranked option. Other Mimics work their announced assignments. Mimic nominations and votes avoid teammates where possible. They do not see the crew's actual deviations or upcoming engine random draws.

| Parameter | Casual | Primary (`typical`) | Coordinated |
|---|---:|---:|---:|
| Chance of departing from roster | 20% | 8% | 2% |
| Subjective noise scale | 1.10 | 0.55 | 0.20 |
| Suspicion retained per round | 75% | 88% | 96% |
| Follow eligible group proposal | 45% | 70% | 90% |
| Desired online Med bay reserve | 1 | 2 | 2 |
| Mimic chooses among top 8 instead of best | 25% | 12% | 4% |

These parameters are explicit assumptions. The scenarios change several parameters together, so their differences cannot be attributed to any single parameter.

## What happened in the primary 1,000 games

- Crew caught all three Mimics in 820 games.
- Mimics won 170 games by reaching the relay and 10 by hull breach.
- X-ray became available at least once in every game, first appearing at round **3.03** on average.
- There were **4.77 scans** per game: **2.72 Mimic scans** and **2.05 crew scans** on average.
- Scanner-offline rounds averaged **3.08** per game; online-but-cell-short rounds averaged **0.38**.
- Med bay smashes averaged **1.90** per game.

Means count rounds actually played, including games that ended early. Production reports contain unusually useful evidence: a worker who sabotages does not produce. This model exploits that evidence and protects the X-ray deliberately, which helps explain why its result can differ substantially from a less organized table.

## Limits and validation

The simulation does not reproduce speech, convincing lies, bluffing about assignments, friendship, attention lapses, learning over successive games, or genuinely optimal adversarial strategy. Group discussion is represented by nominations and imperfect agreement. Even casual players share an initial resource plan, and all players submit legal actions and ballots on time. Mimics use a one-round heuristic rather than searching all long-term strategies. All of these can shift results in real play.

Bot functions receive the engine's `toPublicState()` whitelist plus their own separately initialized role/team memory. They never receive hidden submissions, resolved intents, other crew roles, or the engine's RNG. Engine and bot randomness use separate deterministic streams. All simulation actions and ballots are checked by the engine.

Validation passed: 6 simulator tests, including 108 complete games across all profile pairings, deterministic replay, hidden-information invariance, legal team sabotage, scanner backup allocation, capped-production inference, and Wilson interval checks. The existing 40 engine tests also passed.

## Reproduce

From the repository root:

```powershell
pnpm --filter @mimic/engine build
node --test tools/balance-sim.test.mjs
node tools/balance-sim.mjs 20260912
```

The CLI runs all requested batches and the four additional sensitivity scenarios. It overwrites `tools/results/balanced-10-results.json` and `tools/results/balanced-10-games.jsonl`. The Markdown report is a snapshot of this run, not regenerated by the CLI. A different master seed produces another sample; use the same source and engine revision to reproduce this one.

- `tools/balance-bots.mjs`: simulation-only behavioral model.
- `tools/balance-sim.mjs`: real-engine runner and aggregation.
- `tools/balance-sim.test.mjs`: validation tests.
- `tools/results/balanced-10-results.json`: settings, batch statistics, and intervals.
- `tools/results/balanced-10-games.jsonl`: per-game seeds, outcomes, and diagnostics.

No production game rules, seated bots, or balance estimates were modified.
