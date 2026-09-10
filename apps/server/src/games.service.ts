import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import {
  beginRound,
  buildActOptions,
  castBallot,
  checkEndOfGame,
  createGame,
  createRng,
  isWellFormedSubmission,
  livingPlayers,
  playerById,
  resolveRound,
  resolveSettings,
  resolveVote,
  shouldVote,
  startGame,
  startVote,
  toPublicState,
  toSpectatorState,
  type ActionButton,
  type Balance,
  type CustomSettings,
  type GameState,
  type Phase,
  type PublicState,
  type RoomId,
  type Rng,
} from '@mimic/engine';
import { randomUUID } from 'crypto';
import { chooseBotAction, chooseBotBallot, BOT_NAMES } from './bots';

/** How the phone/TV is told about a phase, without ever driving it. */
export interface Emitter {
  broadcast(code: string, event: string, payload: unknown): void;
  toToken(code: string, token: string, event: string, payload: unknown): void;
}

interface Runtime {
  state: GameState;
  hostToken: string;
  rng: Rng;
  sockets: Map<string, string>; // playerToken | hostToken -> socket id
  timer: NodeJS.Timeout | null;
  tick: NodeJS.Timeout | null;
  botTimers: NodeJS.Timeout[];
  /** The locked-in count the TV is allowed to see. Advanced on a 5s tick, never per submission. */
  lockedInPublic: number;
  runoffCandidates: string[] | null;
  voteRevealed: boolean;
}

/**
 * Dev/test mode. ACT and VOTE stay long enough for a human to actually complete the tap
 * flow (four taps behind a 700 ms guard and a fade each); everything else is cut to the
 * bone so a whole ten-round game fits in a couple of minutes.
 */
const FAST_SECONDS: Record<Phase | 'ROLES', number> = {
  LOBBY: 0,
  ROLES: 5,
  REPORT: 3,
  TALK: 4,
  ACT: 10,
  RESOLVE: 4,
  VOTE: 10,
  GAME_OVER: 0,
};

/** Seconds the vote result stays on the TV before the game moves on. Drama, per section 10. */
const VOTE_REVEAL_SECONDS = 8;
const FAST_VOTE_REVEAL_SECONDS = 3;

@Injectable()
export class GamesService implements OnModuleDestroy {
  private readonly log = new Logger('GamesService');
  private games = new Map<string, Runtime>();
  private emitter: Emitter | null = null;

  setEmitter(e: Emitter) {
    this.emitter = e;
  }

  /**
   * A game in progress owns a phase timeout and a locked-in interval. Without this, those
   * keep the Node process alive long after the app has been closed — which is invisible in
   * production (the process is meant to stay up) but hangs any test that closes the app.
   */
  onModuleDestroy() {
    for (const g of this.games.values()) this.clearTimers(g);
    this.games.clear();
  }

  // -- registry ------------------------------------------------------------

  private newCode(): string {
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O, they read badly on a TV
    for (let attempt = 0; attempt < 500; attempt++) {
      let code = '';
      for (let i = 0; i < 4; i++) code += letters[Math.floor(Math.random() * letters.length)];
      if (!this.games.has(code)) return code;
    }
    throw new Error('no free room code');
  }

  create(seed?: number): { code: string; hostToken: string } {
    const code = this.newCode();
    const actualSeed = seed ?? (Math.random() * 2 ** 31) | 0;
    const hostToken = randomUUID();
    this.games.set(code, {
      state: createGame(code, actualSeed),
      hostToken,
      rng: createRng(actualSeed),
      sockets: new Map(),
      timer: null,
      tick: null,
      botTimers: [],
      lockedInPublic: 0,
      runoffCandidates: null,
      voteRevealed: false,
    });
    this.log.log(`created game ${code}`);
    return { code, hostToken };
  }

  get(code: string): Runtime | undefined {
    return this.games.get(code?.toUpperCase?.() ?? '');
  }

  destroy(code: string) {
    const g = this.get(code);
    if (!g) return;
    this.clearTimers(g);
    this.games.delete(code.toUpperCase());
  }

