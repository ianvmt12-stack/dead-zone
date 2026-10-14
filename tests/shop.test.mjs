/**
 * Tests de la tienda de campo: verifican el recorrido completo
 * "puntos -> comprar arma -> subir 3 niveles" contra el DOM real.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { Arsenal } from '../src/systems/arsenal.js';
import { Shop } from '../src/ui/shop.js';
import { WEAPONS, MAX_WEAPON_LEVEL } from '../src/config.js';

const HTML = `<!DOCTYPE html><body>
  <div id="toasts"></div>
  <div id="damage-numbers"></div>
  <div id="flash"></div>
  <div id="hud">
    <div id="timer-block" hidden></div>
    <span id="stat-round"></span><span id="stat-timer"></span>
    <span id="stat-remaining"></span><span id="stat-points"></span>
    <i id="health-fill"></i><b id="health-ghost"></b><span id="health-value"></span>
    <div class="health-track"></div>
    <span id="weapon-label"></span><em id="weapon-level"></em>
    <span id="ammo-mag"></span><span id="ammo-reserve"></span><span id="ammo-box"></span>
    <div id="reload-bar" hidden><i></i></div>
    <div id="reload-hint"></div>
    <div class="crosshair" id="crosshair"></div>
  </div>
  <div id="shop" class="overlay hidden">
    <div class="panel shop-panel">
      <header class="shop-head">
        <p id="shop-subtitle"></p>
        <span id="shop-points"></span>
        <b id="shop-timer"></b>
        <div class="meta-item countdown"></div>
      </header>
      <div class="shop-body">
        <section class="shop-col"><h3>Armamento</h3>
          <div id="shop-weapons" class="card-list"></div></section>
        <section class="shop-col"><h3>Mejoras</h3>
          <span id="upgrade-weapon-name"></span>
          <div id="shop-upgrades" class="card-list"></div>
          <div id="upgrade-stats" class="stat-rows"></div></section>
        <section class="shop-col"><h3>Suministros</h3>
          <div id="shop-supplies" class="card-list"></div></section>
      </div>
      <footer class="shop-foot">
        <button id="shop-close">Volver al campo</button>
      </footer>
    </div>
  </div>
</body>`;

/** Monta un entorno completo: DOM + arsenal + tienda. */
function mount() {
  const dom = new JSDOM(HTML, { pretendToBeVisual: true });
  const { document } = dom.window;
  global.document = document;
  global.requestAnimationFrame = () => 0;

  const arsenal = new Arsenal();
  const player = {
    health: 50,
    maxHealth: 100,
    speedBonus: 0,
    heal(v) { this.health = Math.min(this.maxHealth, this.health + v); },
    addSpeedBonus(v) { this.speedBonus += v; },
    addMaxHealth(v) { this.maxHealth += v; },
  };

  const audio = new Proxy({}, { get: () => () => {} });
  const effects = { screenFlash() {} };
  const weaponModel = { setWeapon(id) { this.current = id; } };

  const shop = new Shop({ arsenal, player, audio, effects, weaponModel });

  const weaponButtons = [...document.querySelectorAll('#shop-weapons button')];
  const upgradeButtons = [...document.querySelectorAll('#shop-upgrades button')];
  const itemButtons = [...document.querySelectorAll('#shop-supplies button')];

  return { document, arsenal, player, shop, weaponButtons, upgradeButtons, itemButtons, weaponModel };
}

test('la tienda se abre, lista 5 armas y 3 niveles de mejora', () => {
  const { document, shop, weaponButtons, upgradeButtons } = mount();
  shop.show('Oleada 1 superada');

  assert.equal(weaponButtons.length, WEAPONS.length, 'una tarjeta por arma');
  assert.equal(upgradeButtons.length, MAX_WEAPON_LEVEL, 'una tarjeta por nivel');

  assert.equal(document.getElementById('shop').classList.contains('hidden'), false);
  assert.equal(document.getElementById('shop-subtitle').textContent, 'Oleada 1 superada');
});

