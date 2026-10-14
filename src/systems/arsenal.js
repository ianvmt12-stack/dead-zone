import { WEAPONS, WEAPON_BY_ID, MAX_WEAPON_LEVEL, UPGRADE, SHOP_ITEMS } from '../config.js';
import { clamp } from '../core/math.js';

/**
 * Arsenal: inventario, puntos, mejoras, munición y estado de disparo.
 * Es la única fuente de verdad sobre lo que posee el jugador.
 */
export class Arsenal {
  constructor() {
    this.reset();
  }

  reset() {
    this.points = 0;
    this.currentId = 'pistol';

    /** Armas adquiridas. */
    this.ownedIds = new Set(['pistol']);
    /** id -> nivel de mejora (0..MAX_WEAPON_LEVEL). */
    this.levels = new Map();
    /** id -> balas en el cargador. */
    this.magazine = new Map();
    /** id -> balas de reserva. */
    this.reserve = new Map();
    /** id de suministro -> unidades compradas. */
    this.itemCounts = new Map();

    this._cooldown = 0;
    this._reloadTimer = 0;

    for (const w of WEAPONS) {
      this.levels.set(w.id, 0);
      // Solo la pistola viene con munición de serie; el resto se llena al comprarla.
      const owned = this.ownedIds.has(w.id);
      this.magazine.set(w.id, owned ? this.statsFor(w.id).magazine : 0);
      this.reserve.set(w.id, owned ? w.reserve : 0);
      this.itemCounts.set(w.id, 0);
    }
  }

  // ───────────────────── Estadísticas ─────────────────────

  /** Estadísticas efectivas de un arma teniendo en cuenta su nivel. */
  statsFor(id, levelOverride = null) {
    const w = WEAPON_BY_ID[id];
    if (!w) throw new Error(`Arma desconocida: ${id}`);

    const level = clamp(levelOverride ?? this.levelOf(id), 0, MAX_WEAPON_LEVEL);

    const interval = w.interval * Math.pow(UPGRADE.fireRate, level);
    return {
      damage: w.damage * Math.pow(UPGRADE.damage, level),
      interval,
      fireRate: 1 / interval, // disparos por segundo
      magazine: Math.round(w.magazine * Math.pow(UPGRADE.magazine, level)),
      reloadTime: w.reloadTime * (1 - 0.06 * level),
    };
  }

  levelOf(id) {
    return this.levels.get(id) ?? 0;
  }

  owns(id) {
    return this.ownedIds.has(id);
  }

  isMaxed(id) {
    return this.levelOf(id) >= MAX_WEAPON_LEVEL;
  }

  /** Precio del siguiente nivel de mejora, o null si ya está al máximo. */
  upgradeCost(id) {
    if (!this.owns(id) || this.isMaxed(id)) return null;
    return WEAPON_BY_ID[id].upgradeCosts[this.levelOf(id)];
  }

  /** Diferencia de estadísticas que aportaría el siguiente nivel. */
  nextUpgradeDelta(id) {
    const cur = this.statsFor(id);
    const next = this.statsFor(id, this.levelOf(id) + 1);
    return {
      damage: next.damage - cur.damage,
      interval: cur.interval - next.interval,
      fireRate: next.fireRate - cur.fireRate,
      magazine: next.magazine - cur.magazine,
    };
  }

  get current() {
    return WEAPON_BY_ID[this.currentId];
  }

  get currentStats() {
    return this.statsFor(this.currentId);
  }

  get currentMagazine() {
    return this.magazine.get(this.currentId) ?? 0;
  }

  get currentReserve() {
    return this.reserve.get(this.currentId) ?? 0;
  }

  get isReloading() {
    return this._reloadTimer > 0;
  }

  /** Progreso de recarga 0..1. */
  get reloadProgress() {
    if (this._reloadTimer <= 0) return 0;
    return clamp(1 - this._reloadTimer / this.currentStats.reloadTime, 0, 1);
  }

  // ───────────────────── Puntos y compras ─────────────────────

  addPoints(amount) {
    this.points += amount;
  }

  spend(amount) {
    if (this.points < amount) return false;
    this.points -= amount;
    return true;
  }

  /** Marca un arma como adquirida y la equipa. */
  grant(id, { equip = true } = {}) {
    this.ownedIds.add(id);
    this.magazine.set(id, this.statsFor(id).magazine);
    this.reserve.set(id, WEAPON_BY_ID[id].reserve);
    if (equip) {
      this.currentId = id;
      this._reloadTimer = 0;
    }
  }

