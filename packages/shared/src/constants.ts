export const TICK_RATE = 30;
export const TICK_MS = 1000 / TICK_RATE;

export const ARENA = {
  width: 1280,
  height: 720,
  groundY: 640,
  platforms: [
    { x: 220, y: 480, w: 240, h: 16 },
    { x: 820, y: 480, w: 240, h: 16 },
    { x: 520, y: 340, w: 240, h: 16 },
  ],
} as const;

export const PHYSICS = {
  gravity: 1400,
  maxFallSpeed: 900,
  friction: 0.82,
} as const;

export const STARTING_COINS = 1000;
export const ROOM_CODE_LENGTH = 6;
export const PLAYER_HALF_W = 22;
export const PLAYER_HALF_H = 34;

export type CharacterId = 'brawler' | 'ranger';
export interface CharacterDef {
  id: CharacterId;
  name: string;
  hp: number;
  speed: number;
  jump: number;
  color: number;
  desc: string;
}

export const CHARACTERS: Record<CharacterId, CharacterDef> = {
  brawler: {
    id: 'brawler',
    name: 'Brawler',
    hp: 120,
    speed: 180,
    jump: 480,
    color: 0xff5252,
    desc: 'เลือดเยอะ ตัวใหญ่ ช้ากว่า',
  },
  ranger: {
    id: 'ranger',
    name: 'Ranger',
    hp: 90,
    speed: 220,
    jump: 520,
    color: 0x4dd0e1,
    desc: 'คล่องตัว เลือดน้อย กระโดดสูง',
  },
};

export type WeaponId = 'sword' | 'bow' | 'hammer';
export interface WeaponDef {
  id: WeaponId;
  name: string;
  type: 'melee' | 'ranged';
  damage: number;
  range: number;
  cooldownMs: number;
  knockback: number;
  price: number;
  projectileSpeed?: number;
  desc: string;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  sword: {
    id: 'sword',
    name: 'Sword',
    type: 'melee',
    damage: 15,
    range: 60,
    cooldownMs: 400,
    knockback: 200,
    price: 300,
    desc: 'โจมตีระยะใกล้ เร็ว ดาเมจปานกลาง',
  },
  bow: {
    id: 'bow',
    name: 'Bow',
    type: 'ranged',
    damage: 10,
    range: 500,
    cooldownMs: 600,
    knockback: 100,
    projectileSpeed: 520,
    price: 500,
    desc: 'ยิงลูกธนู ระยะไกล ดาเมจน้อย',
  },
  hammer: {
    id: 'hammer',
    name: 'Hammer',
    type: 'melee',
    damage: 25,
    range: 70,
    cooldownMs: 800,
    knockback: 340,
    price: 700,
    desc: 'หนัก ช้า ดาเมจสูง น็อกแรง',
  },
};

export type SkillId = 'dash' | 'fireball' | 'shield';
export interface SkillDef {
  id: SkillId;
  name: string;
  cooldownMs: number;
  price: number;
  desc: string;
}

export const SKILLS: Record<SkillId, SkillDef> = {
  dash: {
    id: 'dash',
    name: 'Dash',
    cooldownMs: 3000,
    price: 200,
    desc: 'พุ่งไปข้างหน้า 250px ทันที',
  },
  fireball: {
    id: 'fireball',
    name: 'Fireball',
    cooldownMs: 5000,
    price: 400,
    desc: 'ยิง projectile ดาเมจ 20',
  },
  shield: {
    id: 'shield',
    name: 'Shield',
    cooldownMs: 8000,
    price: 300,
    desc: 'ลด damage 50% เป็นเวลา 2 วินาที',
  },
};

export const FIREBALL = {
  damage: 20,
  speed: 460,
  range: 600,
  hitW: 18,
  hitH: 18,
} as const;

export const DASH = {
  distance: 250,
  durationMs: 180,
  invulnMs: 80,
} as const;

export const SHIELD = {
  durationMs: 2000,
  damageMultiplier: 0.5,
} as const;

export const BLOCK_MULTIPLIER = 0.5;
