import type {
  ButtonState,
  CharacterId,
  InputState,
  PlayerSnapshot,
  SkillId,
  WeaponId,
} from '@game/shared';
import {
  ARENA,
  CHARACTERS,
  DASH,
  PLAYER_HALF_H,
  PLAYER_HALF_W,
  SHIELD,
  WEAPONS,
} from '@game/shared';

export class Player {
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  facing: 1 | -1;
  hp: number;
  readonly maxHp: number;
  readonly speed: number;
  readonly jumpVel: number;

  // input snapshots
  buttons: ButtonState = emptyButtons();
  prevButtons: ButtonState = emptyButtons();

  // combat state
  attackCooldownMs = 0;
  attackingFor = 0; // ms remaining showing attack pose

  skillCooldownsMs: [number, number] = [0, 0];

  // status effects
  shieldedFor = 0; // ms
  dashingFor = 0; // ms
  dashInvulnFor = 0; // ms
  dashDir: 1 | -1 = 1;

  onGround = false;

  constructor(
    public readonly id: string,
    public readonly slot: 0 | 1,
    character: CharacterId,
    public readonly weapon: WeaponId,
    public readonly skills: [SkillId | null, SkillId | null]
  ) {
    const def = CHARACTERS[character];
    this.maxHp = def.hp;
    this.hp = def.hp;
    this.speed = def.speed;
    this.jumpVel = def.jump;
    this.facing = slot === 0 ? 1 : -1;
    this.x = slot === 0 ? 320 : ARENA.width - 320;
    this.y = ARENA.groundY - PLAYER_HALF_H;
  }

  applyInput(input: InputState): void {
    // simply replace latest buttons; prevButtons updated at tick start
    this.buttons = { ...input.buttons };
  }

  startTick(): void {
    // prevButtons set in GameLoop after applying input
  }

  isAlive(): boolean {
    return this.hp > 0;
  }

  takeDamage(amount: number, knockbackX: number): void {
    if (this.dashInvulnFor > 0) return;
    let dmg = amount;
    if (this.buttons.block && this.onGround && !this.dashingFor) dmg *= 0.5;
    if (this.shieldedFor > 0) dmg *= SHIELD.damageMultiplier;
    dmg = Math.max(1, Math.round(dmg));
    this.hp = Math.max(0, this.hp - dmg);
    this.vx += knockbackX;
    this.vy = Math.min(this.vy, -180);
  }

  startDash(): void {
    this.dashingFor = DASH.durationMs;
    this.dashInvulnFor = DASH.invulnMs;
    this.dashDir = this.facing;
    this.vx = this.dashDir * (DASH.distance / (DASH.durationMs / 1000));
    this.vy = 0;
  }

  startShield(): void {
    this.shieldedFor = SHIELD.durationMs;
  }

  toSnapshot(): PlayerSnapshot {
    const weaponCdMax = WEAPONS[this.weapon].cooldownMs;
    return {
      id: this.id,
      slot: this.slot,
      x: Math.round(this.x * 100) / 100,
      y: Math.round(this.y * 100) / 100,
      vx: this.vx,
      vy: this.vy,
      facing: this.facing,
      hp: this.hp,
      maxHp: this.maxHp,
      attacking: this.attackingFor > 0,
      blocking: this.buttons.block && this.onGround && this.dashingFor === 0,
      shielded: this.shieldedFor > 0,
      dashing: this.dashingFor > 0,
      weapon: this.weapon,
      cooldowns: {
        attackMs: Math.max(0, this.attackCooldownMs),
        skill1Ms: Math.max(0, this.skillCooldownsMs[0]),
        skill2Ms: Math.max(0, this.skillCooldownsMs[1]),
      },
    };
  }
}

export function emptyButtons(): ButtonState {
  return {
    left: false,
    right: false,
    jump: false,
    block: false,
    attack: false,
    skill1: false,
    skill2: false,
  };
}

export function buttonPressed(now: ButtonState, prev: ButtonState, key: keyof ButtonState): boolean {
  return now[key] && !prev[key];
}
