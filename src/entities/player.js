import * as THREE from 'three';
import { PLAYER, CAMERA } from '../config.js';
import { clamp, damp } from '../core/math.js';

/**
 * Jugador en primera persona: movimiento, cámara, vida y regeneración.
 * No renderiza su propio cuerpo; la cámara ES el jugador.
 */
export class Player {
  constructor(camera, arena) {
    this.camera = camera;
    this.arena = arena;

    this.position = new THREE.Vector3(0, PLAYER.height, 0);
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = true;

    this.maxHealth = PLAYER.maxHealth;
    this.health = PLAYER.maxHealth;
    this.speedBonus = 0;
    this.dead = false;

    this._sinceDamage = 99;
    this._bobPhase = 0;
    this._landingDip = 0;
    this._shake = 0;
    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._wish = new THREE.Vector3();

    // Retroalimentación para el HUD (sacudida de daño, etc.).
    this.lastDamageAt = -99;
  }

  reset() {
    this.position.set(0, PLAYER.height, 6);
    this.velocity.set(0, 0, 0);
    this.yaw = Math.PI;
    this.pitch = 0;
    this.maxHealth = PLAYER.maxHealth;
    this.health = PLAYER.maxHealth;
    this.speedBonus = 0;
    this.dead = false;
    this.onGround = true;
    this._sinceDamage = 99;
    this._shake = 0;
    this.syncCamera();
  }

  addMaxHealth(amount) {
    this.maxHealth += amount;
    this.health = this.maxHealth;
  }

  addSpeedBonus(fraction) {
    this.speedBonus += fraction;
  }

  takeDamage(amount) {
    if (this.dead) return false;
    this.health -= amount;
    this._sinceDamage = 0;
    this._shake = Math.min(1, this._shake + amount / 40);
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      return true; // señal de muerte
    }
    return false;
  }

  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  /** Sacudida acumulada de cámara tras recibir daño. */
  get shake() {
    return this._shake;
  }

  update(dt, input, { allowMove = true } = {}) {
    // ── Mira ──
    if (allowMove) {
      const look = input.consumeLook();
      this.yaw -= look.dx;
      this.pitch = clamp(this.pitch - look.dy, -CAMERA.pitchLimit, CAMERA.pitchLimit);
    } else {
      input.consumeLook();
    }

    // ── Movimiento ──
    this._forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this._right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this._wish.set(0, 0, 0);

    if (allowMove) {
      const axis = input.getMoveAxis();
      this._wish.addScaledVector(this._forward, axis.y);
      this._wish.addScaledVector(this._right, axis.x);
    }

    const wantsSprint =
      allowMove && input.isDown('ShiftLeft') && this._wish.lengthSq() > 0;
    const maxSpeed = (wantsSprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed) * (1 + this.speedBonus);

    if (this._wish.lengthSq() > 0) {
      this._wish.normalize().multiplyScalar(maxSpeed);
    }

    // Aceleración hacia la velocidad deseada + rozamiento.
    const accel = this._wish.lengthSq() > 0 ? PLAYER.accel : PLAYER.friction * 3.2;
    this.velocity.x = damp(this.velocity.x, this._wish.x, accel / maxSpeed, dt);
    this.velocity.z = damp(this.velocity.z, this._wish.z, accel / maxSpeed, dt);

    // Gravedad y salto.
    this.velocity.y += PLAYER.gravity * dt;
    if (allowMove && this.onGround && input.isDown('Space')) {
      this.velocity.y = PLAYER.jumpVelocity;
      this.onGround = false;
    }

    this.position.addScaledVector(this.velocity, dt);

    // Colisión horizontal contra_props y muros.
    const flat = { x: this.position.x, z: this.position.z };
    this.arena.resolvePosition(flat, PLAYER.radius);
    this.position.x = flat.x;
    this.position.z = flat.z;

    // Suelo.
    if (this.position.y <= PLAYER.height) {
      if (!this.onGround && this.velocity.y < -6) {
        this._landingDip = Math.min(0.16, -this.velocity.y * 0.014);
      }
      this.position.y = PLAYER.height;
      this.velocity.y = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }

    // ── Cabeceo de caminar ──
    const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.onGround && horizontalSpeed > 0.4) {
      this._bobPhase += dt * (wantsSprint ? 13 : 9.5);
    } else {
      this._bobPhase = damp(this._bobPhase, 0, 6, dt);
    }
    this._landingDip = damp(this._landingDip, 0, 9, dt);
    this._shake = damp(this._shake, 0, 4.5, dt);

    // ── Regeneración ──
    this._sinceDamage += dt;
    if (!this.dead && this._sinceDamage > PLAYER.regenDelay && this.health < this.maxHealth) {
      this.health = Math.min(this.maxHealth, this.health + PLAYER.regenRate * dt);
    }

    this.syncCamera(dt, horizontalSpeed, wantsSprint);
  }

  syncCamera(dt = 0, horizontalSpeed = 0, sprinting = false) {
    const cam = this.camera;

    // Bob vertical y lateral.
    const bobAmount = this.onGround ? Math.min(horizontalSpeed / PLAYER.sprintSpeed, 1) : 0;
    const bobY = Math.sin(this._bobPhase * 2) * 0.035 * bobAmount;
    const bobX = Math.cos(this._bobPhase) * 0.028 * bobAmount;

    // Sacudida por daño.
    let shakeY = 0;
    let shakeR = 0;
    if (this._shake > 0.001) {
      const s = this._shake * this._shake * 0.09;
      shakeY = (Math.random() - 0.5) * s;
      shakeR = (Math.random() - 0.5) * s;
    }

    cam.position.set(
      this.position.x + bobX,
      this.position.y + bobY - this._landingDip + shakeY,
      this.position.z,
    );

    cam.rotation.set(0, 0, 0);
    cam.rotation.order = 'YXZ';
    cam.rotation.y = this.yaw;
    cam.rotation.x = this.pitch - bobAmount * 0.012;
    cam.rotation.z = shakeR + (sprinting ? Math.sin(this._bobPhase) * 0.006 : 0);
  }

  /** Dirección de apuntado en espacio mundo (origen del rayo de disparo). */
  aimOrigin(target = new THREE.Vector3()) {
    return target.copy(this.camera.position);
  }

  aimDirection(target = new THREE.Vector3()) {
    return this.camera.getWorldDirection(target);
  }

  get eyeHeight() {
    return this.position.y;
  }
}