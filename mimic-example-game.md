# MIMIC — example game, 8 players, first 5 rounds (v1.1 rules)

Settings: 8 players, 2 Mimics, repair track 6, repair chance 60%, reactor cap 3 cells per round, scan cost 4 cells, fuse 3, start with 2 scrap and 0 cells.

Pipes: Reactor–Cargo, Cargo–Steering, Steering–Med bay, Med bay–Oxygen, Oxygen–Reactor, Reactor–Med bay (cross).

**Players:** Ann, Bo, Cara, Dev, Eva, Fin, Gus, Hana.
**Secret roles:** Dev and Gus are Mimics. Everyone else is crew. Only Dev and Gus know this, from the reveal card.

Every round every phone shows the same four taps: Room, Focus, `WORK`/`SABO`, Lock in. The "really did" column is what the server made of the taps. Nobody at the table sees it.

---

## Round 1

**Start:** scrap 2, cells 0, repair 0/6, nothing broken.

**Talk (150 s).** Nobody knows anything yet. Ann suggests the obvious plan: two people to the Cargo bay for scrap, four to the Med bay, two to the Reactor to start banking cells. Nobody argues. Dev says "I'll take Med bay". Gus says "Reactor for me".

**Act (60 s).**

| Player | Role | Room | Focus | Button | Really did |
|---|---|---|---|---|---|
| Ann | crew | Cargo bay | Cargo bay | WORK | work |
| Bo | crew | Cargo bay | Reactor | SABO | work (crew SABO means nothing) |
| Cara | crew | Med bay | Med bay | WORK | work |
| Dev | **Mimic** | Med bay | Med bay | SABO | CORRUPT |
| Eva | crew | Med bay | Oxygen | WORK | work |
| Fin | crew | Med bay | Med bay | WORK | work |
| Gus | **Mimic** | Reactor | Oxygen | SABO | BREAK Oxygen |
| Hana | crew | Reactor | Reactor | WORK | work |

**Resolve.** Two legal sabotages from the Mimic team. The server picks one at random: Dev's Corrupt. Gus's Break is dropped and Gus simply works in the Reactor. Nobody is told.

- Reactor: 2 workers, +2 cells (cap is 3). Cells 0 → 2.
- Cargo bay: 2 workers, +4 scrap. Scrap 2 → 6.
- Med bay: 4 workers, 4 attempts, 4 scrap spent. Scrap 6 → 2. First attempt is the corrupted one, fails. Three clean rolls at 60%: success, fail, success. Repair 0 → 2.

**TV shows**

| Room | Who | Result |
|---|---|---|
| Reactor | Gus, Hana | +2 power cells |
| Cargo bay | Ann, Bo | +4 scrap |
| Steering | – | – |
| Oxygen | – | – |
| Med bay | Cara, Dev, Eva, Fin | +2 repair (4 attempts) |

Repair 2/6 · Scrap 2 · Cells 2. No vote, X-ray offline.

**Table reaction.** "Two out of four, a bit unlucky." Nobody thinks twice.

---

## Round 2

**Start:** scrap 2, cells 2, repair 2/6.

**Report.** Nothing broken, no fuse ticks.

**Talk.** Same plan. Fin says he will swap to the Reactor and Hana can take the Med bay. Dev stays in the Med bay, "I've got the rhythm". Gus stays in the Reactor.

**Act.**

| Player | Role | Room | Focus | Button | Really did |
|---|---|---|---|---|---|
| Ann | crew | Cargo bay | Cargo bay | WORK | work |
| Bo | crew | Cargo bay | Steering | WORK | work |
| Cara | crew | Med bay | Reactor | WORK | work |
| Dev | **Mimic** | Med bay | Med bay | SABO | CORRUPT |
| Eva | crew | Med bay | Med bay | SABO | work |
| Fin | crew | Reactor | Reactor | WORK | work |
| Gus | **Mimic** | Reactor | Oxygen | SABO | BREAK Oxygen |
| Hana | crew | Med bay | Oxygen | WORK | work |

**Resolve.** Two legal sabotages again. This time the random pick is Gus's Break. Dev's Corrupt is dropped, Dev works.

