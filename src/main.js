import * as THREE from 'three';
import { CAMERA, ROUND } from './config.js';
import { formatTime, clamp } from './core/math.js';

import { Input } from './core/input.js';
import { AudioEngine } from './core/audio.js';
import { TouchControls } from './core/touch.js';

import { createArena } from './world/arena.js';
import { Player } from './entities/player.js';
import { ZombieManager } from './entities/zombieManager.js';
import { WeaponModel } from './entities/weaponModel.js';
import { Effects } from './entities/effects.js';

import { Arsenal } from './systems/arsenal.js';
import { Combat } from './systems/combat.js';
import { Director } from './systems/director.js';

import { Hud } from './ui/hud.js';
import { Shop } from './ui/shop.js';
import { Screens } from './ui/screens.js';

// ────────────────────────── Arranque ──────────────────────────

const canvas = document.getElementById('scene');

/** Comprueba soporte de WebGL antes de tocar nada. */
function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

if (!hasWebGL()) {
  document.body.innerHTML = `
    <div style="display:grid;place-items:center;height:100%;padding:24px;text-align:center;font-family:sans-serif;color:#d8dee6;background:#07090c">
      <div>
        <h1 style="color:#b3202a">WebGL no disponible</h1>
        <p style="color:#7d8794;max-width:420px;line-height:1.6">
          Este juego necesita WebGL. Activa la aceleración por hardware en tu
          navegador o prueba con otro dispositivo.
        </p>
      </div>
    </div>`;
  throw new Error('WebGL no soportado');
}

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.setClearColor(0x0a0e13);
renderer.autoClear = false;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  CAMERA.fov,
  window.innerWidth / window.innerHeight,
  CAMERA.near,
  CAMERA.far,
);

// ────────────────────────── Sistemas ──────────────────────────

const input = new Input(canvas);
const audio = new AudioEngine();
const hud = new Hud();

/** En móvil no hay Pointer Lock: los gestos to supplantan al ratón. */
const touch = new TouchControls(document.getElementById('touch-layer'), {
  onFire: () => {
    input._virtualFirePressed = true;
  },
  onReload: () => {
    input._virtualReload = true;
  },
  onJump: () => {
    input._virtualJump = true;
  },
  onShop: () => {
    input._virtualShop = true;
  },
});
input.attachTouch(touch);

let shadowsEnabled = true;
const arena = createArena(scene, { shadows: shadowsEnabled });
const player = new Player(camera, arena);
const zombies = new ZombieManager(scene, arena, { shadows: shadowsEnabled });
const weaponModel = new WeaponModel();
const effects = new Effects(scene, camera, {
  numberLayer: document.getElementById('damage-numbers'),
});
const arsenal = new Arsenal();

const combat = new Combat({
  player, zombies, arsenal, weaponModel, effects, audio,
});

const director = new Director({
  zombies,
  audio,
  onEvent: (type, data) => handleDirectorEvent(type, data),
});

const shop = new Shop({
  arsenal,
  player,
  audio,
  effects,
  weaponModel,
  onOpen: () => hud.hide(),
  onClose: () => {
    // Cerrar la tienda devuelve el control y el HUD al jugador.
    hud.show();
    if (game.state === 'intermission') input.requestLock();
  },
  onToast: (text, kind) => hud.toast(text, kind),
});

const screens = new Screens({
  onStart: () => startGame(),
  onResume: () => resumeFromPause(),
  onQuit: () => quitToMenu(),
  onRetry: () => startGame(),
  onQualityChange: (value) => setQuality(value === 'high'),
  onSensChange: (v) => {
    input.sensitivity = 0.0024 * (v / 14);
  },
  onVolumeChange: (v) => audio.setVolume(v),
});

// ────────────────────────── Estado de juego ──────────────────────────

const game = {
  state: 'menu', // menu | playing | intermission | paused | gameover
  time: 0,
  godMode: false,
};

