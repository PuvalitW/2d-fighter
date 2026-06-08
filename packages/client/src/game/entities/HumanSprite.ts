import Phaser from 'phaser';
import type { CharacterId, WeaponId } from '@game/shared';
import { CHARACTERS } from '@game/shared';

export interface HumanAnimState {
  facing: 1 | -1;
  vx: number;
  vy: number;
  onGround: boolean;
  attacking: boolean;
  blocking: boolean;
  dashing: boolean;
  shielded: boolean;
}

interface Palette {
  skin: number;
  primary: number; // body / cape
  secondary: number; // limbs / pants
  accent: number; // headband / details
}

const PALETTES: Record<CharacterId, Palette> = {
  brawler: {
    skin: 0xffd7b1,
    primary: 0xd23b3b, // red gi
    secondary: 0x3b2a25, // dark brown pants
    accent: 0xffd166,
  },
  ranger: {
    skin: 0xffd7b1,
    primary: 0x2aa9b6, // teal tunic
    secondary: 0x3b4a55, // gray pants
    accent: 0xc7e8ff,
  },
};

const SCALE: Record<CharacterId, number> = {
  brawler: 1.0,
  ranger: 0.92,
};

/**
 * Stick-figure human sprite assembled from Phaser primitives.
 * No external assets needed. Renders head, torso, two arms, two legs, eyes
 * and a weapon held in the front hand. Animates walk/jump/attack/block/dash.
 */
export class HumanSprite extends Phaser.GameObjects.Container {
  // body parts (positioned in local container coords; container origin = pelvis-ish)
  private head!: Phaser.GameObjects.Arc;
  private headOutline!: Phaser.GameObjects.Arc;
  private torso!: Phaser.GameObjects.Rectangle;
  private headband!: Phaser.GameObjects.Rectangle;
  private leftArm!: Phaser.GameObjects.Rectangle;
  private rightArm!: Phaser.GameObjects.Rectangle;
  private leftLeg!: Phaser.GameObjects.Rectangle;
  private rightLeg!: Phaser.GameObjects.Rectangle;
  private leftEye!: Phaser.GameObjects.Arc;
  private rightEye!: Phaser.GameObjects.Arc;
  private mouth!: Phaser.GameObjects.Rectangle;
  private weapon!: Phaser.GameObjects.Container;
  private shieldRing!: Phaser.GameObjects.Arc;
  private dashTrail!: Phaser.GameObjects.Arc;

  private walkPhase = 0;
  private attackTimer = 0;
  private dashTimer = 0;

