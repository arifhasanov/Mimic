# MIMIC — phone app spec (v1.1)

Companion to `mimic-v1-build-spec.md`. Where the two disagree, this file wins for anything shown on a phone. The build spec still owns the engine, the TV and the transport (NestJS + Socket.IO behind a SvelteKit single-page frontend), except for the changes listed in section 9 of this file.

---

## 1. The threat

Everyone sits close together around one table, looking up at one TV. Any phone screen can be seen by the neighbours, by accident or on purpose. So the phone leaks a role if **any** of these differ between a crew member and a Mimic:

- what is on the screen (words, number of buttons, colours, icons, layout)
- how many taps it takes to finish
- how long it takes to finish
- where on the screen the taps land
- what the screen does on its own (lights up, vibrates, animates, shows a badge)

The spec must make all five identical for every living player in every phase. Not "similar". Identical.

---

## 2. The one rule that makes it work

**Every living player goes through exactly the same screens, with exactly the same buttons, in exactly the same order, every round. The phone never knows the player's role after the reveal card.**

This replaces the "crew sees WORK / WORK, alien sees WORK / SABO" idea. That idea still leaks: a neighbour who can read the labels learns the role from the labels themselves. The fix is to give **everyone** the same `WORK / SABO` buttons and let the server decide what they mean:

- A crew member who taps `SABO` simply works. Nothing happens, nothing is logged, nobody is told.
- A Mimic who taps `SABO` sabotages, if the choice is legal. If it is illegal, they work.

Because the crew's `SABO` is harmless, there is no dummy step anywhere. Every step is a real step for everyone, so nothing has to be faked to look real.

The same goes for the target. Everyone picks a **focus room** every round (their own room or a neighbour). For a worker it changes nothing. For a saboteur it says what gets hit.

---

## 3. Action flow, identical for every player

Four taps, four screens, every round, for everyone.

| Step | Screen | Buttons | Meaning for crew | Meaning for Mimic |
|---|---|---|---|---|
| 1 | **Room** | 5 room tiles in fixed map order | where you work | where you stand |
| 2 | **Focus** | your room + its pipe neighbours (3 or 4 tiles, see below) | ignored | sabotage target |
| 3 | **Action** | `WORK` and `SABO`, side by side | both mean work | `SABO` = sabotage the focus room |
| 4 | **Lock** | one button `LOCK IN`, plus `BACK` | | |

Then the phone shows the **Locked** screen: "Locked in. Look at the TV." with one `CHANGE` button that restarts at step 1. Both roles may change as often as they like until the phase ends. The last lock-in counts.

### Focus tiles

The focus screen lists the chosen room first and then its pipe neighbours, from the public pipe list in the build spec, section 4. Every player in the same room sees the same tiles, whatever their role:

| Chosen room | Focus tiles |
|---|---|
| Reactor | Reactor, Cargo bay, Oxygen, Med bay |
| Cargo bay | Cargo bay, Reactor, Steering |
| Steering | Steering, Cargo bay, Med bay |
| Oxygen | Oxygen, Med bay, Reactor |
| Med bay | Med bay, Steering, Oxygen, Reactor |

Tiles are **not** marked legal or illegal for sabotage. A tile may show a small public "broken" marker, because that is on the TV anyway. A Mimic who picks a target that cannot be sabotaged works instead. That is their mistake to avoid, and the rulebook explains the matrix below.

### What `SABO` does, by focus (the focus rule, also in build spec section 7)

| Focus is | Effect |
|---|---|
| your own room, and it is the Med bay | `CORRUPT` one repair attempt |
| your own room, and it is the Cargo bay | `STEAL` 2 scrap |
| your own room, and it is the Reactor | `STEAL` 2 power cells |
| your own room, and it is Steering or Oxygen | `BREAK` it |
| a neighbour room that is breakable and not already broken | `BREAK` it |
| anything else | nothing, resolves as `WORK` |

This means the phone needs no `resource` field and no intent picker with three choices. One target, one button.

### Button order is shuffled

