# MIMIC — v1.1

A web app for the real-life social deduction party game **MIMIC**. Everyone sits in one room
around one monitor; each player uses their own phone only to make secret choices. There is no
in-app chat and there must not be one — all discussion happens out loud, face to face.

The rules live in [`mimic-v1-build-spec.md`](mimic-v1-build-spec.md) and
[`mimic-v1-phone-spec.md`](mimic-v1-phone-spec.md). The phone spec wins for anything shown
on a phone.

---

## Run it

```bash
pnpm install
pnpm build
pnpm start
```

That is the whole deployment: one Node process on one port. Open `http://localhost:3000/`
on the monitor, press **Create a game**, and everyone else opens the same URL on their phones
and types the four-letter room code. The server prints your LAN address on start-up — that
is the one to give the table.

### Development

Two dev servers, because Vite's HMR is worth it:

```bash
pnpm dev:server   # NestJS on 3000, owns all state and all timers
pnpm dev:web      # Vite on 5173, proxies /socket.io to 3000
```

The client always connects to `window.location.origin`, so the same code runs in dev and in
production.

### Tests

```bash
pnpm test   # engine (Vitest), gateway (Jest), phone components (Vitest)
```

The engine suite is every acceptance test in build spec section 18 and the settings tests in
section 20. The gateway suite plays a whole game over real sockets, including the
hidden-information guarantees from section 16. The web suite covers phone spec tests 15 and
16 — the action flow renders byte-identical DOM for a crew member and a Mimic, and the
client holds no role after the reveal.

The full-game gateway test plays six rounds of real wall-clock time, so `pnpm test` takes
about two and a half minutes.

---

## Layout

```
packages/engine   pure game engine + shared types. No framework, no sockets, no timers.
apps/server       NestJS + Socket.IO. Owns all game state, all randomness, all timers.
apps/web          SvelteKit (Svelte 5) single-page frontend. Types-only dependency on the engine.
```

`apps/server` serves the built SvelteKit app as an SPA on the same port as the socket, so
`/play` and `/host/ABCD` survive a refresh and a cold open on a phone.

Three screens:

| Route | Who | What |
|---|---|---|
| `/` | everyone | Room code, name, join. Plus **Create a game** for the monitor. |
| `/host/:code` | the monitor | The whole game state, readable from three metres. The header shows the round, where the round is (Report · Talk · Act · Resolve · Vote) and what comes next. |
| `/play` | phones | Four taps to act, two to vote, nothing else. |

---

## The two rules that shape the code

**1. The server is authoritative and the client is blind.** No game logic runs in the
browser. `apps/web` imports only *types* from the engine (see `src/lib/types.ts`). The phone
renders the `actOptions` payload the server sends and nothing else — it has no pipe list, no
breakable list and no legality check, because holding any of those would let a phone behave
differently for a Mimic.

**2. Every living player sees the same pixels.** A crew member who taps `SABO` simply works;
nothing is logged and nobody is told. So the same four screens, the same button labels, the
same tap count and the same acknowledgement serve both roles. `PublicState` is built by an
explicit whitelist in `packages/engine/src/publicState.ts` — a new field on `GameState` has
to be opted in there, so it cannot leak by accident — and no key in it is even *named*
`role`, `token`, `intent`, `focus` or `action`.

---

## The art

The ship map is `apps/web/static/ship-map.png`, drawn nose-right so the ship flies left to
right. Room hotspots are percentages of the image in
[`apps/web/src/lib/shipMap.config.ts`](apps/web/src/lib/shipMap.config.ts), so they survive
any resolution and any screen.

**Swapping the art** means replacing that PNG, setting `aspect`, and re-measuring the five
boxes. Append `?hotspots` to the host URL — `http://localhost:3000/host/ABCD?hotspots` — to
outline every box over the art while you tune it. If the new art has no diagonal
Reactor→Med bay pipe, set `crossPipe.draw` to `true` and the app will draw one.

Two pieces are drawn by the app rather than baked into the image:

