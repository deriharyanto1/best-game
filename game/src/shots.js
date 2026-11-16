// The screenshot scenes behind ?shot=title|play|upgrade|victory. Each one plays the real
// rules forward from a fresh world for a fixed number of steps, steered by a simple autopilot
// (aim at the nearest shade, keep a fighting distance, grab close pickups, dash out when
// surrounded), so the frame is what a real game looks like and the same seed always gives the
// same frame. The victory scene's pilot fights with demo buffs (harder embers, more hearts),
// the way the starter's end scene uses a weaker pilot to force a loss: the screen it shows is
// the real victory screen over a real run.
import { FIELD, STEP } from './config.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_UPGRADE, SCREEN_VICTORY } from './render.js';

/**
 * The autopilot's control for one step: move, aim, fire and dash, from the world's state.
 * It keeps a fighting distance from the nearest shade, sidesteps while it shoots, and runs
 * for a pickup only when nothing is close enough to bite.
 */
export function autopilot(state) {
  const p = state.player;
  let nearest = null;
  let nearestDist = Infinity;
  for (const e of state.enemies) {
    if (!e.active || e.spawnT > 0) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d < nearestDist) {
      nearestDist = d;
      nearest = e;
    }
  }
  if (!nearest) {
    const dx = FIELD.width / 2 - p.x;
    const dy = FIELD.height / 2 - p.y;
    const d = Math.hypot(dx, dy) || 1;
    return { mx: d > 40 ? dx / d : 0, my: d > 40 ? dy / d : 0, aimX: p.x, aimY: p.y - 100, firing: false, dash: false };
  }
  const ax = nearest.x - p.x;
  const ay = nearest.y - p.y;
  const ad = Math.hypot(ax, ay) || 1;
  const nx = ax / ad;
  const ny = ay / ad;
  // Strafe around the target, closing in past 380 and backing off inside 150.
  const radial = nearestDist > 380 ? 0.8 : nearestDist < 150 ? -1 : 0;
  const strafe = 0.9;
  let mx = nx * radial + -ny * strafe;
  let my = ny * radial + nx * strafe;
  // A close pickup is worth a detour when nothing is about to bite.
  if (nearestDist > 160) {
    for (const pk of state.pickups) {
      if (!pk.active) continue;
      const d = Math.hypot(pk.x - p.x, pk.y - p.y);
      if (d < 220) {
        mx = (pk.x - p.x) / d;
        my = (pk.y - p.y) / d;
        break;
      }
    }
  }
  const len = Math.hypot(mx, my) || 1;
  mx /= len;
  my /= len;
  // Dash out when surrounded.
  let close = 0;
  for (const e of state.enemies) {
    if (!e.active || e.spawnT > 0) continue;
    if (Math.hypot(e.x - p.x, e.y - p.y) < 150) close += 1;
  }
  const dash = close >= 3 && p.dashCd <= 0;
  return { mx, my, aimX: nearest.x, aimY: nearest.y, firing: true, dash };
}

const IDLE = { mx: 0, my: 0, aimX: FIELD.width / 2, aimY: 0, firing: false, dash: false };

function runSteps(world, seconds, pilot) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    world.step(STEP, pilot ? autopilot(world.state) : IDLE, false);
  }
}

/**
 * Play forward with the autopilot for up to `seconds`, stopping early when `stopWhen`
 * holds. With `autoUpgrade` set, a wave-clear's blessing is taken at once (the first card)
 * so the run flows into the next wave instead of waiting at the choice screen.
 */
function simulate(world, seconds, stopWhen, autoUpgrade) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    world.step(STEP, autopilot(world.state), false);
    const s = world.state;
    if (s.phase === 'upgrade' && autoUpgrade && s.choices.length > 0) {
      world.applyUpgrade(s.choices[0].id);
      continue;
    }
    if (stopWhen && stopWhen(s)) return true;
  }
  return false;
}

/** Demo buffs for the victory run: harder embers and more hearts, escalating per attempt. */
function buffPlayer(world, level) {
  const p = world.state.player;
  p.damage = 1 + level;
  p.maxHp = 5 + level * 2;
  p.hp = p.maxHp;
  p.fireInterval = 0.17 * (1 - 0.15 * level);
}

/**
 * Set `world` to the named scene (title, play, upgrade or victory; any other name is title)
 * and return the screen to draw over it, the best score to show, and the upgrade choices
 * when the scene is one.
 */
export function stageShot(name, world) {
  const state = world.state;
  if (name === 'play') {
    // Mid-wave action: play until wave two is under way, then five seconds of it. The
    // first wave-clear's blessing is taken at once so the run flows into wave two.
    world.reset('run');
    let reached = simulate(world, 90, (s) => (s.wave >= 2 && s.phase === 'play') || s.phase === 'over', true);
    if (!reached || state.phase === 'over') {
      world.reset('run');
      buffPlayer(world, 1);
      simulate(world, 90, (s) => (s.wave >= 2 && s.phase === 'play') || s.phase === 'over', true);
    }
    if (state.phase === 'play') runSteps(world, 5, true);
    return { screen: state.phase === 'over' ? SCREEN_OVER : SCREEN_PLAY, best: state.score };
  }
  if (name === 'upgrade') {
    world.reset('run');
    const cleared = simulate(world, 150, (s) => s.phase === 'upgrade' || s.phase === 'over', false);
    if (!cleared || state.phase === 'over') {
      // The pilot died on wave one: run it again with demo buffs so the scene shows.
      world.reset('run');
      buffPlayer(world, 1);
      simulate(world, 150, (s) => s.phase === 'upgrade' || s.phase === 'over', false);
    }
    return { screen: state.phase === 'upgrade' ? SCREEN_UPGRADE : SCREEN_OVER, best: state.score, choices: state.choices };
  }
  if (name === 'victory') {
    for (let level = 1; level <= 3; level += 1) {
      world.reset('run');
      buffPlayer(world, level);
      const won = simulate(world, 900, (s) => s.phase === 'victory' || s.phase === 'over', true);
      if (won && state.phase === 'victory') {
        return { screen: SCREEN_VICTORY, best: state.score, stats: state.stats };
      }
    }
    return { screen: state.phase === 'victory' ? SCREEN_VICTORY : SCREEN_OVER, best: state.score, stats: state.stats };
  }
  // Title: the demo world drifting behind the title screen.
  world.reset('demo');
  runSteps(world, 5, false);
  return { screen: SCREEN_TITLE, best: 0 };
}
