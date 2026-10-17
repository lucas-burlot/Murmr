// uiohook keycode <-> key name, and which keys make sensible hotkeys.
// Display labels are translated in shared/i18n.ts (keyLabel).

import { UiohookKey } from 'uiohook-napi';
import type { Hotkey } from '../shared/types';

const NAME_BY_CODE = new Map<number, string>(
  Object.entries(UiohookKey).map(([name, code]) => [code as number, name]),
);

export function keyName(keycode: number): string {
  return NAME_BY_CODE.get(keycode) ?? `Key ${keycode}`;
}

// Keys that type a character would still be typed (we don't swallow events),
// so only modifiers and function-style keys are accepted.
const ALLOWED = /^(Ctrl|Alt|Meta|Shift)(Right)?$|^F([1-9]|1\d|2[0-4])$|^(Insert|ScrollLock|Pause|PrintScreen)$/;

export function isAllowedHotkey(keycode: number): boolean {
  const name = NAME_BY_CODE.get(keycode);
  return !!name && ALLOWED.test(name);
}

export function defaultHotkey(): Hotkey {
  // Fn is not exposed to apps on Windows/Linux (and unreliably on macOS):
  // default to a right-hand modifier that is rarely used on its own.
  const keycode = process.platform === 'darwin' ? UiohookKey.AltRight : UiohookKey.CtrlRight;
  return { keycode, name: keyName(keycode) };
}
