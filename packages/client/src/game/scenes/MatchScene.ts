import Phaser from 'phaser';
import type {
  ButtonState,
  MatchSnapshot,
  PlayerSnapshot,
  ProjectileSnapshot,
  RoomState,
  SkillId,
  WeaponId,
} from '@game/shared';
import {
  ARENA,
  CHARACTERS,
  PLAYER_HALF_H,
  PLAYER_HALF_W,
  SKILLS,
  TICK_RATE,
  WEAPONS,
} from '@game/shared';
import { getSocket } from '../network/socket';

interface PlayerView {
  body: Phaser.GameObjects.Rectangle;
  weaponGfx: Phaser.GameObjects.Rectangle;
  shieldRing: Phaser.GameObjects.Arc;
  nameTag: Phaser.GameObjects.Text;
  hpBg: Phaser.GameObjects.Rectangle;
  hpFill: Phaser.GameObjects.Rectangle;
  hpText: Phaser.GameObjects.Text;
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
  private lastSentButtons: ButtonState | null = null;
  private snap: MatchSnapshot | null = null;
  private prevSnap: MatchSnapshot | null = null;
  private interpProgress = 0;
  private hitTickerEvents: Array<{ x: number; y: number; amount: number; tween: Phaser.Tweens.Tween }> = [];
  private myId = '';
  private cdText!: Phaser.GameObjects.Text;
  private weaponLabel!: Phaser.GameObjects.Text;
  private skillLabels!: Phaser.GameObjects.Text;
  private myWeapon: WeaponId | null = null;
  private mySkills: [SkillId | null, SkillId | null] = [null, null];
  private playerLoadout: Map<string, WeaponId | null> = new Map();
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
    this.lastSentButtons = null;
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
    // ground
    this.add.rectangle(ARENA.width / 2, ARENA.groundY + 40, ARENA.width, 80, 0x2c3346);
    this.add.rectangle(ARENA.width / 2, ARENA.groundY, ARENA.width, 4, 0x4a5266);
    // platforms
    for (const p of ARENA.platforms) {
      this.add
        .rectangle(p.x + p.w / 2, p.y + p.h / 2, p.w, p.h, 0x4a5266)
        .setStrokeStyle(1, 0x6b7488);
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
    this.lastSentButtons = { ...this.buttons };
  }

  private onRoomState(state: RoomState): void {
    if (state.phase === 'result') this.scene.start('ResultScene');
    if (state.phase === 'shop') this.scene.start('ShopScene');
    if (state.phase === 'lobby') this.scene.start('LobbyScene');

    // build name + loadout lookup
    for (const p of state.players) {
      this.playerLoadout.set(p.id, p.loadout.weapon);
      const me = p.id === this.myId;
      if (me) {
        this.myWeapon = p.loadout.weapon;
        this.mySkills = p.loadout.skills;
        this.weaponLabel.setText(`อาวุธ: ${p.loadout.weapon ?? '-'}`);
        const s1 = p.loadout.skills[0] ? SKILLS[p.loadout.skills[0]].name : '-';
        const s2 = p.loadout.skills[1] ? SKILLS[p.loadout.skills[1]].name : '-';
        this.skillLabels.setText(`สกิล:  [K] ${s1}   [L] ${s2}`);
      }
      const view = this.players.get(p.id);
      if (view) {
        view.nameTag.setText(p.name);
      }
    }
  }

  private onSnapshot(snap: MatchSnapshot): void {
    this.prevSnap = this.snap;
    this.snap = snap;
    this.interpProgress = 0;

    // ensure view objects exist
    for (const ps of snap.players) {
      if (!this.players.has(ps.id)) {
        this.players.set(ps.id, this.createPlayerView(ps));
      }
    }

    // ensure projectile views
    const seenProj = new Set<string>();
    for (const pr of snap.projectiles) {
      seenProj.add(pr.id);
      if (!this.projectiles.has(pr.id)) {
        this.projectiles.set(pr.id, this.createProjectileView(pr));
      }
    }
    // cleanup vanished projectiles
    for (const [id, view] of this.projectiles) {
      if (!seenProj.has(id)) {
        view.gfx.destroy();
        this.projectiles.delete(id);
      }
    }
  }

