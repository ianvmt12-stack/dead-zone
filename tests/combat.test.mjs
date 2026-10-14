import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { createArena } from '../src/world/arena.js';
import { Player } from '../src/entities/player.js';
import { ZombieManager } from '../src/entities/zombieManager.js';
import { Combat } from '../src/systems/combat.js';
import { Arsenal } from '../src/systems/arsenal.js';

/**
 * Monta una escena de combate completa sin navegador ni DOM.
 * `zombies.spawn(round, posicion)` permite fijar al objetivo a una distancia
 * y orientacion concretas, que es lo que hace falta para comprobar el raycast.
 */
function arenaDeCombate() {
  const scene = new THREE.Scene();
  const arena = createArena(scene, { shadows: false });
  const camera = new THREE.PerspectiveCamera(76, 1.6, 0.06, 260);
  const player = new Player(camera, arena);
  const zombies = new ZombieManager(scene, arena, { shadows: false });
  const arsenal = new Arsenal();

  const noop = () => {};
  const effects = { blood: noop, impact: noop, gib: noop, damageNumber: noop, muzzleFlash: noop };
  const weaponModel = { addRecoil: noop, setReloadProgress: noop, kickFlash: noop, setWeapon: noop };

  const combat = new Combat({ player, zombies, arsenal, weaponModel, effects, audio: null });
  const kills = [];
  combat.onKill = (z) => kills.push(z);

  /** Coloca al jugador en el origen mirando hacia -Z. */
  function apuntar(yaw = 0, pitch = 0) {
    player.position.set(0, 1.7, 0);
    player.yaw = yaw;
    player.pitch = pitch;
    player.syncCamera(0.016, 0, false);
    camera.updateMatrixWorld(true);
    const origin = new THREE.Vector3();
    const dir = new THREE.Vector3();
    player.aimOrigin(origin);
    player.aimDirection(dir);
    return { origin, dir };
  }

  /** Apunta a una altura concreta del objetivo (1.7 = altura de los ojos). */
  function apuntarA(altura, distancia = 6, yaw = 0) {
    return apuntar(yaw, Math.atan2(altura - 1.7, distancia));
  }

  /** Dispara ignorando la cadencia, para tests de daño. */
  function disparoLibre() {
    arsenal.magazine.set(arsenal.currentId, 12);
    combat.arsenal._cooldown = 0;
    combat._fire();
  }

  // Deja la cámara en un estado conocido: jugador en el origen, mirando al
  // pecho de un zombie a 6 m (asi el disparo no cuenta como tiro a la cabeza).
  apuntarA(1.0);

  return { scene, arena, camera, player, zombies, arsenal, combat, kills, apuntar, apuntarA, disparoLibre };
}

test('un disparo alcanza a un zombie de frente y le quita vida', () => {
  const { zombies, combat, apuntar } = arenaDeCombate();
  const z = zombies.spawn(1, new THREE.Vector3(0, 0, -6));
  const hpAntes = z.hp;

  const { origin, dir } = apuntar(0, 0);
  const hit = zombies.raycast(origin, dir, 120);

  assert.ok(hit, 'el raycast encuentra al zombie');
  assert.equal(hit.zombie, z, 'encuentra el correcto');
  assert.ok(hit.dist > 5 && hit.dist < 7, `impacta a distancia razonable (${hit.dist.toFixed(2)})`);

  combat._fire();
  assert.ok(z.hp < hpAntes, `recibe dano: ${hpAntes} -> ${z.hp}`);
});

test('un zombie puede matarse y desaparece de la horda', () => {
  const { zombies, combat, kills, disparoLibre } = arenaDeCombate();
  const z = zombies.spawn(1, new THREE.Vector3(0, 0, -6));

  let disparos = 0;
  while (!z.dead && disparos < 20) {
    disparoLibre();
    disparos++;
  }

  assert.equal(z.dead, true, `muere tras ${disparos} disparos`);
  assert.equal(kills.length, 1, 'se notifica la baja una sola vez');

  zombies.remove(z);
  assert.equal(zombies.aliveCount, 0, 'sale de la horda');
});

test('la escopeta acumula los perdigones en un solo impacto', () => {
  const { zombies, combat, arsenal, disparoLibre } = arenaDeCombate();
  const z = zombies.spawn(1, new THREE.Vector3(0, 0, -6));

  arsenal.addPoints(9999);
  arsenal.buyWeapon('shotgun');

  const hpAntes = z.hp;
  disparoLibre();
  const dano = hpAntes - z.hp;

  // 9 perdigones x 15 = 135 si entran todos; con dispersion, algo menos.
  assert.ok(dano > 80, `los perdigones se acumulan en un unico impacto (${dano.toFixed(0)} de dano)`);
});

