import * as THREE from 'three';
import { ZOMBIE_TYPES, ZOMBIE } from '../config.js';
import { rand, damp } from '../core/math.js';
import { rayCylinder } from '../world/collision.js';

/**
 * Gestor de zombies.
 *
 * Toda la horda se dibuja con 4 InstancedMesh (cuerpo, cabeza y dos brazos),
 * así que 90 zombies cuestan 4 draw calls en vez de 360. La IA es simple y
 * deliberadamente "bruta": persiguen en línea recta y se empujan entre ellos,
 * que es justo lo que produce la sensación de horda sin navmesh.
 */
export class ZombieManager {
  constructor(scene, arena, { shadows = true } = {}) {
    this.scene = scene;
    this.arena = arena;
    this.max = ZOMBIE.maxAlive;
    this.zombies = [];

    this._dummy = new THREE.Object3D();
    this._color = new THREE.Color();
    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();
    this._ray = { x: 0, y: 0, z: 0 };

    this._buildMeshes(shadows);

    // Estado del frame.
    this.onPlayerHit = null; // (daño, zombie) => void
    this.onKill = null; // (zombie, killerInfo) => void
  }

  _buildMeshes(shadows) {
    const geoBody = new THREE.BoxGeometry(0.62, 1.0, 0.36);
    geoBody.translate(0, 0.5, 0); // pivote en los pies
    const geoHead = new THREE.BoxGeometry(0.34, 0.34, 0.34);
    const geoArm = new THREE.BoxGeometry(0.17, 0.86, 0.17);
    geoArm.translate(0, -0.43, 0); // pivote en el hombro

    const matBody = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0.02 });
    const matHead = new THREE.MeshStandardMaterial({ roughness: 0.85 });
    const matArm = new THREE.MeshStandardMaterial({ roughness: 0.9 });

    const mk = (geo, mat) => {
      const mesh = new THREE.InstancedMesh(geo, mat, this.max);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = shadows;
      mesh.receiveShadow = shadows;
      mesh.frustumCulled = false;
      mesh.count = 0;
      // Colores por instancia: permite tipos distintos y destello rojo al recibir daño.
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.max * 3), 3);
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(mesh);
      return mesh;
    };

    this.meshes = {
      body: mk(geoBody, matBody),
      head: mk(geoHead, matHead),
      armL: mk(geoArm, matArm),
      armR: mk(geoArm, matArm),
    };

    // Escala de referencia (1 unidad = cuerpo humano).
    this.group = new THREE.Group();
    this.scene.add(this.group);
    for (const m of Object.values(this.meshes)) this.group.add(m);
  }

  reset() {
    this.zombies.length = 0;
    for (const m of Object.values(this.meshes)) m.count = 0;
  }

  get aliveCount() {
    return this.zombies.length;
  }

  /** Elige el tipo de zombie que toca según la oleada. */
  static rollType(round) {
    const types = Object.values(ZOMBIE_TYPES).filter((t) => round >= t.fromRound);
    if (types.length === 1) return types[0];

    // A partir de la oleada 5 se mezclan corredores y brutos ponderados.
    const weights = types.map((t) => {
      if (t.id === 'walker') return Math.max(0.2, 1 - (round - 1) * 0.04);
      if (t.id === 'runner') return Math.min(0.55, (round - 3) * 0.09);
      return Math.min(0.18, (round - 4) * 0.022);
    });
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < types.length; i++) {
      r -= weights[i];
      if (r <= 0) return types[i];
    }
    return types[0];
  }

  /** Escala de atributos para una oleada concreta. */
  static scalingFor(round) {
    const s = ZOMBIE.scaling;
    return {
      hp: 1 + Math.min(s.hpCap, (round - 1) * s.hpPerRound),
      damage: 1 + Math.min(s.damageCap, (round - 1) * s.damagePerRound),
      speed: 1 + Math.min(s.speedCap, (round - 1) * s.speedPerRound),
    };
  }

  spawn(round, position = null) {
    if (this.zombies.length >= this.max) return null;

    const type = ZombieManager.rollType(round);
    const scale = ZombieManager.scalingFor(round);

    // Punto de aparición elegido al azar en el perímetro, o el indicado.
    let x;
    let z;
    if (position) {
      x = position.x;
      z = position.z;
    } else {
      const zone = this.arena.spawnZones[
        Math.floor(Math.random() * this.arena.spawnZones.length)
      ];
      x = zone.x + rand(-2.2, 2.2);
      z = zone.z + rand(-2.2, 2.2);
    }

    const zombie = {
      type,
      id: this._nextId = (this._nextId || 0) + 1,
      pos: new THREE.Vector3(x, 0, z),
      vel: new THREE.Vector3(),
      hp: type.hp * scale.hp,
      maxHp: type.hp * scale.hp,
      speed: type.speed * scale.speed,
      damage: type.damage * scale.damage,
      radius: type.radius,
      height: type.height,
      attackRange: type.attackRange,
      attackRate: type.attackRate,
      attackCd: rand(0, type.attackRate),
      attackAnim: 0,
      knockResist: type.knockbackResist ?? 0,
      score: type.score,
      // Animación
      phase: rand(0, Math.PI * 2),
      gait: rand(0.85, 1.2),
      lean: rand(0.08, 0.3),
      hitFlash: 0,
      dead: false,
      // Estado de IA
      stagger: 0,
      groanCd: rand(4, 22),
      slot: -1,
    };

    this.zombies.push(zombie);
    return zombie;
  }

  /** Retira un zombie muerto del array activo. */
  remove(zombie) {
    const i = this.zombies.indexOf(zombie);
    if (i >= 0) this.zombies.splice(i, 1);
    return i >= 0;
  }

  damage(zombie, amount, isKill = false) {
    if (zombie.dead) return false;
    zombie.hp -= amount;
    zombie.hitFlash = 1;
    if (zombie.hp <= 0) {
      zombie.dead = true;
      return true;
    }
    return false;
  }

  /**
   * Raycast contra la horda (cilindros verticales).
   * @returns {{zombie, dist, point:THREE.Vector3}|null}
   */
  raycast(origin, dir, maxDist = 120) {
    let best = null;
    let bestDist = maxDist;

    // Limite de distancia por el escenario: las balas no lo atraviesan.
    const wall = this.arena.raycastWorld(origin, dir, maxDist);
    const wallDist = wall ? wall.dist : maxDist;

    for (let i = 0; i < this.zombies.length; i++) {
      const z = this.zombies[i];
      const t = rayCylinder(origin, dir, z.pos.x, z.pos.z, z.radius * 1.05, Math.min(bestDist, wallDist));
      if (t >= bestDist) continue;

      // Comprueba que el impacto cae dentro de la altura del cuerpo.
      const y = origin.y + dir.y * t;
      if (y < 0.05 || y > z.height) continue;

      best = z;
      bestDist = t;
    }

    if (!best) {
      return wall ? { zombie: null, dist: wall.dist, point: this._tmp.copy(origin).addScaledVector(dir, wall.dist).clone(), world: true } : null;
    }
    return {
      zombie: best,
      dist: bestDist,
      point: new THREE.Vector3(origin.x + dir.x * bestDist, y, origin.z + dir.z * bestDist),
      head: y > best.height * 0.78,
    };
  }

  update(dt, player, { allowAttacks = true } = {}) {
    const list = this.zombies;
    const px = player.position.x;
    const pz = player.position.z;

    for (let i = list.length - 1; i >= 0; i--) {
      const z = list[i];

      // Distancia horizontal al jugador.
      let dx = px - z.pos.x;
      let dz = pz - z.pos.z;
      const distSq = dx * dx + dz * dz;
      const dist = Math.sqrt(distSq);

      // ── Persecución ──
      let speed = z.speed;
      if (z.stagger > 0) {
        z.stagger -= dt;
        speed *= 0.25;
      }
      // Pequeño error de rumbo: evita que se muevan en una línea perfecta.
      const wobble = Math.sin(z.phase * 1.7 + performance.now() * 0.0006) * 0.22;
      const angle = Math.atan2(dx, dz) + wobble;

      if (dist > 0.001) {
        z.vel.x = damp(z.vel.x, Math.sin(angle) * speed, 9, dt);
        z.vel.z = damp(z.vel.z, Math.cos(angle) * speed, 9, dt);
      }

      z.pos.x += z.vel.x * dt;
      z.pos.z += z.vel.z * dt;

      // ── Colisiones ──
      this.arena.pushOutOfProps(z.pos, z.radius);
      this._separate(z, dt);

      // ── Animación ──
      const moving = Math.hypot(z.vel.x, z.vel.z);
      z.phase += dt * moving * z.gait * 3.4;
      z.hitFlash = Math.max(0, z.hitFlash - dt * 4.5);
      z.attackAnim = Math.max(0, z.attackAnim - dt * 3.2);

      // ── Ataques ──
      if (allowAttacks) {
        z.attackCd -= dt;
        if (z.attackCd <= 0 && dist < z.attackRange + z.radius) {
          z.attackCd = z.attackRate;
          z.attackAnim = 1;
          this.onPlayerHit?.(z.damage, z);
        }
      }
    }

    this._render();
  }

  /** Separación entre zombies: es lo que convierte un río en una horda. */
  _separate(zombie, dt) {
    const list = this.zombies;
    const push = ZOMBIE.separation * dt;

    for (let i = 0; i < list.length; i++) {
      const other = list[i];
      if (other === zombie) continue;

      const dx = zombie.pos.x - other.pos.x;
      const dz = zombie.pos.z - other.pos.z;
      const minDist = zombie.radius + other.radius;
      const distSq = dx * dx + dz * dz;
      if (distSq > minDist * minDist || distSq < 1e-6) continue;

      const dist = Math.sqrt(distSq);
      const overlap = (minDist - dist) / minDist;
      const nx = dx / dist;
      const nz = dz / dist;
      const force = push * overlap * (1 - zombie.knockResist);

      zombie.pos.x += nx * force;
      zombie.pos.z += nz * force;
    }
  }

  /** Aplica un empujón de impacto (retroceso del arma). */
  applyKnockback(zombie, dirX, dirZ, force) {
    const k = force * (1 - zombie.knockResist);
    zombie.vel.x += dirX * k;
    zombie.vel.z += dirZ * k;
    zombie.stagger = Math.min(0.45, k * 0.5);
  }

  /** Escribe las matrices de las instancias. */
  _render() {
    const { body, head, armL, armR } = this.meshes;
    const d = this._dummy;
    const count = this.zombies.length;

    body.count = count;
    head.count = count;
    armL.count = count;
    armR.count = count;

    for (let i = 0; i < count; i++) {
      const z = this.zombies[i];
      const t = z.type;

      // Ciclo de caminar: el cuerpo sube y baja, los brazos se balancean.
      const bob = Math.abs(Math.sin(z.phase)) * 0.07 * (t.id === 'brute' ? 0.7 : 1);
      const sway = Math.sin(z.phase) * 0.06;
      const lean = z.lean + (z.attackAnim > 0 ? Math.sin(z.attackAnim * Math.PI) * 0.3 : 0);

      const scaleY = t.height / 1.85;
      const scaleXZ = t.radius / 0.42;

      // ── Cuerpo ──
      d.position.set(z.pos.x + sway * 0.3, bob, z.pos.z);
      d.rotation.set(lean, Math.atan2(z.vel.x, z.vel.z), sway * 0.4);
      d.scale.set(scaleXZ, scaleY, scaleXZ);
      d.updateMatrix();
      body.setMatrixAt(i, d.matrix);
      this._tint(body, i, z, t.color, 1);

      // ── Cabeza ──
      const headY = 1.62 * scaleY;
      d.position.set(
        z.pos.x + sway * 0.3 + Math.sin(lean) * headY * 0.5,
        bob + headY,
        z.pos.z + Math.cos(lean) * headY * 0.5,
      );
      d.rotation.set(lean * 1.4, Math.atan2(z.vel.x, z.vel.z), sway * 0.8);
      d.scale.setScalar(scaleXZ);
      d.updateMatrix();
      head.setMatrixAt(i, d.matrix);
      this._tint(head, i, z, t.color, 1.25); // la cabeza es algo más clara

      // ── Brazos (balanceo + ataque) ──
      const armSwing = Math.sin(z.phase) * 0.55;
      const attack = z.attackAnim > 0 ? Math.sin(z.attackAnim * Math.PI) : 0;

      for (const [mesh, side, phase] of [
        [armL, -1, 0],
        [armR, 1, Math.PI * 0.35],
      ]) {
        const shoulderY = 1.38 * scaleY;
        const shoulderX = side * 0.4 * scaleXZ;
        // Convertimos a espacio mundo usando la rotación del zombie.
        const yaw = Math.atan2(z.vel.x, z.vel.z);
        const cos = Math.cos(yaw);
        const sin = Math.sin(yaw);
        d.position.set(
          z.pos.x + shoulderX * cos + sway * 0.3,
          bob + shoulderY,
          z.pos.z - shoulderX * sin,
        );
        // Los brazos se adelantan al caminar y se lanzan hacia delante al atacar.
        const pitch = -armSwing * (side > 0 ? 1 : -1) * 0.9 - attack * 2.1 - 0.35;
        d.rotation.set(pitch + lean, yaw, side * 0.14);
        d.scale.setScalar(scaleXZ);
        d.updateMatrix();
        mesh.setMatrixAt(i, d.matrix);
        this._tint(mesh, i, z, t.color, 0.85);
      }
    }

    for (const m of [body, head, armL, armR]) {
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor.needsUpdate = true;
    }
  }

  /** Aplica color base + destello rojo al recibir un impacto. */
  _tint(mesh, index, z, baseColor, brightness) {
    this._color.setHex(baseColor).multiplyScalar(brightness);
    if (z.hitFlash > 0) {
      this._color.lerp(FLASH_COLOR, z.hitFlash * 0.8);
    }
    mesh.setColorAt(index, this._color);
  }

  dispose() {
    for (const m of Object.values(this.meshes)) {
      m.geometry.dispose();
      m.material.dispose();
      this.scene.remove(m);
    }
  }
}

const FLASH_COLOR = new THREE.Color(0xff3020);