import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    // no external assets — use Graphics + Text in scenes
  }

  create(): void {
    this.scene.start('LobbyScene');
  }
}
