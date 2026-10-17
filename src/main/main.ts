import {
  app,
  BrowserWindow,
  clipboard,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  session,
  shell,
  systemPreferences,
  Tray,
} from 'electron';
import path from 'node:path';
import { uIOhook } from 'uiohook-napi';
import { keyLabel, translate, type MessageKey, type Vars } from '../shared/i18n';
import type { LocalModelId } from '../shared/models';
import {
  IPC,
  type CaptureResult,
  type DictationState,
  type OverlayCommand,
  type Permissions,
  type PermissionStatus,
  type RecordingPayload,
  type Settings,
} from '../shared/types';
import { processRecording } from './dictation';
import * as groq from './groq';
import { HistoryStore } from './history';
import { ESCAPE_KEYCODE, HotkeyMachine } from './hotkey';
import { isAllowedHotkey, keyName } from './keys';
import { LocalWhisper } from './local-whisper';
import { ModelManager } from './models';
import { pasteText } from './paste';
import { loadSettings, saveSettings } from './settings';

const isMac = process.platform === 'darwin';
const RENDERER = path.join(__dirname, '../renderer');
const PRELOAD = path.join(__dirname, '../preload/preload.js');
const RESOURCES = app.isPackaged ? process.resourcesPath : path.join(__dirname, '../../resources');

const OVERLAY_SIZE = { width: 360, height: 72 };
const HIDE_DELAY_MS: Partial<Record<DictationState, number>> = {
  done: 700,
  empty: 1200,
  cancelled: 700,
  error: 3500,
};

let settings: Settings;
let history: HistoryStore;
let mainWindow: BrowserWindow | null = null;
let overlay: BrowserWindow;
let tray: Tray;
let state: DictationState = 'idle';
let hideTimer: NodeJS.Timeout | undefined;
let keyboardHookRunning = false;
let captureResolver: ((r: CaptureResult) => void) | null = null;
let models: ModelManager;
const localWhisper = new LocalWhisper();

const hotkeys = new HotkeyMachine(0, 'hold', {
  start: startDictation,
  stop: stopDictation,
  cancel: cancelDictation,
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showMainWindow());
  app.whenReady().then(init);
}

function init(): void {
  settings = loadSettings();
  history = new HistoryStore(path.join(app.getPath('userData'), 'history.json'), (entries) =>
    broadcast(IPC.historyChanged, entries),
  );
  hotkeys.configure(settings.hotkey.keycode, settings.mode);
  models = new ModelManager(path.join(app.getPath('userData'), 'models'), (progress) => {
    broadcast(IPC.modelsProgress, progress);
    if (progress.state === 'done') prepareLocalEngine();
  });

  // Only our own local pages are loaded; let them use the microphone.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === 'media'));
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === 'media');

  if (isMac) {
    // Packaged builds use icon.icns; in development the generic Electron.app runs, so set it here.
    if (!app.isPackaged) app.dock?.setIcon(path.join(__dirname, '../../build/icon.png'));
    app.dock?.hide(); // live in the menu bar; the dock icon appears with the main window
    Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }]));
  } else {
    Menu.setApplicationMenu(null);
  }

  registerIpc();
  createOverlay();
  createTray();
  startKeyboardHook();
  if (!keyboardHookRunning) {
    // macOS: the hook needs the Accessibility permission; start as soon as it is granted.
    const timer = setInterval(() => {
      startKeyboardHook();
      if (keyboardHookRunning) clearInterval(timer);
    }, 2000);
  }

  if (isMac && systemPreferences.getMediaAccessStatus('microphone') === 'not-determined') {
    void systemPreferences.askForMediaAccess('microphone');
  }
  prepareLocalEngine();
  if (!engineReady() || !keyboardHookRunning) showMainWindow();
}

// --- transcription engine ------------------------------------------------------

function engineReady(): boolean {
  return settings.engine === 'local' ? models.isDownloaded(settings.localModel) : !!settings.apiKey;
}

/** Loads the local model ahead of time so the first dictation doesn't wait for it. */
function prepareLocalEngine(): void {
  if (settings.engine !== 'local') {
    void localWhisper.release(); // free memory when using the cloud
    return;
  }
  if (!models.isDownloaded(settings.localModel)) return;
  localWhisper.load(models.path(settings.localModel)).catch((err) => console.error('Local model failed to load', err));
}

app.on('window-all-closed', () => {
  // Keep running in the tray/menu bar.
});

app.on('activate', () => showMainWindow());

app.on('will-quit', () => {
  if (keyboardHookRunning) uIOhook.stop();
});

// --- keyboard hook -----------------------------------------------------------

function accessibilityGranted(): boolean {
  return !isMac || systemPreferences.isTrustedAccessibilityClient(false);
}