- Oxygen breaks. Fuse set to 3.
- Reactor: 2 workers, +2 cells. Cells 2 → 4.
- Cargo bay: +4 scrap. Scrap 2 → 6.
- Med bay: 4 attempts, 4 scrap spent. Scrap 6 → 2. No corrupt this time. Rolls: success, success, fail, success. Repair 2 → 5.

**TV shows**

| Room | Who | Result |
|---|---|---|
| Reactor | Fin, Gus | +2 power cells |
| Cargo bay | Ann, Bo | +4 scrap |
| Steering | – | – |
| Oxygen | – | **BROKEN, fuse 3** |
| Med bay | Cara, Dev, Eva, Hana | +3 repair (4 attempts) |

Repair 5/6 · Scrap 2 · Cells 4.

**Table reaction.** Good Med bay round, but Oxygen is broken. Bo does the pipe check out loud: "Oxygen touches the Med bay and the Reactor. So it was one of Cara, Dev, Eva, Hana, Fin or Gus. Ann and I were in the Cargo bay, we couldn't reach it." Six suspects, two cleared. Someone has to fix Oxygen in round 3 or 4, or the ship is lost at the start of round 5.

Dev, quietly pleased: he did nothing this round, and the break happened anyway. Gus's action is now hidden inside a crowd of six.

---

## Round 3

**Start:** scrap 2, cells 4, repair 5/6, Oxygen broken.

**Report.** Oxygen fuse 3 → 2.

**Talk.** Fin volunteers to fix Oxygen. Only one repair point is needed. With 2 scrap the Med bay can only make 2 attempts, so Ann goes to the Cargo bay to top up. Three to the Med bay: Cara, Dev, Eva. The rest to the Reactor to bank cells for the first scan: Bo, Gus, Hana.

**Act.**

| Player | Role | Room | Focus | Button | Really did |
|---|---|---|---|---|---|
| Ann | crew | Cargo bay | Cargo bay | WORK | work |
| Bo | crew | Reactor | Reactor | WORK | work |
| Cara | crew | Med bay | Steering | WORK | work |
| Dev | **Mimic** | Med bay | Med bay | SABO | CORRUPT |
| Eva | crew | Med bay | Med bay | WORK | work |
| Fin | crew | Oxygen | Oxygen | WORK | work (repairs) |
| Gus | **Mimic** | Reactor | Reactor | SABO | STEAL 2 cells |
| Hana | crew | Reactor | Oxygen | SABO | work |

**Resolve.** Random pick: Dev's Corrupt. Gus's Steal is dropped.

- Oxygen: broken with 1 worker. Fin repairs it, fuse cleared. Fin is the consumed worker, and Oxygen produces nothing anyway.
- Reactor: 3 workers, +3 cells, exactly the cap. Cells 4 → 7.
- Cargo bay: 1 worker, +2 scrap. Scrap 2 → 4.
- Med bay: 3 attempts, 3 scrap spent. Scrap 4 → 1. First attempt corrupted, fails. Two clean rolls: fail, success. Repair 5 → 6. **X-ray online.**

**TV shows**

| Room | Who | Result |
|---|---|---|
| Reactor | Bo, Gus, Hana | +3 power cells |
| Cargo bay | Ann | +2 scrap |
| Steering | – | – |
| Oxygen | Fin | repaired |
| Med bay | Cara, Dev, Eva | +1 repair (3 attempts) — **X-RAY ONLINE** |

Repair 6/6 · Scrap 1 · Cells 7.

**Vote.** X-ray is online and there are 7 cells, more than the 4 a scan costs. The vote runs.

Bo: "Three rounds of Med bay. Eleven attempts, six repairs. That's about what the dice give, so I can't point at anyone from the numbers. But Dev has been in there every single round." Dev: "So have Cara and Eva, twice each. And the round I was in, we got three." Cara: "Hana was in the Med bay for the Oxygen break too." Everyone taps.

First ballot, all public on the TV:

| Voter | Vote |
|---|---|
| Ann | Dev |
| Bo | Dev |
| Cara | Hana |
| Dev | Cara |
| Eva | Dev |
| Fin | Skip |
| Gus | Cara |
| Hana | Cara |

Dev 3, Cara 3, Hana 1, Skip 1. Two players tied at the top → **runoff** between Dev and Cara. Skip is gone. Dev cannot vote for Dev, Cara cannot vote for Cara.

| Voter | Runoff vote |
|---|---|
| Ann | Dev |
| Bo | Dev |
| Cara | Dev |
| Dev | Cara |
| Eva | Dev |
| Fin | Cara |
| Gus | Cara |
| Hana | Cara |

Dev 4, Cara 4. Tied again → **no scan, no cells spent.** Cells stay at 7.

**Table reaction.** Groans. Fin admits he voted Cara "because she voted Hana, which felt like a deflection". Gus has now voted Cara twice, which is on the TV for the rest of the game.

---

## Round 4

**Start:** scrap 1, cells 7, X-ray online, nothing broken.

**Report.** Nothing to tick.

**Talk.** The Med bay is finished, scrap is useless now. The Reactor can only make 3 cells a round, so Bo proposes the guard tactic: "Only three of us go to the Reactor. If cells go missing, it was one of those three." Ann, Bo and Fin take it, the three people the tie left least suspected. Everyone else goes to the Cargo bay to stand around.

**Act.**

| Player | Role | Room | Focus | Button | Really did |
|---|---|---|---|---|---|
| Ann | crew | Reactor | Reactor | WORK | work |
| Bo | crew | Reactor | Cargo bay | WORK | work |
| Cara | crew | Cargo bay | Cargo bay | SABO | work |
| Dev | **Mimic** | Cargo bay | Reactor | SABO | BREAK Reactor |
| Eva | crew | Cargo bay | Steering | WORK | work |
| Fin | crew | Reactor | Reactor | WORK | work |
| Gus | **Mimic** | Cargo bay | Steering | SABO | BREAK Steering |
| Hana | crew | Cargo bay | Reactor | WORK | work |

Both Mimics can reach a breakable room from the Cargo bay: Reactor on one side, Steering on the other. Dev goes for the Reactor to cost the crew a cell. Gus goes for Steering to make someone waste a turn next round.

**Resolve.** Random pick: Dev's Break Reactor. Gus works.

- Reactor breaks, fuse 3. But three people are working there, so it is repaired in the same round. One of them, Bo, is consumed by the repair. The other two still produce: +2 cells. Cells 7 → 9. A break in a busy room cost the crew exactly one cell.
- Cargo bay: 5 workers, +10 scrap. Scrap 1 → 11. Nobody cares.

**TV shows**

| Room | Who | Result |
|---|---|---|
| Reactor | Ann, Bo, Fin | broken and repaired, +2 power cells |
| Cargo bay | Cara, Dev, Eva, Gus, Hana | +10 scrap |
| Steering | – | – |
| Oxygen | – | – |
| Med bay | – | – |

Scrap 11 · Cells 9.

**Vote.** Cells 9, scan costs 4. Hana: "The Reactor break tells us nothing, everyone was next to it. So we're back to the tie. I'm switching to Dev." Fin: "Me too."

| Voter | Vote |
|---|---|
| Ann | Dev |
| Bo | Dev |
| Cara | Dev |
| Dev | Cara |
| Eva | Dev |
| Fin | Dev |
| Gus | Cara |
| Hana | Dev |

Dev 6, Cara 2. Dev is scanned. 4 cells spent, cells 9 → 5. The TV pauses, then reveals: **Dev is a Mimic.** Dev is eliminated. Dev's phone switches to the spectator view and shows Dev that Gus is the other Mimic, which Dev already knew.

**Table reaction.** Cheering, then Eva: "Gus voted Cara three times and never once voted Dev." Gus: "Cara voted Hana on the first ballot, that looked like a dodge to me. And I was in the Reactor with Hana when Oxygen broke, so I'm not clear either, I know."

---

## Round 5

**Start:** 7 living players. Scrap 11, cells 5, X-ray online, nothing broken.

