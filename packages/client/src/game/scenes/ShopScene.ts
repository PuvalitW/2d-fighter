import Phaser from 'phaser';
import type {
  PlayerPublic,
  RoomState,
  SkillId,
  WeaponId,
} from '@game/shared';
import { SKILLS, WEAPONS } from '@game/shared';
import { getSocket } from '../network/socket';

export class ShopScene extends Phaser.Scene {
  private state: RoomState | null = null;
  private weapon: WeaponId | null = null;
  private skills: [SkillId | null, SkillId | null] = [null, null];
  private coinsText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private myReady = false;
  private opponentReadyText!: Phaser.GameObjects.Text;
  private weaponButtons: Map<WeaponId, Phaser.GameObjects.Rectangle> = new Map();
  private skillButtons: Map<SkillId, Phaser.GameObjects.Rectangle> = new Map();
  private readyBtnBg!: Phaser.GameObjects.Rectangle;
  private readyBtnText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'ShopScene' });
  }

  create(): void {
    const W = this.scale.width;
    this.weapon = null;
    this.skills = [null, null];
    this.myReady = false;

    this.add
      .text(W / 2, 50, 'SHOP', { fontSize: '40px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5);

    this.coinsText = this.add
      .text(W / 2, 100, 'เหรียญ: 1000', { fontSize: '20px', color: '#ffd166' })
      .setOrigin(0.5);

    // weapons
    this.add
      .text(140, 150, 'WEAPON (เลือก 1)', { fontSize: '18px', color: '#cdd' });
    const weaponIds: WeaponId[] = ['sword', 'bow', 'hammer'];
    weaponIds.forEach((id, i) => {
      const def = WEAPONS[id];
      const x = 280 + i * 230;
      const y = 240;
      const bg = this.add
        .rectangle(x, y, 200, 130, 0x1d2230)
        .setStrokeStyle(2, 0x2c3346)
        .setInteractive({ useHandCursor: true });
      this.add.text(x, y - 42, def.name, { fontSize: '20px', color: '#fff' }).setOrigin(0.5);
      this.add
        .text(x, y - 14, `DMG ${def.damage}   CD ${def.cooldownMs}ms`, {
          fontSize: '13px',
          color: '#9aa3b3',
        })
        .setOrigin(0.5);
      this.add
        .text(x, y + 12, def.desc, {
          fontSize: '12px',
          color: '#7c8595',
          wordWrap: { width: 180 },
          align: 'center',
        })
        .setOrigin(0.5);
      this.add
        .text(x, y + 48, `ราคา ${def.price}`, { fontSize: '14px', color: '#ffd166' })
        .setOrigin(0.5);

      bg.on('pointerdown', () => {
        this.weapon = this.weapon === id ? null : id;
        this.sendPurchase();
      });
      this.weaponButtons.set(id, bg);
    });

    // skills
    this.add
      .text(140, 400, 'SKILLS (เลือก 2: K, L)', { fontSize: '18px', color: '#cdd' });
    const skillIds: SkillId[] = ['dash', 'fireball', 'shield'];
    skillIds.forEach((id, i) => {
      const def = SKILLS[id];
      const x = 280 + i * 230;
      const y = 490;
      const bg = this.add
        .rectangle(x, y, 200, 130, 0x1d2230)
        .setStrokeStyle(2, 0x2c3346)
        .setInteractive({ useHandCursor: true });
      this.add.text(x, y - 42, def.name, { fontSize: '20px', color: '#fff' }).setOrigin(0.5);
      this.add
        .text(x, y - 14, `CD ${def.cooldownMs / 1000}s`, {
          fontSize: '13px',
          color: '#9aa3b3',
        })
        .setOrigin(0.5);
      this.add
        .text(x, y + 12, def.desc, {
          fontSize: '12px',
          color: '#7c8595',
          wordWrap: { width: 180 },
          align: 'center',
        })
        .setOrigin(0.5);
      this.add
        .text(x, y + 48, `ราคา ${def.price}`, { fontSize: '14px', color: '#ffd166' })
        .setOrigin(0.5);

      bg.on('pointerdown', () => {
        this.toggleSkill(id);
        this.sendPurchase();
      });
      this.skillButtons.set(id, bg);
    });

    this.statusText = this.add
      .text(W / 2, 630, '', { fontSize: '14px', color: '#ff8a8a' })
      .setOrigin(0.5);
    this.opponentReadyText = this.add
      .text(W / 2, 656, '', { fontSize: '14px', color: '#9aa3b3' })
      .setOrigin(0.5);

    // ready button
    this.readyBtnBg = this.add
      .rectangle(W / 2, 690, 220, 50, 0x5a8dee)
      .setInteractive({ useHandCursor: true });
    this.readyBtnText = this.add
      .text(W / 2, 690, 'READY', { fontSize: '22px', color: '#fff', fontStyle: 'bold' })
      .setOrigin(0.5);
    this.readyBtnBg.on('pointerdown', () => {
      this.myReady = !this.myReady;
      getSocket().emit('shop:ready', { ready: this.myReady });
      this.refreshReady();
    });

    const socket = getSocket();
    socket.off('room:state');
    socket.on('room:state', (state) => this.onState(state));
  }

  private toggleSkill(id: SkillId): void {
    // toggle: if already in slots, remove; otherwise add to first empty slot
    if (this.skills[0] === id) this.skills[0] = null;
    else if (this.skills[1] === id) this.skills[1] = null;
    else if (!this.skills[0]) this.skills[0] = id;
    else if (!this.skills[1]) this.skills[1] = id;
    else {
      // both filled — replace slot 1
      this.skills[1] = id;
    }
  }

  private sendPurchase(): void {
    const socket = getSocket();
    socket.emit(
      'shop:purchase',
      { weapon: this.weapon, skills: this.skills },
      (ack) => {
        if (!ack.ok) {
          this.statusText.setText(`ผิดพลาด: ${ack.error}`);
          this.weapon = null;
          this.skills = [null, null];
        } else {
          this.statusText.setText('');
        }
      }
    );
  }

  private onState(state: RoomState): void {
    this.state = state;
    const me = this.getMe(state);
    if (me) {
      this.coinsText.setText(`เหรียญ: ${me.coins}`);
      this.weapon = me.loadout.weapon;
      this.skills = me.loadout.skills;
      this.myReady = me.ready;
      this.refreshSelectionVisual();
      this.refreshReady();
    }

    const opp = state.players.find((p) => p.id !== me?.id);
    if (opp) {
      const readyMsg = opp.ready ? `✅ ${opp.name} พร้อมแล้ว` : `⏳ ${opp.name} กำลังเลือก...`;
      this.opponentReadyText.setText(readyMsg);
    } else {
      this.opponentReadyText.setText('รออีกฝ่าย...');
    }

    if (state.phase === 'match') this.scene.start('MatchScene');
    if (state.phase === 'lobby') this.scene.start('LobbyScene');
  }

  private getMe(state: RoomState): PlayerPublic | undefined {
    const myId = window.sessionStorage.getItem('fighter:playerId');
    return state.players.find((p) => p.id === myId);
  }

  private refreshSelectionVisual(): void {
    for (const [id, btn] of this.weaponButtons) {
      btn.setStrokeStyle(2, this.weapon === id ? 0xffd166 : 0x2c3346);
    }
    for (const [id, btn] of this.skillButtons) {
      const picked = this.skills.includes(id);
      btn.setStrokeStyle(2, picked ? 0xffd166 : 0x2c3346);
    }
  }

  private refreshReady(): void {
    this.readyBtnBg.setFillStyle(this.myReady ? 0x39c46a : 0x5a8dee);
    this.readyBtnText.setText(this.myReady ? 'พร้อมแล้ว (กดเพื่อยกเลิก)' : 'READY');
  }
}
