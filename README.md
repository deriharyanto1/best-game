[![make.fun bounty](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01)
[![rank](https://make.fun/badge/best-game-01/deriharyanto1/best-game/rank.svg)](https://make.fun/bounty/best-game-01)
[![reward](https://make.fun/badge/best-game-01/deriharyanto1/best-game/reward.svg)](https://make.fun/bounty/best-game-01)

# Emberfall — Warden of the Last Light

A complete, original top-down arena shooter in plain canvas and vanilla JavaScript — no
library, no assets, no network. You are the Warden of the last ember, a lantern-keeper in a
dark hollow. Ten waves of shades come for the light. Hold it.

Entry for the [make.fun bounty "Make the best game"](https://make.fun/bounty/best-game-01)
(best-game-01).

## How it plays

- **Ten waves, one light.** Each wave spawns drifters, spitters, brutes, splitters and
  dashers from the dark edges of the arena. Clear a wave and the tenth brings victory.
- **Blessings between waves.** After every cleared wave you choose one of three blessings:
  harder embers, faster fire, twin flames, piercing light, swift boots, kindled hearts,
  an ember magnet, a quicker dash, or a lantern ward that blocks a hit each wave.
- **A real arsenal of feel.** Ember bolts with spread and pierce, a dash with invulnerability
  frames, pickups (hearts, wards, score gems, spread shot), a kill combo that multiplies
  your score, particles, screen shake, hit-stop and floating score text.
- **Sound, all synthesised.** Every effect and the quiet A-minor generative music loop are
  made live with WebAudio — no audio files.
- **HUD and records.** Hearts, wave and shades remaining, score, best score, combo, dash
  charge and your blessings, with the best score kept in localStorage.

## Controls

- **WASD / arrow keys** — move
- **Mouse** — aim
- **Hold left click / Space** — shoot ember bolts
- **Shift** — dash (brief invulnerability)
- **P / Esc** — pause
- **M** — mute
- **1 / 2 / 3 or click** — choose a blessing
- **R** — restart after game over or victory

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

Or open `game/index.html` through any static file server. The game runs entirely offline
from its own files.

## Layout

- `game/index.html` — the page and canvas
- `game/src/config.js` — tuning, palette, waves and blessings
- `game/src/random.js` — seeded random (repeatable games and screenshots)
- `game/src/input.js` — keyboard and mouse
- `game/src/audio.js` — synthesised effects and generative music
- `game/src/world.js` — rules: the Warden, the shades, waves, score, combo
- `game/src/render.js` — all drawing: arena, shades, HUD and screens
- `game/src/shots.js` — deterministic screenshot scenes (?shot=title|play|upgrade|victory)
- `game/src/main.js` — boot, fixed-step loop, screens, self-test
- `main.ts` — the entry program: copies game/ and screenshots/ to /output and writes dossier.json
- `shots.json` — the four screenshot scenes
- `screenshots/` — 1-title, 2-play, 3-upgrade, 4-victory (real renders of this game's code)