  // -- players -------------------------------------------------------------

  join(code: string, name: string): { ok: false; error: string } | { ok: true; token: string; playerId: string } {
    const g = this.get(code);
    if (!g) return { ok: false, error: 'No game with that code.' };
    if (g.state.phase !== 'LOBBY') return { ok: false, error: 'That game has already started.' };
    if (g.state.players.length >= 12) return { ok: false, error: 'That game is full.' };
    const clean = name.trim().slice(0, 12);
    if (!clean) return { ok: false, error: 'Enter a name.' };
    if (g.state.players.some((p) => p.name.toLowerCase() === clean.toLowerCase()))
      return { ok: false, error: 'That name is taken.' };

    const token = randomUUID();
    const playerId = randomUUID().slice(0, 8);
    g.state.players.push({
      id: playerId,
      name: clean,
      token,
      role: 'CREW',
      alive: true,
      verified: false,
      room: null,
      connected: true,
      isBot: false,
    });
    this.broadcastState(g);
    return { ok: true, token, playerId };
  }

  addBot(code: string, hostToken: string): boolean {
    const g = this.get(code);
    if (!g || g.hostToken !== hostToken || g.state.phase !== 'LOBBY') return false;
    if (g.state.players.length >= 12) return false;
    const taken = new Set(g.state.players.map((p) => p.name));
    const name = BOT_NAMES.find((n) => !taken.has(n));
    if (!name) return false;
    g.state.players.push({
      id: randomUUID().slice(0, 8),
      name,
      token: randomUUID(),
      role: 'CREW',
      alive: true,
      verified: false,
      room: null,
      connected: true,
      isBot: true,
    });
    this.broadcastState(g);
    return true;
  }

  removePlayer(code: string, playerId: string): boolean {
    const g = this.get(code);
    if (!g || g.state.phase !== 'LOBBY') return false;
    g.state.players = g.state.players.filter((p) => p.id !== playerId);
    this.broadcastState(g);
    return true;
  }

  bindSocket(code: string, token: string, socketId: string) {
    const g = this.get(code);
    if (!g) return;
    g.sockets.set(token, socketId);
    const p = g.state.players.find((x) => x.token === token);
    if (p) p.connected = true;
  }

  unbindSocket(socketId: string) {
    for (const g of this.games.values()) {
      for (const [token, id] of g.sockets) {
        if (id !== socketId) continue;
        g.sockets.delete(token);
        const p = g.state.players.find((x) => x.token === token);
        if (p) {
          p.connected = false;
          this.broadcastState(g);
        }
      }
    }
  }

  playerFor(code: string, token: string) {
    const g = this.get(code);
    return g?.state.players.find((p) => p.token === token);
  }

  findByToken(token: string): { runtime: Runtime; code: string } | null {
    for (const [code, g] of this.games) {
      if (g.hostToken === token || g.state.players.some((p) => p.token === token))
        return { runtime: g, code };
    }
    return null;
  }

  // -- settings ------------------------------------------------------------

  setSettings(
    code: string,
    hostToken: string,
    balance?: Balance,
    custom?: Partial<CustomSettings> | null,
    fastPhases?: boolean,
  ): { ok: boolean; error?: string } {
    const g = this.get(code);
    if (!g) return { ok: false, error: 'No game with that code.' };
    if (g.hostToken !== hostToken) return { ok: false, error: 'Not the host.' };
    if (g.state.phase !== 'LOBBY') return { ok: false, error: 'Settings are frozen once the game starts.' };

    if (balance !== undefined) g.state.settings.balance = balance;
    if (custom !== undefined) g.state.settings.custom = custom;
    if (fastPhases !== undefined) g.state.fastPhases = fastPhases;
    g.state.config = resolveSettings(g.state.settings, Math.max(1, g.state.players.length));
    this.broadcastState(g);
    return { ok: true };
  }

  // -- the phase machine ---------------------------------------------------

