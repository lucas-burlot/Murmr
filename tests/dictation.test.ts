import { describe, expect, it, vi } from 'vitest';
import { processRecording, type DictationDeps } from '../src/main/dictation';
import { ApiError } from '../src/main/groq';
import type { RecordingPayload, Settings } from '../src/shared/types';

const settings = (overrides: Partial<Settings> = {}): Settings => ({
  apiKey: 'k',
  baseUrl: 'http://x',
  transcriptionModel: 'whisper-large-v3',
  language: 'fr',
  cleanupEnabled: true,
  cleanupModel: 'openai/gpt-oss-20b',
  hotkey: { keycode: 3640, name: 'AltRight' },
  mode: 'hold',
  dictionary: [],
  sounds: true,
  restoreClipboard: true,
  microphoneId: '',
  openAtLogin: false,
  uiLanguage: 'en',
  ...overrides,
});

const speech: RecordingPayload = { audio: new ArrayBuffer(8), mimeType: 'audio/webm', durationMs: 2000, peakRms: 0.2 };

function deps(s: Settings, impl: Partial<DictationDeps> = {}) {
  const states: string[] = [];
  const d: DictationDeps = {
    getSettings: () => s,
    transcribe: vi.fn(async () => 'euh bonjour'),
    cleanup: vi.fn(async () => 'Bonjour.'),
    paste: vi.fn(async () => {}),
    addHistory: vi.fn(),
    setState: (state, key, detail) => void states.push([state, key, detail].filter(Boolean).join(':')),
    ...impl,
  };
  return { d, states };
}

describe('processRecording', () => {
  it('transcribes, cleans, pastes and records history', async () => {
    const { d, states } = deps(settings());
    expect(await processRecording(speech, d)).toBe('Bonjour.');
    expect(d.paste).toHaveBeenCalledWith('Bonjour.', true);
    expect(d.addHistory).toHaveBeenCalledWith({ raw: 'euh bonjour', text: 'Bonjour.', cleaned: true, durationMs: 2000 });
    expect(states).toEqual(['transcribing', 'cleaning', 'done:msg.pasted']);
  });

  it('raw mode skips the LLM', async () => {
    const { d } = deps(settings({ cleanupEnabled: false }));
    expect(await processRecording(speech, d)).toBe('euh bonjour');
    expect(d.cleanup).not.toHaveBeenCalled();
    expect(d.addHistory).toHaveBeenCalledWith(expect.objectContaining({ cleaned: false }));
  });

  it('falls back to the raw transcript when cleanup fails', async () => {
    const { d, states } = deps(settings(), { cleanup: vi.fn(async () => Promise.reject(new Error('quota'))) });
    expect(await processRecording(speech, d)).toBe('euh bonjour');
    expect(states.at(-1)).toBe('done:msg.pastedRaw');
  });

  it.each([
    ['too short', { ...speech, durationMs: 200 }],
    ['silent', { ...speech, peakRms: 0.004 }],
  ])('never calls the API for a %s recording', async (_name, rec) => {
    const { d, states } = deps(settings());
    expect(await processRecording(rec, d)).toBeNull();
    expect(d.transcribe).not.toHaveBeenCalled();
    expect(states).toEqual(['empty:msg.nothingHeard']);
  });

  it('reports API errors as translatable keys without pasting', async () => {
    const { d, states } = deps(settings(), { transcribe: vi.fn(async () => Promise.reject(new ApiError('invalidKey'))) });
    expect(await processRecording(speech, d)).toBeNull();
    expect(d.paste).not.toHaveBeenCalled();
    expect(states.at(-1)).toBe('error:error.invalidKey');
  });

  it('reports unexpected errors with their message', async () => {
    const { d, states } = deps(settings(), { paste: vi.fn(async () => Promise.reject(new Error('boom'))) });
    expect(await processRecording(speech, d)).toBeNull();
    expect(states.at(-1)).toBe('error:error.generic:boom');
  });

  it('does not paste when Whisper heard nothing', async () => {
    const { d, states } = deps(settings(), { transcribe: vi.fn(async () => '') });
    expect(await processRecording(speech, d)).toBeNull();
    expect(d.paste).not.toHaveBeenCalled();
    expect(states.at(-1)).toBe('empty:msg.nothingHeard');
  });
});
