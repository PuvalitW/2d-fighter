import { PLAYER_HALF_H, PLAYER_HALF_W, WEAPONS } from '@game/shared';
import { Player } from './Player.js';
import { Projectile } from './Projectile.js';

export interface HitInfo {
  target: Player;
  damage: number;
  knockback: number;
  x: number;
  y: number;
}

// Returns true if AABB centered at (ax, ay) hits target's bbox.
function aabbHit(
  ax: number,
  ay: number,
  hw: number,
  hh: number,
  target: Player
): boolean {
  return (
    Math.abs(ax - target.x) <= hw + PLAYER_HALF_W &&
    Math.abs(ay - target.y) <= hh + PLAYER_HALF_H
  );
}

export function meleeHit(attacker: Player, target: Player): HitInfo | null {
  const w = WEAPONS[attacker.weapon];
  if (w.type !== 'melee') return null;
  const reach = w.range;
  const ax = attacker.x + attacker.facing * (PLAYER_HALF_W + reach / 2);
  const ay = attacker.y;
  if (aabbHit(ax, ay, reach / 2, PLAYER_HALF_H, target)) {
    return {
      target,
      damage: w.damage,
      knockback: attacker.facing * w.knockback,
      x: target.x,
      y: target.y,
    };
  }
  return null;
}

export function projectileHit(p: Projectile, target: Player): HitInfo | null {
  if (p.ownerId === target.id) return null;
  if (aabbHit(p.x, p.y, p.halfW, p.halfH, target)) {
    return {
      target,
      damage: p.damage,
      knockback: Math.sign(p.vx) * p.knockback,
      x: p.x,
      y: p.y,
    };
  }
  return null;
}