  private seconds(g: Runtime, phase: Phase): number {
    if (g.state.fastPhases) return FAST_SECONDS[phase];
    const ps = g.state.config.phaseSeconds as Record<string, number>;
    return ps[phase] ?? 10;
  }

  private clearTimers(g: Runtime) {
    if (g.timer) clearTimeout(g.timer);
    if (g.tick) clearInterval(g.tick);
    for (const t of g.botTimers) clearTimeout(t);
    g.timer = null;
    g.tick = null;
    g.botTimers = [];
  }

  private schedule(g: Runtime, seconds: number, next: () => void) {
    if (g.timer) clearTimeout(g.timer);
    g.state.phaseEndsAt = Date.now() + seconds * 1000;
    g.timer = setTimeout(next, seconds * 1000);
  }

  start(code: string, hostToken: string): { ok: boolean; error?: string } {
    const g = this.get(code);
    if (!g) return { ok: false, error: 'No game with that code.' };
    if (g.hostToken !== hostToken) return { ok: false, error: 'Not the host.' };
    if (g.state.phase !== 'LOBBY') return { ok: false, error: 'Already started.' };
    if (g.state.players.length < 3)
      return { ok: false, error: 'Need at least 3 players (6 is the recommended minimum).' };

    g.state = startGame(g.state, g.rng);
    this.enterRoles(g);
    return { ok: true };
  }

  private enterRoles(g: Runtime) {
    g.state.phase = 'ROLES';
    this.schedule(g, this.seconds(g, 'ROLES'), () => this.enterReport(g));
    this.broadcastState(g);
    this.emitPhase(g);
    // The role card is the only private, role-shaped payload in the whole app.
    for (const p of g.state.players) {
      const teammates =
        p.role === 'MIMIC'
          ? g.state.players.filter((x) => x.role === 'MIMIC' && x.id !== p.id).map((x) => x.name)
          : undefined;
      this.emitter?.toToken(g.state.code, p.token, 'privateState', {
        role: p.role,
        mimicTeammates: teammates,
      });
    }
  }

  private enterReport(g: Runtime) {
    g.state = beginRound(g.state);
    if (g.state.phase === 'GAME_OVER') return this.enterGameOver(g);
    this.schedule(g, this.seconds(g, 'REPORT'), () => this.enterTalk(g));
    this.broadcastState(g);
    this.emitPhase(g);
  }

  private enterTalk(g: Runtime) {
    g.state.phase = 'TALK';
    this.schedule(g, this.seconds(g, 'TALK'), () => this.enterAct(g));
    this.broadcastState(g);
    this.emitPhase(g);
  }

  private enterAct(g: Runtime) {
    g.state.phase = 'ACT';
    g.state.submissions = {};
    g.lockedInPublic = 0;
    this.schedule(g, this.seconds(g, 'ACT'), () => this.enterResolve(g));
    this.broadcastState(g);
    this.emitPhase(g);

    const options = buildActOptions(g.state);
    for (const p of livingPlayers(g.state))
      this.emitter?.toToken(g.state.code, p.token, 'actOptions', options);

    // The locked-in counter moves on a 5-second tick so nobody can match a tick to a
    // neighbour lowering their phone.
    if (g.tick) clearInterval(g.tick);
    g.tick = setInterval(() => {
      if (g.state.phase !== 'ACT') return;
      const n = Object.keys(g.state.submissions).length;
      if (n !== g.lockedInPublic) {
        g.lockedInPublic = n;
        this.broadcastState(g);
      }
    }, 5000);

    this.scheduleBotActions(g);
  }

  private enterResolve(g: Runtime) {
    if (g.tick) clearInterval(g.tick);
    g.tick = null;
    for (const t of g.botTimers) clearTimeout(t);
    g.botTimers = [];

    const { state } = resolveRound(g.state, g.rng);
    g.state = state;
    g.lockedInPublic = livingPlayers(g.state).length;
    this.schedule(g, this.seconds(g, 'RESOLVE'), () => this.afterResolve(g));
    this.broadcastState(g);
    this.emitPhase(g);
    this.emitter?.broadcast(g.state.code, 'resolution', { roundReport: g.state.lastReport });
    this.pushSpectatorStates(g);
  }

