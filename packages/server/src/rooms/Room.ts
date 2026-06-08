import type { Server } from 'socket.io';
import type {
  CharacterId,
  ClientToServerEvents,
  Loadout,
  PlayerPublic,
  RoomPhase,
  RoomState,
  ServerToClientEvents,
  ShopPurchasePayload,
  SkillId,
  WeaponId,
} from '@game/shared';
import {
  CHARACTERS,
  SKILLS,
  STARTING_COINS,
  WEAPONS,
} from '@game/shared';
import { GameLoop } from '../game/GameLoop.js';
import { Player } from '../game/Player.js';
import type { BotDifficulty } from '../game/Bot.js';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

interface Member {
  socketId: string;
  playerId: string;
  name: string;
  slot: 0 | 1;
  character: CharacterId | null;
  coins: number;
  ready: boolean;
  loadout: Loadout;
  continueRequested: boolean;
  isBot: boolean;
}

// Loadouts the bot may pick from. Each is guaranteed to cost <= STARTING_COINS.
const BOT_LOADOUTS: Array<{ weapon: WeaponId; skills: [SkillId | null, SkillId | null] }> = [
  { weapon: 'sword', skills: ['dash', 'fireball'] },    // 300 + 200 + 400 = 900
  { weapon: 'sword', skills: ['shield', 'fireball'] },  // 300 + 300 + 400 = 1000
  { weapon: 'bow', skills: ['dash', 'shield'] },        // 500 + 200 + 300 = 1000
  { weapon: 'hammer', skills: ['shield', null] },       // 700 + 300 = 1000
  { weapon: 'hammer', skills: ['dash', null] },         // 700 + 200 = 900
];

export class Room {
  phase: RoomPhase = 'lobby';
  private members = new Map<string, Member>();
  private loop: GameLoop | null = null;
  private disposed = false;
  botDifficulty: BotDifficulty = 'normal';

  constructor(
    private io: IO,
    public readonly code: string,
    private readonly onEmptyDestroy: () => void
  ) {}

  size(): number {
    return this.members.size;
  }

  isFull(): boolean {
    return this.members.size >= 2;
  }

  hasSocket(socketId: string): boolean {
    return this.members.has(socketId);
  }

  addMember(socketId: string, name: string, playerId: string): Member | null {
    if (this.isFull()) return null;
    const slot: 0 | 1 = this.nextSlot();
    const member: Member = {
      socketId,
      playerId,
      name: name.slice(0, 16) || `Player${slot + 1}`,
      slot,
      character: null,
      coins: STARTING_COINS,
      ready: false,
      loadout: { weapon: null, skills: [null, null] },
      continueRequested: false,
      isBot: false,
    };
    this.members.set(socketId, member);
    return member;
  }

  addBot(playerId: string, name = 'BOT'): Member | null {
    if (this.isFull()) return null;
    const slot: 0 | 1 = this.nextSlot();
    const key = `bot:${this.code}:${playerId.slice(0, 6)}`;
    const member: Member = {
      socketId: key,
      playerId,
      name,
      slot,
      character: null,
      coins: STARTING_COINS,
      ready: false,
      loadout: { weapon: null, skills: [null, null] },
      continueRequested: false,
      isBot: true,
    };
    this.members.set(key, member);
    return member;
  }

  private nextSlot(): 0 | 1 {
    const used = new Set([...this.members.values()].map((m) => m.slot));
    return used.has(0) ? 1 : 0;
  }

  hasBot(): boolean {
    for (const m of this.members.values()) if (m.isBot) return true;
    return false;
  }

  private humanCount(): number {
    let n = 0;
    for (const m of this.members.values()) if (!m.isBot) n++;
    return n;
  }

  removeMember(socketId: string): void {
    if (!this.members.has(socketId)) return;
    this.members.delete(socketId);
    this.stopMatch();
    if (this.humanCount() === 0) {
      // no humans left — tear the room down (and any leftover bot)
      this.onEmptyDestroy();
    } else {
      this.io.to(this.code).emit('room:closed', 'opponent left');
      this.onEmptyDestroy();
    }
  }

  selectCharacter(socketId: string, character: CharacterId): void {
    const m = this.members.get(socketId);
    if (!m) return;
    if (this.phase !== 'lobby') return;
    if (!CHARACTERS[character]) return;
    m.character = character;
    this.autoPickBotCharacter();
    this.tryAdvanceFromLobby();
    this.broadcastState();
  }

  private autoPickBotCharacter(): void {
    const bot = this.findBot();
    if (!bot || bot.character) return;
    const humanPicks = [...this.members.values()]
      .filter((m) => !m.isBot && m.character)
      .map((m) => m.character);
    const choices: CharacterId[] = ['brawler', 'ranger'];
    bot.character = choices.find((c) => !humanPicks.includes(c)) ?? 'ranger';
  }

  private findBot(): Member | null {
    for (const m of this.members.values()) if (m.isBot) return m;
    return null;
  }

  private autoBotShop(): void {
    const bot = this.findBot();
    if (!bot) return;
    const pick = BOT_LOADOUTS[Math.floor(Math.random() * BOT_LOADOUTS.length)];
    bot.loadout = { weapon: pick.weapon, skills: [pick.skills[0], pick.skills[1]] };
    let cost = WEAPONS[pick.weapon].price;
    for (const s of pick.skills) if (s) cost += SKILLS[s].price;
    bot.coins = Math.max(0, STARTING_COINS - cost);
    bot.ready = true;
  }