test('sin puntos, los botones muestran el precio pero avisan al hacer clic', () => {
  const { shop, arsenal, weaponButtons } = mount();
  const toasts = [];
  shop.onToast = (text) => toasts.push(text);
  shop.show();

  const shotgun = weaponButtons[1];
  assert.match(shotgun.textContent, /pts$/);
  assert.match(shotgun.className, /no-points/);

  shotgun.click();
  assert.equal(arsenal.points, 0, 'no se cobra nada');
  assert.equal(arsenal.owns('shotgun'), false);
  assert.match(toasts.at(-1), /insuficientes/i);
});

test('comprar un arma con un clic: descuenta puntos y la equipa', () => {
  const { shop, arsenal, weaponButtons, weaponModel } = mount();
  arsenal.addPoints(600);
  shop.show();

  const shotgun = weaponButtons[1];
  assert.equal(shotgun.getAttribute('aria-label'), 'Comprar Escopeta');
  assert.equal(shotgun.disabled, false);

  shotgun.click();

  assert.equal(arsenal.points, 600 - WEAPONS[1].price);
  assert.equal(arsenal.owns('shotgun'), true);
  assert.equal(arsenal.currentId, 'shotgun');
  assert.equal(weaponModel.current, 'shotgun', 'el modelo 3D cambia de arma');

  // La tarjeta pasa a "Equipada".
  assert.match(shotgun.textContent, /Equipada/);
  assert.equal(shotgun.disabled, true);
});

test('no se puede comprar dos veces la misma arma', () => {
  const { shop, arsenal, weaponButtons } = mount();
  arsenal.addPoints(5000);
  shop.show();

  weaponButtons[1].click();
  const pointsAfterFirst = arsenal.points;

  weaponButtons[1].click(); // segundo clic
  assert.equal(arsenal.points, pointsAfterFirst, 'no se cobra dos veces');
});

test('el flujo completo: comprar, mejorar 3 niveles y verlos bloqueados', () => {
  const { shop, arsenal, upgradeButtons, weaponModel } = mount();
  arsenal.addPoints(99_999);
  shop.show();

  const level0 = { ...arsenal.statsFor('pistol', 0) };
  assert.equal(arsenal.levelOf('pistol'), 0);

  // Niveles 2 y 3 bloqueados al principio.
  assert.match(upgradeButtons[1].textContent, /Bloqueado/);
  assert.match(upgradeButtons[2].textContent, /Bloqueado/);
  assert.equal(upgradeButtons[1].disabled, true);

  // Nivel 1.
  assert.equal(upgradeButtons[0].disabled, false);
  upgradeButtons[0].click();
  assert.equal(arsenal.levelOf('pistol'), 1);
  assert.match(upgradeButtons[0].textContent, /Comprado/);

  // Al subir a Nv.1 se desbloquea el 2.
  assert.equal(upgradeButtons[1].disabled, false);
  upgradeButtons[1].click();
  assert.equal(arsenal.levelOf('pistol'), 2);

  // Y luego el 3.
  upgradeButtons[2].click();
  assert.equal(arsenal.levelOf('pistol'), MAX_WEAPON_LEVEL);

  // Ya no hay más.
  for (const btn of upgradeButtons) {
    assert.match(btn.textContent, /Comprado|Máximo/);
    assert.equal(btn.disabled, true);
  }

  // Y las tres estadísticas han subido de verdad.
  const level3 = { ...arsenal.statsFor('pistol', 3) };
  assert.ok(level3.damage > level0.damage, 'más daño');
  assert.ok(level3.fireRate > level0.fireRate, 'más cadencia');
  assert.ok(level3.magazine > level0.magazine, 'cargador más grande');
  assert.ok(level3.interval < level0.interval);
});

test('los niveles se cobran a precios crecientes', () => {
  const { shop, arsenal, upgradeButtons } = mount();
  arsenal.addPoints(99_999);
  shop.show();

  const spent = [];
  for (let i = 0; i < MAX_WEAPON_LEVEL; i++) {
    const before = arsenal.points;
    upgradeButtons[i].click();
    spent.push(before - arsenal.points);
  }

  assert.equal(spent.length, 3);
  assert.ok(spent[1] > spent[0], 'el Nv.2 cuesta más que el Nv.1');
  assert.ok(spent[2] > spent[1], 'el Nv.3 cuesta más que el Nv.2');
  assert.deepEqual(spent, WEAPONS[0].upgradeCosts);
});

