/** Pantallas de menú, pausa y fin de partida. */

export class Screens {
  constructor({ onStart, onResume, onQuit, onRetry }) {
    this.menu = document.getElementById('menu');
    this.pause = document.getElementById('pause');
    this.gameover = document.getElementById('gameover');

    this.el = {
      pauseStats: document.getElementById('pause-stats'),
      overStats: document.getElementById('over-stats'),
      quality: document.getElementById('opt-quality'),
      sens: document.getElementById('opt-sens'),
      volume: document.getElementById('opt-volume'),
      btnStart: document.getElementById('btn-start'),
      btnResume: document.getElementById('btn-resume'),
      btnQuit: document.getElementById('btn-quit'),
      btnRetry: document.getElementById('btn-retry'),
    };

    this._handlers = { onStart, onResume, onQuit, onRetry };

    this.el.btnStart.addEventListener('click', () => this._handlers.onStart?.());
    this.el.btnResume.addEventListener('click', () => this._handlers.onResume?.());
    this.el.btnQuit.addEventListener('click', () => this._handlers.onQuit?.());
    this.el.btnRetry.addEventListener('click', () => this._handlers.onRetry?.());

    // Opciones del menú principal.
    this.el.quality.addEventListener('change', (e) => {
      this._handlers.onQualityChange?.(e.target.value);
    });
    this.el.sens.addEventListener('input', (e) => {
      this._handlers.onSensChange?.(Number(e.target.value));
    });
    this.el.volume.addEventListener('input', (e) => {
      this._handlers.onVolumeChange?.(Number(e.target.value) / 100);
    });
  }

  hideAll() {
    this.menu.classList.add('hidden');
    this.pause.classList.add('hidden');
    this.gameover.classList.add('hidden');
  }

  showMenu() {
    this.hideAll();
    this.menu.classList.remove('hidden');
  }

  showPause(stats) {
    this.el.pauseStats.innerHTML = this._renderStats(stats);
    this.pause.classList.remove('hidden');
  }

  hidePause() {
    this.pause.classList.add('hidden');
  }

  showGameOver(stats) {
    this.el.overStats.innerHTML = this._renderStats(stats);
    this.gameover.classList.remove('hidden');
  }

  _renderStats(s) {
    return `
      <div class="stat-box"><span>Oleada</span><b>${s.round}</b></div>
      <div class="stat-box blood"><span>Bajas</span><b>${s.kills}</b></div>
      <div class="stat-box gold"><span>Puntos</span><b>${s.points.toLocaleString('es-ES')}</b></div>
      <div class="stat-box"><span>Tiempo</span><b>${s.time}</b></div>
      <div class="stat-box wide"><span>Arma final</span><b>${s.weapon} · Nv.${s.weaponLevel}</b></div>
    `;
  }
}