  purchase(socketId: string, payload: ShopPurchasePayload): { ok: boolean; error?: string } {
    const m = this.members.get(socketId);
    if (!m) return { ok: false, error: 'not in room' };
    if (this.phase !== 'shop') return { ok: false, error: 'not in shop' };

    const weaponId = payload.weapon;
    const skillIds = payload.skills;

    if (weaponId !== null && !WEAPONS[weaponId]) {
      return { ok: false, error: 'invalid weapon' };
    }
    for (const s of skillIds) {
      if (s !== null && !SKILLS[s]) return { ok: false, error: 'invalid skill' };
    }
    if (skillIds[0] !== null && skillIds[0] === skillIds[1]) {
      return { ok: false, error: 'duplicate skill' };
    }

    let total = 0;
    if (weaponId) total += WEAPONS[weaponId].price;
    if (skillIds[0]) total += SKILLS[skillIds[0]].price;
    if (skillIds[1]) total += SKILLS[skillIds[1]].price;
    if (total > m.coins + this.weaponRefund(m) + this.skillsRefund(m)) {
      return { ok: false, error: 'not enough coins' };
    }

    // simple model: refund current, charge new, recompute
    m.coins += this.weaponRefund(m) + this.skillsRefund(m);
    m.loadout.weapon = weaponId;
    m.loadout.skills = [skillIds[0], skillIds[1]];
    m.coins -= total;
    if (m.coins < 0) {
      // shouldn't happen due to check above, but defensive
      m.coins = 0;
    }
    m.ready = false;
    this.broadcastState();
    return { ok: true };
  }

  private weaponRefund(m: Member): number {
    return m.loadout.weapon ? WEAPONS[m.loadout.weapon].price : 0;
  }

  private skillsRefund(m: Member): number {
    let total = 0;
    for (const s of m.loadout.skills) {
      if (s) total += SKILLS[s].price;
    }
    return total;
  }

  setReady(socketId: string, ready: boolean): void {
    const m = this.members.get(socketId);
    if (!m) return;
    if (this.phase !== 'shop') return;
    if (ready && !m.loadout.weapon) return; // must have weapon to ready
    m.ready = ready;
    this.tryAdvanceFromShop();
    this.broadcastState();
  }

  requestContinue(socketId: string): void {
    const m = this.members.get(socketId);
    if (!m) return;
    if (this.phase !== 'result') return;
    m.continueRequested = true;
    // bot always auto-continues
    const bot = this.findBot();
    if (bot) bot.continueRequested = true;
    if ([...this.members.values()].every((x) => x.continueRequested)) {
      this.beginShop();
    } else {
      this.broadcastState();
    }
  }

  forwardInput(socketId: string, payload: import('@game/shared').InputState): void {
    if (this.phase !== 'match') return;
    const m = this.members.get(socketId);
    if (!m) return;
    this.loop?.applyInput(m.playerId, payload);
  }

  private tryAdvanceFromLobby(): void {
    if (this.phase !== 'lobby') return;
    if (this.members.size < 2) return;
    const all = [...this.members.values()];
    if (all.every((m) => m.character !== null)) {
      this.beginShop();
    }
  }

  private tryAdvanceFromShop(): void {
    if (this.phase !== 'shop') return;
    if (this.members.size < 2) return;
    const all = [...this.members.values()];
    if (all.every((m) => m.ready && m.loadout.weapon)) {
      this.beginMatch();
    }
  }

  private beginShop(): void {
    this.phase = 'shop';
    for (const m of this.members.values()) {
      m.coins = STARTING_COINS;
      m.loadout = { weapon: null, skills: [null, null] };
      m.ready = false;
      m.continueRequested = false;
    }
    // bot picks its loadout immediately
    this.autoBotShop();
    this.broadcastState();
  }

  private beginMatch(): void {
    this.phase = 'match';
    const players: Player[] = [];
    for (const m of this.members.values()) {
      if (!m.character || !m.loadout.weapon) continue;
      players.push(
        new Player(m.playerId, m.slot, m.character, m.loadout.weapon, m.loadout.skills, m.isBot)
      );
    }
    this.loop = new GameLoop(
      this.io,
      this.code,
      players,
      (winnerId) => this.onMatchEnd(winnerId),
      this.botDifficulty
    );
    this.loop.start();
    this.broadcastState();
  }

  private onMatchEnd(winnerId: string | null): void {
    if (this.disposed) return;
    this.phase = 'result';
    this.loop?.stop();
    this.loop = null;
    for (const m of this.members.values()) {
      m.continueRequested = false;
    }
    this.io.to(this.code).emit('match:end', { winnerId });
    this.broadcastState(winnerId);
  }

  private stopMatch(): void {
    if (this.loop) {
      this.loop.stop();
      this.loop = null;
    }
  }

  broadcastState(winnerId?: string | null): void {
    const players: PlayerPublic[] = [...this.members.values()].map((m) => ({
      id: m.playerId,
      name: m.name,
      slot: m.slot,
      character: m.character,
      coins: m.coins,
      ready: m.ready,
      loadout: m.loadout,
    }));
    const state: RoomState = {
      code: this.code,
      phase: this.phase,
      players,
      winnerId: winnerId ?? undefined,
    };
    this.io.to(this.code).emit('room:state', state);
  }

  dispose(): void {
    this.disposed = true;
    this.stopMatch();
    for (const m of this.members.values()) {
      const sock = this.io.sockets.sockets.get(m.socketId);
      sock?.leave(this.code);
    }
    this.members.clear();
  }

  getWeaponId(playerId: string): WeaponId | null {
    for (const m of this.members.values()) {
      if (m.playerId === playerId) return m.loadout.weapon;
    }
    return null;
  }

  getSkills(playerId: string): [SkillId | null, SkillId | null] {
    for (const m of this.members.values()) {
      if (m.playerId === playerId) return m.loadout.skills;
    }
    return [null, null];
  }
}
