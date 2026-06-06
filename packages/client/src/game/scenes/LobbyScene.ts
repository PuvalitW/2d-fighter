import Phaser from 'phaser';
import type { CharacterId, RoomState } from '@game/shared';
import { CHARACTERS } from '@game/shared';
import { getSocket } from '../network/socket';

export class LobbyScene extends Phaser.Scene {
  private codeText!: Phaser.GameObjects.Text;
  private p1Text!: Phaser.GameObjects.Text;
  private p2Text!: Phaser.GameObjects.Text;
  private selectionText!: Phaser.GameObjects.Text;
  private selected: CharacterId | null = null;
  private state: RoomState | null = null;

  constructor() {
    super({ key: 'LobbyScene' });
  }

  create(): void {
    const W = this.scale.width;

    this.add
      .text(W / 2, 60, 'LOBBY', { fontSize: '40px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5);

    this.codeText = this.add
      .text(W / 2, 110, 'รหัสห้อง: -', { fontSize: '20px', color: '#aab' })
      .setOrigin(0.5);

    this.add
      .text(W / 2, 160, 'เลือกตัวละครของคุณ', { fontSize: '18px', color: '#cdd' })
      .setOrigin(0.5);

    // character cards
    const ids: CharacterId[] = ['brawler', 'ranger'];
    ids.forEach((id, i) => {
      const def = CHARACTERS[id];
      const x = W / 2 + (i === 0 ? -180 : 180);
      const y = 320;
      const w = 280;
      const h = 240;
      const bg = this.add
        .rectangle(x, y, w, h, 0x1d2230, 1)
        .setStrokeStyle(2, 0x2c3346)
        .setInteractive({ useHandCursor: true });
      const swatch = this.add.rectangle(x, y - 50, 80, 100, def.color);
      void swatch;
      this.add.text(x, y + 18, def.name, { fontSize: '22px', color: '#fff' }).setOrigin(0.5);
      this.add
        .text(x, y + 50, `HP ${def.hp}   SPD ${def.speed}   JMP ${def.jump}`, {
          fontSize: '13px',
          color: '#9aa3b3',
        })
        .setOrigin(0.5);
      this.add
        .text(x, y + 80, def.desc, { fontSize: '13px', color: '#7c8595', wordWrap: { width: w - 24 } })
        .setOrigin(0.5);

      bg.on('pointerdown', () => {
        this.selected = id;
        this.refreshSelection();
        getSocket().emit('character:select', { character: id });
      });
    });

    this.p1Text = this.add
      .text(60, 560, 'P1: รอ...', { fontSize: '18px', color: '#fff' });
    this.p2Text = this.add
      .text(60, 595, 'P2: รอ...', { fontSize: '18px', color: '#fff' });

    this.selectionText = this.add
      .text(W / 2, 500, '', { fontSize: '14px', color: '#7cc4ff' })
      .setOrigin(0.5);

    this.add
      .text(W / 2, 660, 'รอให้ทั้ง 2 คนเลือกตัวละคร แล้วจะเข้าสู่ Shop อัตโนมัติ', {
        fontSize: '13px',
        color: '#666c79',
      })
      .setOrigin(0.5);

    const socket = getSocket();
    socket.off('room:state');
    socket.on('room:state', (state) => this.onState(state));

    // request initial state in case we missed it
  }

  private onState(state: RoomState): void {
    this.state = state;
    this.codeText.setText(`รหัสห้อง: ${state.code}`);
    const p1 = state.players.find((p) => p.slot === 0);
    const p2 = state.players.find((p) => p.slot === 1);
    this.p1Text.setText(formatPlayer('P1', p1));
    this.p2Text.setText(formatPlayer('P2', p2));

    if (state.phase === 'shop') {
      this.scene.start('ShopScene');
    } else if (state.phase === 'match') {
      this.scene.start('MatchScene');
    }
  }

  private refreshSelection(): void {
    if (this.selected) {
      this.selectionText.setText(`เลือก: ${CHARACTERS[this.selected].name}`);
    }
  }
}

function formatPlayer(label: string, p: { name: string; character: string | null } | undefined): string {
  if (!p) return `${label}: รออีกฝั่ง...`;
  const ch = p.character ? CHARACTERS[p.character as CharacterId].name : 'ยังไม่เลือก';
  return `${label}: ${p.name}  (${ch})`;
}