function startKeyboardHook(): void {
  if (keyboardHookRunning || !accessibilityGranted()) return;
  uIOhook.on('keydown', (e) => {
    if (captureResolver) return finishCapture(e.keycode);
    hotkeys.keydown(e.keycode);
  });
  uIOhook.on('keyup', (e) => hotkeys.keyup(e.keycode));
  try {
    uIOhook.start();
    keyboardHookRunning = true;
  } catch (err) {
    console.error('Keyboard hook failed to start', err);
    uIOhook.removeAllListeners();
  }
  broadcastPermissions();
  updateTray();
}

function finishCapture(keycode: number): void {
  const resolve = captureResolver!;
  captureResolver = null;
  if (keycode === ESCAPE_KEYCODE) return resolve({ ok: false, reason: 'cancelled' });
  if (!isAllowedHotkey(keycode)) return resolve({ ok: false, reason: 'notAllowed', keyName: keyName(keycode) });
  resolve({ ok: true, hotkey: { keycode, name: keyName(keycode) } });
}

// --- dictation flow ------------------------------------------------------------

function t(key: MessageKey, vars?: Vars): string {
  return translate(settings.uiLanguage, key, vars);
}

function setState(next: DictationState, messageKey?: MessageKey, detail?: string): void {
  state = next;
  clearTimeout(hideTimer);
  broadcast(IPC.stateChanged, { state, messageKey, detail, sounds: settings.sounds, lang: settings.uiLanguage });
  updateTray();
  const delay = HIDE_DELAY_MS[next];
  if (delay !== undefined) {
    hideTimer = setTimeout(() => {
      overlay.hide();
      state = 'idle';
      broadcast(IPC.stateChanged, { state, sounds: settings.sounds, lang: settings.uiLanguage });
      updateTray();
    }, delay);
  }
}

function sendOverlay(command: OverlayCommand): void {
  overlay.webContents.send(IPC.overlayCommand, command);
}

function startDictation(): void {
  if (state === 'recording' || state === 'transcribing' || state === 'cleaning') return;
  if (!engineReady()) {
    showOverlay();
    setState('error', settings.engine === 'local' ? 'error.noLocalModel' : 'error.noApiKey');
    showMainWindow();
    return;
  }
  showOverlay();
  setState('recording');
  sendOverlay({
    type: 'start',
    deviceId: settings.microphoneId,
    sounds: settings.sounds,
    pcm: settings.engine === 'local',
  });
}

function stopDictation(): void {
  if (state !== 'recording') return;
  setState('transcribing');
  sendOverlay({ type: 'stop' }); // the overlay answers with IPC.overlayRecording
}

function cancelDictation(): void {
  if (state !== 'recording') return;
  sendOverlay({ type: 'cancel' });
  setState('cancelled', 'msg.cancelled');
}

async function handleRecording(payload: RecordingPayload): Promise<void> {
  const api = () => ({ apiKey: settings.apiKey, baseUrl: settings.baseUrl });
  await processRecording(payload, {
    getSettings: () => settings,
    transcribe: (rec, s) => {
      if (s.engine === 'local') {
        if (!rec.pcm16) throw new Error('missing PCM audio');
        return localWhisper.transcribe(models.path(s.localModel), rec.pcm16, {
          language: s.language,
          dictionary: s.dictionary,
        });
      }
      return groq.transcribe(api(), new Uint8Array(rec.audio), rec.mimeType, {
        model: s.transcriptionModel,
        language: s.language,
        dictionary: s.dictionary,
      });
    },
    cleanup: (text, s) => groq.cleanup(api(), text, { model: s.cleanupModel, dictionary: s.dictionary }),
    paste: pasteText,
    addHistory: (entry) => history.add(entry),
    setState,
  });
}

// --- windows -------------------------------------------------------------------

function createOverlay(): void {
  overlay = new BrowserWindow({
    ...OVERLAY_SIZE,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false, // never steal focus from the app we will paste into
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    ...(isMac ? { type: 'panel' } : {}),
    webPreferences: { preload: PRELOAD, backgroundThrottling: false, sandbox: true },
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlay.setIgnoreMouseEvents(true);
  void overlay.loadFile(path.join(RENDERER, 'overlay.html'));
}

function showOverlay(): void {
  // Bottom-center of the screen the user is working on.
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  overlay.setBounds({
    x: Math.round(workArea.x + (workArea.width - OVERLAY_SIZE.width) / 2),
    y: Math.round(workArea.y + workArea.height - OVERLAY_SIZE.height - 24),
    ...OVERLAY_SIZE,
  });
  overlay.showInactive();
}

function showMainWindow(): void {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 820,
    minHeight: 560,
    show: false,
    title: 'Murmr',
    icon: path.join(RESOURCES, 'icon.png'),
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    backgroundColor: '#0f1117',
    webPreferences: { preload: PRELOAD, sandbox: true },
  });
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
    if (isMac) app.dock?.hide();
  });
  // External links open in the default browser, never inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  if (isMac) void app.dock?.show();
  void mainWindow.loadFile(path.join(RENDERER, 'index.html'));
}

// --- tray ----------------------------------------------------------------------

