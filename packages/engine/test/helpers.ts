import {
  createGame,
  startGame,
  createRng,
  type GameState,
  type RoomId,
  type Submission,
  type ActionButton,
} from '../src/index.js';

export const NAMES = [
  'Ann', 'Bo', 'Cal', 'Dee', 'Eva', 'Fin', 'Gareth', 'Hugo',
  'Iris', 'Jo', 'Kai', 'Lena',
];

/** A started game with `n` players and fully controlled roles. */
export function makeGame(n: number, opts: { seed?: number; mimics?: string[] } = {}): GameState {
  let s = createGame('TEST', opts.seed ?? 1);
  for (let i = 0; i < n; i++) {
    s.players.push({
      id: 'p' + i,
      name: NAMES[i],
      token: 't' + i,
      role: 'CREW',
      alive: true,
      verified: false,
      room: null,
      connected: true,
      isBot: false,
    });
  }
  s = startGame(s, createRng(opts.seed ?? 1));
  if (opts.mimics) {
    for (const p of s.players) p.role = opts.mimics.includes(p.name) ? 'MIMIC' : 'CREW';
  }
  s.round = 1;
  s.phase = 'ACT';
  return s;
}

export function sub(
  state: GameState,
  name: string,
  room: RoomId,
  focus?: RoomId,
  action: ActionButton = 'WORK',
): GameState {
  const p = state.players.find((x) => x.name === name)!;
  const s: Submission = { playerId: p.id, room, focus: focus ?? room, action };
  state.submissions[p.id] = s;
  return state;
}

export const byName = (s: GameState, name: string) => s.players.find((p) => p.name === name)!;

/** Deterministic rng stub: hands back the numbers you give it, then 0.5 forever. */
export function scriptedRng(values: number[]) {
  let i = 0;
  const next = () => (i < values.length ? values[i++] : 0.5);
  const int = (max: number) => Math.floor(next() * max);
  return {
    next,
    int,
    pick: <T>(items: T[]) => items[int(items.length)],
    shuffle: <T>(items: T[]) => items.slice(),
    chance: (p: number) => next() < p,
  };
}
