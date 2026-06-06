import Phaser from 'phaser';
import type { RoomState } from '@game/shared';
import { getSocket } from '../network/socket';

export class ResultScene extends Phaser.Scene {
  private statusText!: Phaser.GameObjects.Text;
  private myId = '';
  private continueRequested = false;
  private oppContinueText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'ResultScene' });
  }

  create(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    this.continueRequested = false;
    this.myId = window.sessionStorage.getItem('fighter:playerId') ?? '';

    this.add
      .text(W / 2, 200, 'จบรอบนี้', { fontSize: '54px', color: '#fff', fontStyle: 'bold' })
      .setOrigin(0.5);

    this.statusText = this.add
      .text(W / 2, 290, '...', { fontSize: '28px', color: '#ffd166' })
      .setOrigin(0.5);

    const btn = this.add
      .rectangle(W / 2, 460, 280, 60, 0x5a8dee)
      .setInteractive({ useHandCursor: true });
    const btnText = this.add
      .text(W / 2, 460, 'NEXT ROUND', { fontSize: '24px', color: '#fff', fontStyle: 'bold' })
      .setOrigin(0.5);

    btn.on('pointerdown', () => {
      if (this.continueRequested) return;
      this.continueRequested = true;
      btn.setFillStyle(0x39c46a);
      btnText.setText('รอ...');
      getSocket().emit('result:continue');
    });

    this.oppContinueText = this.add
      .text(W / 2, 540, '', { fontSize: '14px', color: '#9aa3b3' })
      .setOrigin(0.5);

    this.add
      .text(W / 2, H - 30, 'ทุกรอบ: เหรียญ + อาวุธ + สกิล จะรีเซ็ตที่ Shop', {
        fontSize: '13px',
        color: '#666c79',
      })
      .setOrigin(0.5);

    const socket = getSocket();
    socket.off('room:state');
    socket.on('room:state', (state) => this.onState(state));
    socket.off('match:end');
    socket.on('match:end', (payload) => {
      this.statusText.setText(this.winnerLabel(payload.winnerId));
    });
  }

  private winnerLabel(winnerId: string | null): string {
    if (!winnerId) return 'เสมอ!';
    return winnerId === this.myId ? '🏆 คุณชนะ!' : '😵 คุณแพ้';
  }

  private onState(state: RoomState): void {
    if (state.winnerId !== undefined) {
      this.statusText.setText(this.winnerLabel(state.winnerId ?? null));
    }
    // show whether opponent is waiting
    const opp = state.players.find((p) => p.id !== this.myId);
    if (opp) {
      // we don't expose continueRequested via room state; we infer from phase transition
      // so just show "Waiting for opponent..." if I clicked
      if (this.continueRequested) {
        this.oppContinueText.setText('กำลังรออีกฝ่ายกด NEXT ROUND...');
      }
    }
    if (state.phase === 'shop') this.scene.start('ShopScene');
    if (state.phase === 'match') this.scene.start('MatchScene');
    if (state.phase === 'lobby') this.scene.start('LobbyScene');
  }
}
