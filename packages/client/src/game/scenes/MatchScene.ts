import Phaser from 'phaser';
import type {
  ButtonState,
  CharacterId,
  MatchSnapshot,
  PlayerSnapshot,
  ProjectileSnapshot,
  RoomState,
  SkillId,
  WeaponId,
} from '@game/shared';
import {
  ARENA,
  PLAYER_HALF_H,
  PLAYER_HALF_W,
  SKILLS,
  TICK_RATE,
} from '@game/shared';
import { getSocket } from '../network/socket';
import { HumanSprite } from '../entities/HumanSprite';

interface PlayerView {
  sprite: HumanSprite;
  character: CharacterId;
  weapon: WeaponId | null;
  nameTag: Phaser.GameObjects.Text;
  hpBg: Phaser.GameObjects.Rectangle;
  hpFill: Phaser.GameObjects.Rectangle;
  hpText: Phaser.GameObjects.Text;
  // last frame state (for animation interpolation)
  lastDrawnX: number;
  lastDrawnY: number;
  lastAttackUntil: number;
}

interface ProjectileView {
  gfx: Phaser.GameObjects.Arc | Phaser.GameObjects.Rectangle;
}

const KEY_TO_BTN: Record<string, keyof ButtonState> = {
  a: 'left',
  d: 'right',
  w: 'jump',
  s: 'block',
  j: 'attack',
  k: 'skill1',
  l: 'skill2',
};

export class MatchScene extends Phaser.Scene {
  private players = new Map<string, PlayerView>();
  private projectiles = new Map<string, ProjectileView>();
  private buttons: ButtonState = emptyButtons();
  private snap: MatchSnapshot | null = null;
  private prevSnap: MatchSnapshot | null = null;
  private interpProgress = 0;
  private myId = '';
  private cdText!: Phaser.GameObjects.Text;
  private weaponLabel!: Phaser.GameObjects.Text;
  private skillLabels!: Phaser.GameObjects.Text;
  private playerInfo: Map<string, { character: CharacterId; weapon: WeaponId | null; name: string; slot: 0 | 1 }> =
    new Map();
  private heartbeat = 0;
  private inputTick = 0;

  constructor() {
    super({ key: 'MatchScene' });
  }

  create(): void {
    this.players.clear();
    this.projectiles.clear();
    this.snap = null;
    this.prevSnap = null;
    this.buttons = emptyButtons();
    this.myId = window.sessionStorage.getItem('fighter:playerId') ?? '';

    this.drawArena();

    // HUD
    this.cdText = this.add.text(20, 20, '', { fontSize: '14px', color: '#fff' });
    this.weaponLabel = this.add.text(20, 50, '', { fontSize: '14px', color: '#ffd166' });
    this.skillLabels = this.add.text(20, 76, '', { fontSize: '13px', color: '#7cc4ff' });

    // input
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => this.handleKey(e, true));
    this.input.keyboard?.on('keyup', (e: KeyboardEvent) => this.handleKey(e, false));

