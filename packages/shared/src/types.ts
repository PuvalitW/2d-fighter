import type { CharacterId, SkillId, WeaponId } from './constants.js';

export type RoomPhase = 'lobby' | 'shop' | 'match' | 'result';

export interface ButtonState {
  left: boolean;
  right: boolean;
  jump: boolean;
  block: boolean;
  attack: boolean;
  skill1: boolean;
  skill2: boolean;
}

export interface InputState {
  tick: number;
  buttons: ButtonState;
}

export interface Loadout {
  weapon: WeaponId | null;
  skills: [SkillId | null, SkillId | null];
}

export interface PlayerPublic {
  id: string;
  name: string;
  slot: 0 | 1;
  character: CharacterId | null;
  coins: number;
  ready: boolean;
  loadout: Loadout;
}

export interface PlayerSnapshot {
  id: string;
  slot: 0 | 1;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  hp: number;
  maxHp: number;
  attacking: boolean;
  blocking: boolean;
  shielded: boolean;
  dashing: boolean;
  weapon: WeaponId | null;
  cooldowns: {
    attackMs: number;
    skill1Ms: number;
    skill2Ms: number;
  };
}

export interface ProjectileSnapshot {
  id: string;
  ownerId: string;
  kind: 'arrow' | 'fireball';
  x: number;
  y: number;
}

export interface MatchSnapshot {
  tick: number;
  players: PlayerSnapshot[];
  projectiles: ProjectileSnapshot[];
}

export interface RoomState {
  code: string;
  phase: RoomPhase;
  players: PlayerPublic[];
  winnerId?: string;
}

export type MatchEvent =
  | { type: 'hit'; targetId: string; sourceId: string; amount: number; x: number; y: number }
  | { type: 'death'; targetId: string }
  | { type: 'skill'; ownerId: string; skill: SkillId }
  | { type: 'attack'; ownerId: string }
  | { type: 'projectileSpawn'; id: string; kind: 'arrow' | 'fireball' }
  | { type: 'projectileGone'; id: string };
