import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { io, type Socket } from 'socket.io-client';
import { GamesService } from '../src/games.service';
import { GameGateway } from '../src/game.gateway';

/**
 * Integration cover for the socket layer: the events in build spec section 14, and the
 * hidden-information guarantees in section 16 that only show up once real payloads cross
 * a real socket.
 */

let app: INestApplication;
let port: number;
const sockets: Socket[] = [];
/** Latest `state` broadcast per socket, so assertions do not race the broadcast. */
const latest = new WeakMap<Socket, any>();

function connect(): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = io(`http://localhost:${port}`, { transports: ['websocket'], forceNew: true });
    sockets.push(s);
    s.on('state', (state: any) => latest.set(s, state));
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
}

function ack<T = any>(s: Socket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve) => s.emit(event, payload, resolve));
}

function next<T = any>(s: Socket, event: string, timeout = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), timeout);
    s.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

/**
 * Wait until a `state` broadcast satisfies a predicate — checking the most recent one
 * first, because the state that matters has usually already arrived by the time a test
 * gets around to asking for it.
 */
function until(s: Socket, predicate: (state: any) => boolean, timeout = 25000): Promise<any> {
  const current = latest.get(s);
  if (current && predicate(current)) return Promise.resolve(current);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      s.off('state', handler);
      reject(new Error('timed out waiting for state'));
    }, timeout);
    const handler = (state: any) => {
      if (!predicate(state)) return;
      clearTimeout(timer);
      s.off('state', handler);
      resolve(state);
    };
    s.on('state', handler);
  });
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    providers: [GamesService, GameGateway],
  }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
  await app.listen(0);
  port = (app.getHttpServer().address() as any).port;
});

afterAll(async () => {
  for (const s of sockets) s.disconnect();
  await app.close();
});

