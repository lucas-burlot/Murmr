// Types and IPC channel names shared by the main process, preload and renderers.

import type { Lang, MessageKey } from './i18n';
import type { LocalModelId } from './models';

export interface Hotkey {
  keycode: number; // uiohook-napi keycode
  name: string; // uiohook-napi key name ("AltRight", "F8"...), translated for display
}

export type DictationMode = 'hold' | 'toggle';

/** Where Whisper runs: Groq's servers, or this computer (whisper.cpp). */
export type Engine = 'cloud' | 'local';

export interface Settings {
  engine: Engine;
  localModel: LocalModelId;
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
  /** 16 kHz mono signed 16-bit PCM, only produced for the local engine. */
  pcm16?: ArrayBuffer;
}

export type OverlayCommand =
  | { type: 'start'; deviceId: string; sounds: boolean; pcm: boolean }
  | { type: 'stop' }
  | { type: 'cancel' };

export type PermissionStatus = 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown';

export interface Permissions {
  platform: string;
  microphone: PermissionStatus;
  accessibility: boolean;
  keyboardHookRunning: boolean;
  /** Started with `npm start`: macOS grants Accessibility to the terminal that launched it. */
  devMode: boolean;
}

export type CaptureResult =
  | { ok: true; hotkey: Hotkey }
  | { ok: false; reason: 'cancelled' | 'notAllowed' | 'hookInactive'; keyName?: string };

export interface TestResult {
  ok: boolean;
  messageKey: MessageKey;
  detail?: string;
}

export interface LocalModelStatus {
  id: LocalModelId;
  sizeMb: number;
  downloaded: boolean;
}

export interface ModelProgress {
  id: LocalModelId;
  received: number;
  total: number;
  state: 'downloading' | 'done' | 'cancelled' | 'error';
  error?: string;
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
  models: {
    list(): Promise<LocalModelStatus[]>;
    download(id: LocalModelId): Promise<void>;
    cancel(id: LocalModelId): Promise<void>;
    remove(id: LocalModelId): Promise<void>;
    onProgress(cb: (p: ModelProgress) => void): Unsubscribe;
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
  modelsList: 'models:list',
  modelsDownload: 'models:download',
  modelsCancel: 'models:cancel',
  modelsRemove: 'models:remove',
  modelsProgress: 'models:progress',
  openExternal: 'app:open-external',
  copy: 'app:copy',
  overlayCommand: 'overlay:command',
  overlayRecording: 'overlay:recording',
  overlayError: 'overlay:error',
} as const;