  // facing internally tracked: container flips by scaleX
  private currentFacing: 1 | -1 = 1;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    public readonly character: CharacterId,
    public readonly weaponId: WeaponId | null
  ) {
    super(scene, x, y);
    const pal = PALETTES[character];
    const s = SCALE[character];

    // shield ring drawn behind body so it surrounds
    this.shieldRing = scene.add
      .circle(0, -6, 46, 0x7cc4ff, 0.0)
      .setStrokeStyle(3, 0x7cc4ff);
    this.shieldRing.setVisible(false);
    this.add(this.shieldRing);

    // dash trail
    this.dashTrail = scene.add.circle(0, -6, 30, 0xffffff, 0.0);
    this.add(this.dashTrail);

    // legs (drawn first so torso overlaps tops)
    this.leftLeg = this.makeLimb(-6, 8, 6 * s, 22 * s, pal.secondary);
    this.rightLeg = this.makeLimb(6, 8, 6 * s, 22 * s, pal.secondary);
    this.add(this.leftLeg);
    this.add(this.rightLeg);

    // torso
    this.torso = scene.add.rectangle(0, -6, 22 * s, 26 * s, pal.primary);
    this.torso.setStrokeStyle(1, 0x000000, 0.6);
    this.add(this.torso);

    // head
    this.headOutline = scene.add.circle(0, -28, 11 * s, 0x000000, 1);
    this.head = scene.add.circle(0, -28, 10 * s, pal.skin);
    this.add(this.headOutline);
    this.add(this.head);

    // headband
    this.headband = scene.add.rectangle(0, -34, 22 * s, 4 * s, pal.accent);
    this.add(this.headband);

    // eyes (positioned slightly forward in facing direction)
    this.leftEye = scene.add.circle(-3, -28, 1.4, 0x111111);
    this.rightEye = scene.add.circle(3, -28, 1.4, 0x111111);
    this.add(this.leftEye);
    this.add(this.rightEye);

    // mouth
    this.mouth = scene.add.rectangle(2, -23, 4, 1.5, 0x55392b);
    this.add(this.mouth);

    // arms — placed in front of torso. arms rotate around shoulder.
    this.leftArm = this.makeLimb(-10, -16, 5 * s, 20 * s, pal.skin);
    this.rightArm = this.makeLimb(10, -16, 5 * s, 22 * s, pal.skin);
    this.add(this.leftArm);
    this.add(this.rightArm);

    // weapon held in front (right) hand. weapon container so we can stack pieces.
    this.weapon = scene.add.container(10, -10);
    this.add(this.weapon);
    this.drawWeapon();

    scene.add.existing(this);
  }

  /** Creates a rect limb anchored at top-center so rotation pivots at the shoulder/hip */
  private makeLimb(x: number, y: number, w: number, h: number, color: number): Phaser.GameObjects.Rectangle {
    const r = this.scene.add.rectangle(x, y, w, h, color);
    r.setOrigin(0.5, 0); // top-center
    r.setStrokeStyle(1, 0x000000, 0.45);
    return r;
  }

  private drawWeapon(): void {
    this.weapon.removeAll(true);
    if (!this.weaponId) return;

    if (this.weaponId === 'sword') {
      // blade + guard + grip
      const blade = this.scene.add.rectangle(14, 0, 28, 4, 0xe8e8f0).setStrokeStyle(1, 0x222);
      const guard = this.scene.add.rectangle(0, 0, 4, 12, 0xffd166);
      const grip = this.scene.add.rectangle(-4, 0, 6, 4, 0x6b4226);
      this.weapon.add([blade, guard, grip]);
    } else if (this.weaponId === 'hammer') {
      const head = this.scene.add.rectangle(18, 0, 20, 16, 0x5a5a6e).setStrokeStyle(1, 0x222);
      const handle = this.scene.add.rectangle(2, 0, 20, 4, 0x6b4226);
      this.weapon.add([head, handle]);
    } else if (this.weaponId === 'bow') {
      const top = this.scene.add.rectangle(8, -10, 3, 22, 0x6b4226);
      top.rotation = -0.2;
      const bot = this.scene.add.rectangle(8, 10, 3, 22, 0x6b4226);
      bot.rotation = 0.2;
      const string = this.scene.add.rectangle(10, 0, 1, 22, 0xeeeeee);
      this.weapon.add([top, bot, string]);
    }
  }

  setFacing(f: 1 | -1): void {
    if (this.currentFacing === f) return;
    this.currentFacing = f;
    // flip whole container so all parts mirror
    this.scaleX = f;
  }

  setShielded(on: boolean): void {
    this.shieldRing.setVisible(on);
    if (on) {
      // gentle pulse
      const t = (this.scene.time.now / 1000) * 4;
      this.shieldRing.setAlpha(0.4 + Math.sin(t) * 0.15);
    }
  }

  setDashing(on: boolean): void {
    this.dashTrail.setVisible(on);
    if (on) {
      this.dashTrail.fillColor = 0xffffff;
      this.dashTrail.setAlpha(0.35);
    } else {
      this.dashTrail.setAlpha(0);
    }
  }

  updateAnim(state: HumanAnimState, deltaMs: number): void {
    this.setFacing(state.facing);
    this.setShielded(state.shielded);
    this.setDashing(state.dashing);

    const speed = Math.abs(state.vx);
    const walking = state.onGround && speed > 30 && !state.blocking;
    const jumping = !state.onGround;

    // walking gait: sin oscillation
    if (walking) {
      this.walkPhase += (deltaMs / 1000) * (4 + Math.min(speed, 240) / 60);
    } else {
      // ease phase back to 0
      this.walkPhase *= 0.85;
    }
    const swing = Math.sin(this.walkPhase) * 0.55;

    // leg swing
    this.leftLeg.rotation = swing;
    this.rightLeg.rotation = -swing;

    // arm swing — opposite to legs feels natural
    let leftArmRot = -swing * 0.7;
    let rightArmRot = swing * 0.7;

    if (jumping) {
      // tuck legs back
      this.leftLeg.rotation = -0.25;
      this.rightLeg.rotation = 0.25;
      leftArmRot = -0.6;
      rightArmRot = -0.4;
    }

    if (state.blocking && state.onGround && !state.dashing) {
      // arms up, body lowered
      leftArmRot = -2.0;
      rightArmRot = -2.0;
      this.torso.y = -3;
      this.head.y = -25;
      this.headOutline.y = -25;
      this.leftEye.y = -25;
      this.rightEye.y = -25;
      this.mouth.y = -20;
      this.headband.y = -31;
    } else {
      this.torso.y = -6;
      this.head.y = -28;
      this.headOutline.y = -28;
      this.leftEye.y = -28;
      this.rightEye.y = -28;
      this.mouth.y = -23;
      this.headband.y = -34;
    }

    // attack: thrust right arm forward
    if (state.attacking) {
      // make right arm horizontal and extended forward
      rightArmRot = Math.PI / 2; // 90° to point forward (in facing direction, container flips it)
      // weapon also thrusts forward
      this.weapon.x = 18;
      this.weapon.y = -14;
      this.weapon.rotation = 0;
      // brief shoulder shake for impact feel
      this.attackTimer = 120;
    } else {
      this.attackTimer = Math.max(0, this.attackTimer - deltaMs);
      // weapon idle in hand
      this.weapon.x = 10;
      this.weapon.y = -10;
      this.weapon.rotation = -0.15;
    }

    this.leftArm.rotation = leftArmRot;
    this.rightArm.rotation = rightArmRot;

    // dash: lean forward
    if (state.dashing) {
      this.dashTimer = 120;
      this.rotation = 0.2 * this.currentFacing;
    } else {
      this.dashTimer = Math.max(0, this.dashTimer - deltaMs);
      this.rotation = 0;
    }
  }
}