describe('GameGateway', () => {
  it('creates a game, seats players, and starts it', async () => {
    const host = await connect();
    const created = await ack(host, 'hostCreate', {});
    expect(created.ok).toBe(true);
    expect(created.code).toMatch(/^[A-Z]{4}$/);

    const { code, hostToken } = created;

    const names = ['Ann', 'Bo', 'Cal', 'Dee', 'Eva', 'Fin'];
    const players: { socket: Socket; token: string; id: string; name: string }[] = [];
    for (const name of names) {
      const s = await connect();
      const res = await ack(s, 'join', { code, name });
      expect(res.ok).toBe(true);
      players.push({ socket: s, token: res.token, id: res.playerId, name });
    }

    // Settings are host-only and LOBBY-only.
    expect((await ack(host, 'hostSetSettings', { code, hostToken, balance: 0, fastPhases: true })).ok).toBe(true);
    expect((await ack(host, 'hostSetSettings', { code, hostToken: 'nope', balance: 2 })).ok).toBe(false);

    // Everyone gets their role card exactly once, during ROLES.
    const roleCards = players.map((p) => next(p.socket, 'privateState'));
    expect((await ack(host, 'hostStart', { code, hostToken })).ok).toBe(true);
    const cards = await Promise.all(roleCards);

    const mimics = cards.filter((c) => c.role === 'MIMIC');
    expect(mimics).toHaveLength(2); // 6 players -> 2 aliens
    // Each Mimic is told the other Mimic's name, and nobody else is told anything.
    for (const c of mimics) expect(c.mimicTeammates).toHaveLength(1);
    for (const c of cards.filter((c) => c.role === 'CREW')) expect(c.mimicTeammates).toBeUndefined();

    // -- section 16.1 / 16.2: broadcasts never carry a living player's role or token.
    const broadcast = await until(host, (s) => s.phase === 'ACT');
    const asText = JSON.stringify(broadcast);
    expect(asText).not.toContain('"role"');
    expect(asText).not.toContain('"token"');
    expect(asText).not.toContain('MIMIC');
    expect(asText).not.toContain('"intent"');

    // -- section 16.4 / test 12: actOptions is one object, identical for every living player.
    const options = await Promise.all(
      players.map((p) =>
        new Promise<any>((resolve) => {
          p.socket.emit('rejoin', { code, token: p.token }, () => {});
          p.socket.once('actOptions', resolve);
        }),
      ),
    );
    for (const o of options) expect(o).toEqual(options[0]);
    expect(options[0].actions).toEqual(['WORK', 'SABO']);

    // -- test 16a: a well-formed but illegal sabotage acks exactly like a legal one, so the
    // response cannot tell a neighbour whether the sender is a Mimic.
    const crew = players.find((p) => cards[players.indexOf(p)].role === 'CREW')!;
    const mimic = players.find((p) => cards[players.indexOf(p)].role === 'MIMIC')!;
    const legal = await ack(mimic.socket, 'submitAction', {
      token: mimic.token,
      room: 'cargo',
      focus: 'steering',
      action: 'SABO',
    });
    const illegal = await ack(crew.socket, 'submitAction', {
      token: crew.token,
      room: 'cargo',
      focus: 'steering',
      action: 'SABO',
    });
    const alsoIllegal = await ack(mimic.socket, 'submitAction', {
      token: mimic.token,
      room: 'steering',
      focus: 'cargo', // unbreakable neighbour — resolves as WORK
      action: 'SABO',
    });
    expect(legal).toEqual({ ok: true });
    expect(illegal).toEqual({ ok: true });
    expect(alsoIllegal).toEqual({ ok: true });

    // Malformed input is the only thing that is refused.
    const bad = await ack(mimic.socket, 'submitAction', {
      token: mimic.token,
      room: 'engine-room',
      focus: 'cargo',
      action: 'SABO',
    });
    expect(bad.ok).toBe(false);

    // A focus that is not a pipe neighbour is malformed, not illegal-but-well-formed.
    const notAdjacent = await ack(mimic.socket, 'submitAction', {
      token: mimic.token,
      room: 'steering',
      focus: 'reactor',
      action: 'SABO',
    });
    expect(notAdjacent.ok).toBe(false);
  }, 40000);

  it('rejects hostSetSettings once the game has started, and leaves the state alone', async () => {
    const host = await connect();
    const { code, hostToken } = await ack(host, 'hostCreate', {});
    for (const name of ['Ann', 'Bo', 'Cal']) {
      const s = await connect();
      await ack(s, 'join', { code, name });
    }
    await ack(host, 'hostSetSettings', { code, hostToken, balance: -1, fastPhases: true });
    const before = await until(host, (s) => s.phase === 'LOBBY');
    expect(before.balance).toBe(-1);

    await ack(host, 'hostStart', { code, hostToken });
    const res = await ack(host, 'hostSetSettings', { code, hostToken, balance: 2 });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/frozen/i);

    const after = await until(host, () => true);
    expect(after.balance).toBe(-1);
  }, 30000);

  it('runs a whole game to a winner and only then reveals every role', async () => {
    const host = await connect();
    const { code, hostToken } = await ack(host, 'hostCreate', {});
    // An all-bot table: every ACT phase ends as soon as the last bot locks in, so the whole
    // game fits the budget. Six rounds is the shortest the settings allow.
    for (let i = 0; i < 8; i++) expect(await ack(host, 'hostAddBot', { code, hostToken })).toEqual({ ok: true });
    await ack(host, 'hostSetSettings', { code, hostToken, custom: { rounds: 6 }, fastPhases: true });
    await ack(host, 'hostStart', { code, hostToken });

    const over = await next<any>(host, 'gameOver', 200000);
    expect(['CREW', 'MIMIC']).toContain(over.winner);
    expect(['HULL_BREACH', 'ALL_MIMICS_FOUND', 'REACHED_THE_RELAY']).toContain(over.reason);
    expect(over.allRoles).toHaveLength(8);
    expect(over.allRoles.filter((r: any) => r.role === 'MIMIC').length).toBeGreaterThan(0);
  }, 240000);
});
