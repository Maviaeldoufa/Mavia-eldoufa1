import crypto from 'crypto';
import type { Server as HttpServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { getUserByToken } from './auth.ts';
import { db, getUserRankBadge } from './db.ts';
import type { ChatMessage } from './types.ts';

const ALLOWED_CHAT_ROOMS = new Set(['general', 'year-1', 'year-2', 'year-3', 'year-4']);

function normalizeRoom(room?: string | null): string {
  return room && ALLOWED_CHAT_ROOMS.has(room) ? room : 'general';
}

interface ClientMeta {
  ws: WebSocket;
  userId: string;
  room: string;
}

let broadcastMessageFn: ((msg: ChatMessage) => void) | null = null;
let closeNonAdminWsClientsFn: ((adminUserIds: Set<string>) => number) | null = null;

export function broadcastChatMessage(msg: ChatMessage): void {
  broadcastMessageFn?.(msg);
}

export function closeNonAdminWsClients(adminUserIds: Set<string>): number {
  return closeNonAdminWsClientsFn ? closeNonAdminWsClientsFn(adminUserIds) : 0;
}

export function attachWebSocketHub(httpServer: HttpServer): void {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws/chat' });
  const clients = new Set<ClientMeta>();

  closeNonAdminWsClientsFn = (adminUserIds: Set<string>) => {
    let closedCount = 0;
    for (const c of clients) {
      if (!adminUserIds.has(c.userId) && c.ws.readyState === WebSocket.OPEN) {
        c.ws.close(4001, 'Session revoked by administrator');
        closedCount += 1;
      }
    }
    return closedCount;
  };

  broadcastMessageFn = (msg: ChatMessage) => {
    const eventPayload = JSON.stringify({
      type: 'chat:message',
      room: msg.room,
      message: msg,
    });
    for (const c of clients) {
      if (c.room === msg.room && c.ws.readyState === WebSocket.OPEN) {
        c.ws.send(eventPayload);
      }
    }
  };

  function broadcastPresence(room: string) {
    const activeUsers = new Set<string>();
    for (const c of clients) {
      if (c.room === room && c.ws.readyState === WebSocket.OPEN) {
        activeUsers.add(c.userId);
      }
    }
    const payload = JSON.stringify({
      type: 'chat:presence',
      room,
      onlineCount: activeUsers.size,
    });
    for (const c of clients) {
      if (c.room === room && c.ws.readyState === WebSocket.OPEN) {
        c.ws.send(payload);
      }
    }
  }

  wss.on('connection', (ws, req) => {
    const reqUrl = new URL(req.url || '/', 'http://localhost:3000');
    const token = reqUrl.searchParams.get('token') || undefined;
    const initialRoom = normalizeRoom(reqUrl.searchParams.get('room'));

    const user = getUserByToken(token);
    if (!user || (user.isSuspended && !user.isProtected && user.role !== 'admin')) {
      ws.close(user?.isSuspended ? 4003 : 4001, user?.isSuspended ? 'Account suspended' : 'Unauthorized');
      return;
    }

    const meta: ClientMeta = { ws, userId: user.id, room: initialRoom };
    clients.add(meta);

    const storeSnapshot = db.get();
    const hydrateHistory = (list: ChatMessage[]) =>
      list.map((m) => {
        const sender = storeSnapshot.users.find((u) => u.id === m.userId);
        return {
          ...m,
          rankBadge: sender ? getUserRankBadge(sender) : m.rankBadge,
        };
      });

    const history = hydrateHistory(
      storeSnapshot.chatMessages.filter((m) => m.room === initialRoom).slice(-100)
    );
    ws.send(
      JSON.stringify({
        type: 'chat:init',
        room: initialRoom,
        messages: history,
      })
    );
    broadcastPresence(initialRoom);

    ws.on('message', (raw) => {
      try {
        const parsed = JSON.parse(raw.toString()) as {
          type?: string;
          room?: string;
          text?: string;
        };

        const currentUser = getUserByToken(token);
        if (!currentUser || (currentUser.isSuspended && !currentUser.isProtected && currentUser.role !== 'admin')) {
          ws.close(currentUser?.isSuspended ? 4003 : 4001, 'Session revoked or suspended');
          return;
        }

        if (parsed.type === 'chat:join' && parsed.room) {
          const prevRoom = meta.room;
          meta.room = normalizeRoom(parsed.room);
          broadcastPresence(prevRoom);
          broadcastPresence(meta.room);

          const roomHistory = hydrateHistory(
            db
              .get()
              .chatMessages.filter((m) => m.room === meta.room)
              .slice(-100)
          );
          ws.send(
            JSON.stringify({
              type: 'chat:init',
              room: meta.room,
              messages: roomHistory,
            })
          );
          return;
        }

        if (parsed.type === 'chat:send' && parsed.text?.trim()) {
          const room = normalizeRoom(parsed.room || meta.room);
          const msg: ChatMessage = {
            id: `msg-${crypto.randomUUID()}`,
            room,
            userId: currentUser.id,
            userName: currentUser.name,
            userRole: currentUser.role,
            userYear: currentUser.year,
            rankBadge: getUserRankBadge(currentUser),
            text: parsed.text.trim().slice(0, 1000),
            createdAt: new Date().toISOString(),
          };

          const store = db.get();
          store.chatMessages.push(msg);
          if (store.chatMessages.length > 1000) {
            store.chatMessages = store.chatMessages.slice(-800);
          }
          db.save();

          broadcastChatMessage(msg);
        }
      } catch {
        // Ignore malformed packets
      }
    });

    ws.on('close', () => {
      clients.delete(meta);
      broadcastPresence(meta.room);
    });
  });
}
