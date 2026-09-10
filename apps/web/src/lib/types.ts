/**
 * Types only. The web app never imports engine *code* — no game logic runs in the browser
 * (build spec section 1 and phone spec section 6). These re-exports keep that boundary
 * visible in one file.
 */
export type {
  Ballot,
  LogEntry,
  Phase,
  ResolvedConfig,
  RoomId,
  RoomReport,
  Role,
  Balance,
  CustomSettings,
} from '@mimic/engine';

export type { PublicState, PublicPlayer, PublicVote, PublicReport } from '@mimic/engine';

export type ActionButton = 'WORK' | 'SABO';

export interface ActOptions {
  rooms: import('@mimic/engine').RoomId[];
  focus: Record<import('@mimic/engine').RoomId, import('@mimic/engine').RoomId[]>;
  actions: ActionButton[];
}
