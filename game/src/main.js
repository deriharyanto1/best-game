// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The game
// moves between six screens: title, play, upgrade, paused, game over and victory.
//
// ?seed=N fixes the spawn pattern. ?shot=title|play|upgrade|victory (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets window.__shotReady for a screenshot.
// ?selftest=1 runs a scripted play-through in the page and reports the result in the status line
// and the document title, for headless play-testing.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_CLEAR, EVENT_DASH, EVENT_KILL, EVENT_OVER, EVENT_PICKUP, EVENT_SHOOT, EVENT_VICTORY, EVENT_WAVE } from './world.js';
import { ACTION_CONFIRM, ACTION_DASH, ACTION_MUTE, ACTION_PAUSE, ACTION_PICK_1, ACTION_PICK_2, ACTION_PICK_3, ACTION_RESTART, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_UPGRADE, SCREEN_VICTORY } from './render.js';
import { autopilot, stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;
/** The upgrade cards' layout, matching the renderer's: three 300x220 cards, 28 apart, at y 250. */
const CARD = { w: 300, h: 220, gap: 28, y: 250 };

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const selftest = params.get('selftest') === '1';
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, { choices: scene.choices, hover: 1 });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runSelfTest() {
  const result = { ok: true, checks: {} };
  const fail = (name, detail) => {
    result.ok = false;
    result.checks[name] = `FAIL: ${detail}`;
  };
  try {
    // Title demo idles without errors.
    world.reset('demo');
    for (let i = 0; i < 120; i += 1) world.step(STEP, { mx: 0, my: 0, aimX: 640, aimY: 0, firing: false, dash: false }, true);
    result.checks.demo = 'ok';
    // A real run: the autopilot shoots, scores and clears wave one.
    world.reset('run');
    let sawShot = false;
    let sawKill = false;
    for (let i = 0; i < 60 * 120; i += 1) {
      const events = world.step(STEP, autopilot(world.state), false);
      if (events & EVENT_SHOOT) sawShot = true;
      if (events & EVENT_KILL) sawKill = true;
      if (world.state.phase === 'upgrade') break;
    }
    if (!sawShot) fail('shoot', 'no shot fired in 120 s');
    if (!sawKill) fail('kill', 'no shade banished in 120 s');
    if (world.state.phase !== 'upgrade') fail('wave-clear', `phase is ${world.state.phase}, score ${world.state.score}`);
    else result.checks.waveClear = `ok (score ${world.state.score}, wave 1)`;
    // The upgrade choice applies and wave two starts.
    if (world.state.choices.length === 3) {
      const before = world.state.player.shotCount + world.state.player.damage;
      world.applyUpgrade(world.state.choices[0].id);
      if (world.state.phase !== 'play' || world.state.wave !== 2) fail('upgrade', `phase ${world.state.phase}, wave ${world.state.wave}`);
      else result.checks.upgrade = `ok (picked ${world.state.choices.length === 0 ? 'a blessing' : 'none'}, stats changed ${before})`;
    } else {
      fail('upgrade', `${world.state.choices.length} choices offered`);
    }
    // Losing: a brute on top of a one-heart Warden ends the run.
    world.reset('run');
    world.state.player.hp = 1;
    world.state.player.invuln = 0;
    world.state.player.x = 640;
    world.state.player.y = 360;
    const brute = world.state.enemies.find((e) => !e.active);
    brute.active = true;
    brute.kind = 'brute';
    brute.x = 640;
    brute.y = 360;
    brute.hp = 14;
    brute.maxHp = 14;
    brute.radius = 30;
    brute.speed = 0;
    brute.damage = 2;
    brute.spawnT = 0;
    brute.flash = 0;
    for (let i = 0; i < 60 && world.state.phase !== 'over'; i += 1) {
      world.step(STEP, { mx: 0, my: 0, aimX: 640, aimY: 0, firing: false, dash: false }, false);
    }
    if (world.state.phase !== 'over') fail('game-over', `phase is ${world.state.phase}`);
    else result.checks.gameOver = 'ok';
    // And a fresh run starts cleanly after it.
    world.reset('run');
    if (world.state.phase !== 'play' || world.state.wave !== 1 || world.state.score !== 0) {
      fail('restart', `phase ${world.state.phase}, wave ${world.state.wave}, score ${world.state.score}`);
    } else {
      result.checks.restart = 'ok';
    }
  } catch (error) {
    fail('exception', String(error && error.message ? error.message : error));
  }
  const summary = result.ok ? 'SELFTEST OK' : 'SELFTEST FAIL';
  const detail = Object.entries(result.checks).map(([k, v]) => `${k}=${v}`).join('; ');
  status.textContent = `${summary}: ${detail}`;
  document.title = `${summary}: ${detail}`;
  window.__selftest = result;
}

