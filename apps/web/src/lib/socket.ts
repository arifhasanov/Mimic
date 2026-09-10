import { io, type Socket } from 'socket.io-client';
import { browser } from '$app/environment';

let socket: Socket | null = null;

/**
 * One socket per tab, always to window.location.origin. In dev, Vite proxies /socket.io to
 * the Nest server on 3000, so this code is identical in dev and production.
 */
export function getSocket(): Socket {
  if (!browser) throw new Error('sockets are browser-only');
  if (!socket) {
    socket = io({ path: '/socket.io', transports: ['websocket', 'polling'] });
  }
  return socket;
}

export function emitAck<T = any>(event: string, payload: unknown): Promise<T> {
  return new Promise((resolve) => {
    const s = getSocket();
    let done = false;
    const finish = (v: any) => {
      if (!done) {
        done = true;
        resolve(v);
      }
    };
    s.emit(event, payload, finish);
    setTimeout(() => finish({ ok: false, error: 'The server did not answer.' }), 8000);
  });
}

const KEY = 'mimic.session';

export interface StoredSession {
  code: string;
  token: string;
  playerId?: string;
  isHost?: boolean;
  name?: string;
}

export function saveSession(s: StoredSession) {
  if (!browser) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode — the player simply cannot reconnect automatically */
  }
}

export function loadSession(): StoredSession | null {
  if (!browser) return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

export function clearSession() {
  if (!browser) return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Host tokens are kept per room code so one laptop can host more than one game over an evening. */
export function saveHost(code: string, hostToken: string) {
  if (!browser) return;
  try {
    localStorage.setItem('mimic.host.' + code, hostToken);
  } catch {
    /* ignore */
  }
}

export function loadHost(code: string): string | null {
  if (!browser) return null;
  try {
    return localStorage.getItem('mimic.host.' + code);
  } catch {
    return null;
  }
}
