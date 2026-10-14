import * as THREE from 'three';
import { WEAPON_BY_ID } from '../config.js';
import { damp, clamp, rand } from '../core/math.js';

/**
 * Modelo del arma en primera persona.
 * Se renderiza en una escena aparte (con clearDepth) para que
 * nunca atraviese las paredes ni se corte con la geometría cercana.
 */
export class WeaponModel {
  constructor() {
    this.scene = new THREE.Scene();

    // Cámara propia: FOV más cerrado para que el arma no se deforme
    // respecto a como se ve el mundo.
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.01, 6);
    this.camera.position.set(0, 0, 0);

    // Luces propias (el mundo no ilumina una escena paralela).
    this.scene.add(new THREE.HemisphereLight(0x8899bb, 0x202018, 1.1));
    const key = new THREE.DirectionalLight(0xfff0d8, 2.2);
    key.position.set(-0.6, 1, 0.7);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x8fb6ff, 1.1);
    rim.position.set(0.8, 0.2, -1);
    this.scene.add(rim);

    this.root = new THREE.Group();
    // Colocación en la esquina inferior derecha. El z importa: la cámara del
    // arma tiene fov 55°, así que a -0.42 el origen caía casi bajo el borde.
    this.root.position.set(0.18, -0.105, -0.58);
    this.scene.add(this.root);

    this.model = new THREE.Group();
    this.root.add(this.model);

    this.muzzle = new THREE.Object3D();
    this.root.add(this.muzzle);

    // Destello del cañón.
    this.flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 0.3),
      new THREE.MeshBasicMaterial({
        color: 0xffd97a,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.muzzle.add(this.flash);

    this.currentId = null;
    this._muzzleLocal = new THREE.Vector3(0, 0, -0.5);

    // Estado de animación.
    this._recoil = 0;
    this._recoilVel = 0;
    this._kick = new THREE.Vector2();
    this._kickVel = new THREE.Vector2();
    this._reloadT = 0; // 0 = quieto, 1 = inclinado
    this._flashT = 0;
    this._swayTarget = new THREE.Vector2();
    this._sway = new THREE.Vector2();
    this._swapT = 1; // 1 = escondido (al cambiar de arma)
  }

  setWeapon(id) {
    if (this.currentId === id) return;
    this.currentId = id;
    this.rebuild(id);
    this._swapT = 1;
  }

  rebuild(id) {
    this.model.clear();
    const def = WEAPON_BY_ID[id];
    if (!def) return;
    const m = def.model;

    const bodyMat = new THREE.MeshStandardMaterial({
      color: m.tint,
      roughness: 0.52,
      metalness: 0.62,
    });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x15181d, roughness: 0.7, metalness: 0.3 });
    const gripMat = new THREE.MeshStandardMaterial({ color: 0x2a2620, roughness: 0.95, metalness: 0.05 });

    const add = (size, pos, mat, rot = 0) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), mat);
      mesh.position.set(pos[0], pos[1], pos[2]);
      if (rot) mesh.rotation.z = rot;
      this.model.add(mesh);
      return mesh;
    };

    // Culata / cuerpo
    add(m.body, [0, 0, -0.02], bodyMat);
    // Cañón
    add(m.barrel, [0, 0.012, -(m.body[2] / 2 + m.barrel[2] / 2 - 0.02)], darkMat);
    // Cargador
    add(m.mag, [0, -m.body[1] / 2 - m.mag[1] / 2 + 0.02, 0.01], darkMat);
    // Empuñadura
    add([0.055, 0.17, 0.09], [0, -0.11, 0.09], gripMat, 0.22);
    // Riel superior
    add([0.03, 0.018, m.body[2] * 0.7], [0, m.body[1] / 2 + 0.01, -0.04], darkMat);

    if (id === 'shotgun') {
      // Tubo de carga inferior
      add([0.045, 0.045, 0.34], [0, -0.055, -0.18], darkMat);
    }
    if (id === 'minigun') {
      // BarrilMultiple
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        add(
          [0.032, 0.032, 0.3],
          [Math.cos(a) * 0.045, 0.012 + Math.sin(a) * 0.045, -(m.body[2] / 2 + 0.14)],
          darkMat,
        );
      }
    }
    if (id === 'pistol' || id === 'smg') {
      // Mira trasera
      add([0.02, 0.035, 0.02], [0, m.body[1] / 2 + 0.03, -0.1], darkMat);
    }

    // Posición del fogonazo al final del cañón.
    const barrelZ = -(m.body[2] / 2 + m.barrel[2] - 0.02);
    this.muzzle.position.set(0, 0.012, barrelZ - 0.05);
    this._muzzleLocal.copy(this.muzzle.position);

    // El arma rota cuando cambias.
    for (const child of this.model.children) {
      child.castShadow = false;
      child.receiveShadow = false;
    }
  }

  /** Dispara el fogonazo. */
  kickFlash() {
    this._flashT = 1;
    this.flash.rotation.z = rand(0, Math.PI * 2);
    this.flash.scale.setScalar(rand(0.8, 1.35));
  }

  /** Retroceso al disparar (intensidad según el arma). */
  addRecoil(amount) {
    this._recoilVel += amount;
    this._kickVel.y += amount * rand(0.6, 1.4);
    this._kickVel.x += rand(-0.35, 0.35) * amount;
  }

  setReloadProgress(t) {
    this._reloadT = t;
  }

  setSway(dx, dy) {
    this._swayTarget.set(clamp(-dx * 2.4, -0.07, 0.07), clamp(-dy * 2.4, -0.07, 0.07));
  }

  /**
   * @param {number} dt
   * @param {number} moveSpeed  velocidad horizontal normalizada 0..1
   * @param {boolean} sprinting
   * @param {number} spreadAmount 0..1 (dispara el barrido de la retícula)
   */
  update(dt, moveSpeed, sprinting) {
    // Muelle de retroceso.
    this._recoilVel += -this._recoil * 190 * dt;
    this._recoilVel *= Math.exp(-13 * dt);
    this._recoil += this._recoilVel * dt;

    this._kickVel.multiplyScalar(Math.exp(-11 * dt));
    this._kick.addScaledVector(this._kickVel, dt);
    this._sway.x = damp(this._sway.x, this._swayTarget.x, 9, dt);
    this._sway.y = damp(this._sway.y, this._swayTarget.y, 9, dt);

    this._swapT = damp(this._swapT, 0, 11, dt);

    // Cabeceo al andar.
    const bob = Math.min(moveSpeed, 1);
    const phase = performance.now() * 0.001 * (sprinting ? 13 : 9.5);
    const bobX = Math.cos(phase) * 0.016 * bob;
    const bobY = Math.sin(phase * 2) * 0.012 * bob;

    // Inclinación al recargar: baja y gira el arma.
    const reloadDip = this._reloadT;
    const reloadRot = this._reloadT * 0.85;

    this.root.position.set(
      0.18 + bobX + this._sway.x + this._kick.x,
      -0.105 + bobY + this._sway.y - this._recoil * 0.012 - reloadDip * 0.14 - this._swapT * 0.35,
      -0.58 + this._recoil * 0.055 + this._swapT * 0.2,
    );
    this.root.rotation.set(
      -this._recoil * 0.13 + this._sway.y * 1.4 + reloadRot * 0.5,
      this._sway.x * 1.6,
      reloadRot + this._kick.x * 1.5 + this._swapT * 0.4,
    );

    // Fogonazo
    if (this._flashT > 0) {
      this._flashT = Math.max(0, this._flashT - dt * 22);
      this.flash.material.opacity = this._flashT * 0.95;
    } else if (this.flash.material.opacity !== 0) {
      this.flash.material.opacity = 0;
    }
  }

  resize(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.scene.traverse((o) => {
      o.geometry?.dispose?.();
      if (o.material) {
        const list = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of list) m.dispose?.();
      }
    });
  }
}