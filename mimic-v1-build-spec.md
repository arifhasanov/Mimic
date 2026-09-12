# MIMIC — v1.1 build spec

Build a web app for a real-life social deduction party game called **MIMIC**.

---

## 0. Changes from v1.0 (read first)

v1.0 was simulated at 4000+ games per setting with heuristic bots (see `tools/balance_sim.py`). The crew won 90–98% of 8-player games, because the X-ray came online around round 3 and unlimited power cells let the crew scan almost the entire table. v1.1 fixes that by limiting how many scans the crew can afford. Every rule below is already updated; this list is only so the reader knows what moved.

| # | Change | v1.0 | v1.1 | Why |
|---|---|---|---|---|
| 1 | Reactor output is capped per round | +1 cell per worker, no limit | +1 cell per worker, **max `reactorCapCells` per round** (3 at 5–9 players, 6 at 10–12) | Scan supply was unlimited. This is the main balance dial; one cell of cap swings the crew win rate by ~30 points, so tune it in single steps and never together with another change |
| 2 | Scan cost | 2 power cells | **4 power cells** (5 at 10–12 players) | Together with the cap gives ~3–4 scans per game instead of 5–7 |
| 7 | Host settings | none | **Balance slider with 5 stops plus a Custom panel** (section 20) | Every table is different; the host tunes it before start and the TV shows what was chosen |
| 8 | New config keys | – | `medbaySeats` (max repair attempts per round, default unlimited) and `sabotagesPerRound` (`'team'` or `'each'`, default `'team'`) | Exposed in Custom. `medbaySeats: 3` moves the X-ray from round ~3 to round ~4 at every player count and is the recommended pace fix if the build phase feels too short |
| 9 | Tech stack | Node + Express + Socket.IO, React + Vite | **SvelteKit (static single-page build) for the frontend, NestJS + Socket.IO for the backend, one pnpm workspace with a shared pure engine package** | SvelteKit for routing and small pages, Nest for a structured stateful server with first-class Socket.IO; Nest serves the built frontend so it is still one process on one port |
| 3 | Alien count | 5–6 → 1, 7–9 → 2, 10–12 → 3 | **5 → 1, 6–9 → 2, 10–12 → 3** | A lone alien almost never wins. 5 players is a teaching game |
| 4 | Ship orientation | Nose on the left | **Nose on the right; ship flies left to right** | Matches the final map art |
| 5 | Pipe layout | Ring Steering–Reactor–Cargo–Med bay–Oxygen + cross Reactor–Med bay | **Ring Reactor–Cargo–Steering–Med bay–Oxygen + cross Reactor–Med bay** | Follows the walls in the art. Same topology (5-cycle plus one chord), balance unchanged |
| 6 | Repair success chance | 60% | 60% (unchanged); **40% is an approved variant** | 40% moves the X-ray from round ~3 to round ~4 and barely changes balance at 7–9 players. If used at 6 players, raise the reactor cap to 4 |

Simulated crew win rate under v1.1 (average table / sharp table): 6p 55/65%, 8p 60/72%, 10p 61/80%, 12p 49/70%. Random voting loses in every case, which is the point: the deduction has to matter.

The players sit together in one room. A shared screen (a TV or a laptop connected to a TV) shows the whole game state. Each player uses their own phone browser only to make secret choices. There is no in-app chat and there must not be one — all discussion happens out loud, face to face.

Your job is to build the server, the TV view, and the phone view. The server is authoritative for all game state and all randomness.

---

## 1. Tech constraints

- TypeScript everywhere. One pnpm workspace with three packages:

  ```
  packages/engine   pure game engine + shared types, no framework, Vitest
  apps/server       NestJS + Socket.IO, owns all game state and timers, Jest (Nest default)
  apps/web          SvelteKit (Svelte 5) frontend, Vitest
  ```