**Report.** Nothing to tick.

**Talk.** One Mimic left. Same Reactor guard: Ann, Bo, Fin. The other four go to the Cargo bay: Cara, Eva, Gus, Hana.

**Act.**

| Player | Role | Room | Focus | Button | Really did |
|---|---|---|---|---|---|
| Ann | crew | Reactor | Reactor | WORK | work |
| Bo | crew | Reactor | Oxygen | SABO | work |
| Cara | crew | Cargo bay | Cargo bay | WORK | work |
| Eva | crew | Cargo bay | Reactor | WORK | work |
| Fin | crew | Reactor | Reactor | WORK | work |
| Gus | **Mimic** | Cargo bay | Steering | SABO | BREAK Steering |
| Hana | crew | Cargo bay | Steering | WORK | work |

Gus is the only Mimic now, so his sabotage always lands.

**Resolve.**

- Steering breaks, fuse 3. Nobody is there, so it stays broken. It must be repaired in round 6 or 7, or the ship crashes at the start of round 8.
- Reactor: 3 workers, +3 cells. Cells 5 → 8.
- Cargo bay: 4 workers, +8 scrap. Scrap 11 → 19.

**TV shows**

| Room | Who | Result |
|---|---|---|
| Reactor | Ann, Bo, Fin | +3 power cells |
| Cargo bay | Cara, Eva, Gus, Hana | +8 scrap |
| Steering | – | **BROKEN, fuse 3** |
| Oxygen | – | – |
| Med bay | – | – |

Scrap 19 · Cells 8.

**Vote.** Bo: "Steering touches the Cargo bay and the Med bay. Nobody was in the Med bay. So it was one of the four in the Cargo bay: Cara, Eva, Gus or Hana. Ann, Fin and I are clear."

| Voter | Vote |
|---|---|
| Ann | Gus |
| Bo | Cara |
| Cara | Gus |
| Eva | Hana |
| Fin | Gus |
| Gus | Cara |
| Hana | Cara |

Gus 3, Cara 3, Hana 1. Tie → runoff Gus against Cara.

| Voter | Runoff vote |
|---|---|
| Ann | Gus |
| Bo | Cara |
| Cara | Gus |
| Eva | Cara |
| Fin | Gus |
| Gus | Cara |
| Hana | Cara |

Cara 4, Gus 3. Cara is scanned. Cells 8 → 4. The TV reveals: **Cara is crew.** Cara is now marked verified for the rest of the game and can never be scanned again.

**Table reaction.** Eva puts her head in her hands. Cara: "Told you." The suspect list for the Steering break is now Eva, Gus or Hana, and Gus has voted Cara five times in a row.

---

## Where the game stands after round 5

| | |
|---|---|
| Round | 5 of 10 complete |
| Living | 7 (Dev eliminated, Mimic) |
| Verified crew | Cara |
| Mimics alive | 1 (Gus, unknown to the crew) |
| Scrap | 19 (useless now) |
| Cells | 4, enough for exactly one scan next round |
| Broken | Steering, fuse 3, must be fixed in round 6 or 7 |
| Scans so far | 2 (one Mimic, one crew) plus one failed runoff |

Round 6 will need one person in Steering, three in the Reactor, and a vote among Eva, Gus and Hana. If the crew reads the vote log, Gus is in trouble. If Gus can get Hana scanned instead and keep breaking rooms, he needs to survive five more votes.

## What this game shows

- The X-ray came online in round 3. That is typical for 8 players.
- Only one sabotage per round landed, even though both Mimics pressed `SABO` every round. Each time the losing Mimic just worked and nobody noticed.
- Corrupt was invisible. The Med bay numbers never looked wrong.
- Breaks were the real evidence. Each break cleared the people who were out of pipe range.
- Breaking a busy Reactor cost the crew exactly one cell. Breaking an empty room cost them a whole turn later.
- The 3-cell cap plus the 4-cell scan cost meant a scan almost every round, but never two, and a stolen 2 cells would have skipped one.
- The runoff tie in round 3 wasted nothing but a round of scanning.
- The public vote log turned into the best evidence in the game.
