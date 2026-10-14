import { MAX_WEAPON_LEVEL } from '../config.js';

/**
 * HUD: salud, puntos, oleada, munición, avisos y retícula.
 * Escribe en el DOM; se llama una vez por frame, así que reutiliza
 * nodos en vez de crear elementos.
 */
export class Hud {
  constructor() {
    this.root = document.getElementById('hud');

    this.el = {
      round: document.getElementById('stat-round'),
      timer: document.getElementById('stat-timer'),
      timerBlock: document.getElementById('timer-block'),
      remaining: document.getElementById('stat-remaining'),
      points: document.getElementById('stat-points'),

      healthFill: document.getElementById('health-fill'),
      healthGhost: document.getElementById('health-ghost'),
      healthValue: document.getElementById('health-value'),
      healthTrack: document.querySelector('.health-track'),

      weaponLabel: document.getElementById('weapon-label'),
      weaponLevel: document.getElementById('weapon-level'),
      ammoMag: document.getElementById('ammo-mag'),
      ammoReserve: document.getElementById('ammo-reserve'),
      ammoBox: document.getElementById('ammo-box'),
      reloadBar: document.getElementById('reload-bar'),
      reloadFill: document.querySelector('#reload-bar i'),
      reloadHint: document.getElementById('reload-hint'),

      crosshair: document.getElementById('crosshair'),
      toasts: document.getElementById('toasts'),
    };

    this._cache = {};
    this._hitTimer = 0;
    this._killTimer = 0;
    this._lastAmmo = -1;
    this._lastPoints = -1;
    this._lastHealth = -1;
    this._toastQueue = [];
  }

  show() {
    this.root.classList.remove('hidden');
  }

  hide() {
    this.root.classList.add('hidden');
  }

  /** Marca impacto en la retícula. `kill` usa un color distinto. */
  hitMarker(kill = false) {
    if (kill) this._killTimer = 0.3;
    else this._hitTimer = 0.16;
  }

  toast(text, kind = '') {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.innerHTML = text;
    this.el.toasts.appendChild(el);
    // Limita el número de avisos simultáneos.
    while (this.el.toasts.children.length > 4) {
      this.el.toasts.removeChild(this.el.toasts.firstChild);
    }
    setTimeout(() => el.remove(), 2600);
  }

  update(dt, { player, arsenal, director, zombies, crosshairSpread }) {
    this._updateHealth(player);
    this._updateWeapon(arsenal, dt);
    this._updateRound(director, zombies);
    this._updatePoints(arsenal);
    this._updateCrosshair(dt, crosshairSpread);
  }

  _updateHealth(player) {
    const pct = (player.health / player.maxHealth) * 100;
    const rounded = Math.round(pct);
    if (rounded !== this._lastHealth) {
      this._lastHealth = rounded;
      this.el.healthFill.style.width = `${pct}%`;
      this.el.healthGhost.style.width = `${pct}%`;
      this.el.healthValue.textContent = Math.ceil(player.health);
      this.el.healthTrack.classList.toggle('low', pct <= 30);
    }
  }

  _updateWeapon(arsenal, dt) {
    const weapon = arsenal.current;
    const level = arsenal.levelOf(weapon.id);

    if (this._cache.weapon !== weapon.id) {
      this._cache.weapon = weapon.id;
      this.el.weaponLabel.textContent = weapon.name;
    }

    const levelKey = `${weapon.id}:${level}`;
    if (this._cache.level !== levelKey) {
      this._cache.level = levelKey;
      this.el.weaponLevel.textContent = `Nv.${level}`;
      this.el.weaponLevel.classList.toggle('maxed', level >= MAX_WEAPON_LEVEL);
    }

    const mag = arsenal.currentMagazine;
    const reserve = arsenal.currentReserve;
    if (this._lastAmmo !== mag * 1000 + reserve) {
      this._lastAmmo = mag * 1000 + reserve;
      this.el.ammoMag.textContent = mag;
      this.el.ammoReserve.textContent = reserve;
      this.el.ammoBox.classList.toggle('empty', mag === 0);
    }

    // Barra de recarga
    if (arsenal.isReloading) {
      this.el.reloadBar.hidden = false;
      this.el.reloadFill.style.width = `${(arsenal.reloadProgress * 100).toFixed(0)}%`;
      this.el.reloadHint.hidden = true;
    } else {
      this.el.reloadBar.hidden = true;
      const needsReload = mag < arsenal.currentStats.magazine;
      this.el.reloadHint.hidden = !needsReload || reserve === 0;
    }
  }

  _updateRound(director, zombies) {
    if (this._cache.round !== director.round) {
      this._cache.round = director.round;
      this.el.round.textContent = director.round;
    }

    const intermission = director.isIntermission;
    if (this._cache.intermission !== intermission) {
      this._cache.intermission = intermission;
      this.el.timerBlock.hidden = !intermission;
    }

    if (intermission) {
      const secs = Math.ceil(director.timer);
      if (this._cache.timer !== secs) {
        this._cache.timer = secs;
        this.el.timer.textContent = secs;
      }
      this.el.remaining.textContent = 'Zona segura';
    } else {
      const remaining = director.remaining + zombies.aliveCount;
      const label = `Enemigos: ${remaining}`;
      if (this._cache.remaining !== label) {
        this._cache.remaining = label;
        this.el.remaining.textContent = label;
      }
    }
  }

  _updatePoints(arsenal) {
    if (this._lastPoints === arsenal.points) return;
    this._lastPoints = arsenal.points;
    this.el.points.textContent = arsenal.points.toLocaleString('es-ES');
  }

  _updateCrosshair(dt, spread) {
    this._hitTimer = Math.max(0, this._hitTimer - dt);
    this._killTimer = Math.max(0, this._killTimer - dt);

    const ch = this.el.crosshair;
    ch.classList.toggle('hit', this._hitTimer > 0);
    ch.classList.toggle('kill', this._killTimer > 0);
    ch.classList.toggle('spread', spread > 0.45);
  }

  reset() {
    this._cache = {};
    this._lastAmmo = -1;
    this._lastPoints = -1;
    this._lastHealth = -1;
    this._hitTimer = 0;
    this._killTimer = 0;
    this.el.toasts.innerHTML = '';
    this.el.crosshair.classList.remove('hit', 'kill', 'spread');
  }
}