function trayImage(recording: boolean): Electron.NativeImage {
  if (isMac) {
    const img = nativeImage.createFromPath(
      path.join(RESOURCES, recording ? 'tray-recording-mac.png' : 'trayTemplate.png'),
    );
    img.setTemplateImage(!recording);
    return img;
  }
  return nativeImage.createFromPath(path.join(RESOURCES, recording ? 'tray-recording.png' : 'tray.png'));
}

function createTray(): void {
  tray = new Tray(trayImage(false));
  if (!isMac) tray.on('click', () => showMainWindow());
  updateTray();
}

function updateTray(): void {
  if (!tray) return;
  tray.setImage(trayImage(state === 'recording'));
  const status = keyboardHookRunning || !isMac ? `Murmr — ${t(`state.${state}`)}` : t('tray.hookInactive');
  tray.setToolTip(status);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: status, enabled: false },
      {
        label: t('tray.hotkey', { key: keyLabel(settings.hotkey.name, process.platform, settings.uiLanguage) }),
        enabled: false,
      },
      { type: 'separator' },
      { label: t('tray.open'), click: () => showMainWindow() },
      {
        label: t('tray.cleanup'),
        type: 'checkbox',
        checked: settings.cleanupEnabled,
        click: (item) => updateSettings({ cleanupEnabled: item.checked }),
      },
      { type: 'separator' },
      { label: t('tray.quit'), role: 'quit' },
    ]),
  );
}

// --- settings & IPC ------------------------------------------------------------

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(channel, payload);
}

function updateSettings(patch: Partial<Settings>): Settings {
  settings = { ...settings, ...patch };
  saveSettings(settings);
  if (patch.hotkey || patch.mode) hotkeys.configure(settings.hotkey.keycode, settings.mode);
  if (patch.engine || patch.localModel) prepareLocalEngine();
  if (patch.openAtLogin !== undefined && process.platform !== 'linux') {
    app.setLoginItemSettings({ openAtLogin: settings.openAtLogin });
  }
  broadcast(IPC.settingsChanged, settings);
  updateTray();
  return settings;
}

function microphoneStatus(): PermissionStatus {
  if (process.platform === 'linux') return 'granted';
  return systemPreferences.getMediaAccessStatus('microphone') as PermissionStatus;
}

function permissions(): Permissions {
  return {
    platform: process.platform,
    microphone: microphoneStatus(),
    accessibility: accessibilityGranted(),
    keyboardHookRunning,
    devMode: !app.isPackaged,
  };
}

function broadcastPermissions(): void {
  if (mainWindow) mainWindow.webContents.send(IPC.permissionsChanged, permissions());
}

function registerIpc(): void {
  ipcMain.handle(IPC.settingsGet, () => settings);
  ipcMain.handle(IPC.settingsSet, (_e, patch: Partial<Settings>) => updateSettings(patch));
  ipcMain.handle(IPC.historyGet, () => history.all());
  ipcMain.handle(IPC.historyRemove, (_e, id: string) => history.remove(id));
  ipcMain.handle(IPC.historyClear, () => history.clear());
  ipcMain.handle(IPC.testApiKey, (_e, apiKey: string, baseUrl: string) => groq.testApiKey({ apiKey, baseUrl }));
  ipcMain.handle(IPC.permissionsGet, () => permissions());
  ipcMain.handle(IPC.permissionsRequest, async (_e, kind: 'microphone' | 'accessibility') => {
    if (kind === 'microphone' && isMac) {
      await systemPreferences.askForMediaAccess('microphone');
      if (microphoneStatus() === 'denied') {
        void shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone');
      }
    }
    if (kind === 'accessibility' && isMac) {
      systemPreferences.isTrustedAccessibilityClient(true); // shows the system prompt
      void shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
    }
    return permissions();
  });
  ipcMain.handle(IPC.captureHotkey, () => {
    if (!keyboardHookRunning) return { ok: false, reason: 'hookInactive' };
    captureResolver?.({ ok: false, reason: 'cancelled' });
    return new Promise<CaptureResult>((resolve) => (captureResolver = resolve));
  });
  ipcMain.handle(IPC.modelsList, () => models.list());
  ipcMain.handle(IPC.modelsDownload, (_e, id: LocalModelId) => {
    void models.download(id); // progress is reported through IPC.modelsProgress
  });
  ipcMain.handle(IPC.modelsCancel, (_e, id: LocalModelId) => models.cancel(id));
  ipcMain.handle(IPC.modelsRemove, async (_e, id: LocalModelId) => {
    if (settings.engine === 'local' && settings.localModel === id) await localWhisper.release();
    models.remove(id);
  });
  ipcMain.handle(IPC.openExternal, (_e, url: string) => {
    if (url.startsWith('https://')) return shell.openExternal(url);
  });
  ipcMain.handle(IPC.copy, (_e, text: string) => clipboard.writeText(text));
  ipcMain.handle(IPC.overlayRecording, (_e, payload: RecordingPayload) => handleRecording(payload));
  ipcMain.on(IPC.overlayError, (_e, messageKey: MessageKey, detail?: string) => {
    if (state === 'recording') setState('error', messageKey, detail);
  });
}
