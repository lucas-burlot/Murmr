import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ModelManager } from '../src/main/models';
import type { LocalModel } from '../src/shared/models';
import type { ModelProgress } from '../src/shared/types';

const CONTENT = Buffer.alloc(300_000, 7); // stands in for a model file
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

let server: http.Server | undefined;
afterEach(() => server?.close());

async function serve(handler: http.RequestListener): Promise<string> {
  server = http.createServer(handler);
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function setup(baseUrl: string, sha256 = sha(CONTENT)) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'murmr-models-'));
  const events: ModelProgress[] = [];
  const catalog: LocalModel[] = [{ id: 'base', file: 'test.bin', sizeMb: 1, sha256 }];
  const manager = new ModelManager(dir, (p) => events.push(p), baseUrl, catalog);
  return { dir, events, manager };
}

const serveContent: http.RequestListener = (_req, res) => {
  res.writeHead(200, { 'content-length': CONTENT.length });
  res.end(CONTENT);
};

describe('ModelManager', () => {
  it('downloads, verifies the checksum and reports progress', async () => {
    const { dir, events, manager } = setup(await serve(serveContent));
    expect(manager.list()).toEqual([{ id: 'base', sizeMb: 1, downloaded: false }]);
    await manager.download('base');
    expect(events.at(-1)).toMatchObject({ id: 'base', state: 'done', received: CONTENT.length, total: CONTENT.length });
    expect(fs.readFileSync(path.join(dir, 'test.bin')).equals(CONTENT)).toBe(true);
    expect(manager.isDownloaded('base')).toBe(true);
  });

  it('rejects a corrupted file and leaves nothing behind', async () => {
    const { dir, events, manager } = setup(await serve(serveContent), '0'.repeat(64));
    await manager.download('base');
    expect(events.at(-1)).toMatchObject({ state: 'error', error: expect.stringContaining('checksum') });
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('reports HTTP errors', async () => {
    const { events, manager } = setup(await serve((_req, res) => res.writeHead(404).end()));
    await manager.download('base');
    expect(events.at(-1)).toMatchObject({ state: 'error', error: 'HTTP 404' });
  });

  it('can be cancelled mid-download', async () => {
    const baseUrl = await serve((_req, res) => {
      res.writeHead(200, { 'content-length': CONTENT.length * 2 });
      res.write(CONTENT); // then never finishes
    });
    const { dir, events, manager } = setup(baseUrl);
    const download = manager.download('base');
    await new Promise((r) => setTimeout(r, 100));
    manager.cancel('base');
    await download;
    expect(events.at(-1)).toMatchObject({ state: 'cancelled' });
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('removes a downloaded model', async () => {
    const { manager } = setup(await serve(serveContent));
    await manager.download('base');
    manager.remove('base');
    expect(manager.isDownloaded('base')).toBe(false);
  });
});