test('mejorar un arma cambia el panel de estadísticas', () => {
  const { shop, arsenal, upgradeButtons, document } = mount();
  arsenal.addPoints(99_999);
  shop.show();

  const statsHtml = () => document.getElementById('upgrade-stats').innerHTML;
  assert.match(statsHtml(), /Daño/);
  assert.match(statsHtml(), /Cadencia/);
  assert.match(statsHtml(), /Cargador/);

  // Con un nivel disponible se muestra la comparación "actual → siguiente".
  assert.match(statsHtml(), /→/, 'hay comparación con el siguiente nivel');

  const before = statsHtml();
  upgradeButtons[0].click();
  const after = statsHtml();
  assert.notEqual(before, after, 'la comparación se actualiza al comprar');

  // Al llegar al máximo desaparece la flecha: ya no hay "siguiente".
  upgradeButtons[1].click();
  upgradeButtons[2].click();
  assert.equal(arsenal.levelOf('pistol'), MAX_WEAPON_LEVEL);
  assert.doesNotMatch(statsHtml(), /→/, 'ya no hay nivel siguiente que comparar');
});

test('mejorar un arma no toca las demás', () => {
  const { shop, arsenal, weaponButtons, upgradeButtons, document } = mount();
  arsenal.addPoints(99_999);
  shop.show();

  // Comprar cambia el arma equipada.
  weaponButtons[1].click();
  assert.match(document.getElementById('upgrade-weapon-name').textContent, /Escopeta/);

  // Mejorar la escopeta no toca la pistola.
  upgradeButtons[0].click();
  upgradeButtons[1].click();
  assert.equal(arsenal.levelOf('shotgun'), 2);
  assert.equal(arsenal.levelOf('pistol'), 0, 'la pistola sigue en Nv.0');
});

test('el encabezado muestra puntos y cuenta atrás', () => {
  const { shop, arsenal } = mount();
  arsenal.addPoints(12345);
  shop.show();
  // Ojo: en es-ES los números de 4 cifras no llevan separador de millares.
  assert.match(document.getElementById('shop-points').textContent, /12\.345/);

  shop.tickTimer(25);
  assert.equal(document.getElementById('shop-timer').textContent, '25');
  shop.tickTimer(3);
  assert.equal(document.getElementById('shop-timer').textContent, '3');
  assert.equal(
    document.querySelector('.meta-item.countdown').classList.contains('urgent'),
    true,
    'los últimos segundos se marcan en rojo',
  );
});

test('los suministros curan y son de un solo uso por partida', () => {
  const { shop, arsenal, player, itemButtons } = mount();
  arsenal.addPoints(9999);
  shop.show();

  player.health = 10;
  itemButtons[2].click(); // Botiquín
  assert.equal(player.health, 70, 'cura 60 PV');
});

test('cerrar la tienda llama al callback y la esconde', () => {
  const { shop, document } = mount();
  let closed = 0;
  shop.onClose = () => closed++;

  shop.show();
  assert.equal(shop.visible, true);

  document.getElementById('shop-close').click();
  assert.equal(shop.visible, false);
  assert.equal(document.getElementById('shop').classList.contains('hidden'), true);
  assert.equal(closed, 1);
});

test('un clic que no se puede pagar avisa y no cobra', () => {
  const { shop, arsenal, upgradeButtons } = mount();
  const toasts = [];
  shop.onToast = (text) => toasts.push(text);

  arsenal.addPoints(50); // insufficientes para el Nv.1 (200)
  shop.show();
  upgradeButtons[0].click();

  assert.equal(arsenal.points, 50, 'no se descuenta nada');
  assert.equal(arsenal.levelOf('pistol'), 0);
  assert.equal(toasts.length, 1);
  assert.match(toasts[0], /insuficientes/i);
});