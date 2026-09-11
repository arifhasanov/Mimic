import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';
import { GamesService } from './games.service';
import type { Balance, BotSkill, CustomSettings } from '@mimic/engine';

type Ack = { ok: true; [k: string]: unknown } | { ok: false; error: string };

const str = (v: unknown, max = 64) => (typeof v === 'string' ? v.slice(0, max) : '');

@WebSocketGateway({ cors: { origin: true } })
export class GameGateway implements OnGatewayInit, OnGatewayDisconnect {
  private readonly log = new Logger('GameGateway');
  @WebSocketServer() server: Server;

  constructor(private readonly games: GamesService) {}

  afterInit(server: Server) {
    this.server = server;
    this.games.setEmitter({
      broadcast: (code, event, payload) => server.to(code).emit(event, payload),
      toToken: (code, token, event, payload) => {
        const g = this.games.get(code);
        const id = g?.sockets.get(token);
        // Private payloads go to one socket id, never to a room.
        if (id) server.to(id).emit(event, payload);
      },
      evict: (code, socketId) => server.in(socketId).socketsLeave(code),
      closeRoom: (code) => server.in(code).socketsLeave(code),
    });
  }

  handleDisconnect(client: Socket) {
    this.games.unbindSocket(client.id);
  }

  // -- host ----------------------------------------------------------------

  @SubscribeMessage('hostCreate')
  hostCreate(@ConnectedSocket() client: Socket): Ack {
    const { code, hostToken } = this.games.create();
    client.join(code);
    this.games.bindSocket(code, hostToken, client.id);
    const g = this.games.get(code)!;
    this.games.broadcastState(g);
    return { ok: true, code, hostToken };
  }

  @SubscribeMessage('hostSetSettings')
  hostSetSettings(@MessageBody() body: any): Ack {
    const code = str(body?.code, 8).toUpperCase();
    const hostToken = str(body?.hostToken, 64);
    const balance =
      body?.balance === undefined || body?.balance === null
        ? undefined
        : (Math.max(-2, Math.min(2, Math.round(Number(body.balance)))) as Balance);
    const custom =
      body?.custom === undefined ? undefined : (body.custom as Partial<CustomSettings> | null);
    const flag = (v: unknown) => (typeof v === 'boolean' ? v : undefined);
    const skill = (v: unknown): BotSkill | undefined =>
      v === 'EASY' || v === 'NORMAL' || v === 'HARD' ? v : undefined;
    const res = this.games.setSettings(code, hostToken, {
      balance,
      custom,
      fastPhases: flag(body?.fastPhases),
      manualSteps: flag(body?.manualSteps),
      hiddenVotes: flag(body?.hiddenVotes),
      botSkill: skill(body?.botSkill),
    });
    return res.ok ? { ok: true } : { ok: false, error: res.error ?? 'Rejected.' };
  }

  @SubscribeMessage('hostNext')
  hostNext(@MessageBody() body: any): Ack {
    const step = Number(body?.step);
    const res = this.games.next(str(body?.code, 8).toUpperCase(), str(body?.hostToken, 64), step);
    return res.ok ? { ok: true } : { ok: false, error: res.error ?? 'Rejected.' };
  }

  @SubscribeMessage('hostQuit')
  hostQuit(@MessageBody() body: any): Ack {
    const res = this.games.quit(str(body?.code, 8).toUpperCase(), str(body?.hostToken, 64));
    return res.ok ? { ok: true } : { ok: false, error: res.error ?? 'Rejected.' };
  }

  @SubscribeMessage('hostStart')
  hostStart(@MessageBody() body: any): Ack {
    const res = this.games.start(str(body?.code, 8).toUpperCase(), str(body?.hostToken, 64));
    return res.ok ? { ok: true } : { ok: false, error: res.error ?? 'Rejected.' };
  }

  @SubscribeMessage('hostAddBot')
  hostAddBot(@MessageBody() body: any): Ack {
    const ok = this.games.addBot(str(body?.code, 8).toUpperCase(), str(body?.hostToken, 64));
    return ok ? { ok: true } : { ok: false, error: 'Could not add a bot.' };
  }

  @SubscribeMessage('hostKick')
  hostKick(@MessageBody() body: any): Ack {
    const res = this.games.kick(
      str(body?.code, 8).toUpperCase(),
      str(body?.hostToken, 64),
      str(body?.playerId, 64),
    );
    return res.ok ? { ok: true } : { ok: false, error: res.error ?? 'Rejected.' };
  }

  // -- players -------------------------------------------------------------

  @SubscribeMessage('join')
  join(@ConnectedSocket() client: Socket, @MessageBody() body: any): Ack {
    const code = str(body?.code, 8).toUpperCase();
    const res = this.games.join(code, str(body?.name, 24));
    if (!res.ok) return { ok: false, error: res.error };
    client.join(code);
    this.games.bindSocket(code, res.token, client.id);
    this.games.resendFor(code, res.token);
    return { ok: true, token: res.token, playerId: res.playerId };
  }

  @SubscribeMessage('rejoin')
  rejoin(@ConnectedSocket() client: Socket, @MessageBody() body: any): Ack {
    const code = str(body?.code, 8).toUpperCase();
    const token = str(body?.token, 64);
    const g = this.games.get(code);
    if (!g) return { ok: false, error: 'That game is over.' };
    const isHost = g.hostToken === token;
    const player = g.state.players.find((p) => p.token === token);
    if (!isHost && !player) return { ok: false, error: 'Unknown player.' };
    client.join(code);
    this.games.bindSocket(code, token, client.id);
    this.games.broadcastState(g);
    // Answer with everything this client needs for the phase it is walking into,
    // so a phone that dropped mid-phase is whole again with no extra round trip.
    this.games.resendFor(code, token);
    return { ok: true, isHost, playerId: player?.id ?? null };
  }

  /**
   * Attach a screen to a game without any host powers. PublicState is safe for everyone by
   * construction, so a monitor that has lost its host token (or a second screen in another room)
   * can still show the game. It cannot start it or change settings.
   */
  @SubscribeMessage('watch')
  watch(@ConnectedSocket() client: Socket, @MessageBody() body: any): Ack {
    const code = str(body?.code, 8).toUpperCase();
    const g = this.games.get(code);
    if (!g) return { ok: false, error: 'No game with that code.' };
    client.join(code);
    this.games.broadcastState(g);
    // A watcher has no token, so the chat so far goes to its socket directly.
    client.emit('chat', g.chat);
    return { ok: true };
  }

  @SubscribeMessage('submitAction')
  submitAction(@MessageBody() body: any): Ack {
    const res = this.games.submitAction(str(body?.token, 64), body?.room, body?.focus, body?.action);
    return res.ok ? { ok: true } : { ok: false, error: res.error ?? 'Rejected.' };
  }

  @SubscribeMessage('submitBallot')
  submitBallot(@MessageBody() body: any): Ack {
    const res = this.games.submitBallot(str(body?.token, 64), body?.choice);
    return res.ok ? { ok: true } : { ok: false, error: res.error ?? 'Rejected.' };
  }
}
