import * as THREE from 'three';
import { rand } from '../core/math.js';

const MAX_PARTICLES = 520;
const MAX_NUMBERS = 28;

/**
 * Efectos de combate: partículas, impactos, números de daño y
 * destellos de pantalla. Todo en pools de tamaño fijo para no
 * provocar basura en el bucle de render.
 */
export class Effects {
  constructor(scene, camera, { numberLayer }) {
    this.scene = scene;
    this.camera = camera;

    // ── Partículas de sangre / polvo ──
    const positions = new Float32Array(MAX_PARTICLES * 3);
    const colors = new Float32Array(MAX_PARTICLES * 3);
    const sizes = new Float32Array(MAX_PARTICLES);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const mat = new THREE.PointsMaterial({
      size: 0.14,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      sizeAttenuation: true,
      blending: THREE.NormalBlending,
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);

    this.particles = [];
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({
        alive: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        size: 1,
      });
      // Esconde las partículas muertas muy lejos.
      positions[i * 3] = 0;
      positions[i * 3 + 1] = -999;
      positions[i * 3 + 2] = 0;
    }
    this._particleCursor = 0;

    // ── Números de daño (DOM) ──
    this.numberLayer = numberLayer;
    this.numbers = [];
    for (let i = 0; i < MAX_NUMBERS; i++) {
      const el = document.createElement('div');
      el.className = 'dmg';
      el.style.display = 'none';
      numberLayer.appendChild(el);
      this.numbers.push({ el, alive: false, pos: new THREE.Vector3(), life: 0, maxLife: 0.85, rise: 0 });
    }
    this._numberCursor = 0;

    // ── Luz de fogonazo en el mundo ──
    this.muzzleLight = new THREE.PointLight(0xffc36a, 0, 14, 2);
    this.muzzleLight.visible = false;
    scene.add(this.muzzleLight);
    this._muzzleTimer = 0;

    this._projected = new THREE.Vector3();
    this._flashEl = document.getElementById('flash');
    this._vignetteEl = document.getElementById('vignette');
    this._vignette = 0;
  }

  // ───────────────────── Partículas ─────────────────────

  _spawnParticle(x, y, z, vx, vy, vz, life, size) {
    const p = this.particles[this._particleCursor];
    this._particleCursor = (this._particleCursor + 1) % MAX_PARTICLES;
    p.alive = true;
    p.pos.set(x, y, z);
    p.vel.set(vx, vy, vz);
    p.life = life;
    p.maxLife = life;
    p.size = size;
  }

  /** Salpicadura de sangre al impactar a un zombie. */
  blood(point, dirX = 0, dirY = 1, dirZ = 0, amount = 10) {
    const n = Math.min(16, 5 + Math.floor(amount / 8));
    for (let i = 0; i < n; i++) {
      const spread = 0.85;
      this._spawnParticle(
        point.x, point.y, point.z,
        dirX * rand(1.2, 3.4) + rand(-spread, spread) * 2.2,
        dirY * rand(1.0, 3.0) + rand(0.4, 2.6),
        dirZ * rand(1.2, 3.4) + rand(-spread, spread) * 2.2,
        rand(0.35, 0.8),
        rand(0.6, 1.5),
      );
    }
  }

  /** Polvo levantado al errar el disparo contra el suelo o los muros. */
  impact(point, normalX = 0, normalY = 1, normalZ = 0) {
    const n = 6;
    for (let i = 0; i < n; i++) {
      this._spawnParticle(
        point.x, point.y, point.z,
        normalX * rand(0.6, 2.2) + rand(-1.1, 1.1),
        normalY * rand(0.6, 2.2) + rand(-0.2, 0.8),
        normalZ * rand(0.6, 2.2) + rand(-1.1, 1.1),
        rand(0.2, 0.45),
        rand(0.5, 1.1),
      );
    }
  }

  /** Nube de muerte al caer un zombie. */
  gib(point, size) {
    const n = 14;
    for (let i = 0; i < n; i++) {
      this._spawnParticle(
        point.x, point.y + 0.5, point.z,
        rand(-1.6, 1.6), rand(0.6, 2.6), rand(-1.6, 1.6),
        rand(0.5, 1.0),
        rand(1.0, 2.1) * size,
      );
    }
  }

  muzzleFlash(worldPos) {
    this.muzzleLight.position.copy(worldPos);
    this.muzzleLight.intensity = 70;
    this.muzzleLight.visible = true;
    this._muzzleTimer = 0.055;
  }

