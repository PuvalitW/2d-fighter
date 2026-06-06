import type { CharacterId, SkillId, WeaponId } from './constants.js';
import type {
  InputState,
  MatchEvent,
  MatchSnapshot,
  RoomState,
} from './types.js';

export interface RoomCreateAck {
  ok: true;
  code: string;
  playerId: string;
}

export interface RoomJoinAck {
  ok: boolean;
  code?: string;
  playerId?: string;
  error?: string;
}

export interface ShopPurchasePayload {
  weapon: WeaponId | null;
  skills: [SkillId | null, SkillId | null];
}

export interface ShopPurchaseAck {
  ok: boolean;
  error?: string;
}

export interface ServerToClientEvents {
  'room:state': (state: RoomState) => void;
  'match:snapshot': (snap: MatchSnapshot) => void;
  'match:event': (evt: MatchEvent) => void;
  'match:end': (payload: { winnerId: string | null }) => void;
  'room:closed': (reason: string) => void;
  'error:msg': (msg: string) => void;
}

export interface ClientToServerEvents {
  'room:create': (
    payload: { name: string },
    cb: (ack: RoomCreateAck) => void
  ) => void;
  'room:join': (
    payload: { code: string; name: string },
    cb: (ack: RoomJoinAck) => void
  ) => void;
  'room:leave': () => void;
  'character:select': (payload: { character: CharacterId }) => void;
  'shop:purchase': (
    payload: ShopPurchasePayload,
    cb: (ack: ShopPurchaseAck) => void
  ) => void;
  'shop:ready': (payload: { ready: boolean }) => void;
  'result:continue': () => void;
  'input:state': (payload: InputState) => void;
}
