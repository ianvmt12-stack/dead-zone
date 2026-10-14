import { WEAPONS, SHOP_ITEMS, MAX_WEAPON_LEVEL, UPGRADE } from '../config.js';

/**
 * Tienda de campo.
 *
 * Se abre automáticamente al final de cada oleada durante el intervalo de
 * 25 segundos. Permite comprar armas, mejorar el arma equipada hasta
 * nivel 3 (daño, cadencia y cargador) y adquirir suministros.
 */
export class Shop {
  constructor({ arsenal, player, audio, effects, weaponModel, onClose, onToast, onOpen }) {
    this.arsenal = arsenal;
    this.player = player;
    this.audio = audio;
    this.effects = effects;
    this.weaponModel = weaponModel;
    this.onClose = onClose;
    this.onToast = onToast;
    this.onOpen = onOpen;

    this.root = document.getElementById('shop');
    this.el = {
      points: document.getElementById('shop-points'),
      timer: document.getElementById('shop-timer'),
      timerBox: document.querySelector('.meta-item.countdown'),
      subtitle: document.getElementById('shop-subtitle'),
      weapons: document.getElementById('shop-weapons'),
      upgrades: document.getElementById('shop-upgrades'),
      upgradeName: document.getElementById('upgrade-weapon-name'),
      stats: document.getElementById('upgrade-stats'),
      supplies: document.getElementById('shop-supplies'),
      close: document.getElementById('shop-close'),
    };

    this.visible = false;
    this._sig = '';

    this.el.close.addEventListener('click', () => this.hide());

    this._buildStatic();
  }

  // ═════════════════════ Construcción de tarjetas ═════════════════════

  /** Crea la lista de armas una sola vez; luego solo se actualiza el estado. */
  _buildStatic() {
    this.el.weapons.innerHTML = '';
    this.weaponCards = new Map();
    this._upgradeLabels = ['daño', 'cadencia', 'cargador'];

    for (const w of WEAPONS) {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <div class="card-name">${w.name}</div>
        <div class="card-desc">${w.desc}</div>
        <button class="card-action" type="button" aria-label="Comprar ${w.name}"></button>
      `;
      const btn = card.querySelector('.card-action');
      btn.addEventListener('click', () => this._onBuyWeapon(w.id));
      this.el.weapons.appendChild(card);

      this.weaponCards.set(w.id, { card, btn });
    }

    // ── Mejoras: siempre las del arma equipada ──
    this.el.upgrades.innerHTML = '';
    this.upgradeRows = [];

    for (let i = 0; i < MAX_WEAPON_LEVEL; i++) {
      const row = document.createElement('div');
      row.className = 'card';
      row.innerHTML = `
        <div class="card-name">
          Nivel ${i + 1} <span class="tag">${['DAÑO', 'CADENCIA', 'CARGADOR'][i]}</span>
        </div>
        <div class="card-desc">${this._describeUpgrade(i)}</div>
        <div class="pips"></div>
        <button class="card-action" type="button" aria-label="Mejorar nivel ${i + 1}">—</button>
      `;
      const btn = row.querySelector('.card-action');
      btn.addEventListener('click', () => this._onBuyUpgrade(i));
      this.el.upgrades.appendChild(row);

      this.upgradeRows.push({
        row,
        btn,
        pips: row.querySelector('.pips'),
        desc: row.querySelector('.card-desc'),
      });
      for (let p = 0; p < MAX_WEAPON_LEVEL; p++) {
        const pip = document.createElement('span');
        pip.className = 'pip';
        this.upgradeRows[i].pips.appendChild(pip);
      }
    }

    // ── Suministros ──
    this.el.supplies.innerHTML = '';
    this.itemCards = new Map();

    for (const item of SHOP_ITEMS) {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <div class="card-name">${item.icon} ${item.name}</div>
        <div class="card-desc">${item.desc}</div>
        <button class="card-action" type="button" aria-label="Comprar ${item.name}"></button>
      `;
      const btn = card.querySelector('.card-action');
      btn.addEventListener('click', () => this._onBuyItem(item.id));
      this.el.supplies.appendChild(card);

      this.itemCards.set(item.id, { card, btn, item });
    }
  }

