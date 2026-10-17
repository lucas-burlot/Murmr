// Client for an OpenAI-compatible API (Groq by default, free tier).
//   Transcription: POST {baseUrl}/audio/transcriptions  (Whisper)
//   Cleanup:       POST {baseUrl}/chat/completions      (LLM)
// No Electron imports: unit-testable.

import type { TestResult } from '../shared/types';
import { cleanupSystemPrompt, filterHallucination, sanitizeLlmOutput, vocabularyPrompt } from './text';

export const DEFAULT_BASE_URL = 'https://api.groq.com/openai/v1';
const TIMEOUT_MS = 30_000;
const MAX_RETRY_WAIT_MS = 5_000;

export type ApiErrorCode = 'invalidKey' | 'rateLimit' | 'network' | 'http' | 'badResponse';

/** Carries a code (translated by the UI) rather than a user-facing sentence. */
export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    readonly detail = '',
  ) {
    super(detail ? `${code}: ${detail}` : code);
  }
}

export interface ApiConfig {
  apiKey: string;
  baseUrl: string;
}

async function request(cfg: ApiConfig, path: string, init: RequestInit): Promise<any> {
  const url = cfg.baseUrl.replace(/\/+$/, '') + path;
  const headers = { Authorization: `Bearer ${cfg.apiKey}`, ...(init.headers ?? {}) };

  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (err) {
      if (attempt === 0) continue;
      throw new ApiError('network', (err as Error).message);
    }
    if ((res.status === 429 || res.status >= 500) && attempt === 0) {
      const retryAfter = Number(res.headers.get('retry-after') ?? 1) * 1000;
      await new Promise((r) => setTimeout(r, Math.min(retryAfter || 1000, MAX_RETRY_WAIT_MS)));
      continue;
    }
    if (res.status === 401) throw new ApiError('invalidKey');
    if (res.status === 429) throw new ApiError('rateLimit');
    if (!res.ok) throw new ApiError('http', `${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  }
  throw new ApiError('network', 'retry failed');
}

function extensionFor(mimeType: string): string {
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('mp4')) return 'm4a';
  return 'wav';
}

export interface TranscribeOptions {
  model: string;
  language: string;
  dictionary: string[];
}

export async function transcribe(
  cfg: ApiConfig,
  audio: Uint8Array,
  mimeType: string,
  opts: TranscribeOptions,
): Promise<string> {
  const form = new FormData();
  form.append('file', new Blob([audio as Uint8Array<ArrayBuffer>], { type: mimeType }), `audio.${extensionFor(mimeType)}`);
  form.append('model', opts.model);
  form.append('response_format', 'json');
  form.append('temperature', '0');
  if (opts.language) form.append('language', opts.language);
  const prompt = vocabularyPrompt(opts.dictionary);
  if (prompt) form.append('prompt', prompt);

  const json = await request(cfg, '/audio/transcriptions', { method: 'POST', body: form });
  return filterHallucination(String(json?.text ?? ''));
}

export interface CleanupOptions {
  model: string;
  dictionary: string[];
}

export async function cleanup(cfg: ApiConfig, text: string, opts: CleanupOptions): Promise<string> {
  const body: Record<string, unknown> = {
    model: opts.model,
    temperature: 0.2,
    messages: [
      { role: 'system', content: cleanupSystemPrompt(opts.dictionary) },
      { role: 'user', content: `<transcription>\n${text}\n</transcription>` },
    ],
  };
  // gpt-oss models reason before answering: keep that short for latency.
  if (opts.model.startsWith('openai/gpt-oss')) body.reasoning_effort = 'low';

  const json = await request(cfg, '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new ApiError('badResponse');
  return sanitizeLlmOutput(content);
}

/** Validates a key with a cheap authenticated call. */
export async function testApiKey(cfg: ApiConfig): Promise<TestResult> {
  if (!cfg.apiKey.trim()) return { ok: false, messageKey: 'test.empty' };
  try {
    await request(cfg, '/models', { method: 'GET' });
    return { ok: true, messageKey: 'test.ok' };
  } catch (err) {
    return err instanceof ApiError
      ? { ok: false, messageKey: `error.${err.code}`, detail: err.detail }
      : { ok: false, messageKey: 'error.generic', detail: (err as Error).message };
  }
}
