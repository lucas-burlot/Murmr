// Recording -> Whisper -> optional LLM cleanup -> paste. Dependencies are
// injected so the pipeline can be tested without Electron or the network.

import type { MessageKey } from '../shared/i18n';
import type { DictationState, HistoryEntry, RecordingPayload, Settings } from '../shared/types';
import { ApiError } from './groq';

export const MIN_DURATION_MS = 400;
// Measured: quiet-room noise ~0.003 RMS, speech peaks 0.05-0.3. Whisper
// hallucinates on silence, so near-silent clips are never sent.
export const MIN_PEAK_RMS = 0.01;

export interface DictationDeps {
  getSettings(): Settings;
  transcribe(rec: RecordingPayload, settings: Settings): Promise<string>;
  cleanup(text: string, settings: Settings): Promise<string>;
  paste(text: string, restoreClipboard: boolean): Promise<void>;
  addHistory(entry: Omit<HistoryEntry, 'id' | 'createdAt'>): void;
  setState(state: DictationState, messageKey?: MessageKey, detail?: string): void;
}

export async function processRecording(rec: RecordingPayload, deps: DictationDeps): Promise<string | null> {
  const settings = deps.getSettings();
  if (rec.durationMs < MIN_DURATION_MS || rec.peakRms < MIN_PEAK_RMS) {
    deps.setState('empty', 'msg.nothingHeard');
    return null;
  }

  try {
    deps.setState('transcribing');
    const raw = await deps.transcribe(rec, settings);
    if (!raw) {
      deps.setState('empty', 'msg.nothingHeard');
      return null;
    }

    let text = raw;
    let cleaned = false;
    let fellBack = false;
    // Cleanup needs the Groq API: in local mode without a key, paste the raw transcript.
    if (settings.cleanupEnabled && settings.apiKey) {
      deps.setState('cleaning');
      try {
        text = await deps.cleanup(raw, settings);
        cleaned = true;
      } catch {
        // Never lose a dictation because the optional cleanup step failed.
        text = raw;
        fellBack = true;
      }
    }
    if (!text) {
      deps.setState('empty', 'msg.nothingToPaste');
      return null;
    }

    await deps.paste(text, settings.restoreClipboard);
    deps.addHistory({ raw, text, cleaned, durationMs: rec.durationMs });
    deps.setState('done', fellBack ? 'msg.pastedRaw' : 'msg.pasted');
    return text;
  } catch (err) {
    if (err instanceof ApiError) deps.setState('error', `error.${err.code}`, err.detail);
    else deps.setState('error', 'error.generic', (err as Error).message);
    return null;
  }
}
