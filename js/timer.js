// Pomodoro state machine. Emits DOM events so the UI layer can stay dumb:
// 'tick' (time changed), 'statechange' (running/paused), 'modechange' (session
// switched focus/short/long), 'complete' (a session just hit zero).

export class PomodoroTimer extends EventTarget {
  constructor(settings) {
    super();
    this.settings = settings;
    this.mode = 'focus'; // 'focus' | 'short' | 'long'
    this.completedFocusSessions = 0;
    this.total = this._durationFor(this.mode);
    this.remaining = this.total;
    this.running = false;
    this._intervalId = null;
    this._last = 0;
  }

  updateSettings(settings) {
    this.settings = settings;
    if (!this.running) {
      this.total = this._durationFor(this.mode);
      this.remaining = this.total;
      this._emit('tick');
    }
  }

  _durationFor(mode) {
    if (mode === 'focus') return this.settings.focusMin * 60;
    if (mode === 'short') return this.settings.shortBreakMin * 60;
    return this.settings.longBreakMin * 60;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._last = Date.now();
    this._intervalId = setInterval(() => this._tick(), 250);
    this._emit('statechange');
  }

  pause() {
    if (!this.running) return;
    this.running = false;
    clearInterval(this._intervalId);
    this._intervalId = null;
    this._emit('statechange');
  }

  reset() {
    this.pause();
    this.total = this._durationFor(this.mode);
    this.remaining = this.total;
    this._emit('tick');
  }

  skip() {
    this._advance();
  }

  restartSessionCount() {
    this.pause();
    this.completedFocusSessions = 0;
    this.mode = 'focus';
    this.total = this._durationFor(this.mode);
    this.remaining = this.total;
    this._emit('modechange');
    this._emit('tick');
  }

  _tick() {
    const now = Date.now();
    const delta = (now - this._last) / 1000;
    this._last = now;
    this.remaining = Math.max(0, this.remaining - delta);
    this._emit('tick');
    if (this.remaining <= 0) {
      this.pause();
      this._emit('complete', { mode: this.mode });
      this._advance();
    }
  }

  _advance() {
    this.pause();
    if (this.mode === 'focus') {
      this.completedFocusSessions++;
      const everyN = Math.max(1, this.settings.sessionsBeforeLongBreak);
      this.mode = this.completedFocusSessions % everyN === 0 ? 'long' : 'short';
    } else {
      this.mode = 'focus';
    }
    this.total = this._durationFor(this.mode);
    this.remaining = this.total;
    this._emit('modechange');
    this._emit('tick');
  }

  _emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail }));
  }
}