  private afterResolve(g: Runtime) {
    if (shouldVote(g.state)) {
      g.runoffCandidates = null;
      this.enterVote(g, 'FIRST');
    } else {
      this.endRound(g);
    }
  }

  private enterVote(g: Runtime, stage: 'FIRST' | 'RUNOFF', candidates?: string[]) {
    g.state = startVote(g.state, stage, candidates);
    g.voteRevealed = false;
    this.schedule(g, this.seconds(g, 'VOTE'), () => this.closeVote(g));
    this.broadcastState(g);
    this.emitPhase(g);
    this.scheduleBotBallots(g);
  }

  private closeVote(g: Runtime) {
    for (const t of g.botTimers) clearTimeout(t);
    g.botTimers = [];
    const { state, outcome } = resolveVote(g.state);
    g.state = state;
    g.voteRevealed = true;
    this.broadcastState(g);
    this.emitter?.broadcast(g.state.code, 'voteResult', {
      ballots: state.vote?.ballots ?? [],
      outcome:
        outcome.kind === 'SCAN'
          ? { kind: 'SCAN', playerId: outcome.playerId, revealedRole: outcome.role }
          : outcome,
    });
    this.pushSpectatorStates(g);

    const reveal = g.state.fastPhases ? FAST_VOTE_REVEAL_SECONDS : VOTE_REVEAL_SECONDS;
    if (g.state.phase === 'GAME_OVER') {
      this.schedule(g, reveal, () => this.enterGameOver(g));
      return;
    }
    if (outcome.kind === 'RUNOFF') {
      this.schedule(g, reveal, () => this.enterVote(g, 'RUNOFF', outcome.candidates));
      return;
    }
    this.schedule(g, reveal, () => this.endRound(g));
  }

  private endRound(g: Runtime) {
    g.state = checkEndOfGame(g.state);
    if (g.state.phase === 'GAME_OVER') return this.enterGameOver(g);
    this.enterReport(g);
  }

  private enterGameOver(g: Runtime) {
    this.clearTimers(g);
    g.state.phase = 'GAME_OVER';
    g.state.phaseEndsAt = 0;
    this.broadcastState(g);
    this.emitPhase(g);
    this.emitter?.broadcast(g.state.code, 'gameOver', {
      winner: g.state.winner,
      reason: g.state.winReason,
      allRoles: g.state.players.map((p) => ({ id: p.id, name: p.name, role: p.role })),
    });
  }

  // -- player input --------------------------------------------------------

  submitAction(
    token: string,
    room: unknown,
    focus: unknown,
    action: unknown,
  ): { ok: boolean; error?: string } {
    const found = this.findByToken(token);
    // Every rejection below is on facts a neighbour can already see (the phase, whether you
    // are alive). Legality of a sabotage is never checked here — that would make the
    // acknowledgement differ between a crew member and a Mimic.
    if (!found) return { ok: false, error: 'Unknown player.' };
    const g = found.runtime;
    if (g.state.phase !== 'ACT') return { ok: false, error: 'Not the action phase.' };
    const p = g.state.players.find((x) => x.token === token);
    if (!p || !p.alive) return { ok: false, error: 'Not a living player.' };
    if (!isWellFormedSubmission(room, focus, action)) return { ok: false, error: 'Malformed action.' };

    g.state.submissions[p.id] = {
      playerId: p.id,
      room: room as RoomId,
      focus: focus as RoomId,
      action: action as ActionButton,
    };

    // Section 6: the phase may end early once every living player has locked in.
    const living = livingPlayers(g.state);
    if (living.every((x) => g.state.submissions[x.id])) {
      g.lockedInPublic = living.length;
      this.schedule(g, 1, () => this.enterResolve(g));
      this.broadcastState(g);
      this.emitPhase(g);
    }
    return { ok: true };
  }

