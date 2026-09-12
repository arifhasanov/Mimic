import type { ActOptions, ChatMessage, PublicState } from './types';
import { getSocket } from './socket';

interface SpectatorState {
  players: { id: string; name: string; trueRole: 'CREW' | 'MIMIC'; alive: boolean; room: string | null }[];
  intents: { playerId: string; room: string; intent: string; target?: string; resource?: string }[];
}

/**
 * The whole client-side model. Note what is *not* here: after the ROLES phase the role card
 * is dropped entirely, so no key named `role` or `mimicTeammates` survives anywhere in this
 * store (phone spec section 6, test 16).
 */
class GameStore {
  state = $state<PublicState | null>(null);
  actOptions = $state<ActOptions | null>(null);
  spectator = $state<SpectatorState | null>(null);
  /** What the bots have said so far. Monitor-only in practice; phones ignore it. */
  chat = $state<ChatMessage[]>([]);
  connected = $state(false);
  /** Set only while the ROLES phase is running, then destroyed. */
  roleCard = $state<{ role: 'CREW' | 'MIMIC'; mimicTeammates?: string[] } | null>(null);
  /**
   * This phone's own ballot rights, sent privately: whether it may vote at all (a runoff
   * candidate may not) and whether its one skip for the game is still unspent.
   */
  voteInfo = $state<{ canVote: boolean; skipAvailable: boolean } | null>(null);
  /** Set when the host ends the game or removes this player; pages send the user to the menu. */
  closed = $state<null | 'closed' | 'kicked'>(null);

  private wired = false;
  /**
   * What to do on a reconnect. Replaced by every page that calls wire(), so a tab that has
   * moved on to a new game never rejoins the old one when its socket drops and comes back.
   */
  private reconnect: (() => void) | null = null;

  /**
   * Split out from the socket handler so it can be tested without a server. The role card
   * exists for exactly one phase and is then unrecoverable by the client (test 16).
   */
  applyState(payload: PublicState) {
    const previous = this.state?.phase;
    this.state = payload;
    if (payload.phase !== 'ROLES' && previous !== payload.phase) this.roleCard = null;
    if (payload.phase !== 'ACT') this.actOptions = null;
    if (payload.phase !== 'VOTE') this.voteInfo = null;
  }

  /** Pages call this on mount, then attach themselves if the socket is already up. */
  wire(onReconnect: () => void) {
    this.reconnect = onReconnect;
    const s = getSocket();
    // Navigating from the join screen reuses a socket that is already connected, so the
    // 'connect' event has been and gone. Seed from the live flag or the UI sticks on
    // "Connecting…" forever.
    this.connected = s.connected;
    if (this.wired) return;
    this.wired = true;

    s.on('connect', () => {
      this.connected = true;
      this.reconnect?.();
    });
    s.on('disconnect', () => {
      this.connected = false;
    });
    s.on('state', (payload: PublicState) => this.applyState(payload));
    s.on('privateState', (payload: { role: 'CREW' | 'MIMIC'; mimicTeammates?: string[] }) => {
      this.roleCard = payload;
    });
    s.on('actOptions', (payload: ActOptions) => {
      this.actOptions = payload;
    });
    s.on('voteInfo', (payload: { canVote: boolean; skipAvailable: boolean }) => {
      this.voteInfo = payload;
    });
    s.on('gameClosed', () => {
      this.closed = 'closed';
    });
    s.on('kicked', () => {
      this.closed = 'kicked';
    });
    s.on('spectatorState', (payload: SpectatorState) => {
      this.spectator = payload;
    });
    s.on('chat', (payload: ChatMessage[]) => {
      this.chat = Array.isArray(payload) ? payload : [];
    });
  }

  reset() {
    this.state = null;
    this.actOptions = null;
    this.spectator = null;
    this.chat = [];
    this.roleCard = null;
    this.voteInfo = null;
    this.closed = null;
  }
}

export const game = new GameStore();

/** Server clock offset, so every screen counts down from the same instant. */
let clockSkew = 0;
export function noteServerNow(serverNow: number) {
  clockSkew = serverNow - Date.now();
}
export function secondsLeft(endsAt: number): number {
  if (!endsAt) return 0;
  return Math.max(0, Math.ceil((endsAt - (Date.now() + clockSkew)) / 1000));
}

export function mmss(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export const PHASE_WORDS: Record<string, string> = {
  LOBBY: 'Waiting for players',
  ROLES: 'Look at your phone',
  REPORT: 'Ship report',
  TALK: 'Talk out loud',
  ACT: 'Choose your action',
  RESOLVE: 'What happened',
  VOTE: 'Vote',
  GAME_OVER: 'Game over',
};