test('disparar al aire no dana a nadie', () => {
  const { zombies, disparoLibre } = arenaDeCombate();
  const z = zombies.spawn(1, new THREE.Vector3(20, 0, -20)); // fuera de la mira
  const hpAntes = z.hp;

  disparoLibre();

  assert.equal(z.hp, hpAntes, 'no recibe dano si no esta en la linea de tiro');
});

test('una caja entre el jugador y el zombie bloquea la bala', () => {
  const { arena, zombies, disparoLibre } = arenaDeCombate();
  const z = zombies.spawn(1, new THREE.Vector3(0, 0, -12));

  arena.colliders.push({
    minX: -3, maxX: 3, minZ: -9, maxZ: -7, minY: 0, maxY: 3, isObstacle: true,
  });

  const hpAntes = z.hp;
  disparoLibre();

  assert.equal(z.hp, hpAntes, 'la caja tapa al zombie y no llega dano');
});

test('la cabeza y los brazos siguen pegados al cuerpo al girar', () => {
  const { zombies } = arenaDeCombate();
  const z = zombies.spawn(1, new THREE.Vector3(0, 0, -6));

  // El zombie se desplaza hacia +X (yaw ~ PI/2) en vez de hacia -Z.
  z.vel.set(4, 0, 0);
  z.phase = 1.1;
  zombies.update(0.016, { position: new THREE.Vector3(0, 1.7, 0) });

  const { legs, body, head, armL } = zombies.meshes;
  assert.equal(body.count, 1);

  const m = new THREE.Matrix4();
  const v = new THREE.Vector3();
  const pos = (mesh) => v.setFromMatrixPosition(mesh.getMatrixAt(0, m.clone())).clone();

  const legsPos = pos(legs);
  const bodyPos = pos(body);
  const headPos = pos(head);
  const armPos = pos(armL);

  // Pila vertical continua: cada pieza arranca donde termina la anterior.
  // Si el torso flotara por encima de las piernas, se verian sueltas.
  const cintura = bodyPos.y - legsPos.y;
  assert.ok(
    Math.abs(cintura - 0.88) < 0.12,
    `el torso apoya sobre las piernas (delta ${cintura.toFixed(2)}, esperado ~0.88)`
  );

  const cuello = headPos.y - bodyPos.y;
  assert.ok(
    Math.abs(cuello - 0.7) < 0.12,
    `la cabeza corona el torso (delta ${cuello.toFixed(2)}, esperado ~0.70)`
  );

  // Y al girar, nada se sale lateralmente del cuerpo.
  const dHead = Math.hypot(headPos.x - bodyPos.x, headPos.z - bodyPos.z);
  const dArm = Math.hypot(armPos.x - bodyPos.x, armPos.z - bodyPos.z);
  assert.ok(dHead < 0.25, `la cabeza queda sobre el torso (desvio ${dHead.toFixed(2)})`);
  assert.ok(dArm < 0.6, `el hombro queda junto al torso (desvio ${dArm.toFixed(2)})`);
});

test('la cabeza hace x2,1 de dano que el torso', () => {
  const { zombies, disparoLibre, apuntarA } = arenaDeCombate();

  // Un objetivo cada vez: si coexistieran superpuestos, el raycast cogeria
  // siempre el primero y la comparacion no significaria nada.
  const torso = zombies.spawn(1, new THREE.Vector3(0, 0, -6));
  const miraTorso = apuntarA(1.0);
  const hitTorso = zombies.raycast(miraTorso.origin, miraTorso.dir, 120);
  assert.equal(hitTorso.zombie, torso, 'el torso recibe el impacto');
  assert.equal(hitTorso.head, false, 'el torso no cuenta como cabeza');

  const hpTorso = torso.hp;
  disparoLibre();
  const dTorso = hpTorso - torso.hp;

  zombies.remove(torso);

  const craneo = zombies.spawn(1, new THREE.Vector3(0, 0, -6));
  const miraCabeza = apuntarA(1.75);
  const hitCabeza = zombies.raycast(miraCabeza.origin, miraCabeza.dir, 120);
  assert.equal(hitCabeza.zombie, craneo, 'la cabeza recibe el impacto');
  assert.equal(hitCabeza.head, true, 'se detecta como impacto en la cabeza');

  const hpCabeza = craneo.hp;
  disparoLibre();
  const dCabeza = hpCabeza - craneo.hp;

  assert.ok(Math.abs(dTorso - 26) < 0.01, `el torso recibe el dano base (${dTorso.toFixed(1)})`);
  assert.ok(
    Math.abs(dCabeza - 26 * 2.1) < 0.01,
    `la cabeza recibe x2,1 (${dCabeza.toFixed(1)} frente a ${(26 * 2.1).toFixed(1)} esperado)`,
  );
});
