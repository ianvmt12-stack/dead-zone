import test from 'node:test';
import assert from 'node:assert/strict';

import { Arsenal } from '../src/systems/arsenal.js';
import { Director } from '../src/systems/director.js';
import { WEAPONS, MAX_WEAPON_LEVEL, ROUND, SHOP_ITEMS } from '../src/config.js';

// ─────────��────────────── Arsenal ───────────────────────────────

test('empieza con la pistola, 12 balas y sin puntos', () => {
  const a = new Arsenal();
  assert.equal(a.currentId, 'pistol');
  assert.equal(a.currentMagazine, 12);
  assert.equal(a.points, 0);
  assert.equal(a.owns('pistol'), true);
  assert.equal(a.owns('shotgun'), false);
});

test('las mejoras suben daño, cadencia y cargador hasta el nivel 3', () => {
  const a = new Arsenal();
  const l0 = a.statsFor('pistol', 0);
  const l1 = a.statsFor('pistol', 1);
  const l2 = a.statsFor('pistol', 2);
  const l3 = a.statsFor('pistol', 3);

  // Cada nivel mejora las tres estadísticas.
  assert.ok(l1.damage > l0.damage, 'daño sube');
  assert.ok(l1.fireRate > l0.fireRate, 'cadencia sube');
  assert.ok(l1.magazine > l0.magazine, 'cargador sube');

  assert.ok(l2.damage > l1.damage, 'daño sigue subiendo en Nv.2');
  assert.ok(l2.fireRate > l1.fireRate, 'cadencia sigue subiendo en Nv.2');
  assert.ok(l3.damage > l2.damage, 'daño sigue subiendo en Nv.3');
  assert.ok(l3.fireRate > l2.fireRate, 'cadencia sigue subiendo en Nv.3');
  assert.ok(l3.magazine > l2.magazine, 'cargador sigue subiendo en Nv.3');

  // El intervalo es el inverso de la cadencia.
  assert.ok(l1.interval < l0.interval);
});

test('no se puede superar el nivel 3', () => {
  const a = new Arsenal();
  a.addPoints(99_999);
  const cost = WEAPONS[0].upgradeCosts;
  const totalCost = cost[0] + cost[1] + cost[2];

  for (let i = 0; i < MAX_WEAPON_LEVEL; i++) {
    assert.equal(a.buyUpgrade('pistol').ok, true, `el nivel ${i + 1} sí se compra`);
  }
  assert.equal(a.levelOf('pistol'), MAX_WEAPON_LEVEL);
  assert.equal(a.points, 99_999 - totalCost, 'solo se gastan los 3 niveles');

  // A partir de ahí, nada más.
  for (let i = 0; i < 3; i++) {
    const res = a.buyUpgrade('pistol');
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'maxed');
  }
  assert.equal(a.upgradeCost('pistol'), null, 'ya no hay precio que mostrar');
});

test('mejorar un arma no comprada no es posible', () => {
  const a = new Arsenal();
  a.addPoints(99_999);
  const res = a.buyUpgrade('minigun');
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'unknown');
  assert.equal(a.points, 99_999);
});

test('comprar un arma la equipa y la desbloquea', () => {
  const a = new Arsenal();
  a.addPoints(5000);
  const res = a.buyWeapon('shotgun');
  assert.equal(res.ok, true);
  assert.equal(a.currentId, 'shotgun');
  assert.equal(a.owns('shotgun'), true);
  // No se puede comprar dos veces.
  assert.equal(a.buyWeapon('shotgun').reason, 'owned');
});

test('sin puntos suficientes no se compra', () => {
  const a = new Arsenal();
  a.addPoints(10);
  const res = a.buyWeapon('minigun');
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'points');
  assert.equal(a.points, 10, 'no se descuenta nada');
});

test('mejorar un arma norangesa el cargador al instante', () => {
  const a = new Arsenal();
  a.addPoints(5000);
  a.buyUpgrade('pistol');
  assert.equal(a.currentMagazine, a.currentStats.magazine);
  assert.ok(a.currentStats.magazine > 12);
});