    const socket = getSocket();
    socket.off('match:snapshot');
    socket.off('match:event');
    socket.off('room:state');
    socket.on('match:snapshot', (s) => this.onSnapshot(s));
    socket.on('match:event', (ev) => this.onMatchEvent(ev));
    socket.on('room:state', (state) => this.onRoomState(state));
  }

  private drawArena(): void {
    // sky gradient bands
    this.add.rectangle(ARENA.width / 2, 150, ARENA.width, 300, 0x1f2735);
    this.add.rectangle(ARENA.width / 2, 420, ARENA.width, 240, 0x252e3e);

    // distant mountains silhouette (just 2 triangles)
    const g = this.add.graphics();
    g.fillStyle(0x1a2330, 1);
    g.fillTriangle(120, 460, 320, 220, 540, 460);
    g.fillTriangle(720, 460, 920, 260, 1180, 460);

    // ground band
    this.add.rectangle(ARENA.width / 2, ARENA.groundY + 40, ARENA.width, 80, 0x2c3346);
    this.add.rectangle(ARENA.width / 2, ARENA.groundY, ARENA.width, 4, 0x6c7488);

    // platforms with shadow & highlight
    for (const p of ARENA.platforms) {
      // shadow
      this.add.rectangle(p.x + p.w / 2, p.y + p.h / 2 + 4, p.w, p.h, 0x000000, 0.3);
      // body
      this.add
        .rectangle(p.x + p.w / 2, p.y + p.h / 2, p.w, p.h, 0x4a5266)
        .setStrokeStyle(1, 0x6b7488);
      // top highlight
      this.add.rectangle(p.x + p.w / 2, p.y + 1, p.w, 2, 0x8a93a7);
    }
  }

  private handleKey(e: KeyboardEvent, down: boolean): void {
    const k = e.key.toLowerCase();
    const btn = KEY_TO_BTN[k];
    if (!btn) return;
    e.preventDefault();
    if (this.buttons[btn] === down) return;
    this.buttons = { ...this.buttons, [btn]: down };
    this.sendInputs();
  }

  private sendInputs(): void {
    const socket = getSocket();
    this.inputTick += 1;
    socket.emit('input:state', { tick: this.inputTick, buttons: { ...this.buttons } });
  }

  private onRoomState(state: RoomState): void {
    if (state.phase === 'result') this.scene.start('ResultScene');
    if (state.phase === 'shop') this.scene.start('ShopScene');
    if (state.phase === 'lobby') this.scene.start('LobbyScene');

    for (const p of state.players) {
      const character = (p.character ?? (p.slot === 0 ? 'brawler' : 'ranger')) as CharacterId;
      const prev = this.playerInfo.get(p.id);
      this.playerInfo.set(p.id, { character, weapon: p.loadout.weapon, name: p.name, slot: p.slot });

      // if existing view's character/weapon changed, recreate sprite
      const view = this.players.get(p.id);
      if (view && (view.character !== character || view.weapon !== p.loadout.weapon)) {
        view.sprite.destroy();
        const fresh = new HumanSprite(this, view.sprite.x, view.sprite.y, character, p.loadout.weapon);
        view.sprite = fresh;
        view.character = character;
        view.weapon = p.loadout.weapon;
      }
      if (view) {
        view.nameTag.setText(p.name);
      }

      if (p.id === this.myId) {
        this.weaponLabel.setText(`อาวุธ: ${p.loadout.weapon ?? '-'}`);
        const s1 = p.loadout.skills[0] ? SKILLS[p.loadout.skills[0]].name : '-';
        const s2 = p.loadout.skills[1] ? SKILLS[p.loadout.skills[1]].name : '-';
        this.skillLabels.setText(`สกิล:  [K] ${s1}   [L] ${s2}`);
      }
      void prev;
    }
  }

  private onSnapshot(snap: MatchSnapshot): void {
    this.prevSnap = this.snap;
    this.snap = snap;
    this.interpProgress = 0;

    for (const ps of snap.players) {
      if (!this.players.has(ps.id)) {
        this.players.set(ps.id, this.createPlayerView(ps));
      }
    }

    const seenProj = new Set<string>();
    for (const pr of snap.projectiles) {
      seenProj.add(pr.id);
      if (!this.projectiles.has(pr.id)) {
        this.projectiles.set(pr.id, this.createProjectileView(pr));
      }
    }
    for (const [id, view] of this.projectiles) {
      if (!seenProj.has(id)) {
        view.gfx.destroy();
        this.projectiles.delete(id);
      }
    }
  }

  private createPlayerView(ps: PlayerSnapshot): PlayerView {
    const info = this.playerInfo.get(ps.id);
    const character: CharacterId = info?.character ?? (ps.slot === 0 ? 'brawler' : 'ranger');
    const weapon: WeaponId | null = info?.weapon ?? ps.weapon ?? null;

    const sprite = new HumanSprite(this, ps.x, ps.y, character, weapon);

    const nameTag = this.add
      .text(ps.x, ps.y - PLAYER_HALF_H - 22, info?.name ?? `P${ps.slot + 1}`, {
        fontSize: '13px',
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#000',
        strokeThickness: 3,
      })
      .setOrigin(0.5);

    const hpBg = this.add.rectangle(ps.x, ps.y - PLAYER_HALF_H - 42, 74, 9, 0x000000, 0.7);
    hpBg.setStrokeStyle(1, 0x222);
    const hpFill = this.add
      .rectangle(ps.x - 36, ps.y - PLAYER_HALF_H - 42, 72, 7, 0x39c46a)
      .setOrigin(0, 0.5);
    const hpText = this.add
      .text(ps.x, ps.y - PLAYER_HALF_H - 58, `${ps.hp}/${ps.maxHp}`, {
        fontSize: '11px',
        color: '#fff',
      })
      .setOrigin(0.5);

    return {
      sprite,
      character,
      weapon,
      nameTag,
      hpBg,
      hpFill,
      hpText,
      lastDrawnX: ps.x,
      lastDrawnY: ps.y,
      lastAttackUntil: 0,
    };
  }

  private createProjectileView(pr: ProjectileSnapshot): ProjectileView {
    if (pr.kind === 'fireball') {
      const gfx = this.add.circle(pr.x, pr.y, 12, 0xff6b35).setStrokeStyle(2, 0xffd166);
      return { gfx };
    }
    const gfx = this.add.rectangle(pr.x, pr.y, 26, 4, 0xeeeeee);
    return { gfx };
  }

  private onMatchEvent(ev: import('@game/shared').MatchEvent): void {
    if (ev.type === 'hit') {
      const t = this.add
        .text(ev.x, ev.y - 50, `-${ev.amount}`, {
          fontSize: '22px',
          color: '#ff5252',
          fontStyle: 'bold',
          stroke: '#000',
          strokeThickness: 4,
        })
        .setOrigin(0.5);
      this.tweens.add({
        targets: t,
        y: ev.y - 110,
        alpha: 0,
        duration: 600,
        onComplete: () => t.destroy(),
      });

      // spark burst at the hit point
      const sparkColor = 0xffd166;
      for (let i = 0; i < 6; i++) {
        const s = this.add.circle(ev.x, ev.y, 3, sparkColor);
        const ang = (Math.PI * 2 * i) / 6 + Math.random() * 0.3;
        this.tweens.add({
          targets: s,
          x: ev.x + Math.cos(ang) * 30,
          y: ev.y + Math.sin(ang) * 30,
          alpha: 0,
          duration: 400,
          onComplete: () => s.destroy(),
        });
      }
    } else if (ev.type === 'attack') {
      const view = this.players.get(ev.ownerId);
      if (view) {
        view.lastAttackUntil = this.time.now + 180;
      }
    } else if (ev.type === 'death') {
      const view = this.players.get(ev.targetId);
      if (view) {
        view.sprite.setAlpha(0.5);
        view.sprite.setAngle(20);
      }
    }
  }

  update(_t: number, dt: number): void {
    // input heartbeat: resend every 100ms
    this.heartbeat += dt;
    if (this.heartbeat >= 100) {
      this.heartbeat = 0;
      this.sendInputs();
    }

    if (!this.snap) return;

    // interpolate
    const lerpDur = 1000 / TICK_RATE;
    this.interpProgress = Math.min(1, this.interpProgress + dt / lerpDur);
    const a = this.interpProgress;

    for (const ps of this.snap.players) {
      const view = this.players.get(ps.id);
      if (!view) continue;
      const prev = this.prevSnap?.players.find((x) => x.id === ps.id);
      const x = prev ? prev.x + (ps.x - prev.x) * a : ps.x;
      const y = prev ? prev.y + (ps.y - prev.y) * a : ps.y;

      view.sprite.setPosition(x, y);

      // derive on-ground status from vy ~ 0 and y near ground OR platform
      const onGround = Math.abs(ps.vy) < 20;

      view.sprite.updateAnim(
        {
          facing: ps.facing,
          vx: ps.vx,
          vy: ps.vy,
          onGround,
          attacking: ps.attacking || this.time.now < view.lastAttackUntil,
          blocking: ps.blocking,
          dashing: ps.dashing,
          shielded: ps.shielded,
        },
        dt
      );

      view.nameTag.setPosition(x, y - PLAYER_HALF_H - 22);
      view.hpBg.setPosition(x, y - PLAYER_HALF_H - 42);
      view.hpFill.setPosition(x - 36, y - PLAYER_HALF_H - 42);
      const ratio = Math.max(0, ps.hp / ps.maxHp);
      view.hpFill.width = 72 * ratio;
      view.hpFill.fillColor = ratio > 0.5 ? 0x39c46a : ratio > 0.25 ? 0xffd166 : 0xff5252;
      view.hpText.setPosition(x, y - PLAYER_HALF_H - 58).setText(`${ps.hp}/${ps.maxHp}`);

      view.lastDrawnX = x;
      view.lastDrawnY = y;
    }

    for (const pr of this.snap.projectiles) {
      const view = this.projectiles.get(pr.id);
      if (!view) continue;
      view.gfx.setPosition(pr.x, pr.y);
    }

    // cooldown HUD
    const me = this.snap.players.find((p) => p.id === this.myId);
    if (me) {
      const fmt = (ms: number) => (ms > 0 ? `${(ms / 1000).toFixed(1)}s` : 'พร้อม');
      this.cdText.setText(
        `[J] ${fmt(me.cooldowns.attackMs)}   [K] ${fmt(me.cooldowns.skill1Ms)}   [L] ${fmt(me.cooldowns.skill2Ms)}`
      );
    }
  }
}

function emptyButtons(): ButtonState {
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
