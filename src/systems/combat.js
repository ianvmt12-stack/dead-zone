import * as THREE from 'three';
import { rand } from '../core/math.js';

/**
 * Sistema de combate: disparo, recarga, cambio de arma y daño.
 * Traduce la entrada del jugador en rayos contra la horda.
 */
export class Combat {
  constructor({ player, zombies, arsenal, weaponModel, effects, audio }) {
    this.player = player;
    this.zombies = zombies;
    this.arsenal = arsenal;
    this.weaponModel = weaponModel;
    this.effects = effects;
    this.audio = audio;

    this._origin = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._shotDir = new THREE.Vector3();
    this._muzzleWorld = new THREE.Vector3();
    this._accumulator = new Map(); // daño acumulado por zombie en un mismo disparo

    /** Se llama cuando un zombie muere por acción del jugador. */
    this.onKill = null; // (zombie, {headshot}) => void
    this.onShoot = null; // (weapon, stats) => void
  }

  reset() {
    this._accumulator.clear();
  }

  update(dt, input, { enabled = true } = {}) {
    // ── Avance de recarga ──
    const reloaded = this.arsenal.update(dt);
    this.weaponModel.setReloadProgress(this.arsenal.isReloading ? this.arsenal.reloadProgress : 0);
    if (reloaded) this.audio?.reload();

    if (!enabled) return;

    // ── Cambio de arma (teclas 1-5) ──
    for (let slot = 1; slot <= 5; slot++) {
      if (input.wasPressed(`Digit${slot}`)) {
        if (this.arsenal.equipSlot(slot)) {
          this.weaponModel.setWeapon(this.arsenal.currentId);
          this.audio?.swap();
        }
      }
    }

    // ── Recarga manual ──
    if (input.wasPressed('KeyR')) {
      if (this.arsenal.isReloading) {
        this.arsenal.cancelReload();
        this.weaponModel.setReloadProgress(0);
      } else if (this.arsenal.startReload()) {
        this.audio?.reload();
      } else if (this.arsenal.currentMagazine === 0 && this.arsenal.currentReserve === 0) {
        this.audio?.denied();
      }
    }

    // ── Disparo ──
    const weapon = this.arsenal.current;
    const wantsFire = weapon.auto ? input.isMouseDown(0) : input.wasMousePressed(0);

    if (wantsFire) {
      if (this.arsenal.isReloading) {
        // Cancelar recarga para disparar es una decisión de diseño:
        // priorizamos la supervivencia del jugador.
        this.arsenal.cancelReload();
        this.weaponModel.setReloadProgress(0);
      }

      if (this.arsenal.canFire()) {
        this._fire();
      } else if (
        (weapon.auto ? input.wasMousePressed(0) : true) &&
        this.arsenal.currentMagazine === 0 &&
        !this.arsenal.isReloading &&
        this.arsenal.currentReserve > 0
      ) {
        this.arsenal.startReload();
        this.audio?.reload();
      }
    }
  }

  _fire() {
    const weapon = this.arsenal.current;
    const stats = this.arsenal.currentStats;

    this.arsenal.consumeRound();
    this.arsenal.notifyFired();

    this.player.aimOrigin(this._origin);
    this.player.aimDirection(this._dir);

    // Retroceso de cámara + del arma.
    this.weaponModel.addRecoil(weapon.recoil * 0.9);
    this.audio?.gunshot(weapon.sound);
    this.onShoot?.(weapon, stats);

    // Fogonazo: luz en el mundo, en la boca del cañón.
    this._muzzleWorld
      .copy(this._origin)
      .addScaledVector(this._dir, 0.75)
      .addScaledVector(this.player.camera.up, -0.08);
    this.effects.muzzleFlash(this._muzzleWorld);
    this.weaponModel.kickFlash();

    this._accumulator.clear();

    const pellets = weapon.pellets;
    for (let p = 0; p < pellets; p++) {
      this._shotDir.copy(this._dir);

      // Dispersión en un cono alrededor del eje de apuntado.
      if (weapon.spread > 0) {
        const angle = rand(0, Math.PI * 2);
        const radius = Math.sqrt(Math.random()) * weapon.spread * (pellets > 1 ? 1 : 0.55);
        this._applySpread(angle, radius);
      }

      this._tracePellet(stats.damage);
    }

    this._applyKnockbackAndDamage();
  }

  _applySpread(angle, radius) {
    // Construye una base ortonormal alrededor de la dirección de apuntado.
    const up = Math.abs(this._dir.y) > 0.95 ? UP_FALLBACK : this.player.camera.up;
    const right = _v1.crossVectors(this._dir, up).normalize();
    const realUp = _v2.crossVectors(right, this._dir).normalize();

    this._shotDir
      .addScaledVector(right, Math.cos(angle) * radius)
      .addScaledVector(realUp, Math.sin(angle) * radius)
      .normalize();
  }

  /** Un perdigón: raycast contra el mundo y contra la horda. */
  _tracePellet(damage) {
    const hit = this.zombies.raycast(this._origin, this._shotDir, 120);

    if (!hit) return;

    if (hit.zombie) {
      this.effects.blood(hit.point, this._shotDir.x, this._shotDir.y + 0.3, this._shotDir.z, damage);

      // El daño en la cabeza se multiplica: premia la puntería.
      const mult = hit.head ? 2.1 : 1;
      const total = damage * mult;

      const key = hit.zombie.id;
      const prev = this._accumulator.get(key);
      if (prev) {
        prev.damage += total;
        prev.headshot ||= hit.head;
        this._accumulator.set(key, prev);
      } else {
        this._accumulator.set(key, { zombie: hit.zombie, damage: total, headshot: hit.head });
      }
    } else {
      this.effects.impact(hit.point, hit.normal?.x ?? 0, hit.normal?.y ?? 1, hit.normal?.z ?? 0);
      this.audio?.surfaceHit();
    }
  }

  /** Consolida el daño acumulado: así 9 perdigones en un zombie dan UN golpe. */
  _applyKnockbackAndDamage() {
    if (this._accumulator.size === 0) return;

    for (const { zombie, damage, headshot } of this._accumulator.values()) {
      if (zombie.dead) continue;

      const killed = this.zombies.damage(zombie, damage);
      this.audio?.fleshHit();

      // Números flotantes: uno por impacto real, no por perdigón.
      this.effects.damageNumber(
        _v3.set(zombie.pos.x, zombie.height * 0.75, zombie.pos.z),
        damage,
        killed ? 'kill' : headshot ? 'crit' : 'normal',
      );

      // Empujón: las escopetas barren la horda.
      const knock = Math.min(3.2, damage * 0.012);
      this.zombies.applyKnockback(zombie, this._shotDir.x, this._shotDir.z, knock);

      if (killed) {
        this.effects.gib(zombie.pos, zombie.radius);
        this.audio?.zombieDie();
        this.onKill?.(zombie, { headshot, damage });
      }
    }
    this._accumulator.clear();
  }

  /** Genera un cono de dispersión visual para la retícula. */
  currentSpread() {
    const weapon = this.arsenal.current;
    if (this.arsenal.isReloading) return 0.5;
    return Math.min(1, weapon.spread * 9);
  }
}

// Vectores temporales reutilizados (evitan basura por frame).
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const UP_FALLBACK = new THREE.Vector3(0, 0, 1);