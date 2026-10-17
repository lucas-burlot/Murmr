import { describe, expect, it } from 'vitest';
import { ESCAPE_KEYCODE, HotkeyMachine } from '../src/main/hotkey';
import type { DictationMode } from '../src/shared/types';

const HOTKEY = 3640; // AltRight
const OTHER = 18; // E

function machine(mode: DictationMode) {
  const events: string[] = [];
  const m = new HotkeyMachine(HOTKEY, mode, {
    start: () => events.push('start'),
    stop: () => events.push('stop'),
    cancel: () => events.push('cancel'),
  });
  return { m, events };
}

describe('hold mode', () => {
  it('starts on press, ignores auto-repeat, stops on release', () => {
    const { m, events } = machine('hold');
    for (let i = 0; i < 5; i++) m.keydown(HOTKEY);
    m.keyup(HOTKEY);
    expect(events).toEqual(['start', 'stop']);
  });

  it('cancels when another key is pressed (shortcut such as Option+E)', () => {
    const { m, events } = machine('hold');
    m.keydown(HOTKEY);
    m.keydown(OTHER);
    m.keyup(OTHER);
    m.keyup(HOTKEY);
    expect(events).toEqual(['start', 'cancel']);
  });

  it('cancels with Escape', () => {
    const { m, events } = machine('hold');
    m.keydown(HOTKEY);
    m.keydown(ESCAPE_KEYCODE);
    m.keyup(HOTKEY);
    expect(events).toEqual(['start', 'cancel']);
  });

  it('ignores other keys while idle', () => {
    const { m, events } = machine('hold');
    m.keydown(OTHER);
    m.keydown(ESCAPE_KEYCODE);
    expect(events).toEqual([]);
  });
});

describe('toggle mode', () => {
  it('starts on first press and stops on second, letting the user type in between', () => {
    const { m, events } = machine('toggle');
    m.keydown(HOTKEY);
    m.keyup(HOTKEY);
    m.keydown(OTHER);
    m.keydown(HOTKEY);
    m.keyup(HOTKEY);
    expect(events).toEqual(['start', 'stop']);
  });

  it('reconfigure resets the state', () => {
    const { m, events } = machine('toggle');
    m.keydown(HOTKEY);
    m.configure(3613, 'hold');
    m.keydown(3613);
    m.keyup(3613);
    expect(events).toEqual(['start', 'start', 'stop']);
  });
});
