import { clamp } from '../core/math.js';

/**
 * Controles táctiles para móviles.
 *
 * En pantallas táctiles no existe Pointer Lock, así que se emula:
 *  - mitad izquierda: joystick virtual para moverse
 *  - mitad derecha: arrastre para mirar
 *  - botones flotantes: disparar, recargar, saltar, tienda
 *
 * Traduce el gesto a los mismos métodos que usa el jugador con teclado,
 * de modo que la lógica del juego no necesita saber de dónde viene la entrada.
 */
export class TouchControls {
  constructor(root, { onFire, onReload, onJump, onToggleFireMode, onShop, onInteract }) {
    this.root = root;
    this.enabled = false;

    this.move = { x: 0, y: 0 };
    this.look = { dx: 0, dy: 0 };
    this.firing = false;
    this.sprinting = false;

    this._handlers = { onFire, onReload, onJump, onToggleFireMode, onShop, onInteract };
    this._moveId = null;
    this._lookId = null;
    this._moveOrigin = { x: 0, y: 0 };
    this._lookLast = { x: 0, y: 0 };
    this.sensitivity = 0.0042;

    this._build();
  }

  /** Activa los controles si el dispositivo es táctil. */
  autoEnable() {
    const isTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches
      || navigator.maxTouchPoints > 0;
    if (isTouch) this.enable();
    return isTouch;
  }

  enable() {
    if (this.enabled) return;
    this.enabled = true;
    this.root.classList.remove('hidden');
    document.body.classList.add('touch-mode');
    this._bind();
  }

  disable() {
    if (!this.enabled) return;
    this.enabled = false;
    this.root.classList.add('hidden');
    document.body.classList.remove('touch-mode');
    this.reset();
  }

  reset() {
    this.move.x = 0;
    this.move.y = 0;
    this.look.dx = 0;
    this.look.dy = 0;
    this.firing = false;
    this._moveId = null;
    this._lookId = null;
    this._updateStick(0, 0);
  }

  _build() {
    this.root.classList.add('hidden');
    this.root.innerHTML = `
      <div class="stick-zone" id="stick-zone">
        <div class="stick-base" id="stick-base">
          <div class="stick-knob" id="stick-knob"></div>
        </div>
      </div>

      <div class="look-zone" id="look-zone"></div>

      <div class="touch-buttons">
        <button class="tbtn tbtn-reload" id="t-reload" type="button" aria-label="Recargar">⟳</button>
        <button class="tbtn tbtn-jump" id="t-jump" type="button" aria-label="Saltar">⤒</button>
        <button class="tbtn tbtn-shop" id="t-shop" type="button" aria-label="Tienda">▤</button>
        <button class="tbtn tbtn-fire" id="t-fire" type="button" aria-label="Disparar">◉</button>
      </div>
    `;

    this.el = {
      stickZone: this.root.querySelector('#stick-zone'),
      stickBase: this.root.querySelector('#stick-base'),
      stickKnob: this.root.querySelector('#stick-knob'),
      lookZone: this.root.querySelector('#look-zone'),
      fire: this.root.querySelector('#t-fire'),
      reload: this.root.querySelector('#t-reload'),
      jump: this.root.querySelector('#t-jump'),
      shop: this.root.querySelector('#t-shop'),
    };
  }

  _updateStick(dx, dy) {
    const R = 46;
    const len = Math.hypot(dx, dy);
    if (len > R) {
      dx = (dx / len) * R;
      dy = (dy / len) * R;
    }
    this.el.stickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  _bind() {
    const { stickZone, lookZone } = this.el;

    // ── Joystick ──
    stickZone.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      this._moveId = t.identifier;
      this._moveOrigin.x = t.clientX;
      this._moveOrigin.y = t.clientY;
      const rect = stickZone.getBoundingClientRect();
      this._moveOrigin.x = rect.left + rect.width / 2;
      this._moveOrigin.y = rect.top + rect.height / 2;
      this._updateStick(t.clientX - this._moveOrigin.x, t.clientY - this._moveOrigin.y);
      this._readStick(t);
      e.preventDefault();
    }, { passive: false });

    stickZone.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this._moveId) continue;
        this._updateStick(t.clientX - this._moveOrigin.x, t.clientY - this._moveOrigin.y);
        this._readStick(t);
      }
      e.preventDefault();
    }, { passive: false });

    const endMove = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this._moveId) continue;
        this._moveId = null;
        this.move.x = 0;
        this.move.y = 0;
        this.sprinting = false;
        this._updateStick(0, 0);
      }
    };
    stickZone.addEventListener('touchend', endMove);
    stickZone.addEventListener('touchcancel', endMove);

    // ── Mirar ──
    lookZone.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      this._lookId = t.identifier;
      this._lookLast.x = t.clientX;
      this._lookLast.y = t.clientY;
      e.preventDefault();
    }, { passive: false });

    lookZone.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this._lookId) continue;
        this.look.dx += (t.clientX - this._lookLast.x) * this.sensitivity;
        this.look.dy += (t.clientY - this._lookLast.y) * this.sensitivity;
        this._lookLast.x = t.clientX;
        this._lookLast.y = t.clientY;
      }
      e.preventDefault();
    }, { passive: false });

    const endLook = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this._lookId) this._lookId = null;
      }
    };
    lookZone.addEventListener('touchend', endLook);
    lookZone.addEventListener('touchcancel', endLook);

    // ── Botones ──
    const hold = (el, on, off) => {
      el.addEventListener('touchstart', (e) => {
        el.classList.add('pressed');
        on();
        e.preventDefault();
      }, { passive: false });
      const release = (e) => {
        el.classList.remove('pressed');
        off?.();
        e.preventDefault();
      };
      el.addEventListener('touchend', release);
      el.addEventListener('touchcancel', release);
    };

    hold(this.el.fire, () => {
      this.firing = true;
      this._handlers.onFire?.();
    }, () => {
      this.firing = false;
    });

    const tap = (el, fn) => {
      el.addEventListener('touchstart', (e) => {
        el.classList.add('pressed');
        fn();
        e.preventDefault();
      }, { passive: false });
      const off = (e) => {
        el.classList.remove('pressed');
        if (e) e.preventDefault();
      };
      el.addEventListener('touchend', off);
      el.addEventListener('touchcancel', off);
    };

    tap(this.el.reload, () => this._handlers.onReload?.());
    tap(this.el.jump, () => this._handlers.onJump?.());
    tap(this.el.shop, () => this._handlers.onShop?.());
  }

  _readStick(t) {
    const dx = t.clientX - this._moveOrigin.x;
    const dy = t.clientY - this._moveOrigin.y;
    const R = 46;
    this.move.x = clamp(dx / R, -1, 1);
    this.move.y = clamp(dy / R, -1, 1);
    // Empujar el joystick al máximo hace correr.
    this.sprinting = Math.hypot(this.move.x, this.move.y) > 0.88;
  }

  /** Consume el desplazamiento de cámara acumulado y lo reinicia. */
  consumeLook() {
    const dx = this.look.dx;
    const dy = this.look.dy;
    this.look.dx = 0;
    this.look.dy = 0;
    return { dx, dy };
  }
}