test('munición: gastar, recargar y quedarse sin balas', () => {
  const a = new Arsenal();
  for (let i = 0; i < 12; i++) a.consumeRound();
  assert.equal(a.currentMagazine, 0);
  assert.equal(a.canFire(), false);
  assert.ok(a.canReload(), 'puede recargar si tiene reserva');

  const before = a.currentReserve;
  a.startReload();
  assert.equal(a.isReloading, true);

  // Avanza el tiempo más allá del tiempo de recarga.
  let done = false;
  for (let i = 0; i < 200 && !done; i++) done = a.update(1 / 60);

  assert.equal(done, true, 'la recarga termina');
  assert.equal(a.currentMagazine, a.currentStats.magazine);
  assert.equal(a.currentReserve, before - a.currentStats.magazine);
});

test('no se recarga sin munición de reserva', () => {
  const a = new Arsenal();
  a.reserve.set('pistol', 0);
  a.magazine.set('pistol', 0);
  assert.equal(a.canReload(), false);
  assert.equal(a.startReload(), false);
});

test('la cadencia limita el fuego', () => {
  const a = new Arsenal();
  assert.equal(a.canFire(), true);
  a.notifyFired();
  assert.equal(a.canFire(), false, 'no puede disparar durante el intervalo');
  a.update(a.currentStats.interval + 0.001);
  assert.equal(a.canFire(), true);
});

test('equipar por ranura 1-5', () => {
  const a = new Arsenal();
  a.addPoints(99_999);
  a.buyWeapon('rifle');
  assert.equal(a.currentId, 'rifle');
  assert.equal(a.equipSlot(1), true);
  assert.equal(a.currentId, 'pistol');
  // Una ranura sin arma comprada no cambia nada.
  assert.equal(a.equipSlot(5), false);
  assert.equal(a.currentId, 'pistol');
});

test('las mejoras de velocidad y vida llegan al jugador', () => {
  const a = new Arsenal();
  const player = { addSpeedBonus(v) { this.speed = (this.speed || 0) + v; }, addMaxHealth(v) { this.maxHp = (this.maxHp || 100) + v; }, heal(v) { this.hp = (this.hp || 0) + v; } };
  a.addPoints(99_999);

  const speed = a.buyItem('adrenaline', player);
  assert.equal(speed.ok, true);
  assert.ok(player.speed > 0, 'la adrenalina aumenta la velocidad');

  const armor = a.buyItem('armor', player);
  assert.equal(armor.ok, true);
  assert.ok(player.maxHp > 100, 'las placas suben la vida máxima');

  const kit = a.buyItem('medkit', player);
  assert.equal(kit.ok, true);
  assert.equal(kit.effect.heal, 60);
});

test('los suministros con tope no se compran de más', () => {
  const a = new Arsenal();
  const player = { addSpeedBonus() {}, addMaxHealth() {}, heal() {} };
  a.addPoints(999_999);
  const max = SHOP_ITEMS.find((i) => i.id === 'armor').max;

  for (let i = 0; i < max; i++) assert.equal(a.buyItem('armor', player).ok, true);
  assert.equal(a.buyItem('armor', player).reason, 'maxed');
});

test('fullResupply deja todo cargado (intervalo entre oleadas)', () => {
  const a = new Arsenal();
  a.addPoints(99_999);
  a.buyWeapon('rifle');
  a.magazine.set('pistol', 0);
  a.reserve.set('pistol', 0);
  a.magazine.set('rifle', 0);
  a.reserve.set('rifle', 0);

  a.fullResupply();

  // Solo se recarga lo que posees.
  for (const w of WEAPONS) {
    if (!a.owns(w.id)) continue;
    assert.equal(a.magazine.get(w.id), a.statsFor(w.id).magazine, `${w.name}: cargador lleno`);
    assert.ok(a.reserve.get(w.id) > 0, `${w.name}: reserva repuesta`);
  }

  // Las armas no compradas se quedan intactas.
  assert.equal(a.magazine.get('shotgun'), 0, 'la escopeta sigue sin tocarse');
  assert.equal(a.reserve.get('minigun'), 0, 'la minigun sigue sin tocarse');
});