  private createPlayerView(ps: PlayerSnapshot): PlayerView {
    const def = ps.slot === 0 ? CHARACTERS.brawler : CHARACTERS.ranger;
    // use color from snapshot character if we knew it; fallback to slot color
    const color = ps.slot === 0 ? 0xff5252 : 0x4dd0e1;
    const body = this.add.rectangle(ps.x, ps.y, PLAYER_HALF_W * 2, PLAYER_HALF_H * 2, color);
    body.setStrokeStyle(2, 0x000000);
    const weaponGfx = this.add.rectangle(ps.x, ps.y, 30, 6, 0xffffff);
    const shieldRing = this.add.circle(ps.x, ps.y, 44, 0x7cc4ff, 0.0).setStrokeStyle(3, 0x7cc4ff);
    shieldRing.setVisible(false);

    const nameTag = this.add
      .text(ps.x, ps.y - PLAYER_HALF_H - 22, `P${ps.slot + 1}`, {
        fontSize: '13px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    const hpBg = this.add.rectangle(ps.x, ps.y - PLAYER_HALF_H - 42, 70, 8, 0x000000, 0.6);
    const hpFill = this.add.rectangle(ps.x - 35, ps.y - PLAYER_HALF_H - 42, 70, 8, 0x39c46a).setOrigin(0, 0.5);
    const hpText = this.add
      .text(ps.x, ps.y - PLAYER_HALF_H - 56, `${ps.hp}/${ps.maxHp}`, {
        fontSize: '11px',
        color: '#fff',
      })
      .setOrigin(0.5);
    void def;

    return { body, weaponGfx, shieldRing, nameTag, hpBg, hpFill, hpText };
  }

  private createProjectileView(pr: ProjectileSnapshot): ProjectileView {
    if (pr.kind === 'fireball') {
      const gfx = this.add.circle(pr.x, pr.y, 12, 0xff6b35).setStrokeStyle(2, 0xffd166);
      return { gfx };
    }
    const gfx = this.add.rectangle(pr.x, pr.y, 24, 4, 0xeeeeee);
    return { gfx };
  }

  private onMatchEvent(ev: import('@game/shared').MatchEvent): void {
    if (ev.type === 'hit') {
      const t = this.add
        .text(ev.x, ev.y - 50, `-${ev.amount}`, {
          fontSize: '20px',
          color: '#ff5252',
          fontStyle: 'bold',
        })
        .setOrigin(0.5);
      const tween = this.tweens.add({
        targets: t,
        y: ev.y - 110,
        alpha: 0,
        duration: 600,
        onComplete: () => t.destroy(),
      });
      void tween;
    } else if (ev.type === 'attack') {
      const view = this.players.get(ev.ownerId);
      if (view) {
        const flash = view.weaponGfx;
        const orig = flash.fillColor;
        flash.fillColor = 0xffd166;
        this.time.delayedCall(100, () => {
          flash.fillColor = orig;
        });
      }
    } else if (ev.type === 'death') {
      const view = this.players.get(ev.targetId);
      if (view) view.body.fillColor = 0x555;
    }
  }

  update(_t: number, dt: number): void {
    // heartbeat: resend input every 100ms in case packet lost
    this.heartbeat += dt;
    if (this.heartbeat >= 100) {
      this.heartbeat = 0;
      if (this.lastSentButtons === null) this.sendInputs();
      else this.sendInputs();
    }

    if (!this.snap) return;

    // interpolate between prev and current snapshot
    const lerpDur = 1000 / TICK_RATE;
    this.interpProgress = Math.min(1, this.interpProgress + dt / lerpDur);
    const a = this.interpProgress;

    for (const ps of this.snap.players) {
      const view = this.players.get(ps.id);
      if (!view) continue;
      const prev = this.prevSnap?.players.find((x) => x.id === ps.id);
      const x = prev ? prev.x + (ps.x - prev.x) * a : ps.x;
      const y = prev ? prev.y + (ps.y - prev.y) * a : ps.y;
      view.body.setPosition(x, y);

      // weapon: in front of body in facing direction
      const offX = ps.facing * (PLAYER_HALF_W + 16);
      const offY = ps.attacking ? -4 : 6;
      view.weaponGfx.setPosition(x + offX, y + offY);
      view.weaponGfx.setSize(ps.attacking ? 36 : 28, 6);
      view.weaponGfx.fillColor = ps.attacking ? 0xffd166 : 0xeeeeee;

      view.shieldRing.setPosition(x, y);
      view.shieldRing.setVisible(ps.shielded);

      view.nameTag.setPosition(x, y - PLAYER_HALF_H - 22);
      view.hpBg.setPosition(x, y - PLAYER_HALF_H - 42);
      view.hpFill.setPosition(x - 35, y - PLAYER_HALF_H - 42);
      const ratio = Math.max(0, ps.hp / ps.maxHp);
      view.hpFill.width = 70 * ratio;
      view.hpFill.fillColor = ratio > 0.5 ? 0x39c46a : ratio > 0.2 ? 0xffd166 : 0xff5252;
      view.hpText.setPosition(x, y - PLAYER_HALF_H - 56).setText(`${ps.hp}/${ps.maxHp}`);

      // body tint when dashing
      if (ps.dashing) view.body.fillColor = 0xffffff;
      else if (ps.blocking) view.body.fillColor = 0x888888;
      else view.body.fillColor = ps.slot === 0 ? 0xff5252 : 0x4dd0e1;
    }

    for (const pr of this.snap.projectiles) {
      const view = this.projectiles.get(pr.id);
      if (!view) continue;
      view.gfx.setPosition(pr.x, pr.y);
    }

    // cooldown HUD for me
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