  _describeUpgrade(levelIndex) {
    const base = this.arsenal.current;
    const dmg = Math.round(base.damage * (Math.pow(UPGRADE.damage, levelIndex + 1) - Math.pow(UPGRADE.damage, levelIndex)));
    const intervalCut = (1 - Math.pow(UPGRADE.fireRate, levelIndex + 1)) * 100;
    const mag = Math.round(
      base.magazine * (Math.pow(UPGRADE.magazine, levelIndex + 1) - Math.pow(UPGRADE.magazine, levelIndex)),
    );
    if (levelIndex === 0) return `+${dmg} daño · +${Math.round(intervalCut)}% cadencia · +${mag} balas`;
    return `+${dmg} daño · +${Math.round(intervalCut)}% cadencia · +${mag} balas (acumulado)`;
  }

  // ═════════════════════ Acciones ═════════════════════

  _onBuyWeapon(id) {
    const res = this.arsenal.buyWeapon(id);
    if (res.ok) {
      this.audio?.purchase();
      this.effects?.screenFlash('#c8ff3d');
      this.weaponModel.setWeapon(id);
      this._notify(`Arma adquirida: <b>${res.weapon.name}</b>`);
    } else {
      this.audio?.denied();
      this._notify(
        res.reason === 'points' ? 'Puntos insuficientes' : res.reason === 'owned' ? 'Ya la tienes' : 'No disponible',
        true,
      );
    }
    this.refresh(true);
  }

  _onBuyUpgrade(levelIndex) {
    const id = this.arsenal.currentId;
    const currentLevel = this.arsenal.levelOf(id);
    if (currentLevel !== levelIndex) {
      // Los niveles se compran en orden: hay que tener el anterior.
      this.audio?.denied();
      this._notify('Compra primero el nivel anterior', true);
      return;
    }

    const res = this.arsenal.buyUpgrade(id);
    if (res.ok) {
      this.audio?.purchase();
      this.effects?.screenFlash('#c8ff3d');
      const name = this.arsenal.current.name;
      this._notify(`<b>${name}</b> mejorado a nivel ${res.level}`);
    } else {
      this.audio?.denied();
      this._notify(
        res.reason === 'points' ? 'Puntos insuficientes' : 'Nivel máximo alcanzado',
        true,
      );
    }
    this.refresh(true);
  }

  _onBuyItem(id) {
    const res = this.arsenal.buyItem(id, this.player);
    if (res.ok) {
      this.audio?.purchase();
      this.effects?.screenFlash('#c8ff3d');
      if (res.effect?.heal) this.player.heal(res.effect.heal);
      this._notify(`Comprado: <b>${SHOP_ITEMS.find((i) => i.id === id).name}</b>`);
    } else {
      this.audio?.denied();
      this._notify(res.reason === 'points' ? 'Puntos insuficientes' : 'Límite alcanzado', true);
    }
    this.refresh(true);
  }

  _notify(text, bad = false) {
    this.onToast?.(text, bad ? 'bad' : '');
  }

  // ═════════════════════ Visibilidad ═════════════════════

  show(subtitle = 'Zona segura · Oleada superada') {
    this.visible = true;
    this.root.classList.remove('hidden');
    this.el.subtitle.textContent = subtitle;
    this.refresh(true);
    this.onOpen?.();
  }

  hide() {
    this.visible = false;
    this.root.classList.add('hidden');
    this.onClose?.();
  }

