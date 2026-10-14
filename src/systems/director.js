import { ROUND } from '../config.js';
import { clamp } from '../core/math.js';

/**
 * Director de oleadas.
 *
 * Bucle: OLEADA (aparición progresiva) -> INTERVALO de 25 s con la tienda
 * abierta -> siguiente oleada. La dificultad crece por oleada, no por minuto.
 */
export class Director {
  constructor({ zombies, audio, onEvent }) {
    this.zombies = zombies;
    this.audio = audio;
    this.onEvent = onEvent; // (tipo, datos) => void

    this.round = 0;
    this.state = 'idle'; // idle | round | intermission
    this.timer = 0;

    this.totalThisRound = 0;
    this.spawnedThisRound = 0;
    this.killedThisRound = 0;
    this.spawnTimer = 0;
    this.batchSize = 1;

    this.totalKills = 0;
    this._countdownBeep = -1;
  }

  reset() {
    this.round = 0;
    this.state = 'idle';
    this.timer = 0;
    this.totalThisRound = 0;
    this.spawnedThisRound = 0;
    this.killedThisRound = 0;
    this.spawnTimer = 0;
    this.totalKills = 0;
    this._countdownBeep = -1;
  }

  /** Enemigos totales de una oleada. */
  static countForRound(round) {
    const raw = ROUND.baseCount + (round - 1) * ROUND.countPerRound;
    const grown = raw * Math.pow(ROUND.countGrowth, Math.max(0, round - 1) * 0.35);
    return Math.round(Math.min(ROUND.countCap, grown));
  }

  /** Duración del intervalo entre oleadas, en segundos. */
  static get intermissionTime() {
    return ROUND.intermission;
  }

  // ───────────────────── Ciclo de juego ─────────────────────

  startRound() {
    this.round += 1;
    this.state = 'round';
    this.totalThisRound = Director.countForRound(this.round);
    this.spawnedThisRound = 0;
    this.killedThisRound = 0;

    this.spawnTimer = 0.8;
    this.batchSize = Math.min(
      ROUND.batchCap,
      Math.round(ROUND.batchBase * Math.pow(ROUND.batchGrowth, this.round - 1)),
    );

    this.onEvent?.('roundStart', { round: this.round, total: this.totalThisRound });
    this.audio?.roundStart();
    if (this.round > 1) this.audio?.hordeRoar(clamp(this.round / 12, 0.3, 1));
  }

  startIntermission() {
    this.state = 'intermission';
    this.timer = ROUND.intermission;
    this._countdownBeep = -1;

    const bonus = ROUND.clearBonus + ROUND.clearBonusPerRound * (this.round - 1);
    this.onEvent?.('roundClear', {
      round: this.round,
      bonus,
      kills: this.killedThisRound,
    });
    this.audio?.roundClear();
  }

  onKill() {
    this.killedThisRound += 1;
    this.totalKills += 1;
  }

  get remaining() {
    return this.totalThisRound - this.spawnedThisRound;
  }

  update(dt) {
    if (this.state === 'round') {
      this._updateRound(dt);
    } else if (this.state === 'intermission') {
      this._updateIntermission(dt);
    }
  }

  _updateRound(dt) {
    // Aparición progresiva en tandas.
    if (this.spawnedThisRound < this.totalThisRound) {
      this.spawnTimer -= dt;

      // Cuantos quedan y cuántos pueden aparecer a la vez sin saturar.
      const alive = this.zombies.aliveCount;
      const headroom = Math.min(
        this.batchSize,
        Math.ceil(Director.countForRound(this.round) * 0.42),
        80 - alive,
      );

      if (this.spawnTimer <= 0 && headroom > 0) {
        for (let i = 0; i < headroom; i++) {
          if (this.spawnedThisRound >= this.totalThisRound) break;
          this.zombies.spawn(this.round);
          this.spawnedThisRound += 1;
        }

        const pressure = this.spawnedThisRound / this.totalThisRound;
        const interval = Math.max(
          ROUND.spawnIntervalMin,
          ROUND.spawnIntervalBase * Math.pow(0.9, (this.round - 1) * 0.45),
        );
        this.spawnTimer = interval * (1 - pressure * 0.3);
      }
    } else if (this.zombies.aliveCount === 0) {
      // Todos aparecidos y todos muertos: la oleada termina.
      this.startIntermission();
    }
  }

  _updateIntermission(dt) {
    this.timer -= dt;

    // Últimos Pitidos de cuenta atrás.
    const whole = Math.ceil(this.timer);
    if (whole !== this._countdownBeep && whole > 0 && whole <= 5) {
      this._countdownBeep = whole;
      this.audio?.countdownTick(true);
    }

    if (this.timer <= 0) {
      this.timer = 0;
      this.startRound();
    }
  }

  get isIntermission() {
    return this.state === 'intermission';
  }
}