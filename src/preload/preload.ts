// Runs sandboxed: only `electron` can be required at runtime, so everything
// imported from shared code must be type-only and channel names are inlined.

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { MurmrAPI } from '../shared/types';

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: MurmrAPI = {
  platform: process.platform,
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch) => ipcRenderer.invoke('settings:set', patch),
    onChange: (cb) => subscribe('settings:changed', cb),
  },
  history: {
    get: () => ipcRenderer.invoke('history:get'),
    remove: (id) => ipcRenderer.invoke('history:remove', id),
    clear: () => ipcRenderer.invoke('history:clear'),
    onChange: (cb) => subscribe('history:changed', cb),
  },
  state: {
    onChange: (cb) => subscribe('state:changed', cb),
  },
  testApiKey: (apiKey, baseUrl) => ipcRenderer.invoke('groq:test', apiKey, baseUrl),
  captureHotkey: () => ipcRenderer.invoke('hotkey:capture'),
  permissions: {
    get: () => ipcRenderer.invoke('permissions:get'),
    request: (kind) => ipcRenderer.invoke('permissions:request', kind),
    onChange: (cb) => subscribe('permissions:changed', cb),
  },
  models: {
    list: () => ipcRenderer.invoke('models:list'),
    download: (id) => ipcRenderer.invoke('models:download', id),
    cancel: (id) => ipcRenderer.invoke('models:cancel', id),
    remove: (id) => ipcRenderer.invoke('models:remove', id),
    onProgress: (cb) => subscribe('models:progress', cb),
  },
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  copy: (text) => ipcRenderer.invoke('app:copy', text),
  overlay: {
    onCommand: (cb) => subscribe('overlay:command', cb),
    sendRecording: (payload) => ipcRenderer.invoke('overlay:recording', payload),
    reportError: (messageKey, detail) => ipcRenderer.send('overlay:error', messageKey, detail),
  },
};

contextBridge.exposeInMainWorld('murmr', api);
