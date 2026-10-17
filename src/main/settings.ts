// Settings persisted as JSON in the user data folder. The API key is encrypted
// with the OS keychain (safeStorage) when available.

import { app, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { isLang } from '../shared/i18n';
import type { Settings } from '../shared/types';
import { DEFAULT_BASE_URL } from './groq';
import { defaultHotkey } from './keys';

const file = () => path.join(app.getPath('userData'), 'settings.json');

export function defaultSettings(): Settings {
  return {
    apiKey: '',
    baseUrl: DEFAULT_BASE_URL,
    transcriptionModel: 'whisper-large-v3',
    language: '', // auto-detect
    cleanupEnabled: true,
    cleanupModel: 'openai/gpt-oss-20b',
    hotkey: defaultHotkey(),
    mode: 'hold',
    dictionary: [],
    sounds: true,
    restoreClipboard: true,
    microphoneId: '',
    openAtLogin: false,
    uiLanguage: 'en',
  };
}

type Stored = Omit<Settings, 'apiKey'> & { apiKey?: string; apiKeyEncrypted?: string };

export function loadSettings(): Settings {
  const defaults = defaultSettings();
  let stored: Partial<Stored> = {};
  try {
    stored = JSON.parse(fs.readFileSync(file(), 'utf8'));
  } catch {
    return defaults; // first launch or unreadable file
  }
  const { apiKeyEncrypted, apiKey, ...rest } = stored;
  let key = apiKey ?? '';
  if (apiKeyEncrypted && safeStorage.isEncryptionAvailable()) {
    try {
      key = safeStorage.decryptString(Buffer.from(apiKeyEncrypted, 'base64'));
    } catch {
      key = '';
    }
  }
  const known = Object.fromEntries(Object.entries(rest).filter(([k]) => k in defaults)) as Partial<Settings>;
  const settings = { ...defaults, ...known, apiKey: key };
  if (!settings.hotkey?.name) settings.hotkey = defaults.hotkey;
  if (!isLang(settings.uiLanguage)) settings.uiLanguage = defaults.uiLanguage;
  return settings;
}

export function saveSettings(settings: Settings): void {
  const { apiKey, ...rest } = settings;
  const stored: Stored = safeStorage.isEncryptionAvailable()
    ? { ...rest, apiKeyEncrypted: safeStorage.encryptString(apiKey).toString('base64') }
    : { ...rest, apiKey };
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(stored, null, 2), { encoding: 'utf8', mode: 0o600 });
}