  submitBallot(token: string, choice: unknown): { ok: boolean; error?: string } {
    const found = this.findByToken(token);
    if (!found) return { ok: false, error: 'Unknown player.' };
    const g = found.runtime;
    if (g.state.phase !== 'VOTE' || g.voteRevealed) return { ok: false, error: 'Not the vote phase.' };
    const p = g.state.players.find((x) => x.token === token);
    if (!p) return { ok: false, error: 'Unknown player.' };
    if (typeof choice !== 'string') return { ok: false, error: 'Malformed ballot.' };

    const res = castBallot(g.state, p.id, choice);
    if (!res.ok) return { ok: false, error: res.error };
    g.state = res.state;
    this.broadcastState(g);

    const living = livingPlayers(g.state);
    if (g.state.vote && living.every((x) => g.state.vote!.ballots.some((b) => b.voterId === x.id))) {
      this.schedule(g, 1, () => this.closeVote(g));
      this.emitPhase(g);
    }
    return { ok: true };
  }

  // -- bots (dev/test mode) ------------------------------------------------

  private scheduleBotActions(g: Runtime) {
    const total = this.seconds(g, 'ACT') * 1000;
    for (const p of livingPlayers(g.state)) {
      if (!p.isBot) continue;
      const delay = Math.min(total - 800, 800 + Math.random() * (total * 0.35));
      g.botTimers.push(
        setTimeout(() => {
          if (g.state.phase !== 'ACT') return;
          const choice = chooseBotAction(g.state, p);
          this.submitAction(p.token, choice.room, choice.focus, choice.action);
        }, Math.max(300, delay)),
      );
    }
  }

  private scheduleBotBallots(g: Runtime) {
    const total = this.seconds(g, 'VOTE') * 1000;
    for (const p of livingPlayers(g.state)) {
      if (!p.isBot) continue;
      const delay = Math.min(total - 800, 900 + Math.random() * (total * 0.35));
      g.botTimers.push(
        setTimeout(() => {
          if (g.state.phase !== 'VOTE' || g.voteRevealed) return;
          this.submitBallot(p.token, chooseBotBallot(g.state, p));
        }, Math.max(300, delay)),
      );
    }
  }

  // -- emitting ------------------------------------------------------------

  publicState(g: Runtime): PublicState {
    return toPublicState(g.state, g.state.phase === 'ACT' ? g.lockedInPublic : 0);
  }

  broadcastState(g: Runtime) {
    this.emitter?.broadcast(g.state.code, 'state', this.publicState(g));
  }

  private emitPhase(g: Runtime) {
    this.emitter?.broadcast(g.state.code, 'phaseChange', {
      phase: g.state.phase,
      endsAt: g.state.phaseEndsAt,
      round: g.state.round,
    });
  }

  private pushSpectatorStates(g: Runtime) {
    const spectator = toSpectatorState(g.state);
    for (const p of g.state.players) {
      if (p.alive) continue;
      this.emitter?.toToken(g.state.code, p.token, 'spectatorState', spectator);
    }
  }

  /** Everything a (re)connecting client needs, in one shot. */
  resendFor(code: string, token: string) {
    const g = this.get(code);
    if (!g) return;
    this.emitter?.toToken(code, token, 'state', this.publicState(g));
    const p = g.state.players.find((x) => x.token === token);
    if (!p) return;
    if (g.state.phase === 'ROLES') {
      const teammates =
        p.role === 'MIMIC'
          ? g.state.players.filter((x) => x.role === 'MIMIC' && x.id !== p.id).map((x) => x.name)
          : undefined;
      this.emitter?.toToken(code, token, 'privateState', { role: p.role, mimicTeammates: teammates });
    }
    if (g.state.phase === 'ACT' && p.alive)
      this.emitter?.toToken(code, token, 'actOptions', buildActOptions(g.state));
    if (!p.alive) this.emitter?.toToken(code, token, 'spectatorState', toSpectatorState(g.state));
  }


  playerNameById(g: Runtime, id: string) {
    return playerById(g.state, id)?.name ?? '?';
  }
}
