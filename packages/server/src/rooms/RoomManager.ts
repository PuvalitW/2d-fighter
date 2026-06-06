import type { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@game/shared';
import { ROOM_CODE_LENGTH } from '@game/shared';
import { Room } from './Room.js';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomCode(length = ROOM_CODE_LENGTH): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

export class RoomManager {
  private rooms = new Map<string, Room>();
  private socketToRoom = new Map<string, string>();

  constructor(private io: IO) {}

  createRoom(): Room {
    let code = randomCode();
    while (this.rooms.has(code)) code = randomCode();
    const room = new Room(this.io, code, () => this.destroyRoom(code));
    this.rooms.set(code, room);
    return room;
  }

  joinRoom(code: string): Room | null {
    return this.rooms.get(code.toUpperCase()) ?? null;
  }

  trackSocket(socketId: string, code: string): void {
    this.socketToRoom.set(socketId, code);
  }

  untrackSocket(socketId: string): string | undefined {
    const code = this.socketToRoom.get(socketId);
    this.socketToRoom.delete(socketId);
    return code;
  }

  findRoomBySocket(socketId: string): Room | null {
    const code = this.socketToRoom.get(socketId);
    if (!code) return null;
    return this.rooms.get(code) ?? null;
  }

  destroyRoom(code: string): void {
    const room = this.rooms.get(code);
    if (!room) return;
    room.dispose();
    this.rooms.delete(code);
    console.log(`[rooms] destroyed ${code}`);
  }
}
