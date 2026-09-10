import type { RoomId } from './types.js';

/** Fixed map order, used by the monitor and by the phone's room screen. */
export const ROOMS: RoomId[] = ['reactor', 'cargo', 'steering', 'oxygen', 'medbay'];

export const ROOM_NAMES: Record<RoomId, string> = {
  reactor: 'Reactor',
  cargo: 'Cargo bay',
  steering: 'Steering',
  oxygen: 'Oxygen',
  medbay: 'Med bay',
};

/** Undirected, exactly 6. Ring reactor–cargo–steering–medbay–oxygen plus the reactor–medbay chord. */
export const PIPES: [RoomId, RoomId][] = [
  ['reactor', 'cargo'],
  ['cargo', 'steering'],
  ['steering', 'medbay'],
  ['medbay', 'oxygen'],
  ['oxygen', 'reactor'],
  ['reactor', 'medbay'],
];

export const BREAKABLE: Record<RoomId, boolean> = {
  reactor: true,
  cargo: false,
  steering: true,
  oxygen: true,
  medbay: false,
};

/** Derived from PIPES once — never hard-code the adjacency a second time. */
export const ADJACENCY: Record<RoomId, RoomId[]> = (() => {
  const adj = {} as Record<RoomId, RoomId[]>;
  for (const r of ROOMS) adj[r] = [];
  for (const [a, b] of PIPES) {
    adj[a].push(b);
    adj[b].push(a);
  }
  // Keep each list in fixed map order so it is deterministic, then freeze: the ship's
  // topology is shared by every game in the process and must not be mutable by a caller.
  for (const r of ROOMS) {
    adj[r].sort((x, y) => ROOMS.indexOf(x) - ROOMS.indexOf(y));
    Object.freeze(adj[r]);
  }
  return Object.freeze(adj);
})();

/** The focus list for a room: the room itself first, then its pipe neighbours. */
export function focusTiles(room: RoomId): RoomId[] {
  return [room, ...ADJACENCY[room]];
}
