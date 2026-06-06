import { randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@game/shared';
import { RoomManager } from '../rooms/RoomManager.js';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;
type S = Socket<ClientToServerEvents, ServerToClientEvents>;

export function registerSocketHandlers(io: IO, socket: S, rooms: RoomManager): void {
  socket.on('room:create', ({ name }, cb) => {
    const room = rooms.createRoom();
    const playerId = randomUUID();
    const member = room.addMember(socket.id, name, playerId);
    if (!member) {
      cb({ ok: true, code: room.code, playerId }); // shouldn't happen, room is new
      return;
    }
    socket.join(room.code);
    rooms.trackSocket(socket.id, room.code);
    room.broadcastState();
    cb({ ok: true, code: room.code, playerId });
  });

  socket.on('room:join', ({ code, name }, cb) => {
    const room = rooms.joinRoom(code);
    if (!room) {
      cb({ ok: false, error: 'room not found' });
      return;
    }
    if (room.isFull()) {
      cb({ ok: false, error: 'room is full' });
      return;
    }
    const playerId = randomUUID();
    const member = room.addMember(socket.id, name, playerId);
    if (!member) {
      cb({ ok: false, error: 'could not join' });
      return;
    }
    socket.join(room.code);
    rooms.trackSocket(socket.id, room.code);
    room.broadcastState();
    cb({ ok: true, code: room.code, playerId });
  });

  socket.on('character:select', ({ character }) => {
    const room = rooms.findRoomBySocket(socket.id);
    if (!room) return;
    room.selectCharacter(socket.id, character);
  });

  socket.on('shop:purchase', (payload, cb) => {
    const room = rooms.findRoomBySocket(socket.id);
    if (!room) {
      cb({ ok: false, error: 'no room' });
      return;
    }
    const result = room.purchase(socket.id, payload);
    cb(result);
  });

  socket.on('shop:ready', ({ ready }) => {
    const room = rooms.findRoomBySocket(socket.id);
    if (!room) return;
    room.setReady(socket.id, ready);
  });

  socket.on('result:continue', () => {
    const room = rooms.findRoomBySocket(socket.id);
    if (!room) return;
    room.requestContinue(socket.id);
  });

  socket.on('input:state', (payload) => {
    const room = rooms.findRoomBySocket(socket.id);
    if (!room) return;
    room.forwardInput(socket.id, payload);
  });

  socket.on('room:leave', () => {
    leave(socket, rooms);
  });

  socket.on('disconnect', (reason) => {
    console.log(`[io] disconnect ${socket.id} (${reason})`);
    leave(socket, rooms);
  });
}

function leave(socket: S, rooms: RoomManager): void {
  const room = rooms.findRoomBySocket(socket.id);
  if (!room) return;
  room.removeMember(socket.id);
  rooms.untrackSocket(socket.id);
  socket.leave(room.code);
}
