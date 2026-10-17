// Push-to-talk / toggle state machine fed with raw key events.
// No Electron or native imports: unit-testable.

import type { DictationMode } from '../shared/types';

export const ESCAPE_KEYCODE = 1; // uiohook-napi UiohookKey.Escape

export interface HotkeyCallbacks {
  start(): void;
  stop(): void;
  cancel(): void;
}

export class HotkeyMachine {
  private held = false; // physical key state, used to ignore OS auto-repeat
  private active = false; // currently dictating

  constructor(
    private keycode: number,
    private mode: DictationMode,
    private readonly cb: HotkeyCallbacks,
  ) {}

  configure(keycode: number, mode: DictationMode): void {
    this.keycode = keycode;
    this.mode = mode;
    this.reset();
  }

  reset(): void {
    this.held = false;
    this.active = false;
  }

  keydown(code: number): void {
    if (code === ESCAPE_KEYCODE && this.active) {
      this.active = false;
      this.cb.cancel();
      return;
    }
    if (code !== this.keycode) {
      // Holding the hotkey and pressing another key means the user is typing a
      // shortcut (e.g. Option+E for "é"), not dictating.
      if (this.mode === 'hold' && this.active) {
        this.active = false;
        this.cb.cancel();
      }
      return;
    }
    if (this.held) return;
    this.held = true;
    if (this.mode === 'toggle') {
      this.active = !this.active;
      if (this.active) this.cb.start();
      else this.cb.stop();
    } else if (!this.active) {
      this.active = true;
      this.cb.start();
    }
  }

  keyup(code: number): void {
    if (code !== this.keycode) return;
    this.held = false;
    if (this.mode === 'hold' && this.active) {
      this.active = false;
      this.cb.stop();
    }
  }
}
