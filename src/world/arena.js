import * as THREE from 'three';
import { ARENA } from '../config.js';
import { makeRng, rand, randInt, TAU } from '../core/math.js';
import { resolveCircleBox, rayBox } from './collision.js';

/**
 * Construye el recinto jugable: suelo, muros, cajas, iluminación y niebla.
 * Devuelve los datos de colisión que usan jugador y zombies.
 */
export function createArena(scene, { shadows = true } = {}) {
  const rng = makeRng(20260814);
  const half = ARENA.half;
  const colliders = [];
  const meshes = [];

  scene.background = new THREE.Color(0x0a0e13);
  scene.fog = new THREE.Fog(0x0a0e13, ARENA.fogNear, ARENA.fogFar);

  // ───────────────────── Iluminación ─────────────────────

  scene.add(new THREE.HemisphereLight(0x5c6f8c, 0x1b2418, 0.95));
  scene.add(new THREE.AmbientLight(0x2b3542, 0.55));

  const moon = new THREE.DirectionalLight(0xbcd2ff, 1.9);
  moon.position.set(28, 46, -20);
  moon.castShadow = shadows;
  if (shadows) {
    moon.shadow.mapSize.set(2048, 2048);
    const s = half * 1.15;
    Object.assign(moon.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 140 });
    moon.shadow.bias = -0.0012;
    moon.shadow.normalBias = 0.022;
  }
  scene.add(moon);
  scene.add(moon.target);

  // Farolas del recinto: dan puntos de referencia y color a un mapa que,
  // de otro modo, sería un plano verde bastante plano.
  const lampPosts = [];
  const lampGeo = new THREE.CylinderGeometry(0.11, 0.14, 5.4, 8);
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.8, metalness: 0.3 });
  const bulbGeo = new THREE.SphereGeometry(0.26, 10, 8);
  const bulbMat = new THREE.MeshStandardMaterial({
    color: 0xffe9a8,
    emissive: 0xffc94d,
    emissiveIntensity: 2.4,
    roughness: 0.4,
  });

  const lampSpots = [
    [-24, -24], [24, -24], [-24, 24], [24, 24], [0, -30], [0, 30], [-30, 0], [30, 0],
  ];
  const lights = [];
  for (const [x, z] of lampSpots) {
    const post = new THREE.Mesh(lampGeo, lampMat);
    post.position.set(x, 2.7, z);
    post.castShadow = shadows;
    scene.add(post);
    meshes.push(post);

    const bulb = new THREE.Mesh(bulbGeo, bulbMat);
    bulb.position.set(x, 5.5, z);
    scene.add(bulb);

    const light = new THREE.PointLight(0xffb84d, 34, 26, 2);
    light.position.set(x, 5.2, z);
    scene.add(light);
    lights.push(light);
    lampPosts.push(bulb);
  }

  // ───────────────────── Suelo ─────────────────────

  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x2f3a2e,
    roughness: 0.96,
    metalness: 0.02,
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, half * 2), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = shadows;
  scene.add(ground);

  // Rejilla técnica: rompe la monotonía del plano a un coste mínimo.
  const grid = new THREE.GridHelper(half * 2, half, 0x3d4a38, 0x3d4a38);
  grid.material.transparent = true;
  grid.material.opacity = 0.16;
  grid.position.y = 0.012;
  scene.add(grid);

  // Manchas de tierra (planos oscuros) para dar textura.
  const stainMat = new THREE.MeshBasicMaterial({
    color: 0x1a211a,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
  for (let i = 0; i < 26; i++) {
    const r = rand(1.2, 4.5);
    const stain = new THREE.Mesh(new THREE.CircleGeometry(r, 12), stainMat);
    stain.rotation.x = -Math.PI / 2;
    stain.rotation.z = rng() * TAU;
    stain.position.set(rand(-half + 4, half - 4), 0.008, rand(-half + 4, half - 4));
    stain.scale.set(1, rand(0.6, 1.3), 1);
    scene.add(stain);
  }

  // ───────────────────── Muros perimetrales ─────────────────────

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 0.92, metalness: 0.05 });
  const t = ARENA.wallThickness;
  const h = ARENA.wallHeight;
  const walls = [
    { x: 0, z: -half - t / 2, w: half * 2 + t * 2, d: t },
    { x: 0, z: half + t / 2, w: half * 2 + t * 2, d: t },
    { x: -half - t / 2, z: 0, w: t, d: half * 2 + t * 2 },
    { x: half + t / 2, z: 0, w: t, d: half * 2 + t * 2 },
  ];
  for (const w of walls) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w.w, h, w.d), wallMat);
    mesh.position.set(w.x, h / 2, w.z);
    mesh.castShadow = shadows;
    mesh.receiveShadow = shadows;
    scene.add(mesh);
    meshes.push(mesh);
  }

  // Bordillo interior: frena a los zombies antes de llegar al muro.
  const inner = half - 0.9;
  const colliderBoxes = [
    { minX: -half - 2, maxX: half + 2, minZ: -half - 2, maxZ: -inner },
    { minX: -half - 2, maxX: half + 2, minZ: inner, maxZ: half + 2 },
    { minX: -half - 2, maxX: -inner, minZ: -half - 2, maxZ: half + 2 },
    { minX: inner, maxX: half + 2, minZ: -half - 2, maxZ: half + 2 },
  ];

  // ───────────────────── Cajas y barriles ─────────────────────

  const crateGeo = new THREE.BoxGeometry(1, 1, 1);
  const crateMats = [
    new THREE.MeshStandardMaterial({ color: 0x6b5236, roughness: 0.85 }),
    new THREE.MeshStandardMaterial({ color: 0x4a5560, roughness: 0.7, metalness: 0.25 }),
    new THREE.MeshStandardMaterial({ color: 0x5c4436, roughness: 0.88 }),
  ];
  const barrelGeo = new THREE.CylinderGeometry(0.52, 0.52, 1.15, 14);
  const barrelMat = new THREE.MeshStandardMaterial({ color: 0x7a3b32, roughness: 0.6, metalness: 0.45 });

  const obstacles = [];
  const margin = 6;

  // Coloca obstáculos evitando solapamientos y el centro (zona inicial del jugador).
  let attempts = 0;
  while (obstacles.length < ARENA.propCount && attempts < 900) {
    attempts++;
    const isBarrel = rng() < 0.3;
    const size = isBarrel
      ? { x: rand(0.9, 1.15), y: rand(1.0, 1.3), z: rand(0.9, 1.15) }
      : { x: rand(1.3, 2.9), y: rand(1.1, 2.4), z: rand(1.3, 2.9) };

    const x = rand(-half + margin, half - margin);
    const z = rand(-half + margin, half - margin);
    if (Math.hypot(x, z) < 11) continue; // deja libre el centro

    const radius = Math.max(size.x, size.z) * 0.75;
    let clash = false;
    for (const o of obstacles) {
      if (Math.hypot(o.x - x, o.z - z) < o.radius + radius + 1.6) {
        clash = true;
        break;
      }
    }
    if (clash) continue;

    obstacles.push({ x, z, radius, size, isBarrel });

    const mesh = isBarrel
      ? new THREE.Mesh(barrelGeo, barrelMat)
      : new THREE.Mesh(crateGeo, crateMats[randInt(0, crateMats.length - 1)]);
    mesh.position.set(x, size.y / 2, z);
    if (!isBarrel) mesh.rotation.y = rng() * TAU;
    mesh.castShadow = shadows;
    mesh.receiveShadow = shadows;
    scene.add(mesh);
    meshes.push(mesh);

    colliders.push({
      minX: x - size.x / 2,
      maxX: x + size.x / 2,
      minZ: z - size.z / 2,
      maxZ: z + size.z / 2,
      minY: 0,
      maxY: size.y,
      isObstacle: true,
    });
  }

  colliders.push(...colliderBoxes);

  // ───────────────────── Puntos de aparición ─────────────────────
  // Zonas en los bordes, lejos del centro, para que la horda llegue surrounds.

  const spawnZones = [];
  const zoneCount = 12;
  for (let i = 0; i < zoneCount; i++) {
    const angle = (i / zoneCount) * TAU + 0.2;
    const radius = half - rand(2.5, 7);
    spawnZones.push({
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius,
    });
  }

  // Niebla volumétrica falsa: planos de "humo" muy tenues cerca del suelo.
  const fogMat = new THREE.MeshBasicMaterial({
    color: 0x9fb4c8,
    transparent: true,
    opacity: 0.028,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  for (let i = 0; i < 7; i++) {
    const puff = new THREE.Mesh(new THREE.PlaneGeometry(rand(26, 46), rand(9, 16)), fogMat);
    puff.position.set(rand(-half, half), rand(1.4, 3.6), rand(-half, half));
    puff.rotation.y = rng() * TAU;
    puff.renderOrder = 2;
    scene.add(puff);
  }

  // ───────────────────── API pública ─────────────────────

  let flicker = 0;

  return {
    half,
    colliders,
    obstacles,
    spawnZones,
    moon,

    /** Mantiene al jugador dentro del recinto y fuera de los obstáculos. */
    resolvePosition(pos, radius) {
      const limit = half - 0.6 - radius;
      pos.x = Math.max(-limit, Math.min(limit, pos.x));
      pos.z = Math.max(-limit, Math.min(limit, pos.z));

      for (let i = 0; i < colliders.length; i++) {
        resolveCircleBox(pos, radius, colliders[i]);
      }
      return pos;
    },

    /** Impulsa a un zombie fuera de los obstáculos. */
    pushOutOfProps(pos, radius) {
      for (let i = 0; i < colliders.length; i++) {
        const box = colliders[i];
        // Las paredes perimetrales las gestiona el límite, no hace falta empujar.
        if (!box.isObstacle) continue;
        resolveCircleBox(pos, radius, box);
      }
      const limit = half - 0.8 - radius;
      pos.x = Math.max(-limit, Math.min(limit, pos.x));
      pos.z = Math.max(-limit, Math.min(limit, pos.z));
      return pos;
    },

    /** Distancia de bloqueo más cercana a un rayo (muros + cajas). */
    raycastWorld(origin, dir, maxDist) {
      let best = maxDist;
      let normal = { x: 0, y: 0, z: 0 };
      for (let i = 0; i < colliders.length; i++) {
        const hit = rayBox(origin, dir, colliders[i], best);
        if (hit && hit.dist < best) {
          best = hit.dist;
          normal = hit.normal;
        }
      }
      return best < maxDist ? { dist: best, normal } : null;
    },

    setShadows(enabled) {
      moon.castShadow = enabled;
      for (const m of meshes) m.castShadow = enabled;
      ground.receiveShadow = enabled;
    },

    update(dt) {
      // Parpadeo sutil de las farolas: hace el ambiente menos plano.
      flicker += dt;
      for (let i = 0; i < lights.length; i++) {
        const base = 34;
        const wobble = Math.sin(flicker * (2.1 + i * 0.37) + i) * 0.05
          + Math.sin(flicker * (11.3 + i)) * 0.02;
        lights[i].intensity = base * (1 + wobble);
      }
    },

    dispose() {
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose?.();
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const m of mats) m.dispose?.();
        }
      });
    },
  };
}