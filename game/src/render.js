// All drawing, and nothing else: the arena, the shades, the Warden, the HUD and every
// screen. The playfield is a fixed 1280x720 logical area scaled to the window; the renderer
// owns the canvas size, the letterbox and the screen shake, so the world never sees pixels.

import { ENEMY, FIELD, FONT, FONT_DISPLAY, PALETTE, PICKUP, WAVE_COUNT } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_UPGRADE = 'upgrade';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_VICTORY = 'victory';

const TAU = Math.PI * 2;

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;
  let dpr = 1;

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    scale = Math.min(w / FIELD.width, h / FIELD.height);
    offsetX = (w - FIELD.width * scale) / 2;
    offsetY = (h - FIELD.height * scale) / 2;
  }
  window.addEventListener('resize', resize);
  resize();

  /** Client (CSS pixel) coordinates into logical field coordinates. */
  function toLogical(clientX, clientY) {
    return { x: (clientX - offsetX) / scale, y: (clientY - offsetY) / scale };
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function circle(x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
  }

  function text(str, x, y, size, color, weight = 600, align = 'center', font = FONT) {
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px ${font}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(str, x, y);
  }

  function drawFloor(time) {
    const grad = ctx.createRadialGradient(FIELD.width / 2, FIELD.height / 2, 80, FIELD.width / 2, FIELD.height / 2, 760);
    grad.addColorStop(0, PALETTE.floorGlow);
    grad.addColorStop(0.55, PALETTE.floor);
    grad.addColorStop(1, PALETTE.backdrop);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    // A faint grid, and slow-drifting embers that give the dark floor life.
    ctx.strokeStyle = PALETTE.floorGrid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 80; x < FIELD.width; x += 80) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, FIELD.height);
    }
    for (let y = 80; y < FIELD.height; y += 80) {
      ctx.moveTo(0, y);
      ctx.lineTo(FIELD.width, y);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,179,71,0.16)';
    ctx.lineWidth = 2;
    ctx.strokeRect(14, 14, FIELD.width - 28, FIELD.height - 28);
    for (let i = 0; i < 14; i += 1) {
      const x = ((i * 173 + time * 12) % (FIELD.width + 40)) - 20;
      const y = 60 + ((i * 97) % (FIELD.height - 120)) + Math.sin(time * 0.7 + i) * 8;
      ctx.fillStyle = `rgba(255,179,71,${0.10 + 0.08 * Math.sin(time + i * 2)})`;
      circle(x, y, 2);
      ctx.fill();
    }
  }

  function drawPickup(p, time) {
    const def = PICKUP[p.kind];
    const bob = Math.sin(p.bob) * 3;
    const blink = p.life < 2 ? (Math.sin(time * 14) > 0 ? 1 : 0.25) : 1;
    ctx.save();
    ctx.globalAlpha = blink;
    ctx.shadowColor = def.color;
    ctx.shadowBlur = 14;
    ctx.fillStyle = def.color;
    if (p.kind === 'heal') {
      const s = def.radius;
      ctx.fillRect(p.x - 3, p.y - s + bob, 6, s * 2);
      ctx.fillRect(p.x - s, p.y - 3 + bob, s * 2, 6);
    } else if (p.kind === 'shield') {
      circle(p.x, p.y + bob, def.radius);
      ctx.fill();
      ctx.fillStyle = PALETTE.backdrop;
      circle(p.x, p.y + bob, def.radius - 5);
      ctx.fill();
      ctx.fillStyle = def.color;
      circle(p.x, p.y + bob, 3.5);
      ctx.fill();
    } else if (p.kind === 'gem') {
      ctx.translate(p.x, p.y + bob);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-6, -6, 12, 12);
    } else {
      // Spread: three small embers in a fan.
      for (let i = -1; i <= 1; i += 1) {
        circle(p.x + i * 9, p.y + bob - Math.abs(i) * -4, 4.5);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawEnemy(e, time) {
    const spawnScale = e.spawnT > 0 ? 1 - e.spawnT / 0.5 : 1;
    const r = e.radius * Math.max(0.2, spawnScale);
    ctx.save();
    ctx.translate(e.x, e.y);
    if (e.spawnT > 0) ctx.globalAlpha = 0.35 + 0.65 * spawnScale;
    ctx.shadowColor = e.color;
    ctx.shadowBlur = 16;
    ctx.fillStyle = e.color;
    if (e.kind === 'drifter') {
      // A wobbling violet blob.
      ctx.beginPath();
      for (let i = 0; i <= 10; i += 1) {
        const a = (i / 10) * TAU;
        const rr = r * (1 + 0.12 * Math.sin(a * 3 + time * 3 + e.wobble));
        const x = Math.cos(a) * rr;
        const y = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    } else if (e.kind === 'spitter') {
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-r * 0.85, -r * 0.85, r * 1.7, r * 1.7);
      ctx.rotate(-Math.PI / 4);
      ctx.fillStyle = e.dark;
      circle(0, 0, r * 0.45);
      ctx.fill();
    } else if (e.kind === 'brute') {
      ctx.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * TAU + time * 0.2;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = e.dark;
      ctx.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * TAU + time * 0.2 + 0.5;
        const x = Math.cos(a) * r * 0.55;
        const y = Math.sin(a) * r * 0.55;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    } else if (e.kind === 'splitter') {
      circle(0, 0, r);
      ctx.fill();
      ctx.fillStyle = e.dark;
      circle(0, 0, r * 0.55);
      ctx.fill();
      ctx.fillStyle = e.color;
      circle(-r * 0.3, -r * 0.25, r * 0.2);
      ctx.fill();
      circle(r * 0.3, r * 0.25, r * 0.2);
      ctx.fill();
    } else if (e.kind === 'dasher') {
      ctx.rotate(e.angle);
      ctx.beginPath();
      ctx.moveTo(r * 1.2, 0);
      ctx.lineTo(-r * 0.8, r * 0.85);
      ctx.lineTo(-r * 0.4, 0);
      ctx.lineTo(-r * 0.8, -r * 0.85);
      ctx.closePath();
      ctx.fill();
      if (e.state === 'telegraph') {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(time * 24);
        ctx.beginPath();
        ctx.moveTo(r * 1.2, 0);
        ctx.lineTo(-r * 0.8, r * 0.85);
        ctx.lineTo(-r * 0.4, 0);
        ctx.lineTo(-r * 0.8, -r * 0.85);
        ctx.closePath();
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    } else {
      // Mote: a small bright shard.
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.8, 0);
      ctx.lineTo(0, r);
      ctx.lineTo(-r * 0.8, 0);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    // Eyes, always facing the Warden: two white dots with dark pupils.
    if (e.kind !== 'brute' && e.spawnT <= 0) {
      const look = Math.atan2(stateRef.player.y - e.y, stateRef.player.x - e.x);
      const ex = Math.cos(look);
      const ey = Math.sin(look);
      const px = -ey;
      const py = ex;
      for (const side of [-1, 1]) {
        const cx = e.x + ex * r * 0.3 + px * side * r * 0.38;
        const cy = e.y + ey * r * 0.3 + py * side * r * 0.38;
        ctx.fillStyle = '#ffffff';
        circle(cx, cy, Math.max(2, r * 0.16));
        ctx.fill();
        ctx.fillStyle = '#11141b';
        circle(cx + ex * 1.5, cy + ey * 1.5, Math.max(1.2, r * 0.08));
        ctx.fill();
      }
    }
    // Hit flash and the health bar of anything hurt.
    if (e.flash > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, e.flash / 0.12) * 0.8;
      ctx.fillStyle = '#ffffff';
      circle(e.x, e.y, r);
      ctx.fill();
      ctx.restore();
    }
    if (e.hp < e.maxHp && e.spawnT <= 0) {
      const w = e.radius * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(e.x - w / 2, e.y - e.radius - 10, w, 4);
      ctx.fillStyle = '#ff5d5d';
      ctx.fillRect(e.x - w / 2, e.y - e.radius - 10, w * (e.hp / e.maxHp), 4);
    }
  }

  function drawPlayer(p, time) {
    const blink = p.invuln > 0 && p.dashTimer <= 0 ? (Math.sin(time * 30) > 0 ? 0.45 : 1) : 1;
    ctx.save();
    ctx.globalAlpha = blink;
    // Lantern glow under the Warden.
    const glow = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, 90);
    glow.addColorStop(0, 'rgba(255,209,102,0.28)');
    glow.addColorStop(1, 'rgba(255,209,102,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(p.x - 90, p.y - 90, 180, 180);
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + p.radius * 0.85, p.radius * 0.95, p.radius * 0.4, 0, 0, TAU);
    ctx.fill();
    // Robe: a dark hooded circle with an ember trim.
    ctx.shadowColor = '#ffb347';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#2a2144';
    circle(p.x, p.y, p.radius);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ffb347';
    ctx.lineWidth = 2;
    circle(p.x, p.y, p.radius - 1);
    ctx.stroke();
    // Hood point and the face shadow.
    ctx.fillStyle = '#1a1430';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - p.radius - 6);
    ctx.lineTo(p.x - 9, p.y - 2);
    ctx.lineTo(p.x + 9, p.y - 2);
    ctx.closePath();
    ctx.fill();
    // Two ember eyes, looking along the aim.
    const ex = Math.cos(p.aim);
    const ey = Math.sin(p.aim);
    for (const side of [-1, 1]) {
      const px = -ey * side * 5.5;
      const py = ex * side * 5.5;
      ctx.fillStyle = '#ffd166';
      circle(p.x + px + ex * 3, p.y + py + ey * 3, 2.4);
      ctx.fill();
    }
    // The lantern orb, carried on the aim side.
    const lx = p.x + ex * (p.radius + 8);
    const ly = p.y + ey * (p.radius + 8);
    ctx.shadowColor = '#ffd166';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#ffd166';
    circle(lx, ly, 6 + Math.sin(time * 5) * 1.2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // Shield ring, when a ward is up.
    if (p.shield) {
      ctx.strokeStyle = 'rgba(110,193,255,0.85)';
      ctx.lineWidth = 2.5;
      circle(p.x, p.y, p.radius + 8 + Math.sin(time * 4) * 1.5);
      ctx.stroke();
    }
    // Aim tick: a short line toward the aim.
    ctx.strokeStyle = 'rgba(255,209,102,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x + ex * (p.radius + 14), p.y + ey * (p.radius + 14));
    ctx.lineTo(p.x + ex * (p.radius + 24), p.y + ey * (p.radius + 24));
    ctx.stroke();
    ctx.restore();
  }

  function drawParticles(state) {
    for (const p of state.particles) {
      if (!p.active) continue;
      const t = p.life / p.maxLife;
      if (p.kind === 'ring') {
        ctx.save();
        ctx.globalAlpha = t * 0.8;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3;
        circle(p.x, p.y, p.size);
        ctx.stroke();
        ctx.restore();
        continue;
      }
      ctx.save();
      ctx.globalAlpha = Math.max(0, t);
      ctx.fillStyle = p.color;
      circle(p.x, p.y, p.size * t + 0.5);
      ctx.fill();
      ctx.restore();
    }
    for (const f of state.floaters) {
      if (!f.active) continue;
      const t = f.life / f.maxLife;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, t * 1.6));
      text(f.text, f.x, f.y, f.size, f.color, 700);
      ctx.restore();
    }
  }

  function drawBullets(state) {
    for (const b of state.bullets) {
      if (!b.active) continue;
      ctx.save();
      ctx.shadowColor = '#ffd166';
      ctx.shadowBlur = 12;
      ctx.fillStyle = '#ffcf5c';
      circle(b.x, b.y, b.radius);
      ctx.fill();
      ctx.fillStyle = '#fff6d8';
      circle(b.x, b.y, b.radius * 0.45);
      ctx.fill();
      ctx.restore();
    }
    for (const b of state.ebullets) {
      if (!b.active) continue;
      ctx.save();
      ctx.shadowColor = '#7ee787';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#7ee787';
      circle(b.x, b.y, b.radius);
      ctx.fill();
      ctx.fillStyle = '#d9ffd9';
      circle(b.x, b.y, b.radius * 0.4);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawHud(state, best) {
    const p = state.player;
    // Hearts, top left.
    for (let i = 0; i < p.maxHp; i += 1) {
      const x = 36 + i * 30;
      const y = 36;
      ctx.font = '24px ' + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = i < p.hp ? '#ff5d7a' : 'rgba(245,239,230,0.18)';
      ctx.fillText('♥', x, y);
    }
    if (p.shield) text('WARD', 36, 62, 11, '#6ec1ff', 700, 'left');
    // Wave and the shades left, top centre.
    text(`WAVE ${Math.max(1, state.wave)} / ${WAVE_COUNT}`, FIELD.width / 2, 30, 20, PALETTE.text, 700);
    const left = state.spawnQueue.length + state.enemies.filter((e) => e.active).length;
    text(state.phase === 'upgrade' ? 'WAVE CLEARED' : `${left} shades remain`, FIELD.width / 2, 54, 13, PALETTE.muted, 600);
    // Score, best and combo, top right.
    text(`SCORE ${state.score}`, FIELD.width - 36, 30, 20, PALETTE.text, 700, 'right');
    text(`BEST ${Math.max(best, state.score)}`, FIELD.width - 36, 54, 13, PALETTE.muted, 600, 'right');
    if (state.combo >= 3) {
      text(`COMBO x${(1 + Math.min(state.combo, 20) * 0.1).toFixed(1)}`, FIELD.width - 36, 78, 15, '#ffb347', 700, 'right');
    }
    // Dash charge, bottom left.
    const dashFrac = 1 - Math.max(0, p.dashCd) / (p.dashCooldown || 1.5);
    ctx.fillStyle = 'rgba(245,239,230,0.15)';
    roundRect(36, FIELD.height - 44, 120, 10, 5);
    ctx.fill();
    ctx.fillStyle = dashFrac >= 1 ? '#ffb347' : '#8a7a5c';
    roundRect(36, FIELD.height - 44, 120 * Math.max(0, dashFrac), 10, 5);
    ctx.fill();
    text('DASH [SHIFT]', 36, FIELD.height - 58, 11, PALETTE.muted, 600, 'left');
    // Upgrade pips, bottom right.
    const ups = Object.entries(p.upgrades).filter(([, n]) => n > 0);
    if (ups.length > 0) {
      text(ups.map(([id, n]) => `${id.toUpperCase()}${n > 1 ? '×' + n : ''}`).join('  ·  '), FIELD.width - 36, FIELD.height - 36, 12, PALETTE.muted, 600, 'right');
    }
    // Wave banner, centre.
    if (state.bannerTimer > 0 && state.banner) {
      const a = Math.min(1, state.bannerTimer / 0.5);
      ctx.save();
      ctx.globalAlpha = Math.min(1, a);
      text(state.banner, FIELD.width / 2, FIELD.height / 2 - 140, 54, PALETTE.banner, 800, 'center', FONT_DISPLAY);
      ctx.restore();
    }
    // Low hearts: a pulsing red edge.
    if (p.hp === 1 && state.phase === 'play') {
      const pulse = 0.10 + 0.08 * Math.sin(state.time * 6);
      const grad = ctx.createRadialGradient(FIELD.width / 2, FIELD.height / 2, 280, FIELD.width / 2, FIELD.height / 2, 720);
      grad.addColorStop(0, 'rgba(255,93,93,0)');
      grad.addColorStop(1, `rgba(255,93,93,${pulse})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    }
  }

  function dim(alpha) {
    ctx.fillStyle = `rgba(10,7,16,${alpha})`;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = 'rgba(20,15,34,0.92)';
    roundRect(x, y, w, h, 16);
    ctx.fill();
    ctx.strokeStyle = PALETTE.cardBorder;
    ctx.lineWidth = 1.5;
    roundRect(x, y, w, h, 16);
    ctx.stroke();
  }

  function drawTitle(state, best) {
    dim(0.55);
    text('EMBERFALL', FIELD.width / 2, 168, 84, PALETTE.accent, 800, 'center', FONT_DISPLAY);
    text('Warden of the Last Light', FIELD.width / 2, 228, 24, PALETTE.text, 600);
    text('Ten waves of shades are coming for the last ember. Hold the light.', FIELD.width / 2, 268, 17, PALETTE.muted, 600);
    const lines = [
      'WASD / ARROWS — move      MOUSE — aim      HOLD CLICK / SPACE — shoot',
      'SHIFT — dash through danger      P — pause      M — mute',
      'Clear a wave, choose a blessing, and survive all ten waves to win.',
    ];
    lines.forEach((line, i) => text(line, FIELD.width / 2, 330 + i * 28, 15, PALETTE.text, 600));
    if (best > 0) text(`BEST SCORE  ${best}`, FIELD.width / 2, 440, 18, '#ffd166', 700);
    const blink = Math.sin(state.time * 4) > -0.2;
    if (blink) text('— PRESS SPACE OR CLICK TO BEGIN —', FIELD.width / 2, 500, 19, PALETTE.accent, 700);
    text('A complete original game: 10 waves, 5 shades, 9 blessings, sound included.', FIELD.width / 2, 560, 13, PALETTE.dim, 600);
  }

  function drawUpgrade(state, ui) {
    dim(0.45);
    text('WAVE CLEARED', FIELD.width / 2, 130, 44, PALETTE.banner, 800, 'center', FONT_DISPLAY);
    text('Choose a blessing — the shades will not wait long.', FIELD.width / 2, 176, 17, PALETTE.muted, 600);
    const cards = state.choices;
    const w = 300;
    const h = 220;
    const gap = 28;
    const total = cards.length * w + (cards.length - 1) * gap;
    const startX = (FIELD.width - total) / 2;
    const y = 250;
    cards.forEach((card, i) => {
      const x = startX + i * (w + gap);
      const hovered = ui.hover === i;
      ctx.fillStyle = hovered ? PALETTE.cardHover : PALETTE.card;
      roundRect(x, y, w, h, 16);
      ctx.fill();
      ctx.strokeStyle = hovered ? PALETTE.accent : PALETTE.cardBorder;
      ctx.lineWidth = hovered ? 2.5 : 1.5;
      roundRect(x, y, w, h, 16);
      ctx.stroke();
      text(card.icon, x + w / 2, y + 58, 44, PALETTE.accent, 700);
      text(card.name, x + w / 2, y + 118, 21, PALETTE.text, 700);
      text(card.desc, x + w / 2, y + 152, 15, PALETTE.muted, 600);
      text(`[ ${i + 1} ]  or click`, x + w / 2, y + 190, 13, PALETTE.dim, 600);
    });
    text(`Score ${state.score}  ·  Wave ${state.wave} of ${WAVE_COUNT} cleared`, FIELD.width / 2, 530, 15, PALETTE.muted, 600);
  }

  function drawPaused() {
    dim(0.6);
    text('PAUSED', FIELD.width / 2, FIELD.height / 2 - 20, 56, PALETTE.text, 800, 'center', FONT_DISPLAY);
    text('Press P or click to keep fighting.', FIELD.width / 2, FIELD.height / 2 + 40, 17, PALETTE.muted, 600);
  }

  function statLines(state, best) {
    const s = state.stats;
    const mins = Math.floor(s.timePlayed / 60);
    const secs = Math.floor(s.timePlayed % 60).toString().padStart(2, '0');
    return [
      `SCORE  ${state.score}`,
      `BEST  ${Math.max(best, state.score)}`,
      `WAVE REACHED  ${Math.max(1, state.wave)} / ${WAVE_COUNT}`,
      `SHADES BANISHED  ${s.kills}`,
      `TIME  ${mins}:${secs}`,
    ];
  }

  function drawOver(state, best) {
    dim(0.62);
    text('THE LIGHT FADES', FIELD.width / 2, 190, 56, '#ff5d5d', 800, 'center', FONT_DISPLAY);
    text(`The shades overran the hollow on wave ${Math.max(1, state.wave)}.`, FIELD.width / 2, 244, 17, PALETTE.muted, 600);
    statLines(state, best).forEach((line, i) => text(line, FIELD.width / 2, 310 + i * 32, 19, PALETTE.text, 600));
    const blink = Math.sin(state.time * 4) > -0.2;
    if (blink) text('— PRESS R OR CLICK TO TRY AGAIN —', FIELD.width / 2, 520, 19, PALETTE.accent, 700);
  }

  function drawVictory(state, best) {
    dim(0.5);
    const stars = state.player.hp >= 4 ? 3 : state.player.hp >= 2 ? 2 : 1;
    text('★'.repeat(stars) + '☆'.repeat(3 - stars), FIELD.width / 2, 130, 40, '#ffd166', 700);
    text('THE LIGHT ENDURES', FIELD.width / 2, 200, 56, '#ffd166', 800, 'center', FONT_DISPLAY);
    text('All ten waves are banished. The hollow is safe — for tonight.', FIELD.width / 2, 254, 17, PALETTE.muted, 600);
    statLines(state, best).forEach((line, i) => text(line, FIELD.width / 2, 316 + i * 32, 19, PALETTE.text, 600));
    const blink = Math.sin(state.time * 4) > -0.2;
    if (blink) text('— PRESS R OR CLICK TO PLAY AGAIN —', FIELD.width / 2, 526, 19, PALETTE.accent, 700);
  }

  // The world reads the player's position for the shades' eyes; kept as a module-level
  // reference the draw call sets, so drawEnemy stays a pure function of its arguments.
  let stateRef = null;

  function draw(state, screen, best, ui = {}) {
    stateRef = state;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = PALETTE.backdrop;
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offsetX, dpr * offsetY);
    const shake = state.shake * 9;
    const sx = (Math.random() * 2 - 1) * shake;
    const sy = (Math.random() * 2 - 1) * shake;
    ctx.save();
    ctx.translate(sx, sy);
    drawFloor(state.time);
    for (const p of state.pickups) if (p.active) drawPickup(p, state.time);
    for (const e of state.enemies) if (e.active) drawEnemy(e, state.time);
    drawPlayer(state.player, state.time);
    drawBullets(state);
    drawParticles(state);
    ctx.restore();
    if (screen === SCREEN_PLAY || screen === SCREEN_UPGRADE || screen === SCREEN_PAUSED) drawHud(state, best);
    if (screen === SCREEN_TITLE) drawTitle(state, best);
    else if (screen === SCREEN_UPGRADE) drawUpgrade(state, ui);
    else if (screen === SCREEN_PAUSED) drawPaused();
    else if (screen === SCREEN_OVER) drawOver(state, best);
    else if (screen === SCREEN_VICTORY) drawVictory(state, best);
    if (ui.muted) text('MUTED — M to unmute', FIELD.width - 24, FIELD.height - 24, 12, PALETTE.dim, 600, 'right');
  }

  return { draw, toLogical, resize };
}
