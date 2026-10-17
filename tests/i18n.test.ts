import { describe, expect, it } from 'vitest';
import { isLang, keyLabel, translate } from '../src/shared/i18n';

describe('translate', () => {
  it('uses English by default and French on demand', () => {
    expect(translate('en', 'nav.settings')).toBe('Settings');
    expect(translate('fr', 'nav.settings')).toBe('Réglages');
  });

  it('interpolates variables and keeps unknown placeholders', () => {
    expect(translate('en', 'tray.hotkey', { key: 'F8' })).toBe('Shortcut: F8');
    expect(translate('fr', 'error.micUnavailable', { detail: 'occupé' })).toBe('Micro indisponible : occupé');
    expect(translate('en', 'home.title.hold')).toBe('Hold {key} and speak.');
  });
});

describe('keyLabel', () => {
  it('names keys per platform and language', () => {
    expect(keyLabel('AltRight', 'darwin', 'en')).toBe('Right Option');
    expect(keyLabel('AltRight', 'win32', 'en')).toBe('Right Alt');
    expect(keyLabel('AltRight', 'darwin', 'fr')).toBe('Option droite');
    expect(keyLabel('CtrlRight', 'linux', 'fr')).toBe('Ctrl droit');
    expect(keyLabel('F8', 'linux', 'fr')).toBe('F8');
  });
});

it('validates stored languages', () => {
  expect(isLang('fr')).toBe(true);
  expect(isLang('de')).toBe(false);
});