  /** Refresca el contenido. `force` ignora la caché de firmas. */
  refresh(force = false) {
    const a = this.arsenal;

    this.el.points.textContent = a.points.toLocaleString('es-ES');

    // ── Armas ──
    for (const w of WEAPONS) {
      const { card, btn } = this.weaponCards.get(w.id);
      const owned = a.owns(w.id);
      const equipped = a.currentId === w.id;
      const affordable = a.points >= w.price;

      card.classList.toggle('owned', owned);
      card.classList.toggle('equipped', equipped);
      card.classList.toggle('locked', !owned && !affordable);

      if (equipped) {
        btn.textContent = 'Equipada';
        btn.className = 'card-action done';
        btn.disabled = true;
      } else if (owned) {
        btn.textContent = 'Equipar';
        btn.className = 'card-action buy';
        btn.disabled = false;
      } else {
        // Aunque no haya puntos, el botón sigue siendo clicable: el clic
        // explica por qué no se puede comprar en vez de dejar silencio.
        btn.textContent = `${w.price.toLocaleString('es-ES')} pts`;
        btn.className = affordable ? 'card-action buy' : 'card-action no-points';
        btn.disabled = false;
      }
    }

    // ── Mejoras ──
    const id = a.currentId;
    const weapon = a.current;
    const level = a.levelOf(id);
    const maxed = level >= MAX_WEAPON_LEVEL;

    this.el.upgradeName.textContent = `${weapon.name} · Nv.${level}`;

    for (let i = 0; i < MAX_WEAPON_LEVEL; i++) {
      const { row, btn, pips, desc } = this.upgradeRows[i];
      const purchased = level > i;
      const isNext = level === i;

      desc.innerHTML = this._describeUpgrade(i);
      row.classList.toggle('owned', purchased);
      row.classList.toggle('equipped', isNext);

      for (let p = 0; p < MAX_WEAPON_LEVEL; p++) {
        pips.children[p].classList.toggle('on', level > p);
      }

      if (purchased) {
        btn.textContent = 'Comprado';
        btn.className = 'card-action done';
        btn.disabled = true;
      } else if (maxed) {
        btn.textContent = 'Máximo';
        btn.className = 'card-action done';
        btn.disabled = true;
      } else if (isNext) {
        const cost = a.upgradeCost(id);
        btn.textContent = `${cost.toLocaleString('es-ES')} pts`;
        btn.className = a.points >= cost ? 'card-action buy' : 'card-action no-points';
        btn.disabled = false;
      } else {
        btn.textContent = 'Bloqueado';
        btn.className = 'card-action done';
        btn.disabled = true;
      }
    }

    this._renderStatComparison();

    // ── Suministros ──
    for (const [itemId, { btn, item, card }] of this.itemCards) {
      const count = a.itemCounts.get(itemId) ?? 0;
      const capped = item.max && count >= item.max;
      const affordable = a.points >= item.price;

      card.classList.toggle('locked', !affordable);

      if (capped) {
        btn.textContent = 'Máximo';
        btn.className = 'card-action done';
        btn.disabled = true;
      } else {
        btn.textContent = `${item.price.toLocaleString('es-ES')} pts`;
        btn.className = affordable ? 'card-action buy' : 'card-action no-points';
        btn.disabled = false;
      }
    }

    this._sig = '';
  }

  /** Comparativa "actual → siguiente" para que se entienda la mejora. */
  _renderStatComparison() {
    const a = this.arsenal;
    const id = a.currentId;
    const cur = a.statsFor(id);
    const maxed = a.isMaxed(id);
    const next = maxed ? null : a.statsFor(id, a.levelOf(id) + 1);

    const rows = [
      ['Daño', (s) => s.damage.toFixed(1), ' dmg'],
      ['Cadencia', (s) => s.fireRate.toFixed(2), ' d/s'],
      ['Cargador', (s) => String(s.magazine), ' balas'],
      ['Recarga', (s) => s.reloadTime.toFixed(2), ' s'],
    ];

    this.el.stats.innerHTML = rows
      .map(([label, fmt, unit]) => {
        if (!next) {
          return `<div class="stat-row"><span>${label}</span><div class="vals"><b>${fmt(cur)}${unit}</b></div></div>`;
        }
        const isBetter = label === 'Recarga' ? next.reloadTime < cur.reloadTime : true;
        return `
          <div class="stat-row">
            <span>${label}</span>
            <div class="vals">
              <s>${fmt(cur)}${unit}</s> → <b>${fmt(next)}${unit}</b>
              ${isBetter ? '<em>▲</em>' : ''}
            </div>
          </div>`;
      })
      .join('');
  }

  /** Actualiza solo el reloj (cada frame, barato). */
  tickTimer(seconds) {
    const secs = Math.max(0, Math.ceil(seconds));
    this.el.timer.textContent = secs;
    this.el.timerBox.classList.toggle('urgent', secs <= 5);
  }

  /**
   * Refresco ligero: solo reconstruye la UI si algo relevante cambió.
   * La vida queda fuera de la firma a propósito (regenera cada frame en
   * el intervalo y no se muestra dentro de la tienda).
   */
  tick() {
    const a = this.arsenal;
    const sig = [
      a.points,
      a.currentId,
      a.levelOf(a.currentId),
      [...a.itemCounts.values()].join(','),
    ].join('|');

    if (sig !== this._sig) {
      this._sig = sig;
      this.refresh();
    }
  }
}