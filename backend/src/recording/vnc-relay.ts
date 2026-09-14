import type { Server as HttpServer } from 'node:http';
import { connect as netConnect } from 'node:net';
import { URL } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import * as jwt from 'jsonwebtoken';
import { VNC_PORT } from './recording.service';

const RELAY_PATH = '/ws/recording';

/** Bridges a browser WebSocket to the local x11vnc TCP port, so the noVNC client in
 *  TestDetail can render (and control) the Codegen browser window that's rendering into
 *  the container's virtual display (see recording.service.ts / NEEDS_VIRTUAL_DISPLAY).
 *  This is a raw `ws` server attached directly to the underlying HTTP server rather than a
 *  NestJS gateway — Nest's global `/api` prefix only applies to its own HTTP routing, and a
 *  byte-for-byte proxy doesn't need any of Nest's request pipeline (guards, DI, etc.)
 *  beyond the one JWT check done manually below. */
export function attachVncRelay(httpServer: HttpServer, isRecordingActive: (testId: string) => boolean): void {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    if (!req.url || !req.url.startsWith(RELAY_PATH)) return; // not ours — leave for any other upgrade handler

    const url = new URL(req.url, 'http://internal');
    const token = url.searchParams.get('token');
    const testId = url.searchParams.get('testId');

    if (!token || !verifyToken(token)) {
      socket.destroy();
      return;
    }
    if (!testId || !isRecordingActive(testId)) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      const tcp = netConnect(VNC_PORT, '127.0.0.1');

      tcp.on('connect', () => {
        ws.on('message', (data) => tcp.write(data as Buffer));
        tcp.on('data', (data) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(data);
        });
      });
      tcp.on('error', () => ws.close());
      tcp.on('close', () => ws.close());
      ws.on('close', () => tcp.destroy());
      ws.on('error', () => tcp.destroy());
    });
  });
}

function verifyToken(token: string): boolean {
  try {
    jwt.verify(token, process.env.JWT_SECRET ?? 'dev-secret-change-me');
    return true;
  } catch {
    return false;
  }
}
