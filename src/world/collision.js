/** Colisión de círculos contra AABB en el plano XZ, para el jugador. */

const _clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/**
 * Empuja `pos` fuera de un AABB y devuelve true si hubo contacto.
 * @param {{x:number,z:number}} pos
 * @param {number} radius
 * @param {{minX:number,maxX:number,minZ:number,maxZ:number}} box
 */
export function resolveCircleBox(pos, radius, box) {
  const cx = _clamp(pos.x, box.minX, box.maxX);
  const cz = _clamp(pos.z, box.minZ, box.maxZ);
  let dx = pos.x - cx;
  let dz = pos.z - cz;
  const distSq = dx * dx + dz * dz;

  if (distSq > radius * radius) return false;

  if (distSq > 1e-8) {
    // Fuera de la caja: empujón radial.
    const dist = Math.sqrt(distSq);
    pos.x = cx + (dx / dist) * radius;
    pos.z = cz + (dz / dist) * radius;
  } else {
    // Centro dentro de la caja: expulsar por la cara más cercana.
    const left = pos.x - box.minX;
    const right = box.maxX - pos.x;
    const back = pos.z - box.minZ;
    const front = box.maxZ - pos.z;
    const min = Math.min(left, right, back, front);

    if (min === left) pos.x = box.minX - radius;
    else if (min === right) pos.x = box.maxX + radius;
    else if (min === back) pos.z = box.minZ - radius;
    else pos.z = box.maxZ + radius;
  }
  return true;
}

/**
 * Distancia a lo largo de un rayo hasta el primer AABB, o Infinity.
 * Usado para que las balas no atraviesen las cajas.
 * @returns {{dist:number, normal:{x:number,y:number,z:number}}|null}
 */
export function rayBox(origin, dir, box, maxDist) {
  let tmin = 0;
  let tmax = maxDist;
  let hitAxis = 0;
  let hitSign = 1;

  // Eje X
  for (let axis = 0; axis < 3; axis++) {
    const key = axis === 0 ? 'x' : axis === 1 ? 'y' : 'z';
    const o = origin[key];
    const d = dir[key];
    const lo = box[key === 'x' ? 'minX' : key === 'y' ? 'minY' : 'minZ'];
    const hi = box[key === 'x' ? 'maxX' : key === 'y' ? 'maxY' : 'maxZ'];

    if (Math.abs(d) < 1e-8) {
      if (o < lo || o > hi) return null; // paralelo y fuera
      continue;
    }
    const inv = 1 / d;
    let t1 = (lo - o) * inv;
    let t2 = (hi - o) * inv;
    let sign = -1;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
      sign = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      hitAxis = axis;
      hitSign = sign;
    }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }

  if (tmin > maxDist || tmin < 0) return null;
  return {
    dist: tmin,
    normal: {
      x: hitAxis === 0 ? hitSign : 0,
      y: hitAxis === 1 ? hitSign : 0,
      z: hitAxis === 2 ? hitSign : 0,
    },
  };
}

/** Distancia a un cilindro vertical infinito. Devuelve Infinity si no hay impacto. */
export function rayCylinder(origin, dir, cx, cz, radius, maxDist) {
  const ox = origin.x - cx;
  const oz = origin.z - cz;
  const a = dir.x * dir.x + dir.z * dir.z;
  if (a < 1e-8) return Infinity; // rayo vertical: solo impacta si ya está dentro
  const b = 2 * (ox * dir.x + oz * dir.z);
  const c = ox * ox + oz * oz - radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return Infinity;

  const sq = Math.sqrt(disc);
  const t1 = (-b - sq) / (2 * a);
  const t2 = (-b + sq) / (2 * a);
  if (t1 >= 0 && t1 <= maxDist) return t1;
  if (t2 >= 0 && t2 <= maxDist) return t2;
  return Infinity;
}