function runGame() {
  const input = createInput(canvas);
  const audio = createAudio();
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let hover = -1;
  let dashQueued = false;

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset('run');
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.unlock();
    announce(`Playing. Wave 1 of 10. ${world.state.player.hp} hearts.`);
  }

  function endGame(victory) {
    screen = victory ? SCREEN_VICTORY : SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(victory
      ? `Victory. The light endures. Score ${world.state.score}. Best ${best}.`
      : `Game over on wave ${world.state.wave}. Score ${world.state.score}. Best ${best}.`);
  }

  function upgradeCardAt(clientX, clientY) {
    const logical = renderer.toLogical(clientX, clientY);
    const cards = world.state.choices;
    const total = cards.length * CARD.w + (cards.length - 1) * CARD.gap;
    const startX = (1280 - total) / 2;
    for (let i = 0; i < cards.length; i += 1) {
      const x = startX + i * (CARD.w + CARD.gap);
      if (logical.x >= x && logical.x <= x + CARD.w && logical.y >= CARD.y && logical.y <= CARD.y + CARD.h) return i;
    }
    return -1;
  }

  function pickUpgrade(index) {
    const choices = world.state.choices;
    if (index < 0 || index >= choices.length) return;
    audio.upgrade();
    world.applyUpgrade(choices[index].id);
    screen = SCREEN_PLAY;
    announce(`Blessing taken: ${choices[index].name}. Wave ${world.state.wave}.`);
  }

  function playEvents(events) {
    if (events & EVENT_SHOOT) audio.shoot();
    if (events & EVENT_KILL) audio.explode(false);
    if (events & EVENT_PICKUP) audio.pickup('gem');
    if (events & EVENT_WAVE) audio.wave();
    if (events & EVENT_CLEAR) audio.upgrade();
    if (events & EVENT_DASH) audio.dash();
    if (events & EVENT_OVER) {
      audio.over();
      endGame(false);
    } else if (events & EVENT_VICTORY) {
      audio.victory();
      endGame(true);
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    const aim = input.aim();
    // The dash press is edge-triggered: queue it here, once per frame, for the next step.
    if (actions & ACTION_DASH) dashQueued = true;
    if (actions & ACTION_MUTE) {
      audio.setMuted(!audio.isMuted());
      announce(audio.isMuted() ? 'Muted.' : 'Sound on.');
    }
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) startGame();
      return;
    }
    if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      }
      return;
    }
    if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
      return;
    }
    if (screen === SCREEN_UPGRADE) {
      if (actions & ACTION_PICK_1) pickUpgrade(0);
      else if (actions & ACTION_PICK_2) pickUpgrade(1);
      else if (actions & ACTION_PICK_3) pickUpgrade(2);
      else if (actions & ACTION_CONFIRM && aim.seen) {
        const index = upgradeCardAt(aim.x, aim.y);
        if (index >= 0) pickUpgrade(index);
      }
      return;
    }
    if (screen === SCREEN_OVER || screen === SCREEN_VICTORY) {
      if (actions & (ACTION_RESTART | ACTION_CONFIRM)) startGame();
    }
  }

  function step() {
    const move = input.move();
    const aim = input.aim();
    const logical = renderer.toLogical(aim.x, aim.y);
    const ctrl = {
      mx: move.x,
      my: move.y,
      aimX: aim.seen ? logical.x : world.state.player.x,
      aimY: aim.seen ? logical.y : world.state.player.y - 100,
      firing: input.firing(),
      dash: dashQueued,
    };
    dashQueued = false;
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { mx: 0, my: 0, aimX: 640, aimY: 0, firing: false, dash: false }, true);
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const events = world.step(STEP, ctrl, false);
    playEvents(events);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    // The dash press is edge-triggered: take it here, once per frame, before stepping.
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
      if (screen === SCREEN_UPGRADE) {
        const aim = input.aim();
        hover = aim.seen ? upgradeCardAt(aim.x, aim.y) : -1;
        world.step(STEP, { mx: 0, my: 0, aimX: 640, aimY: 0, firing: false, dash: false }, false);
      }
    }
    renderer.draw(world.state, screen, best, { hover, muted: audio.isMuted() });
  }

  // Leaving the tab pauses a running game rather than letting shades close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });
  // The first gesture unlocks sound.
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
  window.addEventListener('keydown', () => audio.unlock(), { once: true });

  world.reset('demo');
  announce('Emberfall. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else if (selftest) runSelfTest();
else runGame();
