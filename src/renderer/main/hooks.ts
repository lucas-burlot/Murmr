import { useCallback, useEffect, useState } from 'react';
import type { LocalModelId } from '../../shared/models';
import type { HistoryEntry, LocalModelStatus, ModelProgress, Permissions, Settings, StateEvent } from '../../shared/types';

const murmr = window.murmr;

export function useSettings(): [Settings | null, (patch: Partial<Settings>) => Promise<void>] {
  const [settings, setSettings] = useState<Settings | null>(null);
  useEffect(() => {
    void murmr.settings.get().then(setSettings);
    return murmr.settings.onChange(setSettings);
  }, []);
  const update = useCallback(async (patch: Partial<Settings>) => {
    setSettings(await murmr.settings.set(patch));
  }, []);
  return [settings, update];
}

export function useHistory(): HistoryEntry[] {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  useEffect(() => {
    void murmr.history.get().then(setEntries);
    return murmr.history.onChange(setEntries);
  }, []);
  return entries;
}

export function useDictationState(): StateEvent {
  const [state, setState] = useState<StateEvent>({ state: 'idle', sounds: true, lang: 'en' });
  useEffect(() => murmr.state.onChange(setState), []);
  return state;
}

export function usePermissions(): [Permissions | null, (kind: 'microphone' | 'accessibility') => Promise<void>] {
  const [perms, setPerms] = useState<Permissions | null>(null);
  useEffect(() => {
    const refresh = () => void murmr.permissions.get().then(setPerms);
    refresh();
    // Permissions are granted in the OS settings app: poll while the window is open.
    const timer = setInterval(refresh, 2000);
    const off = murmr.permissions.onChange(setPerms);
    return () => {
      clearInterval(timer);
      off();
    };
  }, []);
  const request = useCallback(async (kind: 'microphone' | 'accessibility') => {
    setPerms(await murmr.permissions.request(kind));
  }, []);
  return [perms, request];
}

export interface ModelsState {
  models: LocalModelStatus[];
  progress: Partial<Record<LocalModelId, ModelProgress>>;
}

export function useModels(): ModelsState {
  const [models, setModels] = useState<LocalModelStatus[]>([]);
  const [progress, setProgress] = useState<ModelsState['progress']>({});
  useEffect(() => {
    const refresh = () => void murmr.models.list().then(setModels);
    refresh();
    return murmr.models.onProgress((p) => {
      setProgress((prev) => ({ ...prev, [p.id]: p }));
      if (p.state !== 'downloading') refresh();
    });
  }, []);
  return { models, progress };
}