// ───────────────────────────── Director ─────────────────────────────

test('el intervalo entre oleadas dura 25 segundos', () => {
  assert.equal(ROUND.intermission, 25);
  assert.equal(Director.intermissionTime, 25);
});

test('la oleada 1 tiene 6 enemigos y crece con la dificultad', () => {
  const r1 = Director.countForRound(1);
  const r5 = Director.countForRound(5);
  const r20 = Director.countForRound(20);
  assert.equal(r1, 6);
  assert.ok(r5 > r1, 'más enemigos en la oleada 5');
  assert.ok(r20 > r5, 'más aún en la 20');
  assert.ok(r20 <= ROUND.countCap, 'pero con techo');
});

test('el ciclo es oleada -> intervalo de 25 s -> oleada', () => {
  const zombies = { aliveCount: 0, spawn() {} };
  const audio = new Proxy({}, { get: () => () => {} });
  const d = new Director({ zombies, audio, onEvent: () => {} });

  d.startRound();
  assert.equal(d.round, 1);
  assert.equal(d.state, 'round');

  // Marcamos todos como aparecidos y el horda vacía => fin de oleada.
  d.spawnedThisRound = d.totalThisRound;
  d.update(0.016);
  assert.equal(d.state, 'intermission');
  assert.ok(Math.abs(d.timer - 25) < 0.1, 'empieza con 25 s');

  // 24 s después sigue en intervalo.
  d.update(24);
  assert.equal(d.state, 'intermission');
  assert.ok(d.timer > 0.9 && d.timer < 1.1);

  // Al pasar los 25 s arranca la oleada 2.
  d.update(1.1);
  assert.equal(d.state, 'round');
  assert.equal(d.round, 2);
});

test('la oleada no termina mientras queden zombies vivos', () => {
  const zombies = { aliveCount: 3, spawn() {} };
  const audio = new Proxy({}, { get: () => () => {} });
  const d = new Director({ zombies, audio, onEvent: () => {} });

  d.startRound();
  d.spawnedThisRound = d.totalThisRound;
  for (let i = 0; i < 60; i++) d.update(1 / 60);
  assert.equal(d.state, 'round', 'sigue activa porque quedan 3 en pie');
});

test('la bonificación de fin de oleada crece', () => {
  const b1 = ROUND.clearBonus + ROUND.clearBonusPerRound * 0;
  const b5 = ROUND.clearBonus + ROUND.clearBonusPerRound * 4;
  assert.ok(b5 > b1);
});

test('los enemigos aparecen gradualmente, no todos de golpe', () => {
  const spawned = [];
  const zombies = { aliveCount: 0, spawn(round) { spawned.push(round); } };
  const audio = new Proxy({}, { get: () => () => {} });
  const d = new Director({ zombies, audio, onEvent: () => {} });

  d.startRound();
  d.update(0.1);
  assert.equal(spawned.length, 0, 'no aparece nada en el primer instante');

  d.update(1.0);
  assert.ok(spawned.length > 0, 'empiezan a aparecer');
  assert.ok(spawned.length < d.totalThisRound, 'pero no todos de golpe');
});

test('el ciclo económico completo cabe en una partida razonable', () => {
  // 6 bajas de la oleada 1 con la pistola: ¿llega para comprar algo?
  const a = new Arsenal();
  for (let i = 0; i < 6; i++) a.addPoints(10); // 6 walkers x 10 pts
  a.addPoints(ROUND.clearBonus); // bonus de fin de oleada

  const cheapest = Math.min(...WEAPONS.map((w) => w.price));
  assert.ok(a.points >= cheapest, `con ${a.points} pts se puede comprar lo más barato (${cheapest})`);
});