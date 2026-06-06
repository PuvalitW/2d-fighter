import type { ProjectileSnapshot } from '@game/shared';

export type ProjectileKind = 'arrow' | 'fireball';

export class Projectile {
  vx: number;
  vy: number;
  alive = true;
  travelled = 0;

  constructor(
    public readonly id: string,
    public readonly ownerId: string,
    public readonly kind: ProjectileKind,
    public x: number,
    public y: number,
    facing: 1 | -1,
    public readonly speed: number,
    public readonly damage: number,
    public readonly maxRange: number,
    public readonly halfW: number,
    public readonly halfH: number,
    public readonly knockback: number
  ) {
    this.vx = facing * speed;
    this.vy = 0;
  }

  step(dt: number): void {
    const dx = this.vx * dt;
    this.x += dx;
    this.travelled += Math.abs(dx);
    if (this.travelled >= this.maxRange) this.alive = false;
    if (this.x < -50 || this.x > 1330) this.alive = false;
  }

  toSnapshot(): ProjectileSnapshot {
    return {
      id: this.id,
      ownerId: this.ownerId,
      kind: this.kind,
      x: Math.round(this.x * 100) / 100,
      y: Math.round(this.y * 100) / 100,
    };
  }
}