- The `WORK` / `SABO` pair is randomly left-right swapped **per player per round**.
- The focus tiles are randomly shuffled **per player per round**.
- The room tiles keep the fixed map order. Your room is public after resolution anyway, and a stable layout reduces mistakes.

So a neighbour who sees a thumb land bottom-left learns nothing over ten rounds.

### Timing is flattened

Mimics have more to think about, so they would naturally finish later. Remove the signal:

- Each screen ignores taps for the first **700 ms** after it appears.
- Every screen transition takes a random **300 to 900 ms** fade. Tap rhythm carries no information.
- The `ACT` phase always runs its full length on the phones. The TV may end the phase early when all have locked in (build spec section 6), but the phone shows the same Locked screen either way.
- The TV's "N of M locked in" counter updates on a **5-second tick**, not per submission, so nobody can match a tick to a neighbour lowering their phone.

Players should make their decision during `TALK`, when the phone shows nothing.

---

## 4. Vote flow

| Step | Screen | Buttons |
|---|---|---|
| 1 | **Ballot** | one tile per living player in seating order, plus `SKIP` |
| 2 | **Lock** | `LOCK IN`, `BACK` |

Runoff: the same screen with only the tied candidates and no `SKIP`. If you are a candidate, your own tile is present but disabled, so the layout has the same number of tiles for everyone at the table. Who the candidates are is public, so this hides nothing that is not already on the TV.

Ballots are public on the TV, so the vote screen needs no shuffling. Keep the 700 ms tap guard and the fade for consistency.

---

## 5. Every phone state

| State | When | Shows | Interaction |
|---|---|---|---|
| **Join** | `/` | room code, name, `JOIN` | form |
| **Lobby** | before start | "You're in. Look at the TV." | none |
| **Role reveal** | `ROLES` phase | a dark card with `HOLD TO REVEAL` | press-and-hold shows the role text; release hides it; may be repeated until the phase ends, then never again |
| **Waiting** | `REPORT`, `TALK`, `RESOLVE`, and any phase the player has nothing to do | "Look at the TV." | none |
| **Act** | `ACT` | the 4-step flow | 4 taps |
| **Locked** | after lock-in, until phase end | "Locked in. Look at the TV." + `CHANGE` | 1 tap to restart |
| **Vote** | `VOTE` | the 2-step flow | 2 taps |
| **Spectator** | eliminated | full state, all roles | scroll |
| **Game over** | `GAME_OVER` | "Game over. Look at the TV." | none |
| **Reconnecting** | socket lost | "Reconnecting…" | none (Socket.IO reconnects by itself; the client re-emits `rejoin` and the server resends full state) |

The Waiting screen is the same pixels for every role. It is what the phone shows for most of the game.

### Role reveal card

The card is the only moment the phone knows the role, and it is the most dangerous screen in the app.

- Same card size, same layout, same font, same line count for both roles. The crew card has filler lines of the same length as the Mimic card's teammate list (for example a random crew motto), so the amount of text on screen does not differ.
- Text appears only while the thumb is held down, and the card is small enough to cover with the other hand.
- No colour difference between roles. No icon. No "MIMIC" in a big font. Just small text.
- After the `ROLES` phase ends the client discards the role. It never needs it again (see section 6).
- The `ROLES` phase has a fixed length (30 s) so nobody notices who looked longer.

---

## 6. No role logic on the phone

After the reveal, the client must not hold or branch on the role. Concretely:

- The server sends every living player the **same** `actOptions` object at the start of `ACT`: `{ rooms, focus: Record<RoomId, RoomId[]>, actions: ['WORK','SABO'] }`. It is built from public state only and is deep-equal for every player. There is a unit test for this.
- The client renders those lists and nothing else. It has no pipe list, no breakable list, no legality logic.
- The `submitAction` socket event carries `{ token, room, focus, action: 'WORK' | 'SABO' }`. The engine derives an intent from it using the role held server-side (the focus rule, build spec section 7). A crew `SABO` becomes `WORK`. The acknowledgement is identical for a crew member and a Mimic.
- `privateState` is `{ role, mimicTeammates? }` and is sent **only during `ROLES`**, only to that player. Nothing role-specific is sent at any other time.

