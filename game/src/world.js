// The game's rules and state, with no drawing and no browser in it: the Warden, the shades,
// their bullets and pickups, waves, upgrades, score and combo. step() advances one fixed step
// and returns what happened as bit flags, so the caller can react (sound, announcements) without
// the world knowing about screens or sound. Nothing here allocates after createWorld returns.
import { BULLET, COMBO, ENEMY, FIELD, PICKUP, PLAYER, POOLS, UPGRADE_DEFS, WAVE_BONUS, WAVE_COUNT } from './config.js';
import { pick, range } from './random.js';

export const EVENT_SHOOT = 1;
export const EVENT_HIT = 2;
export const EVENT_KILL = 4;
export const EVENT_PICKUP = 8;
export const EVENT_WAVE = 16;
export const EVENT_CLEAR = 32;
export const EVENT_OVER = 64;
export const EVENT_VICTORY = 128;
export const EVENT_DASH = 256;

/** The wave's spawn list: kinds shuffled, heavier and meaner as the waves climb. */
export function waveComposition(wave, random) {
  const list = [];
  const add = (kind, count) => {
    for (let i = 0; i < count; i += 1) list.push(kind);
  };
  add('drifter', 4 + 2 * wave);
  if (wave >= 2) add('spitter', 1 + Math.floor(wave / 2));
  if (wave >= 3) add('brute', Math.floor((wave - 1) / 2));
  if (wave >= 4) add('splitter', wave - 2);
  if (wave >= 5) add('dasher', wave - 3);
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function makePool(size, make) {
  const pool = [];
  for (let i = 0; i < size; i += 1) pool.push(make());
  return pool;
}

export function createWorld(random) {
  const player = {
    x: FIELD.width / 2, y: FIELD.height / 2, vx: 0, vy: 0,
    radius: PLAYER.radius,
    hp: PLAYER.hp, maxHp: PLAYER.maxHp, aim: -Math.PI / 2,
    fireTimer: 0, dashTimer: 0, dashCd: 0, dashX: 0, dashY: 1,
    invuln: 0, shield: false, spreadTimer: 0,
    upgrades: {}, damage: PLAYER.damage, fireInterval: PLAYER.fireInterval,
    speed: PLAYER.speed, magnetRadius: PLAYER.pickupRadius, shotCount: 1, pierceCount: 0,
  };
  const bullets = makePool(POOLS.bullets, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, damage: 1, pierce: 0, life: 0, radius: BULLET.radius, lastHit: null }));
  const ebullets = makePool(POOLS.enemyBullets, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, radius: 7, damage: 1 }));
  const enemies = makePool(POOLS.enemies, () => ({
    active: false, kind: 'drifter', x: 0, y: 0, vx: 0, vy: 0, hp: 1, maxHp: 1,
    radius: 16, speed: 80, damage: 1, score: 50, color: '#fff', dark: '#888',
    fireTimer: 0, state: 'chase', stateTimer: 0, spawnT: 0, flash: 0, wobble: 0, angle: 0,
  }));
  const pickups = makePool(POOLS.pickups, () => ({ active: false, kind: 'gem', x: 0, y: 0, vx: 0, vy: 0, life: 0, bob: 0 }));
  const particles = makePool(POOLS.particles, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 3, color: '#fff', drag: 0.9, kind: 'spark' }));
  const floaters = makePool(POOLS.floaters, () => ({ active: false, x: 0, y: 0, text: '', life: 0, maxLife: 1, color: '#fff', size: 16 }));

  const state = {
    player, bullets, ebullets, enemies, pickups, particles, floaters,
    score: 0, combo: 0, comboTimer: 0, kills: 0,
    wave: 0, phase: 'demo', spawnQueue: [], spawnTimer: 0, waveT: 0,
    elapsed: 0, time: 0, shake: 0, hitStop: 0, banner: '', bannerTimer: 0,
    choices: [], stats: { kills: 0, shotsFired: 0, hits: 0, damageDealt: 0, timePlayed: 0, wavesCleared: 0 },
  };

  function free(pool) {
    for (let i = 0; i < pool.length; i += 1) if (!pool[i].active) return pool[i];
    return null;
  }

  function activeCount(pool) {
    let n = 0;
    for (const item of pool) if (item.active) n += 1;
    return n;
  }

  function burst(x, y, color, count, speed, size, kind = 'spark') {
    for (let i = 0; i < count; i += 1) {
      const p = free(particles);
      if (!p) return;
      const angle = random() * Math.PI * 2;
      const v = speed * (0.3 + random() * 0.7);
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * v;
      p.vy = Math.sin(angle) * v;
      p.maxLife = 0.35 + random() * 0.45;
      p.life = p.maxLife;
      p.size = size * (0.6 + random() * 0.8);
      p.color = color;
      p.drag = 0.88;
      p.kind = kind;
    }
  }

  function ring(x, y, color) {
    const p = free(particles);
    if (!p) return;
    p.active = true;
    p.x = x;
    p.y = y;
    p.vx = 0;
    p.vy = 0;
    p.maxLife = 0.4;
    p.life = 0.4;
    p.size = 8;
    p.color = color;
    p.drag = 1;
    p.kind = 'ring';
  }

  function floater(x, y, text, color, size = 16) {
    const f = free(floaters);
    if (!f) return;
    f.active = true;
    f.x = x;
    f.y = y;
    f.text = text;
    f.maxLife = 1.0;
    f.life = 1.0;
    f.color = color;
    f.size = size;
  }

  function comboMultiplier() {
    return 1 + Math.min(state.combo, COMBO.maxSteps) * COMBO.step;
  }

  function addScore(base, x, y) {
    const gained = Math.round(base * comboMultiplier());
    state.score += gained;
    if (x !== undefined) floater(x, y, `+${gained}`, '#ffd166', 15);
    return gained;
  }

  function recompute() {
    const u = player.upgrades;
    player.damage = PLAYER.damage * 1.3 ** (u.damage ?? 0);
    player.fireInterval = PLAYER.fireInterval * 0.82 ** (u.rapid ?? 0);
    player.speed = PLAYER.speed * 1.12 ** (u.swift ?? 0);
    player.magnetRadius = PLAYER.pickupRadius * 1.7 ** (u.magnet ?? 0);
    player.shotCount = 1 + (u.multishot ?? 0);
    player.pierceCount = u.pierce ?? 0;
    player.maxHp = PLAYER.maxHp + (u.heart ?? 0);
    player.dashCooldown = PLAYER.dashCooldown * 0.65 ** (u.dash ?? 0);
  }

  function edgePoint() {
    const side = Math.floor(random() * 4);
    const margin = 40;
    if (side === 0) return { x: range(random, margin, FIELD.width - margin), y: -margin };
    if (side === 1) return { x: FIELD.width + margin, y: range(random, margin, FIELD.height - margin) };
    if (side === 2) return { x: range(random, margin, FIELD.width - margin), y: FIELD.height + margin };
    return { x: -margin, y: range(random, margin, FIELD.height - margin) };
  }

  function spawnEnemy(kind, x = null, y = null) {
    const def = ENEMY[kind];
    const e = free(enemies);
    if (!e || !def) return null;
    const at = x === null ? edgePoint() : { x, y };
    const hpScale = 1 + (state.wave - 1) * 0.12;
    e.active = true;
    e.kind = kind;
    e.x = at.x;
    e.y = at.y;
    e.vx = 0;
    e.vy = 0;
    e.maxHp = Math.round(def.hp * hpScale);
    e.hp = e.maxHp;
    e.radius = def.radius;
    e.speed = def.speed * (1 + (state.wave - 1) * 0.04);
    e.damage = def.damage;
    e.score = def.score;
    e.color = def.color;
    e.dark = def.dark;
    e.fireTimer = range(random, 1.0, 2.0);
    e.state = 'chase';
    e.stateTimer = 0;
    e.spawnT = 0.5;
    e.flash = 0;
    e.wobble = random() * Math.PI * 2;
    e.angle = random() * Math.PI * 2;
    return e;
  }

  function dropPickup(x, y) {
    const roll = random();
    let kind = null;
    if (roll < 0.05 && player.hp < player.maxHp) kind = 'heal';
    else if (roll < 0.09) kind = 'shield';
    else if (roll < 0.27) kind = 'gem';
    else if (roll < 0.32 && player.spreadTimer <= 0) kind = 'spread';
    if (!kind) return;
    const p = free(pickups);
    if (!p) return;
    p.active = true;
    p.kind = kind;
    p.x = x;
    p.y = y;
    const angle = random() * Math.PI * 2;
    p.vx = Math.cos(angle) * 40;
    p.vy = Math.sin(angle) * 40;
    p.life = 9;
    p.bob = random() * Math.PI * 2;
  }

  function killEnemy(e, awardScore = true) {
    e.active = false;
    state.kills += 1;
    state.stats.kills += 1;
    state.combo += 1;
    state.comboTimer = COMBO.window;
    burst(e.x, e.y, e.color, e.kind === 'brute' ? 26 : 14, 260, 4);
    burst(e.x, e.y, '#ffd166', 6, 180, 3);
    ring(e.x, e.y, e.color);
    if (awardScore) addScore(e.score, e.x, e.y - e.radius - 6);
    if (e.kind === 'splitter') {
      for (let i = 0; i < 2; i += 1) {
        const mote = spawnEnemy('mote', e.x + (i === 0 ? -14 : 14), e.y);
        if (mote) mote.spawnT = 0.15;
      }
    }
    if (e.kind === 'brute') state.hitStop = Math.max(state.hitStop, 0.05);
    dropPickup(e.x, e.y);
  }

  function hurtPlayer(damage) {
    if (player.invuln > 0 || state.phase !== 'play') return 0;
    if (player.shield) {
      player.shield = false;
      player.invuln = 0.8;
      burst(player.x, player.y, '#6ec1ff', 12, 220, 4);
      floater(player.x, player.y - 30, 'WARD HELD', '#6ec1ff', 15);
      return EVENT_HIT;
    }
    player.hp -= damage;
    player.invuln = PLAYER.invulnerable;
    state.shake = Math.min(1, state.shake + 0.7);
    state.hitStop = Math.max(state.hitStop, 0.07);
    state.combo = 0;
    state.comboTimer = 0;
    burst(player.x, player.y, '#ff5d5d', 16, 280, 4);
    if (player.hp <= 0) {
      player.hp = 0;
      state.phase = 'over';
      burst(player.x, player.y, '#ffb347', 40, 380, 5);
      burst(player.x, player.y, '#f5efe6', 20, 240, 3);
      ring(player.x, player.y, '#ffb347');
      return EVENT_HIT | EVENT_OVER;
    }
    return EVENT_HIT;
  }

  function startWave(n) {
    state.wave = n;
    state.phase = 'play';
    state.spawnQueue = waveComposition(n, random);
    state.spawnTimer = 0.9;
    state.waveT = 0;
    state.banner = n === WAVE_COUNT ? 'FINAL WAVE' : `WAVE ${n}`;
    state.bannerTimer = 2.2;
    if ((player.upgrades.ward ?? 0) > 0) player.shield = true;
    return EVENT_WAVE;
  }

  function offerUpgrades() {
    const blocked = new Set();
    if (player.shotCount >= 4) blocked.add('multishot');
    if (player.pierceCount >= 3) blocked.add('pierce');
    if (player.maxHp >= 8) blocked.add('heart');
    const pool = UPGRADE_DEFS.filter((def) => !blocked.has(def.id));
    const chosen = [];
    while (chosen.length < 3 && pool.length > 0) {
      const index = Math.floor(random() * pool.length);
      chosen.push(pool.splice(index, 1)[0]);
    }
    state.choices = chosen;
    return chosen;
  }

  function applyUpgrade(id) {
    const def = UPGRADE_DEFS.find((d) => d.id === id);
    if (!def) return false;
    player.upgrades[id] = (player.upgrades[id] ?? 0) + 1;
    recompute();
    if (id === 'heart') player.hp = Math.min(player.maxHp, player.hp + 1);
    if (id === 'ward') player.shield = true;
    state.choices = [];
    state.phase = 'play';
    return startWave(state.wave + 1);
  }

  function reset(mode = 'run') {
    player.x = FIELD.width / 2;
    player.y = FIELD.height / 2;
    player.vx = 0;
    player.vy = 0;
    player.hp = PLAYER.hp;
    player.maxHp = PLAYER.maxHp;
    player.aim = -Math.PI / 2;
    player.fireTimer = 0;
    player.dashTimer = 0;
    player.dashCd = 0;
    player.invuln = 0;
    player.shield = false;
    player.spreadTimer = 0;
    player.upgrades = {};
    recompute();
    for (const pool of [bullets, ebullets, enemies, pickups, particles, floaters]) {
      for (const item of pool) item.active = false;
    }
    state.score = 0;
    state.combo = 0;
    state.comboTimer = 0;
    state.kills = 0;
    state.wave = 0;
    state.spawnQueue = [];
    state.spawnTimer = 0;
    state.waveT = 0;
    state.elapsed = 0;
    state.time = 0;
    state.shake = 0;
    state.hitStop = 0;
    state.banner = '';
    state.bannerTimer = 0;
    state.choices = [];
    state.stats = { kills: 0, shotsFired: 0, hits: 0, damageDealt: 0, timePlayed: 0, wavesCleared: 0 };
    if (mode === 'demo') {
      state.phase = 'demo';
      for (let i = 0; i < 6; i += 1) {
        const e = spawnEnemy(pick(random, ['drifter', 'drifter', 'spitter', 'splitter']), range(random, 120, FIELD.width - 120), range(random, 120, FIELD.height - 120));
        if (e) e.spawnT = 0;
      }
    } else {
      startWave(1);
    }
  }

  function updateParticles(dt) {
    for (const p of particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      if (p.kind === 'ring') {
        p.size += 260 * dt;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= p.drag;
      p.vy *= p.drag;
    }
    for (const f of floaters) {
      if (!f.active) continue;
      f.life -= dt;
      if (f.life <= 0) {
        f.active = false;
        continue;
      }
      f.y -= 42 * dt;
    }
  }

  function updateDemo(dt) {
    state.time += dt;
    for (const e of enemies) {
      if (!e.active) continue;
      e.wobble += dt;
      e.x += Math.cos(e.wobble) * e.speed * 0.4 * dt;
      e.y += Math.sin(e.wobble * 0.7) * e.speed * 0.4 * dt;
      e.x = Math.max(40, Math.min(FIELD.width - 40, e.x));
      e.y = Math.max(40, Math.min(FIELD.height - 40, e.y));
    }
    if (activeCount(enemies) < 6 && random() < dt * 0.2) {
      const e = spawnEnemy(pick(random, ['drifter', 'spitter']), range(random, 80, FIELD.width - 80), range(random, 80, FIELD.height - 80));
      if (e) e.spawnT = 0;
    }
    updateParticles(dt);
  }

  /**
   * One fixed step. `ctrl` is {mx, my, aimX, aimY, firing, dash} in logical coordinates.
   * With `demo` set, the world idles as the title screen's backdrop: shades drift, nothing
   * touches the Warden and nothing scores.
   */
  function step(dt, ctrl, demo = false) {
    if (state.hitStop > 0) {
      state.hitStop -= dt;
      return 0;
    }
    let events = 0;
    state.time += dt;
    state.shake = Math.max(0, state.shake - dt * 2.2);
    if (state.bannerTimer > 0) state.bannerTimer -= dt;

    if (demo || state.phase === 'demo') {
      updateDemo(dt);
      return 0;
    }
    if (state.phase === 'upgrade' || state.phase === 'over' || state.phase === 'victory') {
      updateParticles(dt);
      return 0;
    }

    state.elapsed += dt;
    state.stats.timePlayed += dt;
    state.waveT += dt;
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) state.combo = 0;
    }
    if (player.spreadTimer > 0) player.spreadTimer -= dt;
    if (player.invuln > 0) player.invuln -= dt;
    if (player.dashCd > 0) player.dashCd -= dt;

    // --- The Warden: move, dash, aim, fire.
    player.aim = Math.atan2(ctrl.aimY - player.y, ctrl.aimX - player.x);
    if (ctrl.dash && player.dashCd <= 0 && player.dashTimer <= 0 && (ctrl.mx !== 0 || ctrl.my !== 0)) {
      player.dashTimer = PLAYER.dashTime;
      player.dashCd = player.dashCooldown;
      player.dashX = ctrl.mx;
      player.dashY = ctrl.my;
      player.invuln = Math.max(player.invuln, 0.3);
      burst(player.x, player.y, '#ffb347', 10, 200, 3);
      events |= EVENT_DASH;
    }
    if (player.dashTimer > 0) {
      player.dashTimer -= dt;
      player.vx = player.dashX * PLAYER.dashSpeed;
      player.vy = player.dashY * PLAYER.dashSpeed;
    } else {
      player.vx = ctrl.mx * player.speed;
      player.vy = ctrl.my * player.speed;
    }
    player.x = Math.max(player.radius, Math.min(FIELD.width - player.radius, player.x + player.vx * dt));
    player.y = Math.max(player.radius, Math.min(FIELD.height - player.radius, player.y + player.vy * dt));

    player.fireTimer -= dt;
    if (ctrl.firing && player.fireTimer <= 0) {
      player.fireTimer = player.fireInterval;
      const shots = player.shotCount + (player.spreadTimer > 0 ? 1 : 0);
      const spread = 0.11;
      for (let i = 0; i < shots; i += 1) {
        const b = free(bullets);
        if (!b) break;
        const offset = (i - (shots - 1) / 2) * spread;
        const angle = player.aim + offset;
        b.active = true;
        b.x = player.x + Math.cos(angle) * (player.radius + 6);
        b.y = player.y + Math.sin(angle) * (player.radius + 6);
        b.vx = Math.cos(angle) * PLAYER.bulletSpeed;
        b.vy = Math.sin(angle) * PLAYER.bulletSpeed;
        b.damage = player.damage;
        b.pierce = player.pierceCount;
        b.life = BULLET.life;
        b.radius = BULLET.radius;
      }
      state.stats.shotsFired += shots;
      events |= EVENT_SHOOT;
    }

    // --- Spawning: the queue drains on a timer; the wave ends when the field is empty.
    if (state.spawnQueue.length > 0) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        spawnEnemy(state.spawnQueue.shift());
        state.spawnTimer = Math.max(0.22, 0.55 - state.wave * 0.03);
      }
    } else if (activeCount(enemies) === 0) {
      state.stats.wavesCleared += 1;
      addScore(WAVE_BONUS * state.wave, FIELD.width / 2, 660);
      if (state.wave >= WAVE_COUNT) {
        state.phase = 'victory';
        state.banner = '';
        return events | EVENT_VICTORY;
      }
      state.phase = 'upgrade';
      offerUpgrades();
      return events | EVENT_CLEAR;
    }

    // --- Shades: each kind moves and fights its own way.
    for (const e of enemies) {
      if (!e.active) continue;
      if (e.spawnT > 0) {
        e.spawnT -= dt;
        continue;
      }
      if (e.flash > 0) e.flash -= dt;
      const dx = player.x - e.x;
      const dy = player.y - e.y;
      const dist = Math.hypot(dx, dy) || 1;
      const nx = dx / dist;
      const ny = dy / dist;
      if (e.kind === 'spitter') {
        const want = 300;
        const toward = dist > want + 40 ? 1 : dist < want - 60 ? -1 : 0;
        e.wobble += dt * 1.4;
        e.vx = nx * e.speed * toward + Math.cos(e.wobble) * 40;
        e.vy = ny * e.speed * toward + Math.sin(e.wobble) * 40;
        e.fireTimer -= dt;
        if (e.fireTimer <= 0 && dist < (ENEMY.spitter.range ?? 380)) {
          e.fireTimer = ENEMY.spitter.fireInterval;
          const b = free(ebullets);
          if (b) {
            b.active = true;
            b.x = e.x;
            b.y = e.y;
            b.vx = nx * (ENEMY.spitter.bulletSpeed ?? 250);
            b.vy = ny * (ENEMY.spitter.bulletSpeed ?? 250);
            b.life = 4;
            b.damage = 1;
          }
        }
      } else if (e.kind === 'dasher') {
        e.stateTimer -= dt;
        if (e.state === 'chase') {
          e.vx = nx * e.speed;
          e.vy = ny * e.speed;
          if (dist < 280 && e.stateTimer <= 0) {
            e.state = 'telegraph';
            e.stateTimer = ENEMY.dasher.telegraph ?? 0.6;
            e.vx = 0;
            e.vy = 0;
          }
        } else if (e.state === 'telegraph') {
          e.vx = 0;
          e.vy = 0;
          if (e.stateTimer <= 0) {
            e.state = 'lunge';
            e.stateTimer = 0.35;
            e.vx = nx * (ENEMY.dasher.lungeSpeed ?? 540);
            e.vy = ny * (ENEMY.dasher.lungeSpeed ?? 540);
          }
        } else if (e.state === 'lunge') {
          if (e.stateTimer <= 0) {
            e.state = 'recover';
            e.stateTimer = 0.6;
          }
        } else {
          e.vx *= 0.9;
          e.vy *= 0.9;
          if (e.stateTimer <= 0) {
            e.state = 'chase';
            e.stateTimer = 1.2;
          }
        }
      } else {
        e.wobble += dt * 2;
        const wob = e.kind === 'drifter' ? 0.35 : 0.15;
        e.vx = nx * e.speed + -ny * Math.sin(e.wobble) * e.speed * wob;
        e.vy = ny * e.speed + nx * Math.sin(e.wobble) * e.speed * wob;
      }
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.x = Math.max(e.radius, Math.min(FIELD.width - e.radius, e.x));
      e.y = Math.max(e.radius, Math.min(FIELD.height - e.radius, e.y));
      e.angle = Math.atan2(e.vy, e.vx);
    }

    // Shades keep their distance from each other.
    for (let i = 0; i < enemies.length; i += 1) {
      const a = enemies[i];
      if (!a.active || a.spawnT > 0) continue;
      for (let j = i + 1; j < enemies.length; j += 1) {
        const b = enemies[j];
        if (!b.active || b.spawnT > 0) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        const min = a.radius + b.radius - 4;
        if (dist > 0 && dist < min) {
          const push = (min - dist) / 2;
          const nx = dx / dist;
          const ny = dy / dist;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
        }
      }
    }

    // --- Ember bolts: fly, fade, and burn what they touch.
    for (const b of bullets) {
      if (!b.active) continue;
      b.life -= dt;
      if (b.life <= 0) {
        b.active = false;
        continue;
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < -20 || b.x > FIELD.width + 20 || b.y < -20 || b.y > FIELD.height + 20) {
        b.active = false;
        continue;
      }
      for (const e of enemies) {
        if (!e.active || e.spawnT > 0 || e === b.lastHit) continue;
        const dx = e.x - b.x;
        const dy = e.y - b.y;
        const rr = e.radius + b.radius;
        if (dx * dx + dy * dy > rr * rr) continue;
        e.hp -= b.damage;
        e.flash = 0.12;
        state.stats.hits += 1;
        state.stats.damageDealt += b.damage;
        b.lastHit = e;
        burst(b.x, b.y, '#ffd166', 4, 160, 3);
        const kb = e.kind === 'brute' ? 30 : 120;
        e.x += (b.vx / PLAYER.bulletSpeed) * kb * dt * 4;
        e.y += (b.vy / PLAYER.bulletSpeed) * kb * dt * 4;
        events |= EVENT_HIT;
        if (e.hp <= 0) {
          killEnemy(e);
          events |= EVENT_KILL;
        }
        if (b.pierce > 0) {
          b.pierce -= 1;
        } else {
          b.active = false;
        }
        break;
      }
    }

    // --- Shade spit: slow orbs that hurt on touch.
    for (const b of ebullets) {
      if (!b.active) continue;
      b.life -= dt;
      if (b.life <= 0) {
        b.active = false;
        continue;
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < -20 || b.x > FIELD.width + 20 || b.y < -20 || b.y > FIELD.height + 20) {
        b.active = false;
        continue;
      }
      const dx = player.x - b.x;
      const dy = player.y - b.y;
      const rr = player.radius + b.radius - 4;
      if (dx * dx + dy * dy < rr * rr) {
        b.active = false;
        events |= hurtPlayer(b.damage);
        if (events & EVENT_OVER) return events;
      }
    }

    // --- Shades that reach the Warden bite.
    for (const e of enemies) {
      if (!e.active || e.spawnT > 0) continue;
      const dx = player.x - e.x;
      const dy = player.y - e.y;
      const rr = player.radius + e.radius - 6;
      if (dx * dx + dy * dy < rr * rr) {
        events |= hurtPlayer(e.damage);
        e.x -= (dx / (Math.hypot(dx, dy) || 1)) * 26;
        e.y -= (dy / (Math.hypot(dx, dy) || 1)) * 26;
        if (events & EVENT_OVER) return events;
      }
    }

    // --- Pickups: drift, glow, and answer the magnet.
    for (const p of pickups) {
      if (!p.active) continue;
      p.life -= dt;
      p.bob += dt * 3;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
      const dx = player.x - p.x;
      const dy = player.y - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist < player.magnetRadius && dist > 1) {
        p.x += (dx / dist) * 320 * dt;
        p.y += (dy / dist) * 320 * dt;
      }
      if (dist < player.radius + PICKUP[p.kind].radius + 4) {
        p.active = false;
        if (p.kind === 'heal') {
          player.hp = Math.min(player.maxHp, player.hp + 1);
          floater(player.x, player.y - 30, '+1 HEART', '#7ee787', 16);
        } else if (p.kind === 'shield') {
          player.shield = true;
          floater(player.x, player.y - 30, 'WARD UP', '#6ec1ff', 16);
        } else if (p.kind === 'gem') {
          addScore(25, p.x, p.y - 12);
        } else if (p.kind === 'spread') {
          player.spreadTimer = 8;
          floater(player.x, player.y - 30, 'SPREAD SHOT', '#ffb347', 16);
        }
        burst(p.x, p.y, PICKUP[p.kind].color, 8, 140, 3);
        events |= EVENT_PICKUP;
      }
    }

    updateParticles(dt);
    return events;
  }

  reset('run');
  return { state, reset, step, startWave, offerUpgrades, applyUpgrade, waveComposition: (n) => waveComposition(n, random), activeCount: () => activeCount(enemies) };
}