- **Frontend: SvelteKit in single-page mode.** `adapter-static` with `fallback: 'index.html'` and `export const ssr = false` in the root layout. SvelteKit is used for its routing, stores and build; it never runs on a server. Routes: `/` (join), `/play` (phone), `/host/[code]` (TV). The build output is a folder of static files.
- **Backend: NestJS with Socket.IO** (`@nestjs/websockets` + `@nestjs/platform-socket.io`). One `GameGateway` class handles every socket event in section 14. One `GamesService` holds every game in memory keyed by room code and runs the phase timers. A process restart ends every game in progress. That is acceptable for v1.
- **Hard requirement: the SvelteKit app is hosted by NestJS and served as an SPA on the same port as the socket.** There is no separate frontend server in production. Nest serves the SvelteKit build with `ServeStaticModule` (root `apps/web/build`, `exclude: ['/socket.io*']`, fallback to `index.html` for every path that is not a real file so `/play` and `/host/ABCD` work on refresh and on a fresh phone), and mounts Socket.IO on the same HTTP server at `/socket.io`. `pnpm build` builds the engine, then the web app, then the server; `node apps/server/dist/main.js` is the whole deployment, and players open `http://<host>:3000/` on their phones. Smoke test for the build: `GET /host/ABCD` returns `index.html` with 200, `GET /socket.io/?EIO=4&transport=polling` returns the Socket.IO handshake, both on port 3000.
- **Development:** two dev servers. Vite on 5173 for the web app, Nest on 3000. `vite.config.ts` proxies `/socket.io` to 3000 with `ws: true` so the client code is identical in dev and production (it always connects to `window.location.origin`).
- The engine package has zero dependencies and is imported by the server only. The web app imports only the **types** from it (`RoomId`, `PublicState`, the event payloads). No game logic ever runs in the browser.
- No authentication, no accounts. A game is identified by a 4-letter room code.
- Reconnection: on `join`, the server issues a `playerToken` (`crypto.randomUUID()`). The client stores it in `localStorage`. Socket.IO reconnects on its own; on every (re)connect the client emits `rejoin { code, token }` and the server immediately answers with the full current `state` and, if the phase calls for it, that client's `privateState` or `actOptions`, so a phone that drops mid-phase is whole again with no extra round trip.
- Private messages go to a socket id, never to a room. The server keeps `token → socket.id` per game and looks it up for every `privateState`, `actOptions` and `spectatorState` emit. Broadcasts go to the Socket.IO room named by the game code.
- All randomness goes through a single seedable RNG module (`createRng(seed)`) in the engine package. In test mode the seed is fixed so games are reproducible.
- Phase timers are server-side (`setTimeout` per game inside `GamesService`). The server sends `phaseEndsAt` as epoch milliseconds; clients render countdowns from that and never drive phase changes themselves.
- Tests: Vitest for the engine, the settings resolver and the payload whitelist (all in `packages/engine`). Jest for the gateway (Nest's `@nestjs/testing` with an in-process Socket.IO client). The identical-DOM test from the phone spec renders the Svelte component to a string with two different private states and compares the strings.
- Responsive: the TV view targets 1920x1080 landscape; the phone view targets a 390px-wide portrait screen.

---

## 2. The game in one paragraph

A spaceship crew is 10 rounds from a space station. Hidden among them are Mimics — aliens that look exactly like crew members. The crew must rebuild a broken X-ray machine in the Med bay, then vote each round on who gets scanned. The scanner reveals the truth: an alien scanned is killed. Aliens secretly sabotage the ship's systems, and secretly corrupt the X-ray repairs. If the crew kills every alien, the crew wins. If a broken system's fuse runs out, or if round 10 finishes with any alien alive, the aliens win.

---

## 3. Glossary

| Term | Meaning |
|---|---|
| Room | One of 5 locations on the ship |
| Pipe | A connection between two rooms; used only for sabotage range |
| Fuse | Countdown on a broken room. Reaches 0 → ship crashes |
| Scrap | Resource. Spent on X-ray repair attempts |
| Power cell | Resource. Spent on X-ray scans |
| Repair track | 0 to 6. At 6 the X-ray machine is online |
| Scan | Firing the X-ray machine at one voted player |
| Verified | A player publicly proven to be crew by a scan |

---

## 4. The ship

The ship flies **left to right**. Engines and the Reactor are at the stern on the left; Steering (the cockpit with the viewport) is at the bow on the right. Seen from above the deck plan is:

```
 stern                                        bow
 ┌────────────┬──────────────────┬──────────────┐
 │  Reactor   │    Cargo bay     │   Steering   │
 ├────────────┼──────────────────┴────┐         │
 │  Oxygen    │        Med bay        │─────────┘
 └────────────┴───────────────────────┘
```

Five rooms:

| Room id | Name | Position | Work output | Breakable |
|---|---|---|---|---|
| `reactor` | Reactor | top left | +1 power cell per worker, capped at `reactorCapCells` per round | yes |
| `cargo` | Cargo bay | top middle | +2 scrap per worker | no |
| `steering` | Steering | top right (bow) | nothing | yes |
| `oxygen` | Oxygen | bottom left | nothing | yes |
| `medbay` | Med bay | bottom middle and right | X-ray repair attempt | only once the X-ray is online, and only from a neighbour (see the smash, below) |

Pipes (undirected, exactly 6). They follow the shared walls in the art, plus the one diagonal pipe that runs from the Reactor down into the Med bay:

```
reactor  — cargo
cargo    — steering
steering — medbay
medbay   — oxygen
oxygen   — reactor
reactor  — medbay      (cross pipe, the diagonal)
```

Adjacency, derived from the pipe list (the server computes this, never hard-code it twice):

| Standing in | Connected rooms | `SABO` on own room does | Neighbours a `SABO` can BREAK (when not already broken) |
|---|---|---|---|
| `reactor` | cargo, oxygen, medbay | STEAL 2 cells | oxygen |
| `cargo` | reactor, steering | STEAL 2 scrap | reactor, steering |
| `steering` | cargo, medbay | BREAK steering | – |
| `oxygen` | medbay, reactor | BREAK oxygen | reactor |
| `medbay` | steering, oxygen, reactor | CORRUPT | steering, oxygen, reactor |

Movement is unrestricted: a player may choose any room every round. Pipes matter only for sabotage range.

---

## 5. Roles

Assigned once at game start, randomly, never shown to anyone else.

| Players | Aliens | Reactor cap (cells per round) | Scan cost (cells) |
|---|---|---|---|
| 5 | 1 | 3 | 4 |
| 6–9 | 2 | 3 | 4 |
| 10–12 | 3 | 6 | 5 |

These are the **Balanced** slider values (section 20). Five players is a teaching game and is crew-favoured; six is the recommended minimum.

Aliens see the names of their fellow aliens on the role reveal screen, once, at the start. After that the app never mentions it again and never gives aliens any extra screen, message, notification, or badge. This is a hard requirement: any extra phone interaction would be visible to the table and would expose the alien.

---

## 6. Round structure

Rounds 1 through 10. Each round has 5 phases, run by a server-side timer. The TV shows the current phase and a large countdown. Phase lengths are config values.

| # | Phase | Default length | What happens |
|---|---|---|---|
| 1 | `REPORT` | 20s | Fuses tick down. Win checks run. TV shows ship status. |
| 2 | `TALK` | 150s | Players talk out loud. No app interaction. |
| 3 | `ACT` | 60s | Every player secretly submits a room + an action on their phone. |
| 4 | `RESOLVE` | 30s | Server resolves everything. TV reveals positions and per-room totals. |
| 5 | `VOTE` | 60s | Only if the scan conditions are met. Otherwise skipped entirely. |

If all living players have submitted during `ACT`, the phase may end early.

---

## 7. Actions

Every player submits exactly one action per round, and it has the same shape for everyone: `{ room: RoomId, focus: RoomId, action: 'WORK' | 'SABO' }`. `room` is where the player stands. `focus` is the player's own room or one of its pipe neighbours. `action` is one of two identical-looking buttons.

The engine derives an internal intent from the submission plus the role it holds. This is the **focus rule**, and it is the only place a role is ever read during resolution:

| Role | Action | Focus | Intent |
|---|---|---|---|
| Crew | anything | anything | `WORK` |
| Mimic | `WORK` | anything | `WORK` |
| Mimic | `SABO` | own room, and it is `medbay` | `CORRUPT` |
| Mimic | `SABO` | own room, and it is `cargo` | `STEAL` scrap |
| Mimic | `SABO` | own room, and it is `reactor` | `STEAL` cells |
| Mimic | `SABO` | own room, and it is `steering` or `oxygen` | `BREAK` own room |
| Mimic | `SABO` | a pipe neighbour that is breakable and not already broken | `BREAK` that room |
| Mimic | `SABO` | the Med bay from a pipe neighbour, once `xrayOnline` is true | `BREAK` the Med bay (the smash) |
| Mimic | `SABO` | anything else (unbreakable neighbour, already broken, not adjacent) | `WORK` |

Three consequences worth stating out loud: a Mimic can only `STEAL` by focusing their own Cargo bay or Reactor; the Reactor can only be `BREAK`-ed from a neighbour (Cargo bay, Oxygen or Med bay), never from inside it; and the Med bay is the mirror image — it can only be smashed from a neighbour (Reactor, Steering or Oxygen), because focusing it from inside is the `CORRUPT`. A crew `SABO` is harmless and leaves no trace anywhere.

Internal intents: `WORK`, `BREAK`, `CORRUPT`, `STEAL`. They exist only inside the engine and the log of the eliminated-player spectator view. The phone never sees them.

The phone screens are specified in `mimic-v1-phone-spec.md`. Every living player sees the same four screens with the same buttons every round.

### WORK

Resolved per room, after sabotage.

- If the room is broken → the room is repaired. See section 8, step 4.
- `reactor` → +1 power cell to the pool per worker, but the room never yields more than `reactorCapCells` in one round. Extra workers add nothing.
- `cargo` → +2 scrap to the pool.
- `medbay` → one X-ray repair attempt. Costs 1 scrap. 60% chance of +1 repair progress.
- `steering`, `oxygen` → nothing.

### BREAK

Valid if the target room is breakable, is currently not broken, and is either the Mimic's own room (Steering or Oxygen only) or connected to it by a pipe (see the adjacency table in section 4). Sets `broken = true`, `fuse = 3`.

**The Med bay smash.** The Med bay is not a hull system and never carries a fuse, but a finished X-ray is a machine like any other. Once `xrayOnline` is true, a Mimic standing in the Reactor, Steering or Oxygen may focus the Med bay: `repairProgress` drops by 1 and `xrayOnline` goes back to `false`. The room itself is never marked broken, so nothing can breach the hull from it — but there is no scan until the crew has farmed the scrap and won that repair back. It resolves before the Med bay work in step 6, so a crew that keeps people in the Med bay can win the repair back in the same round.

How the range limit is enforced, in three layers:

1. **Server computes the focus lists.** At the start of every `ACT` phase the server builds one `actOptions` object from public state only: for every room, the list of focus tiles (that room first, then its pipe neighbours). It is sent to **every** living player and is identical for all of them. The phone never has the pipe list; it only renders the array for the room the player tapped. Focus tiles are not marked legal or illegal.
2. **Phone shows only that list.** After the player picks a room, the focus screen lists exactly `actOptions.focus[room]`.
3. **Engine validates on resolve.** A `SABO` whose focus is not a legal target under the focus rule resolves as `WORK`. The endpoint rejects only malformed input (a room or focus that is not in `actOptions`); it must **not** reject an illegal-but-well-formed sabotage, because that response would differ between a crew member and a Mimic. The legality check is a pure function `isLegalBreak(state, room, target)` and is the single source of truth.

Room state does not change during `ACT`, so the list computed at phase start stays valid for the whole phase.

### CORRUPT

Derived from `SABO` with focus on the Mimic's own room when that room is `medbay`. Turns one repair attempt this round into a guaranteed failure. The scrap for that attempt is still spent.

### STEAL

Derived from `SABO` with focus on the Mimic's own room when that room is `cargo` (destroys `stealAmount` scrap, default 2) or `reactor` (destroys `stealAmount` power cells). The pool cannot go below 0.

---

## 8. Resolution algorithm — implement exactly in this order

Run at the start of `RESOLVE`.

1. **Fill defaults.** Any living player who did not submit gets `{ room: <their room last round, or 'cargo' in round 1>, focus: <that room>, action: 'WORK' }`.

1b. **Derive intents.** Apply the focus rule from section 7 to every submission, using the role held server-side. The result is an internal intent per player: `WORK`, or `BREAK target`, `CORRUPT`, `STEAL scrap|cells`. Crew always get `WORK`. Illegal Mimic choices get `WORK`.

2. **Pick the team sabotage.** Collect all derived intents from living Mimics where `intent !== 'WORK'`. If two or more legal sabotages remain, pick exactly one uniformly at random. All other aliens' intents silently become `WORK` in the room they chose. **At most one sabotage happens per round for the whole alien team.** Do not notify anyone about which one was picked. (With the Custom setting `sabotagesPerRound: 'each'`, skip the random pick and apply every legal sabotage; two CORRUPTs set `corruptedAttempts = 2`, two BREAKs break two rooms.)

3. **Apply the chosen sabotage.**
   - `BREAK` → target room `broken = true`, `fuse = 3`.
   - `CORRUPT` → set a flag `corruptedAttempts = 1` for this round's medbay resolution.
   - `STEAL` → subtract 2 from the named resource pool, floored at 0.

4. **Repair broken rooms.** For each broken room that has at least one worker this round: set `broken = false`, clear the fuse, and remove exactly one worker from that room's production list (pick at random among the workers there). **All remaining workers in that room still produce normally.** This is deliberate: a break always costs the crew exactly one action, never more.

5. **Produce resources.** For each remaining worker: `reactor` → +1 cell, `cargo` → +2 scrap. Then clamp this round's reactor output: `cellsGained = min(reactorWorkers × cellsPerReactorWorker, reactorCapCells)`. The cap applies after the repair step, so a Reactor that was broken and repaired this round produces from its remaining workers, still capped.

6. **Resolve the Med bay.** Let `n` be the number of remaining medbay workers, capped at `medbaySeats` (default unlimited). Process `n` attempts in random order:
   - If `scrap < 1`, the attempt does nothing and no scrap is spent.
   - Otherwise spend 1 scrap. If `corruptedAttempts > 0`, decrement it and the attempt fails. Otherwise roll: 60% → `repairProgress += 1`.
   - Cap `repairProgress` at 6. At 6, set `xrayOnline = true`.

7. **Build the public report.** Per-room totals only. Never per-player results, never individual dice rolls, never who sabotaged.

Example report objects the TV renders:

```
{ room: 'medbay',  workers: ['Eva','Fin','Gareth','Hugo'], summary: '+1 repair' }
{ room: 'reactor', workers: ['Ann','Bo'],                  summary: '+2 power cells' }
{ room: 'steering',workers: [],                            summary: 'broken, fuse 2' }
```

Player positions are public. Intents are never public.

---

## 9. Fuses and the crash

- A room broken in round N has `fuse = 3` immediately.
- At the start of every later `REPORT` phase, every broken room's fuse decreases by 1.
- If any fuse reaches 0 → the aliens win immediately, game over, reason `HULL_BREACH`.
- So a room broken in round N must be repaired during round N, N+1 or N+2.

---

## 10. The vote

The `VOTE` phase runs only if all of these are true at the end of `RESOLVE`:

- `xrayOnline === true`
- `powerCells >= scanCostCells` (4, or 5 at 10–12 players)
- at least 2 living players

Otherwise skip straight to the next round.

**First ballot.** Every living player picks one option: any living player, or `SKIP`. Self-voting is allowed (config flag `allowSelfVote`, default `true`). `SKIP` is worth one ballot per player for the whole game: it is spent when the ballot closes (so changing your mind before then costs nothing), and once spent that player must name someone on every later ballot. The phone is told privately whether its own skip is still there; nobody else's ledger is public. All ballots are revealed on the TV with voter names — who voted for whom is fully public and permanent, and appears in the log.

**Resolving the first ballot.** Find the highest vote count. Collect every option tied at that count.
- If `SKIP` is in that set → no scan. No power cells are spent.
- If exactly one player is in that set → that player is scanned.
- If two or more players are in that set → run a runoff.

**Runoff.** Candidates are only the tied players, and they do not vote: the rest of the living crew decides between them. `SKIP` is not available. The phase closes as soon as every eligible voter has answered, so the two under the scanner are never waited for. If the runoff is tied — or nobody was left to vote — → no scan, no power cells spent.

**The scan.** Spend `scanCostCells` power cells. Reveal the scanned player's true role on the TV with a deliberate pause for drama.
- Alien → `alive = false`, role publicly known forever.
- Crew → `verified = true`, shown as verified on the TV for the rest of the game.

---

## 11. Elimination

An eliminated player stays at the table. Their phone switches to a spectator view showing every player's true role and the full game state. They cannot act and cannot vote. The rulebook asks them to stay silent; the app does not enforce this.

Nobody except a scanned alien is ever eliminated. There is no alien kill in v1.

---

## 12. Win conditions

Check in this order.

1. At the start of `REPORT`: any fuse at 0 → **aliens win** (`HULL_BREACH`).
2. Immediately after a scan: no living aliens → **crew win** (`ALL_MIMICS_FOUND`).
3. After round 10 fully completes: at least one living alien → **aliens win** (`REACHED_THE_RELAY`).

On game over, the TV shows every player's true role and a round-by-round replay of the public log.

---

## 13. Data model

```ts
type RoomId = 'steering' | 'reactor' | 'cargo' | 'medbay' | 'oxygen';
type Intent  = 'WORK' | 'BREAK' | 'CORRUPT' | 'STEAL';
type Phase   = 'LOBBY' | 'ROLES' | 'REPORT' | 'TALK' | 'ACT' | 'RESOLVE' | 'VOTE' | 'GAME_OVER';

interface Player {
  id: string;
  name: string;
  token: string;          // never sent to other clients
  role: 'CREW' | 'MIMIC'; // never sent to other clients while alive
  alive: boolean;
  verified: boolean;
  room: RoomId | null;    // public after RESOLVE
  connected: boolean;
}

interface Submission {          // what the phone sends; same shape for every role
  playerId: string;
  room: RoomId;
  focus: RoomId;                // own room or a pipe neighbour
  action: 'WORK' | 'SABO';
}

interface DerivedIntent {       // engine-internal, produced by the focus rule; never leaves the server
  playerId: string;
  room: RoomId;
  intent: Intent;
  target?: RoomId;              // for BREAK
  resource?: 'scrap' | 'cells'; // for STEAL
}

interface RoomState { id: RoomId; broken: boolean; fuse: number | null; }

interface Ballot { voterId: string; choice: string | 'SKIP'; }

interface GameState {
  code: string;
  phase: Phase;
  round: number;                 // 1..10
  phaseEndsAt: number;           // epoch ms
  players: Player[];
  rooms: Record<RoomId, RoomState>;
  scrap: number;
  powerCells: number;
  repairProgress: number;        // 0..6
  xrayOnline: boolean;
  log: LogEntry[];
  winner: 'CREW' | 'MIMIC' | null;
  winReason: string | null;
}
```

Config with defaults:

```ts
{
  rounds: 10,
  repairTarget: 6,
  repairSuccessChance: 0.6,      // 0.4 is an approved variant; if used at 6 players set reactorCapCells to 4
  scanCostCells: (playerCount: number) => playerCount >= 10 ? 5 : 4,     // resolved once at hostStart and stored in state
  fuseLength: 3,
  scrapPerCargoWorker: 2,
  cellsPerReactorWorker: 1,
  reactorCapCells: (playerCount: number) => playerCount >= 10 ? 6 : 3,   // resolved once at hostStart and stored in state
  medbaySeats: Infinity,         // max repair attempts per round; 3 is the recommended value if the build phase feels too short
  stealAmount: 2,
  sabotagesPerRound: 'team',     // 'team' = one per round for the whole Mimic team; 'each' = every Mimic's sabotage lands
  aliensFor:       (playerCount: number) => playerCount <= 5 ? 1 : playerCount <= 9 ? 2 : 3,
  repairCostScrap: 1,
  startingScrap: 2,
  startingCells: 0,
  allowSelfVote: true,
  phaseSeconds: { REPORT: 20, TALK: 150, ACT: 60, RESOLVE: 30, VOTE: 60 }
}
```

---

## 14. Socket events

All traffic is Socket.IO on the default namespace. Every client → server event uses the acknowledgement callback: the server replies `{ ok: true, ...}` or `{ ok: false, error }` to the sender only. Nothing else comes back in the ack; the resulting state arrives as a broadcast like everything else. Each event handler is one `@SubscribeMessage` method on `GameGateway`; validation is a class-validator DTO per event.

**Client → server**

```
join            { code, name }                                          ack { ok, token, playerId }
rejoin          { code, token }                                         ack { ok }   // also sent on every reconnect; token may be a player or host token
hostCreate      { }                                                     ack { ok, code, hostToken }
hostSetSettings { code, hostToken, balance?: -2|-1|0|1|2, custom?: Partial<Config> }   // LOBBY only, see section 20
hostStart       { code, hostToken }
submitAction    { token, room, focus, action: 'WORK' | 'SABO' }         // see the phone spec; the engine derives the intent using the role it holds
submitBallot    { token, choice }                                       // playerId or 'SKIP'
```

**Server → client** — broadcasts go to the Socket.IO room named by the game code; private events go to one socket id looked up from the token.

```
state           PublicState               // broadcast to the game room, safe for the TV and everyone
privateState    { role, mimicTeammates? }  // private; only during ROLES; re-sent on rejoin while ROLES lasts
actOptions      { rooms, focus: Record<RoomId, RoomId[]>, actions: ['WORK','SABO'] }   // private but identical for every living player; sent at ACT start and on rejoin during ACT
phaseChange     { phase, endsAt, round }   // broadcast
resolution      { roundReport }           // broadcast
voteResult      { ballots, outcome, scannedPlayer?, revealedRole? }   // broadcast
gameOver        { winner, reason, allRoles }                          // broadcast
spectatorState  { players with roles, submissions this round }        // private, only to eliminated players
```

The `actOptions` payload is built once per phase from public state and the same object is emitted to every living socket. Never build it per player.

`PublicState` must be constructed by an explicit whitelist function. Write a unit test asserting that no `role`, `token`, or `Submission` field ever appears in a broadcast payload for a living player.

---

## 15. Screens

### Join (`/`)

Room code input, name input, join button. That is all.

### TV / host (`/host/:code`)

One screen, no scrolling, readable from 3 metres away. Layout top to bottom:

1. **Header bar** — `Round 4 of 10`, current phase name in plain words (`Talk out loud`, `Choose your action`, `Vote`), and a very large monospace countdown.
2. **Ship map** — the five rooms as cards. Each card shows the room name, the avatars of everyone standing there, this round's output summary, and a red fuse badge if broken. Arrange them to match the ship art, nose on the right: `Reactor | Cargo bay | Steering` on the top row, `Oxygen | Med bay` on the bottom row with the Med bay wider and reaching under Steering, and the cross pipe drawn diagonally from Reactor down to Med bay.
3. **Status strip** — the repair track as 6 segments, the scrap count, the power cell count.
4. **Vote panel** — during and after a vote, every ballot with voter name and target. Stays visible until the next vote.
5. **Log** — the last 3 round reports in short form.

During `ACT`, the map must show nothing about what anyone is choosing — only a count of how many players have locked in.

Use a real illustrated ship map as the background art if one is supplied at `public/ship-map.png`; otherwise fall back to plain cards. Keep the room hotspot coordinates in a config file (`shipMap.config.ts`) so the art can be swapped without touching code. Hotspots are percentages of image width and height so they survive any resolution. Starting values for the current art (16:9, engines on the left, viewport on the right), measured on the empty floor of each room where avatars go:

```ts
export const shipMap = {
  image: '/ship-map.png',
  rooms: {
    reactor:  { x: 12, y: 12, w: 22, h: 38 },
    cargo:    { x: 38, y: 13, w: 30, h: 37 },
    steering: { x: 71, y: 16, w: 26, h: 40 },
    oxygen:   { x: 12, y: 53, w: 26, h: 36 },
    medbay:   { x: 41, y: 55, w: 36, h: 35 },
  },
  // pipe endpoints for the drawn overlay, also in %; draw only the cross pipe,
  // the wall pipes are already in the art
  crossPipe: { from: { x: 34, y: 48 }, to: { x: 44, y: 58 } },
};
```

Tune these by eye once the art is in place; they are config, not code.

### Phone (`/play`)

Fully specified in **`mimic-v1-phone-spec.md`**, which wins over this file for anything shown on a phone. In one paragraph: every living player sees the same screens with the same buttons every round. Act is four taps (Room, Focus, `WORK`/`SABO`, Lock in) with the button pair and the focus tiles shuffled per player per round and a 700 ms tap guard on every screen. Vote is two taps. The role is shown once on a hold-to-reveal card and then discarded by the client. No notifications, no vibration, no sound, no badges, no colour that differs by role. The phone must never light up on its own.

---

## 16. Hard requirements about hidden information

These are not optional and every one needs a test.

1. The server never sends a living player's role to any other client.
2. Broadcast payloads never contain intents, submissions, dice results, or which sabotage was chosen.
3. Room reports contain aggregate output only.
4. The action and vote flows send the same option payload to every living player, render the same DOM for every living player, and take the same number of taps. The `submitAction` acknowledgement is the same for a crew member and a Mimic for any well-formed payload.
5. No client-side role logic. The client never holds a role string after the `ROLES` phase. It renders `actOptions` from the server and nothing else.

---

## 17. Out of scope for v1

Do not build: accounts, persistence, a database, chat, spectating over the internet, custom room counts, custom role powers, sound, animations beyond simple transitions, mobile native apps, an alien kill mechanic, the Comms room.

---

## 18. Acceptance tests

Write these as automated tests against the game engine with a fixed RNG seed.

1. An 8-player game assigns exactly 2 aliens; a 6-player game assigns 2; a 5-player game assigns 1; a 10-player game assigns 3.
2. Two Mimics both submit `SABO` on a breakable neighbour; exactly one break lands and the other Mimic's action resolves as `WORK` in their chosen room.
3. Reactor is broken and 2 players work there: the room ends the round repaired and the pool gains exactly 1 power cell.
3a. Five players work in an unbroken Reactor in an 8-player game: the pool gains exactly 3 power cells, not 5. In a 10-player game seven Reactor workers gain exactly 6.
3b. A Mimic standing in `steering` with focus `reactor` and `SABO` resolves as `WORK` (not adjacent). The same Mimic standing in `cargo` with focus `reactor` breaks the Reactor. A Mimic in `medbay` may break `steering`, `oxygen` or `reactor`. A Mimic in `reactor` with focus `reactor` steals cells and does not break the Reactor.
3c. A vote does not run with 3 power cells in the pool; it runs with 4, and a completed scan leaves 0.
4. A room broken in round 3 and never repaired ends the game with `HULL_BREACH` at the start of round 6.
5. Four workers in the Med bay with 1 corrupt: exactly 4 scrap are spent and at most 3 progress is possible.
6. Med bay work with 0 scrap in the pool spends nothing and adds nothing.
7. Vote tie between two players triggers a runoff; those two players do not vote in it at all; a second tie spends no power cells.
8. `SKIP` winning the first ballot spends no power cells and scans nobody.
9. Scanning the last living alien ends the game immediately with `ALL_MIMICS_FOUND`.
10. Completing round 10 with an alien alive ends the game with `REACHED_THE_RELAY`.
11. Snapshot test: a broadcast `PublicState` for a mid-game round contains no `role`, `token`, `intent`, `focus` or `action` key at any depth.
12. `actOptions` built for a crew member and for a Mimic in the same game state are deep-equal.
13. A crew submission with `action: 'SABO'` resolves as `WORK` and leaves no trace in the log or state; the state after the round is deep-equal to the same round with `action: 'WORK'`.
14. A Mimic focusing their own Med bay with `SABO` resolves as `CORRUPT`; own Cargo bay as `STEAL` scrap; own Reactor as `STEAL` cells; own Steering as `BREAK` steering; a breakable unbroken neighbour as `BREAK`; the Med bay from a neighbour as `BREAK` once the X-ray is online and as `WORK` before that; the Cargo bay from a neighbour as `WORK`; an already-broken neighbour as `WORK`.
15. Rendering the Act flow component to a string with the same `actOptions` and two different private states (crew, Mimic) produces byte-identical output.
16. The client store after the `ROLES` phase contains no `role` or `mimicTeammates` key.
16a. `submitAction` with a well-formed but illegal sabotage returns the same acknowledgement as a legal one.

---

## 19. Build order

1. Game engine as a pure module in `packages/engine`: state in, action list in, new state and report out. No Nest, no sockets, no timers. Get every engine test in section 18 green with Vitest first.
2. `apps/server`: `GamesService` (game registry, settings resolver, phase timer) and `GameGateway` (the socket events in section 14, token → socket map, room broadcasts), then `ServeStaticModule` serving the SvelteKit build as an SPA on the same port. Prove the single-port deployment with the smoke test in section 1 before building any screen.
3. TV view.
4. Phone view.
5. Reconnection and the lobby.
6. Art swap-in and polish.

Ship step 1 before touching any UI. The engine is the whole game; the rest is presentation.

---

## 20. Host settings and the balance slider

Shown on the host screen (`/host/:code`) while the game is in `LOBBY`. Frozen at `hostStart`. The chosen values are part of `PublicState.settings`, are shown on the TV lobby screen so every player sees the game they are about to play, and are written as the first entry of the log.

### The slider

One horizontal slider with five detents. Left favours the crew, right favours the Mimics. Stored as `balance: -2 | -1 | 0 | 1 | 2`, default `0`.

```
  Crew ◄────●────┼────┼────┼────► Mimics
        -2   -1    0    +1   +2
```

Labels under the detents: `Crew++`, `Crew+`, `Balanced`, `Mimic+`, `Mimic++`.

The slider drives only three keys: `reactorCapCells`, `scanCostCells`, `rounds`. Everything else stays at default. The values depend on the player count, so they are resolved at `hostStart` from the number of players in the lobby:

| Position | 5–9 players: cap / scan / rounds | 10–12 players: cap / scan / rounds |
|---|---|---|
| `-2` Crew++ | 4 / 3 / 10 | 6 / 4 / 12 |
| `-1` Crew+ | 4 / 4 / 10 | 6 / 4 / 11 |
| `0` Balanced | 3 / 4 / 10 | 6 / 5 / 10 |
| `+1` Mimic+ | 3 / 5 / 10 | 6 / 6 / 10 |
| `+2` Mimic++ | 3 / 6 / 10 | 5 / 7 / 10 |

Next to the slider show a live estimate: `Estimated crew win chance: ~60%`. It comes from this lookup table (simulated, average table, `tools/balance_sim.py`), keyed by position and current lobby size. Update it whenever a player joins or leaves.

| Players | Crew++ | Crew+ | Balanced | Mimic+ | Mimic++ |
|---|---|---|---|---|---|
| 5 | 99 | 97 | 87 | 74 | 62 |
| 6 | 94 | 80 | 53 | 32 | 17 |
| 7 | 97 | 89 | 59 | 41 | 23 |
| 8 | 95 | 88 | 60 | 40 | 26 |
| 9 | 93 | 84 | 55 | 41 | 31 |
| 10 | 94 | 81 | 58 | 43 | 15 |
| 11 | 94 | 79 | 60 | 50 | 21 |
| 12 | 84 | 69 | 53 | 46 | 17 |

The steps are not perfectly even because the two dials are coarse. That is acceptable for v1.1; playtests will refine the table, and the table is data, not code.

### Custom

A `Custom` toggle under the slider. When on, the slider greys out and a form lists every tunable key with its current value, its allowed range, and one plain sentence about what it does. Values outside the range are clamped server-side. A `Reset to slider` button turns Custom off and restores the slider's values.

| Key | Range | Default | One-line help shown in the UI |
|---|---|---|---|
| `aliens` | `auto`, 1–4 | `auto` | How many Mimics. Auto: 1 at 5 players, 2 at 6–9, 3 at 10–12 |
| `rounds` | 6–14 | 10 | Rounds until the station. Fewer rounds favour the Mimics |
| `repairTarget` | 4–12 | 6 | Repair points needed to bring the X-ray online. Higher means a longer build phase |
| `repairSuccessChance` | 30–80% in 5% steps | 60% | Chance that one Med bay attempt gives a repair point. Show as a percent stepper, not a decimal. Lower means a longer build phase and more "was that bad luck?" arguments |
| `medbaySeats` | 2–12 or unlimited | unlimited | How many people can work the X-ray in one round. 3 makes every table reach the X-ray around round 4 |
| `repairCostScrap` | 1–2 | 1 | Scrap spent per Med bay attempt |
| `scrapPerCargoWorker` | 1–3 | 2 | Scrap made by each Cargo bay worker |
| `reactorCapCells` | 1–8 | by player count | Most power cells the Reactor can make in one round. The strongest balance dial |
| `scanCostCells` | 2–8 | by player count | Power cells spent per scan |
| `startingScrap` | 0–6 | 2 | Scrap in the pool at the start |
| `startingCells` | 0–6 | 0 | Power cells in the pool at the start |
| `fuseLength` | 2–5 | 3 | Rounds a broken room survives before the ship is lost |
| `stealAmount` | 1–4 | 2 | Scrap or cells destroyed by one Steal |
| `sabotagesPerRound` | `team`, `each` | `team` | Team: one sabotage per round for all Mimics together. Each: every Mimic's sabotage lands |
| `allowSelfVote` | on/off | on | Whether a player may vote for themselves on the first ballot |
| `phaseSeconds.TALK` | 30–600 | 150 | Talking time per round |
| `phaseSeconds.ACT` | 20–180 | 60 | Time to lock in an action |
| `phaseSeconds.VOTE` | 20–180 | 60 | Time to vote |
| `phaseSeconds.REPORT` | 5–60 | 20 | Time the ship report stays on screen |
| `phaseSeconds.RESOLVE` | 10–90 | 30 | Time the round result stays on screen |

With Custom on, the crew-win estimate reads `Estimate not available for custom settings`. Do not try to interpolate.

Group the Custom form under three headings so the host understands what each key does:

- **Balance** (who wins): `aliens`, `reactorCapCells`, `scanCostCells`, `rounds`, `stealAmount`, `sabotagesPerRound`.
- **Pace** (when the X-ray comes online): `repairSuccessChance`, `repairTarget`, `medbaySeats`, `repairCostScrap`, `scrapPerCargoWorker`, `startingScrap`, `startingCells`.
- **Table** (how the evening runs): `fuseLength`, `allowSelfVote`, the five `phaseSeconds`.

The repair chance is deliberately **not** on the slider. Simulated with the chance tied to the slider (70 / 65 / 60 / 55 / 50%), the crew win rates moved by only 1 to 4 points at every table size, but the X-ray moved by about a round in each direction. It is a pace dial, not a balance dial, and mixing the two would make the slider change the length of the build phase without the host asking for it.

### Rules

- Settings can be changed any number of times in `LOBBY` and never after `hostStart`. The server rejects `hostSetSettings` in any other phase.
- The resolved `Config` (all functions evaluated for the actual player count) is stored in `GameState.config` and is the only thing the engine reads. The engine never sees the slider.
- Show the resolved values on the TV lobby screen in plain words: `8 players · 2 Mimics · Balanced · 10 rounds · scans cost 4 cells · Reactor makes up to 3 cells a round`.
- The game-over screen repeats the settings line so a table that argues "that was unfair" can see what they played.

### Tests

17. `resolveSettings({ balance: 0 }, 8)` yields `reactorCapCells 3, scanCostCells 4, rounds 10`; the same with 11 players yields `6, 5, 10`; `balance: 2` with 12 players yields `5, 7, 10`.
18. `hostSetSettings` with `custom: { rounds: 99 }` stores `rounds: 14`; with `custom: { aliens: 4 }` in a 6-player game the engine still assigns 4 Mimics (custom is allowed to be unbalanced, it is only clamped to the range).
19. `hostSetSettings` after `hostStart` is rejected and the state is unchanged.
20. `medbaySeats: 3` with 5 Med bay workers spends exactly 3 scrap.
21. `sabotagesPerRound: 'each'` with two legal BREAKs breaks both rooms.