---

## 7. Visual rules

- Dark background, one dim accent colour, low overall brightness. The screen should be hard to read from a metre away and easy to read from thirty centimetres.
- Every button in the app is the same size, shape, colour and font. No red for sabotage, no green for work, no icons. Labels are one short word in a fixed-width button, so `WORK` and `SABO` occupy the same pixels.
- A tapped tile shows a thin outline only for the duration of the fade, then the next screen replaces it. No persistent highlighted selection sitting on screen.
- No screen ever shows a summary of what was chosen. Not on Lock, not on Locked. If a player wants to check, they tap `CHANGE` and redo it.
- No scrolling in Act or Vote. Five room tiles, four focus tiles and up to twelve name tiles must fit a 390 × 660 px viewport. Twelve names means a 2-column grid.
- Buttons live in the lower half of the screen so the phone can be held low, in the lap, tilted toward the body.
- One fixed-length fade is the only animation in the app. No spinners, no toasts, no snackbars, no confetti.
- Portrait only. Lock orientation via CSS and ignore landscape.
- Use the Screen Wake Lock API during `ACT` and `VOTE` so no one has to wake their phone at a different moment than the others. Release it during `TALK` so phones dim normally.
- No notifications, no vibration, no sound, no badge, no title-bar changes, no favicon changes. The phone never draws attention to itself.

---

## 8. Things that are not the app's job but go in the rulebook

- Hold the phone low and angled toward you. Glance, tap, put it down.
- Everyone lifts their phone when the TV says "Choose your action" and puts it down when it says "Locked in". Do not look at the phone at any other time.
- Silence other notifications before the game.
- Decide during the talk phase, not while holding the phone.
- Crew may press either button. It makes no difference. Do not try to be clever about it.
- Mimics: a `SABO` on a room you cannot legally sabotage is wasted. Learn the table in section 3.

---

## 9. Changes this file makes to the build spec

**Status: approved and applied to `mimic-v1-build-spec.md`.** The list is kept for the record.

1. **Section 7, actions.** Replace the `Intent` picker on the phone with the focus rule. The engine still has `WORK | BREAK | CORRUPT | STEAL` internally; the server derives them from `{ room, focus, action }` plus the role. Rule change to approve: `STEAL` happens only by focusing your own Cargo bay or Reactor, and the Reactor can only be `BREAK`-ed from a neighbour room (Cargo bay, Oxygen, Med bay), never from inside it. Simulated impact: none measurable.
2. **Section 13, `Submission`.** Becomes `{ playerId, room, focus, action }`. The `target` and `resource` fields go away.
3. **Section 14, events.** `submitAction { token, room, focus, action }`. `privateState` sends `{ role, mimicTeammates? }` during `ROLES` only. New broadcast-safe `actOptions { rooms, focus, actions }` sent to everyone at `ACT` start. Drop `legalIntents` and `legalBreakTargets`.
4. **Section 15, phone.** Replace with this file.
5. **Section 16, hidden information.** Requirement 4 becomes: "The action and vote flows send the same option payload to every living player, render the same DOM for every living player, and take the same number of taps." Requirement 5 becomes: "The client never holds a role string after the `ROLES` phase."
6. **Section 18, tests.** Add:
   - 12. `actOptions` built for a crew member and for a Mimic in the same game state are deep-equal.
   - 13. A crew submission with `action: 'SABO'` resolves as `WORK` and leaves no trace in the log or state.
   - 14. A Mimic focusing their own Med bay with `SABO` resolves as `CORRUPT`; own Cargo bay as `STEAL` scrap; own Reactor as `STEAL` cells; a breakable unbroken neighbour as `BREAK`; an unbreakable neighbour as `WORK`.
   - 15. Rendering the Act flow with the same `actOptions` and two different private states (crew, Mimic) produces byte-identical HTML.
   - 16. The client state after the `ROLES` phase contains no `role` or `mimicTeammates` key.
