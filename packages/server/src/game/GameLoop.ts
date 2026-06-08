import type { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  InputState,
  MatchEvent,
  MatchSnapshot,
  ServerToClientEvents,
  SkillId,
} from '@game/shared';
import {
  ARENA,
  FIREBALL,
  PLAYER_HALF_H,
  PLAYER_HALF_W,
  SKILLS,
  TICK_MS,
  TICK_RATE,
  WEAPONS,
} from '@game/shared';
import { buttonPressed, Player } from './Player.js';
import { Projectile } from './Projectile.js';
import { Bot, type BotDifficulty } from './Bot.js';
import { meleeHit, projectileHit } from './combat.js';
import { stepPhysics } from './World.js';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

const MATCH_TIMEOUT_MS = 120_000;

export class GameLoop {
  private timer: NodeJS.Timeout | null = null;
  private tick = 0;
  private projectiles: Projectile[] = [];
  private projectileSeq = 0;
  private startedAt = 0;
  private running = false;
  private bots: Bot[] = [];

  constructor(
    private io: IO,
    private roomCode: string,
    private players: Player[],
    private onEnd: (winnerId: string | null) => void,
    private botDifficulty: BotDifficulty = 'normal'
  ) {}

  start(): void {
    this.startedAt = Date.now();
    this.running = true;
    // Spawn AI controllers for every bot-flagged player
    this.bots = this.players
      .filter((p) => p.isBot)
      .map((p) => new Bot(p, this.botDifficulty));
    this.timer = setInterval(() => this.step(), TICK_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.running = false;
  }

  applyInput(playerId: string, input: InputState): void {
    const p = this.players.find((x) => x.id === playerId);
    if (!p) return;
    p.applyInput(input);
  }

  private step(): void {
    if (!this.running) return;
    const dt = 1 / TICK_RATE;
    this.tick += 1;

    const events: MatchEvent[] = [];

    // bots decide BEFORE we read inputs for the tick
    if (this.bots.length) {
      const now = Date.now();
      for (const bot of this.bots) {
        const enemy = this.players.find((p) => p !== bot.player && p.isAlive()) ?? null;
        bot.think(enemy, now);
      }
    }

    // tick down timers + step physics
    for (const p of this.players) {
      p.attackCooldownMs = Math.max(0, p.attackCooldownMs - TICK_MS);
      p.attackingFor = Math.max(0, p.attackingFor - TICK_MS);
      p.skillCooldownsMs[0] = Math.max(0, p.skillCooldownsMs[0] - TICK_MS);
      p.skillCooldownsMs[1] = Math.max(0, p.skillCooldownsMs[1] - TICK_MS);
      p.shieldedFor = Math.max(0, p.shieldedFor - TICK_MS);
      p.dashingFor = Math.max(0, p.dashingFor - TICK_MS);
      p.dashInvulnFor = Math.max(0, p.dashInvulnFor - TICK_MS);

      // jump (on press, on ground)
      if (
        buttonPressed(p.buttons, p.prevButtons, 'jump') &&
        p.onGround &&
        !p.dashingFor
      ) {
        p.vy = -p.jumpVel;
        p.onGround = false;
      }

      stepPhysics(p, dt);
    }

    // skills + attack (post-physics for snappy feel)
    for (const p of this.players) {
      // attack
      if (
        buttonPressed(p.buttons, p.prevButtons, 'attack') &&
        p.attackCooldownMs === 0 &&
        p.dashingFor === 0
      ) {
        const w = WEAPONS[p.weapon];
        p.attackCooldownMs = w.cooldownMs;
        p.attackingFor = 180;
        events.push({ type: 'attack', ownerId: p.id });
        if (w.type === 'melee') {
          for (const t of this.players) {
            if (t.id === p.id) continue;
            if (!t.isAlive()) continue;
            const hit = meleeHit(p, t);
            if (hit) {
              this.applyHit(events, p, hit);
            }
          }
        } else if (w.type === 'ranged') {
          this.spawnProjectile(events, p, 'arrow', w.damage, w.projectileSpeed ?? 500, w.range, w.knockback, 14, 6);
        }
      }

      // skills
      this.maybeUseSkill(events, p, 0);
      this.maybeUseSkill(events, p, 1);

      p.prevButtons = { ...p.buttons };
    }

    // step projectiles
    for (const proj of this.projectiles) {
      if (!proj.alive) continue;
      proj.step(dt);
      for (const target of this.players) {
        if (!target.isAlive()) continue;
        const hit = projectileHit(proj, target);
        if (hit) {
          const owner = this.players.find((x) => x.id === proj.ownerId);
          if (owner) this.applyHit(events, owner, hit);
          proj.alive = false;
          break;
        }
      }
    }

    // remove dead projectiles
    const before = this.projectiles.length;
    this.projectiles = this.projectiles.filter((p) => {
      if (!p.alive) {
        events.push({ type: 'projectileGone', id: p.id });
        return false;
      }
      return true;
    });
    void before;

    // death check / timeout
    const alive = this.players.filter((p) => p.isAlive());
    const elapsed = Date.now() - this.startedAt;
    if (alive.length <= 1 || elapsed >= MATCH_TIMEOUT_MS) {
      const snapshot = this.snapshot();
      this.io.to(this.roomCode).emit('match:snapshot', snapshot);
      for (const ev of events) this.io.to(this.roomCode).emit('match:event', ev);
      let winnerId: string | null = null;
      if (alive.length === 1) winnerId = alive[0].id;
      else if (alive.length === 0) winnerId = null;
      else {
        // timeout: highest HP wins, tie = null
        const sorted = [...this.players].sort((a, b) => b.hp - a.hp);
        if (sorted.length === 2 && sorted[0].hp === sorted[1].hp) winnerId = null;
        else winnerId = sorted[0].id;
      }
      this.running = false;
      // give onEnd microtask break to send events first
      setImmediate(() => this.onEnd(winnerId));
      return;
    }

    // broadcast
    this.io.to(this.roomCode).emit('match:snapshot', this.snapshot());
    for (const ev of events) this.io.to(this.roomCode).emit('match:event', ev);
  }

  private applyHit(events: MatchEvent[], source: Player, hit: { target: Player; damage: number; knockback: number; x: number; y: number }): void {
    const before = hit.target.hp;
    hit.target.takeDamage(hit.damage, hit.knockback);
    const dealt = before - hit.target.hp;
    if (dealt > 0) {
      events.push({
        type: 'hit',
        targetId: hit.target.id,
        sourceId: source.id,
        amount: dealt,
        x: hit.x,
        y: hit.y,
      });
    }
    if (!hit.target.isAlive()) {
      events.push({ type: 'death', targetId: hit.target.id });
    }
  }

  private maybeUseSkill(events: MatchEvent[], p: Player, slotIdx: 0 | 1): void {
    const key = slotIdx === 0 ? 'skill1' : 'skill2';
    if (!buttonPressed(p.buttons, p.prevButtons, key as 'skill1' | 'skill2')) return;
    if (p.skillCooldownsMs[slotIdx] > 0) return;
    const skillId: SkillId | null = p.skills[slotIdx];
    if (!skillId) return;
    const def = SKILLS[skillId];

    switch (skillId) {
      case 'dash':
        p.startDash();
        break;
      case 'shield':
        p.startShield();
        break;
      case 'fireball':
        this.spawnProjectile(
          events,
          p,
          'fireball',
          FIREBALL.damage,
          FIREBALL.speed,
          FIREBALL.range,
          120,
          FIREBALL.hitW / 2,
          FIREBALL.hitH / 2
        );
        break;
    }
    p.skillCooldownsMs[slotIdx] = def.cooldownMs;
    events.push({ type: 'skill', ownerId: p.id, skill: skillId });
  }

  private spawnProjectile(
    events: MatchEvent[],
    owner: Player,
    kind: 'arrow' | 'fireball',
    damage: number,
    speed: number,
    range: number,
    knockback: number,
    halfW: number,
    halfH: number
  ): void {
    this.projectileSeq += 1;
    const id = `pr_${this.projectileSeq}`;
    const startX = owner.x + owner.facing * (PLAYER_HALF_W + halfW + 4);
    const startY = owner.y - 4;
    const proj = new Projectile(
      id,
      owner.id,
      kind,
      startX,
      startY,
      owner.facing,
      speed,
      damage,
      range,
      halfW,
      halfH,
      knockback
    );
    this.projectiles.push(proj);
    events.push({ type: 'projectileSpawn', id, kind });
  }

  private snapshot(): MatchSnapshot {
    return {
      tick: this.tick,
      players: this.players.map((p) => p.toSnapshot()),
      projectiles: this.projectiles.filter((p) => p.alive).map((p) => p.toSnapshot()),
    };
  }
}
