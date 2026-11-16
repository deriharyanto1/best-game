// Every tuning number and colour in one place. The playfield is a fixed 1280x720 logical
// area; the renderer scales it to the window, so no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Ten waves: clear the tenth and the Warden's light is safe. */
export const WAVE_COUNT = 10;

export const PLAYER = {
  radius: 16,
  speed: 305,
  hp: 5,
  maxHp: 5,
  fireInterval: 0.17,
  bulletSpeed: 760,
  bulletRadius: 5,
  damage: 1,
  dashTime: 0.13,
  dashSpeed: 950,
  dashCooldown: 1.5,
  invulnerable: 1.0,
  pickupRadius: 90,
};

export const BULLET = { life: 1.1, radius: 5 };

export const ENEMY = {
  drifter: { radius: 18, hp: 3, speed: 85, damage: 1, score: 50, color: '#b388ff', dark: '#7a4fd0' },
  spitter: { radius: 16, hp: 2, speed: 70, damage: 1, score: 80, color: '#7ee787', dark: '#3f9e57', range: 380, fireInterval: 2.2, bulletSpeed: 250 },
  brute: { radius: 30, hp: 14, speed: 48, damage: 2, score: 200, color: '#ff6b6b', dark: '#c93a3a' },
  splitter: { radius: 22, hp: 5, speed: 95, damage: 1, score: 100, color: '#4fc3f7', dark: '#2b7fb8' },
  dasher: { radius: 15, hp: 2, speed: 80, damage: 1, score: 120, color: '#f778ba', dark: '#c24a8a', telegraph: 0.6, lungeSpeed: 540 },
  mote: { radius: 10, hp: 1, speed: 155, damage: 1, score: 25, color: '#4fc3f7', dark: '#2b7fb8' },
};

export const PICKUP = {
  heal: { color: '#7ee787', radius: 12 },
  shield: { color: '#6ec1ff', radius: 12 },
  gem: { color: '#ffd166', radius: 9 },
  spread: { color: '#ffb347', radius: 12 },
};

/** Kills inside this window keep the combo alive; each combo step adds 10% score, to x3. */
export const COMBO = { window: 2.5, step: 0.1, maxSteps: 20 };

/** Wave-clear bonus, per wave number. */
export const WAVE_BONUS = 100;

/** The upgrade cards offered between waves: id, name, description and the glyph drawn on the card. */
export const UPGRADE_DEFS = [
  { id: 'damage', name: 'Ember Rounds', desc: '+30% bullet damage', icon: '◆' },
  { id: 'rapid', name: 'Rapid Lantern', desc: 'Fire 18% faster', icon: '≫' },
  { id: 'multishot', name: 'Twin Flames', desc: '+1 ember per shot', icon: '✦' },
  { id: 'pierce', name: 'Piercing Light', desc: 'Shots pierce +1 shade', icon: '»' },
  { id: 'swift', name: 'Swift Boots', desc: '+12% move speed', icon: '›' },
  { id: 'heart', name: 'Kindled Heart', desc: '+1 max heart, heal 1', icon: '♥' },
  { id: 'magnet', name: 'Ember Magnet', desc: '+70% pickup radius', icon: '◎' },
  { id: 'dash', name: 'Shadow Step', desc: 'Dash recharges 35% faster', icon: '↯' },
  { id: 'ward', name: 'Lantern Ward', desc: 'A shield blocks one hit each wave', icon: '◈' },
];

export const PALETTE = {
  backdrop: '#0d0a12',
  floor: '#171222',
  floorGrid: '#221a33',
  floorGlow: '#2a1f45',
  text: '#f5efe6',
  muted: '#a89ec0',
  dim: '#6f6588',
  accent: '#ffb347',
  ember: '#ffd166',
  danger: '#ff5d5d',
  heal: '#7ee787',
  shield: '#6ec1ff',
  card: '#1e1830',
  cardBorder: '#3a2f5c',
  cardHover: '#2a2144',
  banner: '#ffb347',
};

export const FONT = '"Trebuchet MS", system-ui, -apple-system, "Segoe UI", sans-serif';
export const FONT_DISPLAY = '"Trebuchet MS", system-ui, sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'emberfall.best';

/** How many of each pool the world allocates once, at boot; nothing allocates in step(). */
export const POOLS = { bullets: 96, enemyBullets: 64, enemies: 48, pickups: 32, particles: 320, floaters: 32 };