- **The starfield** (`Starfield.svelte`) is a canvas of three parallax layers drifting right
  to left, because the ship is flying left to right. It honours `prefers-reduced-motion`.
- **The broken-room overlay** (`HazardOverlay.svelte`) is inline SVG: a bold yellow/black
  hazard-striped border around the room with a slow pulse and a fuse badge that turns red at
  one round left. Inline SVG rather than a bitmap so it stretches to any room rectangle and
  can be recoloured without regenerating art.

---

## Hosting a game

The host screen owns the balance slider (five detents, `Crew++` to `Mimic++`) with a live
crew-win estimate, and a **Custom** panel exposing every tunable key grouped into *Balance*
(who wins), *Pace* (when the X-ray comes online) and *Table* (how the evening runs). Settings
can change any number of times in the lobby and never after start; the resolved values are
shown on the lobby screen and repeated on the game-over screen, so a table that argues "that
was unfair" can see exactly what they played.

`reactorCapCells` is the strongest dial — one cell swings the crew win rate by roughly
thirty points. Tune it in single steps and never together with another change.

### Game modes

Two switches in the lobby change how the evening runs. Both are named in the settings line,
so the table can see what it is playing:

- **Manual steps** takes every timer off. The monitor shows **Next** instead of a countdown
  (Space, → or a presentation clicker's Page Down work too), so the host moves the table on
  when the talking is done rather than when a clock says so. Act and Vote still close by
  themselves once every living player has locked in; press Next to close them early, and
  anyone who has not locked in gets the default action. A double press can never skip a
  step — every press carries the step it was made on, and a stale one is ignored. Note that
  the role reveal then lasts as long as the host wants, rather than the fixed 30 seconds the
  phone spec asks for so that nobody notices who looked longest.
- **Votes hidden** shows only a vote's outcome: who was scanned and what they were, or that
  nobody was. The ballots never leave the server — not in the log, not on the game-over
  screen, not in the socket traffic. Who *has* voted is still shown while a vote is open,
  because that is participation, not a result.

The host can also remove players and bots from the lobby with the × on their name; their
phone goes back to the join screen, and they can rejoin straight away. **Quit game** in the
header ends the game for everyone after a confirmation, and every screen returns to the
main menu. The lobby and the game-over screen both have a way back to the menu too.

### Dev mode

Two things on the host screen exist only so one person can test alone, and are marked
`(dev)`:

- **+ Bot** seats a bot that plays crudely but not randomly: crew bots repair broken rooms
  and feed the Med bay, Mimic bots sabotage about half the time and never vote out a
  teammate.
- **Fast phases** cuts every phase to a few seconds. `ACT` and `VOTE` stay long enough for a
  human to complete the tap flow, since every screen sits behind a 700 ms guard and a fade.

A whole ten-round game with bots and fast phases takes two or three minutes.

---

## Known limits (v1)

- **All state is in memory.** Restarting the server ends every game in progress. This is
  called out as acceptable in the spec; there is no database and no persistence.
- **A same-round break can be repaired the same round.** Resolution follows build spec
  section 8 exactly, and step 4 (repair) runs after step 3 (sabotage). So breaking a room
  that someone is standing in that round costs the crew one action and nothing more. That is
  the specified order, and it makes "break the room nobody is working" the real skill.
- **The monitor lays out header → map → status vertically, with the vote panel and log in a right
  rail** rather than stacked below the map as section 15 lists them. At 1920×1080 the
  five-element vertical stack squeezes the map badly, and "one screen, no scrolling,
  readable from three metres" is the requirement the layout has to meet.
- **`ACT` ends early when every living player has locked in**, following build spec section
  6 rather than the phone spec's "always runs its full length on the phones". Every phone
  then changes at the same instant, so what leaks is a table-wide fact the monitor's locked-in
  counter already shows, not anything about an individual. Set `phaseSeconds.ACT` in Custom
  if you would rather the phase always run its full length in practice.