/** Reloj propio: evita depender de THREE.Clock (deprecado en r186). */
const clock = {
  last: performance.now(),
  delta() {
    const now = performance.now();
    const dt = (now - this.last) / 1000;
    this.last = now;
    return Math.min(dt, 0.05); // limita el salto tras cambiar de pestaña
  },
};

// ────────────────────────── Transiciones ──────────────────────────

function startGame() {
  audio.init();
  audio.resume();

  player.reset();
  zombies.reset();
  arsenal.reset();
  director.reset();
  combat.reset();
  effects.reset();
  hud.reset();
  touch.reset();

  weaponModel.setWeapon(arsenal.currentId);

  game.state = 'playing';
  game.time = 0;
  game.godMode = new URLSearchParams(location.search).has('god');

  screens.hideAll();
  hud.show();
  shop.hide();

  director.startRound();

  input.requestLock();
  hud.toast('Oleada 1 · <b>Sobrevive</b>', 'warn');

  // Ganchos de desarrollo: ?shop=1 abre la tienda con puntos de sobra
  // y ?god=1 desactiva el daño. No afectan a la partida normal.
  const params = new URLSearchParams(location.search);
  if (params.has('shop')) {
    arsenal.addPoints(5000);
    director.state = 'intermission';
    director.timer = ROUND.intermission;
    toIntermission();
  }
}

function toIntermission() {
  game.state = 'intermission';
  // Recarga y munición gratis entre oleadas, tal como pide el diseño.
  arsenal.fullResupply();
  player.heal(player.maxHealth * 0.35);

  shop.show(`Oleada ${director.round} superada · ${ROUND.intermission}s para prepararte`);
  input.exitLock();
  hud.toast(`+<b>${ROUND.clearBonus + ROUND.clearBonusPerRound * (director.round - 1)}</b> pts por bonificación`, 'warn');
}

function pause() {
  if (game.state !== 'playing') return;
  game.state = 'paused';
  input.exitLock();
  hud.hide();
  screens.showPause(buildStats());
}

function resumeFromPause() {
  if (game.state !== 'paused') return;
  screens.hidePause();
  game.state = 'playing';
  hud.show();
  audio.resume();
  input.requestLock();
}

function quitToMenu() {
  game.state = 'menu';
  shop.hide();
  hud.hide();
  input.exitLock();
  screens.showMenu();
}

function gameOver() {
  game.state = 'gameover';
  audio.death();
  input.exitLock();
  shop.hide();
  hud.hide();
  screens.showGameOver(buildStats());
}

function buildStats() {
  return {
    round: director.round,
    kills: director.totalKills,
    points: arsenal.points,
    time: formatTime(game.time),
    weapon: arsenal.current.name,
    weaponLevel: arsenal.levelOf(arsenal.currentId),
  };
}

// ────────────────────────── Eventos ──────────────────────────

function handleDirectorEvent(type, data) {
  if (type === 'roundStart') {
    hud.toast(`Oleada <b>${data.round}</b> · ${data.total} enemigos`);
  } else if (type === 'roundClear') {
    arsenal.addPoints(data.bonus);
    toIntermission();
  }
}

zombies.onPlayerHit = (damage, zombie) => {
  if (game.godMode) return;
  const died = player.takeDamage(damage);
  audio.hurt();
  effects.damageFlash(clamp(damage / 22, 0.25, 1));
  if (died) gameOver();
};

combat.onKill = (zombie) => {
  arsenal.addPoints(zombie.score);
  director.onKill();
  hud.hitMarker(true);
  zombies.remove(zombie);
};

combat.onShoot = () => {
  hud.hitMarker(false);
};

// ────────────────────────── Bucle ──────────────────────────

function updatePlaying(dt) {
  player.update(dt, input, { allowMove: true });
  director.update(dt);
  combat.update(dt, input, { enabled: true });
  zombies.update(dt, player, { allowAttacks: true });
}

