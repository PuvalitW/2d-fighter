import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@game/shared';
import { RoomManager } from './rooms/RoomManager.js';
import { registerSocketHandlers } from './handlers/sockets.js';

const PORT = Number(process.env.PORT ?? 4000);
// CLIENT_ORIGIN: comma-separated list, or "*" for any
const rawOrigins = process.env.CLIENT_ORIGIN ?? '*';
const allowedOrigins =
  rawOrigins === '*'
    ? '*'
    : rawOrigins.split(',').map((s) => s.trim()).filter(Boolean);

const corsOptions = { origin: allowedOrigins, methods: ['GET', 'POST'] };

const app = express();
app.use(cors(corsOptions));
app.get('/health', (_req, res) => {
  res.json({ ok: true, time: Date.now() });
});
app.get('/', (_req, res) => {
  res.type('text/plain').send('2D Fighter game server. See /health.');
});

const httpServer = http.createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: corsOptions,
});

const rooms = new RoomManager(io);

io.on('connection', (socket) => {
  console.log(`[io] connected ${socket.id}`);
  registerSocketHandlers(io, socket, rooms);
});

httpServer.listen(PORT, () => {
  console.log(`[server] listening on :${PORT}`);
});