  /** Viñeta roja al recibir daño. `intensity` 0..1. */
  damageFlash(intensity) {
    this._vignette = Math.min(1, this._vignette + intensity);
  }

  /** Destello verde: compra correcta. */
  screenFlash(color = '#c8ff3d', duration = 0.25) {
    const el = this._flashEl;
    if (!el) return;
    el.style.background = color;
    el.style.transition = 'none';
    el.style.opacity = '0.18';
    requestAnimationFrame(() => {
      el.style.transition = `opacity ${duration}s ease-out`;
      el.style.opacity = '0';
    });
  }

  // ───────────────────── Números de daño ─────────────────────

  damageNumber(worldPos, amount, kind = 'normal') {
    const n = this.numbers[this._numberCursor];
    this._numberCursor = (this._numberCursor + 1) % MAX_NUMBERS;

    n.alive = true;
    n.pos.copy(worldPos);
    n.life = 0.85;
    n.maxLife = 0.85;
    n.rise = rand(0.7, 1.3);
    n.driftX = rand(-0.5, 0.5);

    n.el.textContent = kind === 'kill' ? `☠ ${Math.round(amount)}` : Math.round(amount);
    n.el.className = `dmg ${kind}`;
    n.el.style.display = 'block';
  }

  // ───────────────────── Actualización ─────────────────────

  update(dt) {
    // Partículas
    const posAttr = this.points.geometry.attributes.position;
    const colAttr = this.points.geometry.attributes.color;
    const sizeAttr = this.points.geometry.attributes.size;
    const bloodColor = new THREE.Color(0x9e1b1b);
    const dustColor = new THREE.Color(0x8a8577);

    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.alive) continue;

      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        posAttr.setXYZ(i, 0, -999, 0);
        continue;
      }

      p.vel.y -= 14 * dt; // gravedad
      p.pos.addScaledVector(p.vel, dt);
      // Rebote simple contra el suelo.
      if (p.pos.y < 0.04) {
        p.pos.y = 0.04;
        p.vel.y *= -0.32;
        p.vel.x *= 0.7;
        p.vel.z *= 0.7;
      }

      const t = p.life / p.maxLife;
      posAttr.setXYZ(i, p.pos.x, p.pos.y, p.pos.z);
      const c = p.size > 1.3 ? bloodColor : dustColor;
      colAttr.setXYZ(i, c.r * t, c.g * t, c.b * t);
      sizeAttr.setX(i, p.size * t);
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    sizeAttr.needsUpdate = true;

    // Fogonazo
    if (this._muzzleTimer > 0) {
      this._muzzleTimer -= dt;
      this.muzzleLight.intensity *= Math.exp(-38 * dt);
      if (this._muzzleTimer <= 0) {
        this.muzzleLight.visible = false;
        this.muzzleLight.intensity = 0;
      }
    }

    // Números de daño proyectados a pantalla
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (const n of this.numbers) {
      if (!n.alive) continue;

      n.life -= dt;
      if (n.life <= 0) {
        n.alive = false;
        n.el.style.display = 'none';
        continue;
      }

      const t = 1 - n.life / n.maxLife;
      this._projected.copy(n.pos);
      this._projected.y += t * n.rise;
      this._projected.x += n.driftX * t;
      this._projected.project(this.camera);

      // Detrás de la cámara o fuera de plano: oculta.
      if (this._projected.z > 1) {
        n.el.style.display = 'none';
        continue;
      }

      const x = (this._projected.x * 0.5 + 0.5) * w;
      const y = (-this._projected.y * 0.5 + 0.5) * h;
      const scale = 1 + (1 - t) * 0.25;
      n.el.style.display = 'block';
      n.el.style.transform = `translate(-50%,-50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${scale.toFixed(2)})`;
      n.el.style.opacity = String(Math.min(1, n.life / (n.maxLife * 0.4)));
    }

    // Viñeta
    if (this._vignette > 0.001) {
      this._vignette = Math.max(0, this._vignette - dt * 1.6);
      this._vignetteEl.style.opacity = this._vignette.toFixed(3);
    } else if (this._vignetteEl.style.opacity !== '0') {
      this._vignetteEl.style.opacity = '0';
    }
  }

  /** Reinicia todos los pools (al empezar una partida nueva). */
  reset() {
    for (const p of this.particles) p.alive = false;
    for (const n of this.numbers) {
      n.alive = false;
      n.el.style.display = 'none';
    }
    this._vignette = 0;
    this._vignetteEl.style.opacity = '0';
    this.muzzleLight.visible = false;
    this.muzzleLight.intensity = 0;
  }
}