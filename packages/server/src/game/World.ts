import { ARENA, PHYSICS, PLAYER_HALF_H, PLAYER_HALF_W } from '@game/shared';
import { Player } from './Player.js';

export function stepPhysics(player: Player, dt: number): void {
  // horizontal input (overridden by dash)
  if (player.dashingFor > 0) {
    // keep dash velocity
  } else if (player.buttons.block && player.onGround) {
    // blocking → no horizontal move
    player.vx = 0;
  } else {
    let target = 0;
    if (player.buttons.left) target -= player.speed;
    if (player.buttons.right) target += player.speed;
    // simple acceleration
    if (target !== 0) {
      player.vx = target;
      player.facing = target > 0 ? 1 : -1;
    } else {
      player.vx *= PHYSICS.friction;
      if (Math.abs(player.vx) < 5) player.vx = 0;
    }
  }

  // gravity
  player.vy += PHYSICS.gravity * dt;
  if (player.vy > PHYSICS.maxFallSpeed) player.vy = PHYSICS.maxFallSpeed;

  // integrate
  player.x += player.vx * dt;
  player.y += player.vy * dt;

  // bounds
  if (player.x < PLAYER_HALF_W) player.x = PLAYER_HALF_W;
  if (player.x > ARENA.width - PLAYER_HALF_W) player.x = ARENA.width - PLAYER_HALF_W;

  // ground collision
  const groundTop = ARENA.groundY;
  let landed = false;
  if (player.y + PLAYER_HALF_H >= groundTop && player.vy >= 0) {
    player.y = groundTop - PLAYER_HALF_H;
    player.vy = 0;
    landed = true;
  }

  // platform collision (only when falling)
  if (!landed) {
    for (const p of ARENA.platforms) {
      const topY = p.y;
      const leftX = p.x;
      const rightX = p.x + p.w;
      const playerBottom = player.y + PLAYER_HALF_H;
      const prevBottom = playerBottom - player.vy * dt;
      const withinX = player.x + PLAYER_HALF_W > leftX && player.x - PLAYER_HALF_W < rightX;
      if (
        withinX &&
        player.vy >= 0 &&
        prevBottom <= topY + 2 &&
        playerBottom >= topY
      ) {
        player.y = topY - PLAYER_HALF_H;
        player.vy = 0;
        landed = true;
        break;
      }
    }
  }

  player.onGround = landed;
}
