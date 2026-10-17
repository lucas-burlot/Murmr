import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiError, cleanup, testApiKey, transcribe } from '../src/main/groq';

interface Reply {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

interface Received {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
}

let server: http.Server | undefined;

/** Fake OpenAI-compatible server answering with `replies` in order. */
async function fakeApi(replies: Reply[]): Promise<{ baseUrl: string; received: Received[] }> {
  const received: Received[] = [];
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      received.push({ method: req.method!, url: req.url!, headers: req.headers, body: Buffer.concat(chunks) });
      const reply = replies.shift()!;
      res.writeHead(reply.status, { 'content-type': 'application/json', ...reply.headers });
      res.end(JSON.stringify(reply.body));
    });
  });
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${port}/openai/v1`, received };
}

afterEach(() => {
  server?.close();
  server = undefined;
});

const chat = (content: string) => ({ choices: [{ message: { role: 'assistant', content } }] });

describe('transcribe', () => {
  it('sends a multipart request with model, language, vocabulary and the audio', async () => {
    const { baseUrl, received } = await fakeApi([{ status: 200, body: { text: ' Bonjour Septeo ' } }]);
    const text = await transcribe({ apiKey: 'gsk_test', baseUrl }, new Uint8Array([1, 2, 3]), 'audio/webm;codecs=opus', {
      model: 'whisper-large-v3',
      language: 'fr',
      dictionary: ['Septeo', 'Wispr'],
    });
    expect(text).toBe('Bonjour Septeo');
    const [req] = received;
    expect(req.url).toBe('/openai/v1/audio/transcriptions');
    expect(req.headers.authorization).toBe('Bearer gsk_test');
    expect(req.headers['content-type']).toMatch(/^multipart\/form-data/);
    const body = req.body.toString('latin1');
    for (const part of ['name="model"', 'whisper-large-v3', 'name="language"', 'Septeo, Wispr', 'filename="audio.webm"']) {
      expect(body).toContain(part);
    }
  });

  it('omits the language when auto-detect is selected', async () => {
    const { baseUrl, received } = await fakeApi([{ status: 200, body: { text: 'hi' } }]);
    await transcribe({ apiKey: 'k', baseUrl }, new Uint8Array([1]), 'audio/webm', {
      model: 'whisper-large-v3',
      language: '',
      dictionary: [],
    });
    const body = received[0].body.toString('latin1');
    expect(body).not.toContain('name="language"');
    expect(body).not.toContain('name="prompt"');
  });

  it('filters Whisper hallucinations', async () => {
    const { baseUrl } = await fakeApi([{ status: 200, body: { text: "Sous-titres réalisés par la communauté d'Amara.org" } }]);
    const text = await transcribe({ apiKey: 'k', baseUrl }, new Uint8Array([1]), 'audio/webm', {
      model: 'm',
      language: 'fr',
      dictionary: [],
    });
    expect(text).toBe('');
  });

  it('gives a clear error for an invalid key', async () => {
    const { baseUrl } = await fakeApi([{ status: 401, body: { error: 'invalid' } }]);
    await expect(
      transcribe({ apiKey: 'bad', baseUrl }, new Uint8Array([1]), 'audio/webm', { model: 'm', language: '', dictionary: [] }),
    ).rejects.toMatchObject({ code: 'invalidKey' });
  });
});

describe('cleanup', () => {
  it('retries once on 429, then returns the sanitized answer', async () => {
    const { baseUrl, received } = await fakeApi([
      { status: 429, body: { error: 'rate' }, headers: { 'retry-after': '0' } },
      { status: 200, body: chat('« Bonjour, ça va ? »') },
    ]);
    const text = await cleanup({ apiKey: 'k', baseUrl }, 'euh bonjour euh ça va', {
      model: 'openai/gpt-oss-20b',
      dictionary: ['Septeo'],
    });
    expect(text).toBe('Bonjour, ça va ?');
    expect(received).toHaveLength(2);
    const payload = JSON.parse(received[1].body.toString());
    expect(received[1].url).toBe('/openai/v1/chat/completions');
    expect(payload.model).toBe('openai/gpt-oss-20b');
    expect(payload.reasoning_effort).toBe('low');
    expect(payload.messages[0].content).toContain('Septeo');
    expect(payload.messages[1].content).toBe('<transcription>\neuh bonjour euh ça va\n</transcription>');
  });

  it('does not send reasoning_effort to non-reasoning models', async () => {
    const { baseUrl, received } = await fakeApi([{ status: 200, body: chat('Ok.') }]);
    await cleanup({ apiKey: 'k', baseUrl }, 'ok', { model: 'llama-3.3-70b-versatile', dictionary: [] });
    expect(JSON.parse(received[0].body.toString())).not.toHaveProperty('reasoning_effort');
  });

  it('rejects malformed responses', async () => {
    const { baseUrl } = await fakeApi([{ status: 200, body: { choices: [] } }]);
    await expect(cleanup({ apiKey: 'k', baseUrl }, 'x', { model: 'm', dictionary: [] })).rejects.toBeInstanceOf(ApiError);
  });
});

describe('testApiKey', () => {
  it('reports a valid key', async () => {
    const { baseUrl, received } = await fakeApi([{ status: 200, body: { data: [] } }]);
    expect(await testApiKey({ apiKey: 'k', baseUrl })).toEqual({ ok: true, messageKey: 'test.ok' });
    expect(received[0]).toMatchObject({ method: 'GET', url: '/openai/v1/models' });
  });

  it('reports an empty key without calling the API', async () => {
    expect(await testApiKey({ apiKey: '  ', baseUrl: 'http://127.0.0.1:1' })).toEqual({ ok: false, messageKey: 'test.empty' });
  });

  it('maps API failures to translatable error keys', async () => {
    const { baseUrl } = await fakeApi([{ status: 401, body: {} }]);
    expect(await testApiKey({ apiKey: 'bad', baseUrl })).toEqual({ ok: false, messageKey: 'error.invalidKey', detail: '' });
  });
});
