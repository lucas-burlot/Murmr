// Types and IPC channel names shared by the main process, preload and renderers.

import type { Lang, MessageKey } from './i18n';

export interface Hotkey {
  keycode: number; // uiohook-napi keycode
  name: string; // uiohook-napi key name ("AltRight", "F8"...), translated for display
}

export type DictationMode = 'hold' | 'toggle';

export interface Settings {
  apiKey: string;
  baseUrl: string;
  transcriptionModel: string;
  language: string; // ISO-639-1, '' = auto-detect
  cleanupEnabled: boolean;
  cleanupModel: string;
  hotkey: Hotkey;
  mode: DictationMode;
  dictionary: string[];
  sounds: boolean;
  restoreClipboard: boolean;
  microphoneId: string; // '' = system default
  openAtLogin: boolean;
  uiLanguage: Lang;
}

export interface HistoryEntry {
  id: string;
  createdAt: number;
  raw: string; // Whisper output
  text: string; // what was pasted
  cleaned: boolean;
  durationMs: number;
}

export type DictationState =
  | 'idle'
  | 'recording'
  | 'transcribing'
  | 'cleaning'
  | 'done'
  | 'empty'
  | 'cancelled'
  | 'error';

export interface StateEvent {
  state: DictationState;
  messageKey?: MessageKey;
  detail?: string;
  sounds: boolean;
  lang: Lang;
}

export interface RecordingPayload {
  audio: ArrayBuffer;
  mimeType: string;
  durationMs: number;
  peakRms: number; // 0..1, loudest analysis frame
}

export type OverlayCommand =
  | { type: 'start'; deviceId: string; sounds: boolean }
  | { type: 'stop' }
  | { type: 'cancel' };

export type PermissionStatus = 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown';

export interface Permissions {
  platform: string;
  microphone: PermissionStatus;
  accessibility: boolean;
  keyboardHookRunning: boolean;
}

export type CaptureResult =
  | { ok: true; hotkey: Hotkey }
  | { ok: false; reason: 'cancelled' | 'notAllowed' | 'hookInactive'; keyName?: string };

export interface TestResult {
  ok: boolean;
  messageKey: MessageKey;
  detail?: string;
}

type Unsubscribe = () => void;

/** API exposed on `window.murmr` by the preload script. */
export interface MurmrAPI {
  platform: string;
  settings: {
    get(): Promise<Settings>;
    set(patch: Partial<Settings>): Promise<Settings>;
    onChange(cb: (s: Settings) => void): Unsubscribe;
  };
  history: {
    get(): Promise<HistoryEntry[]>;
    remove(id: string): Promise<void>;
    clear(): Promise<void>;
    onChange(cb: (entries: HistoryEntry[]) => void): Unsubscribe;
  };
  state: {
    onChange(cb: (e: StateEvent) => void): Unsubscribe;
  };
  testApiKey(apiKey: string, baseUrl: string): Promise<TestResult>;
  captureHotkey(): Promise<CaptureResult>;
  permissions: {
    get(): Promise<Permissions>;
    request(kind: 'microphone' | 'accessibility'): Promise<Permissions>;
    onChange(cb: (p: Permissions) => void): Unsubscribe;
  };
  openExternal(url: string): Promise<void>;
  copy(text: string): Promise<void>;
  overlay: {
    onCommand(cb: (c: OverlayCommand) => void): Unsubscribe;
    sendRecording(payload: RecordingPayload): Promise<void>;
    reportError(messageKey: MessageKey, detail?: string): void;
  };
}

export const IPC = {
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  settingsChanged: 'settings:changed',
  historyGet: 'history:get',
  historyRemove: 'history:remove',
  historyClear: 'history:clear',
  historyChanged: 'history:changed',
  stateChanged: 'state:changed',
  testApiKey: 'groq:test',
  captureHotkey: 'hotkey:capture',
  permissionsGet: 'permissions:get',
  permissionsRequest: 'permissions:request',
  permissionsChanged: 'permissions:changed',
  openExternal: 'app:open-external',
  copy: 'app:copy',
  overlayCommand: 'overlay:command',
  overlayRecording: 'overlay:recording',
  overlayError: 'overlay:error',
} as const;
