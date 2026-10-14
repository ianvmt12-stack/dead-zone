/**
 * Entrada de teclado + ratón con Pointer Lock API.
 * No depende de librerías externas.
 */
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set(); // pulsaciones de este frame (se limpian en endFrame)
    this.mouseButtons = new Set();
    this.mousePressed = new Set();
    this.mouse = { dx: 0, dy: 0 };
    this.locked = false;
    this.sensitivity = 0.0024;
    this.invertY = false;

    /** Controles táctiles, si el dispositivo los necesita. */
    this.touch = null;
    this.fallbackLook = false;
    this._virtualFirePressed = false;
    this._virtualJump = false;
    this._virtualReload = false;
    this._virtualShop = false;

    /** Se dispara cuando el bloqueo del puntero cambia. */
    this.onLockChange = null;

    this._bind();
  }

  /** Conecta un TouchControls. Si no se pasa nada, se autodetecta. */
  attachTouch(touch) {
    this.touch = touch;
    touch.autoEnable();
    return touch;
  }

  _bind() {
    // ── Teclado ──
    window.addEventListener('keydown', (e) => {
      // Evita que la barra espaciadora haga scroll durante el juego.
      if (e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'Tab') {
        e.preventDefault();
      }
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    // Si el jugador pierde el foco, no dejamos teclas "pulsadas" eternamente.
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseButtons.clear();
    });

    // ── Ratón ──
    this.canvas.addEventListener('mousedown', (e) => {
      if (!this.mouseButtons.has(e.button)) this.mousePressed.add(e.button);
      this.mouseButtons.add(e.button);
    });

    window.addEventListener('mouseup', (e) => {
      this.mouseButtons.delete(e.button);
    });

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('mousemove', (e) => {
      // Con Pointer Lock activo, o en modo alternativo si el navegador
      // lo ha rechazado (entornos embebidos, permisos, kioscos).
      if (!this.locked && !this.fallbackLook) return;
      this.mouse.dx += e.movementX || 0;
      this.mouse.dy += e.movementY || 0;
    });

    // ── Pointer Lock ──
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (this.locked) this.fallbackLook = false;
      if (!this.locked) {
        this.mouseButtons.clear();
        this.mouse.dx = 0;
        this.mouse.dy = 0;
      }
      this.onLockChange?.(this.locked, 'change');
    });

    document.addEventListener('pointerlockerror', () => {
      this.locked = false;
      // El navegador no permite capturar el ratón: seguimos jugando con
      // el ratón libre y avisamos con 'error' (que NO debe pausar la partida).
      this.fallbackLook = true;
      this.onLockChange?.(false, 'error');
    });
  }

  /** ¿Estamos capturando el ratón de alguna de las dos formas? */
  get hasMouseLook() {
    return this.locked || this.fallbackLook;
  }

  /**
   * Pide el bloqueo del puntero. Solo puede llamarse desde un gesto del
   * usuario; si el navegador lo rechaza (iframe, permisos, móvil) fallamos
   * en silencio y el juego sigue siendo jugable con clic + teclado.
   */
  requestLock() {
    if (this.locked || this.touch?.enabled) return;

    const swallow = () => {
      /* el navegador no permite capturar el ratón aquí */
    };

    try {
      const result = this.canvas.requestPointerLock?.({ unadjustedMovement: true });
      if (result && typeof result.catch === 'function') {
        result.catch(() => {
          try {
            // Segundo intento sin `unadjustedMovement`, que no todos lo soportan.
            const retry = this.canvas.requestPointerLock?.();
            if (retry && typeof retry.catch === 'function') retry.catch(swallow);
          } catch {
            swallow();
          }
        });
      }
    } catch {
      swallow();
    }
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  isDown(code) {
    if (this.keys.has(code)) return true;
    if (!this.touch?.enabled) return false;
    if (code === 'Space') return this._virtualJump;
    if (code === 'ShiftLeft') return this.touch.sprinting;
    return false;
  }

  /** Verdadero solo en el frame en el que se pulsó la tecla. */
  wasPressed(code) {
    if (this.pressed.has(code)) return true;
    if (!this.touch?.enabled) return false;
    if (code === 'KeyR') return this._virtualReload;
    if (code === 'KeyB') return this._virtualShop;
    return false;
  }

  isMouseDown(button = 0) {
    if (this.mouseButtons.has(button)) return true;
    return button === 0 && !!this.touch?.enabled && this.touch.firing;
  }

  wasMousePressed(button = 0) {
    if (this.mousePressed.has(button)) return true;
    return button === 0 && !!this.touch?.enabled && this._virtualFirePressed;
  }

  /**
   * Eje de movimiento combinado teclado + joystick.
   * @returns {{x:number, y:number}} x = derecha, y = adelante
   */
  getMoveAxis() {
    let x = (this.isDown('KeyD') ? 1 : 0) - (this.isDown('KeyA') ? 1 : 0);
    let y = (this.isDown('KeyW') ? 1 : 0) - (this.isDown('KeyS') ? 1 : 0);

    if (this.touch?.enabled) {
      x += this.touch.move.x;
      y += -this.touch.move.y;
    }

    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  /** Devuelve el desplazamiento acumulado del ratón y lo reinicia. */
  consumeLook() {
    let dx = this.mouse.dx;
    let dy = this.mouse.dy;

    if (this.touch?.enabled) {
      const t = this.touch.consumeLook();
      dx += t.dx / this.sensitivity;
      dy += t.dy / this.sensitivity;
    }

    this.mouse.dx = 0;
    this.mouse.dy = 0;
    return { dx: dx * this.sensitivity, dy: dy * this.sensitivity * (this.invertY ? -1 : 1) };
  }

  endFrame() {
    this.pressed.clear();
    this.mousePressed.clear();
    this._virtualFirePressed = false;
    this._virtualJump = false;
    this._virtualReload = false;
    this._virtualShop = false;
  }
}