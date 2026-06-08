import { SKILLS, WEAPONS, type SkillId } from '@game/shared';
import { Player, emptyButtons } from './Player.js';

export type BotDifficulty = 'easy' | 'normal' | 'hard';

interface DifficultyTuning {
  reactionMs: number;     // how often to re-decide direction
  attackChance: number;   // 0..1: probability that bot fires when in range each decision
  backoffJitterChance: number; // chance to back off after attacking
  preferredGap: number;   // pixels: ideal distance to maintain (melee)
}

const PRESETS: Record<BotDifficulty, DifficultyTuning> = {
  easy:   { reactionMs: 320, attackChance: 0.65, backoffJitterChance: 0.4, preferredGap: 90 },
  normal: { reactionMs: 180, attackChance: 0.88, backoffJitterChance: 0.25, preferredGap: 65 },
  hard:   { reactionMs: 90,  attackChance: 0.98, backoffJitterChance: 0.15, preferredGap: 55 },
};

/**
 * Simple reactive AI: walk toward / away to keep target gap, attack when in
 * range with edge-triggered presses (so the server's "pressed this tick"
 * detection works), jump when the enemy is significantly above, use skills
 * opportunistically, block when the enemy is mid-attack and very close.
 *
 * Inputs are written directly into player.buttons before the GameLoop reads
 * them for the tick.
 */
export class Bot {
  private tuning: DifficultyTuning;
  private nextDecideAt = 0;
  private holdDir: 0 | 1 | -1 = 0;
  private holdBlock = false;

  constructor(public player: Player, difficulty: BotDifficulty = 'normal') {
    this.tuning = PRESETS[difficulty];
  }

  /** Called once per server tick BEFORE physics. Sets player.buttons. */
  think(enemy: Player | null, nowMs: number): void {
    if (!this.player.isAlive()) {
      this.player.buttons = emptyButtons();
      return;
    }
    if (!enemy || !enemy.isAlive()) {
      this.player.buttons = emptyButtons();
      return;
    }

    const dx = enemy.x - this.player.x;
    const dy = enemy.y - this.player.y;
    const dist = Math.abs(dx);
    const toward: 1 | -1 = dx >= 0 ? 1 : -1;

    const w = WEAPONS[this.player.weapon];
    const isRanged = w.type === 'ranged';
    const range = w.range;

    // re-evaluate slow inputs (direction, block) only on reaction cadence
    if (nowMs >= this.nextDecideAt) {
      this.nextDecideAt = nowMs + this.tuning.reactionMs;

      const gap = isRanged ? Math.min(280, range * 0.7) : this.tuning.preferredGap;
      const slack = 25;

      if (dist > gap + slack) {
        this.holdDir = toward; // close the gap
      } else if (dist < gap - slack) {
        this.holdDir = (-toward) as 1 | -1; // back off
      } else {
        // strafe at preferred distance: tiny chance of side step
        if (Math.random() < this.tuning.backoffJitterChance) {
          this.holdDir = Math.random() < 0.5 ? (1 as 1) : (-1 as -1);
        } else {
          this.holdDir = 0;
        }
      }

      // block decision: enemy is mid-attack, close, and we can't attack right now
      const enemyAttacking = enemy.attackingFor > 0;
      const canCounter = this.player.attackCooldownMs < 80;
      this.holdBlock =
        enemyAttacking && dist < 120 && !canCounter && this.player.onGround;
    }

    const btn = emptyButtons();

    // direction
    if (this.holdBlock) {
      btn.block = true;
    } else if (this.holdDir === 1) {
      btn.right = true;
    } else if (this.holdDir === -1) {
      btn.left = true;
    }

    // jump if enemy is significantly higher and within horizontal reach
    if (dy < -70 && dist < 280 && this.player.onGround && !this.holdBlock) {
      btn.jump = true;
      // turn toward enemy as we jump
      if (toward === 1) btn.right = true;
      else if (toward === -1) btn.left = true;
    }

    // edge-triggered attack: press only when cooldown is ready and we'd hit
    const inAttackRange = isRanged
      ? dist < range * 0.92 && Math.abs(dy) < 220
      : dist < range + 28 && Math.abs(dy) < 60;
    if (
      inAttackRange &&
      this.player.attackCooldownMs === 0 &&
      !this.player.dashingFor &&
      !this.holdBlock &&
      Math.random() < this.tuning.attackChance
    ) {
      btn.attack = true;
      // a melee combatant tends to step forward on swing
      if (!isRanged) {
        if (toward === 1) btn.right = true;
        else btn.left = true;
        btn.left = btn.left && toward === -1;
        btn.right = btn.right && toward === 1;
      }
    }

    // skills: pick by situation
    for (let i = 0; i < 2; i++) {
      const slot = i as 0 | 1;
      const id = this.player.skills[slot];
      if (!id) continue;
      if (this.player.skillCooldownsMs[slot] > 0) continue;
      const want = this.wantSkill(id, dist, dy, enemy);
      if (!want) continue;
      if (slot === 0) btn.skill1 = true;
      else btn.skill2 = true;
    }

    this.player.buttons = btn;
  }

  private wantSkill(id: SkillId, dist: number, dy: number, enemy: Player): boolean {
    const def = SKILLS[id];
    void def;
    const hpRatio = this.player.hp / this.player.maxHp;

    switch (id) {
      case 'fireball':
        // long-range poke when enemy can't immediately punish
        return dist > 140 && dist < 620 && Math.abs(dy) < 200;
      case 'dash':
        // close gap when far, or escape if low HP and crowded
        if (hpRatio < 0.3 && dist < 100) return true;
        if (dist > 260) return true;
        return false;
      case 'shield':
        // save when low HP and enemy attacking close
        if (hpRatio < 0.55 && enemy.attackingFor > 0 && dist < 180) return true;
        if (hpRatio < 0.3) return true;
        return false;
    }
  }
}
