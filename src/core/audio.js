/**
 * Motor de audio 100% procedural con WebAudio.
 * No carga ningún fichero externo: todos los efectos se sintetizan,
 * así que el juego arranca sin descargas ni rutas que configurar.
 */
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = 0.7;
    this.noiseBuffer = null;
    this.ready = false;
    this._lastShot = 0;
  }

  /** Debe llamarse desde un gesto del usuario (política de autoplay). */
  init() {
    if (this.ready) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;

    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;

    // Compresor para que las ráfagas de la minigun no saturen.
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 22;
    comp.ratio.value = 9;
    comp.attack.value = 0.003;
    comp.release.value = 0.22;

    this.master.connect(comp);
    comp.connect(this.ctx.destination);

    this.noiseBuffer = this._makeNoise(1.4);
    this.ready = true;
  }

  resume() {
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  _makeNoise(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** Raíz cuadrada reutilizable: inicia un buffer de ruido ya conectado. */
  _noiseSource(playbackRate = 1) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    src.playbackRate.value = playbackRate;
    return src;
  }

  /** Oscilador de tono con envolvente ADSR simplificada. */
  _tone({ freq = 220, type = 'sine', dur = 0.2, gain = 0.3, sweepTo = null, delay = 0 }) {
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (sweepTo !== null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), t0 + dur);
    }

    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
    return osc;
  }

  /** Explosión de ruido filtrada: la base de todos los disparos. */
  _burst({ dur = 0.15, gain = 0.5, cutoff = 2200, q = 1, type = 'lowpass', decay = null, delay = 0 }) {
    const t0 = this.ctx.currentTime + delay;
    const src = this._noiseSource(1);
    const filter = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();

    filter.type = type;
    filter.frequency.setValueAtTime(cutoff, t0);
    filter.Q.value = q;
    if (decay !== null) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(60, decay), t0 + dur);
    }

    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  // ───────────────────── Sonidos del juego ─────────────────────

  /** Disparo. El timbre cambia por arma: grave y seco para la pistola, agudo para la SMG. */
  gunshot(kind = 'pistol') {
    if (!this.ready) return;
    const now = this.ctx.currentTime;

    // Evita apilar 30 disparos del minigun en el mismo sample.
    if (now - this._lastShot < 0.012) return;
    this._lastShot = now;

    switch (kind) {
      case 'shotgun':
        this._burst({ dur: 0.42, gain: 0.85, cutoff: 3400, decay: 260, q: 0.7 });
        this._tone({ freq: 130, type: 'square', dur: 0.22, gain: 0.4, sweepTo: 42 });
        break;
      case 'smg':
        this._burst({ dur: 0.09, gain: 0.42, cutoff: 5200, decay: 900, q: 1.4 });
        this._tone({ freq: 320, type: 'square', dur: 0.05, gain: 0.2, sweepTo: 110 });
        break;
      case 'rifle':
        this._burst({ dur: 0.17, gain: 0.6, cutoff: 4200, decay: 420, q: 1.1 });
        this._tone({ freq: 190, type: 'sawtooth', dur: 0.11, gain: 0.28, sweepTo: 55 });
        break;
      case 'minigun':
        this._burst({ dur: 0.07, gain: 0.34, cutoff: 5800, decay: 1300, q: 1.6 });
        this._tone({ freq: 280, type: 'square', dur: 0.04, gain: 0.15, sweepTo: 130 });
        break;
      default: // pistola
        this._burst({ dur: 0.16, gain: 0.55, cutoff: 3000, decay: 320, q: 1.2 });
        this._tone({ freq: 215, type: 'square', dur: 0.1, gain: 0.3, sweepTo: 62 });
    }
  }

  /** Impacto en carne: chasquido húmedo. */
  fleshHit() {
    if (!this.ready) return;
    this._burst({ dur: 0.09, gain: 0.3, cutoff: 900, decay: 180, type: 'bandpass', q: 1.2 });
    this._tone({ freq: 150, type: 'triangle', dur: 0.07, gain: 0.18, sweepTo: 70 });
  }

  /** Impacto en el escenario (muros, cajas). */
  surfaceHit() {
    if (!this.ready) return;
    this._burst({ dur: 0.05, gain: 0.16, cutoff: 6000, decay: 1600, type: 'highpass' });
  }

  /** Muerte de zombie: gemido descendente. */
  zombieDie() {
    if (!this.ready) return;
    const f = 170 + Math.random() * 120;
    this._tone({ freq: f, type: 'sawtooth', dur: 0.55, gain: 0.16, sweepTo: f * 0.25 });
    this._burst({ dur: 0.3, gain: 0.16, cutoff: 700, decay: 120, type: 'bandpass', q: 0.9 });
  }

  /** Gemido ambiente de un zombie que ha visto al jugador. */
  groan() {
    if (!this.ready) return;
    const f = 90 + Math.random() * 70;
    this._tone({ freq: f, type: 'sawtooth', dur: 0.85, gain: 0.055, sweepTo: f * 1.5 });
  }

  /** El jugador recibe daño. */
  hurt() {
    if (!this.ready) return;
    this._burst({ dur: 0.26, gain: 0.5, cutoff: 500, decay: 90 });
    this._tone({ freq: 90, type: 'sine', dur: 0.3, gain: 0.34, sweepTo: 38 });
  }

  /** Recarga: dos clics metálicos. */
  reload() {
    if (!this.ready) return;
    this._burst({ dur: 0.05, gain: 0.26, cutoff: 3200, decay: 1200, type: 'bandpass', q: 3 });
    this._burst({ dur: 0.07, gain: 0.3, cutoff: 2000, decay: 700, type: 'bandpass', q: 3, delay: 0.18 });
  }

  /** Cargador vacío: clic seco. */
  dryFire() {
    if (!this.ready) return;
    this._burst({ dur: 0.04, gain: 0.2, cutoff: 2600, decay: 900, type: 'bandpass', q: 4 });
  }

  /** Compra realizada en la tienda. */
  purchase() {
    if (!this.ready) return;
    this._tone({ freq: 520, type: 'triangle', dur: 0.1, gain: 0.22 });
    this._tone({ freq: 780, type: 'triangle', dur: 0.14, gain: 0.22, delay: 0.08 });
    this._tone({ freq: 1040, type: 'triangle', dur: 0.2, gain: 0.16, delay: 0.16 });
  }

  /** Compra rechazada por falta de puntos. */
  denied() {
    if (!this.ready) return;
    this._tone({ freq: 200, type: 'square', dur: 0.13, gain: 0.2 });
    this._tone({ freq: 140, type: 'square', dur: 0.2, gain: 0.2, delay: 0.1 });
  }

  /** Cambiar de arma. */
  swap() {
    if (!this.ready) return;
    this._burst({ dur: 0.07, gain: 0.2, cutoff: 2400, decay: 800, type: 'bandpass', q: 2.5 });
  }

  /** Comienza una oleada: sirena corta. */
  roundStart() {
    if (!this.ready) return;
    this._tone({ freq: 330, type: 'sawtooth', dur: 0.5, gain: 0.16, sweepTo: 240 });
    this._tone({ freq: 495, type: 'sawtooth', dur: 0.6, gain: 0.14, sweepTo: 360, delay: 0.22 });
  }

  /** Oleada superada: acorde ascendente. */
  roundClear() {
    if (!this.ready) return;
    [392, 494, 587, 784].forEach((f, i) => {
      this._tone({ freq: f, type: 'triangle', dur: 0.42, gain: 0.16, delay: i * 0.09 });
    });
  }

  /** Cuenta atrás final del intervalo. */
  countdownTick(urgent = false) {
    if (!this.ready) return;
    this._tone({
      freq: urgent ? 880 : 660,
      type: 'square',
      dur: 0.08,
      gain: urgent ? 0.22 : 0.13,
    });
  }

  /** Muerte del jugador. */
  death() {
    if (!this.ready) return;
    this._tone({ freq: 220, type: 'sawtooth', dur: 1.6, gain: 0.3, sweepTo: 28 });
    this._burst({ dur: 1.4, gain: 0.28, cutoff: 800, decay: 60 });
  }

  /** Saturación de oleada (respiración de la horda). */
  hordeRoar(intensity = 1) {
    if (!this.ready) return;
    this._tone({ freq: 58, type: 'sawtooth', dur: 1.5, gain: 0.1 * intensity, sweepTo: 88 });
    this._burst({ dur: 1.3, gain: 0.08 * intensity, cutoff: 380, type: 'bandpass', q: 0.6 });
  }
}