  buyWeapon(id) {
    const w = WEAPON_BY_ID[id];
    if (!w) return { ok: false, reason: 'unknown' };
    if (this.owns(id)) return { ok: false, reason: 'owned' };
    if (!this.spend(w.price)) return { ok: false, reason: 'points' };

    this.grant(id);
    return { ok: true, weapon: w };
  }

  buyUpgrade(id) {
    const cost = this.upgradeCost(id);
    if (cost === null) return { ok: false, reason: this.owns(id) ? 'maxed' : 'unknown' };
    if (!this.spend(cost)) return { ok: false, reason: 'points' };

    const level = this.levelOf(id) + 1;
    this.levels.set(id, level);

    // El cargador más grande se llena al instante: la mejora se nota ya.
    this.magazine.set(id, this.statsFor(id).magazine);
    return { ok: true, level, cost };
  }

  /**
   * Compra un suministro.
   * @param {string} itemId
   * @param {import('../entities/player.js').Player} player
   * @returns {{ok:boolean, reason?:string, effect?:{heal?:number}}}
   */
  buyItem(itemId, player) {
    const item = SHOP_ITEMS.find((i) => i.id === itemId);
    if (!item) return { ok: false, reason: 'unknown' };

    const count = this.itemCounts.get(itemId) ?? 0;
    if (item.max && count >= item.max) return { ok: false, reason: 'maxed' };
    if (!this.spend(item.price)) return { ok: false, reason: 'points' };

    this.itemCounts.set(itemId, count + 1);
    return { ok: true, effect: item.action(this, player) };
  }

  refillReserve(multiplier = 1) {
    for (const w of WEAPONS) {
      if (!this.owns(w.id)) continue;
      const stats = this.statsFor(w.id);
      const target = Math.max(stats.magazine * 8, Math.round(w.reserve * multiplier));
      this.reserve.set(w.id, Math.max(this.reserve.get(w.id), target));
    }
  }

  // ───────────────────── Munición y armas ─────────────────────

  equip(id) {
    if (id === this.currentId || !this.owns(id)) return false;
    this.currentId = id;
    this._reloadTimer = 0;
    return true;
  }

  /** Equipa por ranura (teclas 1-5). */
  equipSlot(slot) {
    const w = WEAPONS.find((x) => x.slot === slot);
    return w ? this.equip(w.id) : false;
  }

  consumeRound() {
    const mag = this.currentMagazine;
    if (mag <= 0) return false;
    this.magazine.set(this.currentId, mag - 1);
    return true;
  }

  canReload() {
    return (
      !this.isReloading &&
      this.currentMagazine < this.currentStats.magazine &&
      this.currentReserve > 0
    );
  }

  startReload() {
    if (!this.canReload()) return false;
    this._reloadTimer = this.currentStats.reloadTime;
    return true;
  }

  _finishReload() {
    const stats = this.currentStats;
    const need = stats.magazine - this.currentMagazine;
    const take = Math.min(need, this.currentReserve);
    if (take > 0) {
      this.magazine.set(this.currentId, this.currentMagazine + take);
      this.reserve.set(this.currentId, this.currentReserve - take);
    }
  }

  /** Cargadores y reserva llenos. Gratis entre oleadas. */
  fullResupply() {
    for (const w of WEAPONS) {
      if (!this.owns(w.id)) continue;
      this.magazine.set(w.id, this.statsFor(w.id).magazine);
      this.reserve.set(w.id, Math.max(this.reserve.get(w.id), Math.round(w.reserve)));
    }
  }

  // ───────────────────── Estado de disparo ─────────────────────

  canFire() {
    return !this.isReloading && this._cooldown <= 0 && this.currentMagazine > 0;
  }

  notifyFired() {
    this._cooldown = this.currentStats.interval;
  }

  /**
   * Avanza los temporizadores internos.
   * @returns {boolean} true en el frame exacto en que termina la recarga
   */
  update(dt) {
    if (this._cooldown > 0) this._cooldown -= dt;

    if (this._reloadTimer > 0) {
      this._reloadTimer -= dt;
      if (this._reloadTimer <= 0) {
        this._reloadTimer = 0;
        this._finishReload();
        return true; // el sonido de recarga ya lo emite el sistema de combate
      }
    }
    return false;
  }
}