function updateIntermission(dt) {
  // Zona segura: el jugador se mueve y recarga a su antojo.
  player.update(dt, input, { allowMove: true });
  combat.update(dt, input, { enabled: true });
  director.update(dt);

  if (shop.visible) {
    shop.tickTimer(director.timer);
    shop.tick();
  }

  // El intervalo terminó y el director ya lanzó la oleada nueva.
  if (director.state === 'round') {
    shop.hide();
    game.state = 'playing';
    input.requestLock();
  }
}

function update(dt) {
  handleKeys();
  effects.update(dt);
  arena.update(dt);

  switch (game.state) {
    case 'playing':
      game.time += dt;
      updatePlaying(dt);
      break;
    case 'intermission':
      updateIntermission(dt);
      break;
    default:
      break;
  }

  if (game.state === 'playing' || game.state === 'intermission') {
    hud.update(dt, {
      player,
      arsenal,
      director,
      zombies,
      crosshairSpread: combat.currentSpread(),
    });
    weaponModel.update(
      dt,
      Math.hypot(player.velocity.x, player.velocity.z) / 8.6,
      input.isDown('ShiftLeft'),
    );
  }
}

function frame() {
  requestAnimationFrame(frame);

  const dt = clock.delta();
  update(dt);

  render();

  input.endFrame();
}

function render() {
  // `autoClear` desactivado: dibujamos el mundo y luego el arma en una
  // escena aparte. Con autoClear activo, el segundo render borraría el color
  // y el mundo entero saldría negro detrás del arma.
  renderer.clear(true, true, true);
  renderer.render(scene, camera);

  if (game.state !== 'menu') {
    // El arma va en su propia escena: se limpia solo la profundidad para que
    // nunca atraviese las paredes, y el resto de la escena se ve igual.
    renderer.clearDepth();
    renderer.render(weaponModel.scene, weaponModel.camera);
  }
}

// ────────────────────────── Entrada global ──────────────────────────

function handleKeys() {
  if (!input.wasPressed('KeyB')) return;
  toggleShop();
}

function toggleShop() {
  if (game.state !== 'intermission') return;
  if (shop.visible) {
    shop.hide();
    input.requestLock();
  } else {
    shop.show(`Oleada ${director.round + 1} en camino · ${Math.ceil(director.timer)}s`);
    input.exitLock();
  }
}

input.onLockChange = (locked, reason) => {
  document.body.classList.toggle('unlocked', !locked);

  // En táctil no hay Pointer Lock: perder el "bloqueo" no significa pausa.
  if (touch.enabled) return;

  // 'error' = el navegador rechazó capturar el ratón. NO es una pausa del
  // jugador, así que seguimos jugando con el ratón libre.
  if (reason === 'error') {
    if (!game._warnedFallback) {
      game._warnedFallback = true;
      hud.toast('Ratón libre: <b>mueve el cursor</b> para mirar', 'warn');
    }
    return;
  }

  // Esc libera el puntero: en combate, eso es pausa.
  if (!locked && game.state === 'playing') {
    pause();
  }

  // Clic en el canvas para recuperar el control.
  if (!locked && !shop.visible && game.state !== 'paused') {
    canvas.addEventListener('click', onCanvasClick);
  } else {
    canvas.removeEventListener('click', onCanvasClick);
  }
};

function onCanvasClick() {
  if (game.state === 'playing' || (game.state === 'intermission' && !shop.visible)) {
    audio.resume();
    input.requestLock();
  }
}

function setQuality(high) {
  shadowsEnabled = high;
  renderer.shadowMap.enabled = high;
  arena.setShadows(high);
  for (const m of Object.values(zombies.meshes)) m.castShadow = high;
}

// ────────────────────────── Ventana ──────────────────────────

function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  weaponModel.resize(w / h);
}
window.addEventListener('resize', onResize);
onResize();

// ────────────────────────── Arranque ──────────────────────────

player.reset();
screens.showMenu();
frame();