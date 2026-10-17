// Downloads local Whisper models with progress, SHA-256 verification and
// cancellation. No Electron imports: unit-testable with a local HTTP server.

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { LOCAL_MODELS, MODEL_BASE_URL, type LocalModel, type LocalModelId } from '../shared/models';
import type { LocalModelStatus, ModelProgress } from '../shared/types';

const PROGRESS_INTERVAL_MS = 200;

export class ModelManager {
  private downloads = new Map<LocalModelId, AbortController>();

  constructor(
    private readonly dir: string,
    private readonly onProgress: (p: ModelProgress) => void,
    private readonly baseUrl = MODEL_BASE_URL,
    private readonly catalog: LocalModel[] = LOCAL_MODELS,
  ) {}

  private model(id: LocalModelId): LocalModel {
    const model = this.catalog.find((m) => m.id === id);
    if (!model) throw new Error(`unknown model: ${id}`);
    return model;
  }

  path(id: LocalModelId): string {
    return path.join(this.dir, this.model(id).file);
  }

  isDownloaded(id: LocalModelId): boolean {
    return fs.existsSync(this.path(id));
  }

  list(): LocalModelStatus[] {
    return this.catalog.map((m) => ({ id: m.id, sizeMb: m.sizeMb, downloaded: this.isDownloaded(m.id) }));
  }

  async download(id: LocalModelId): Promise<void> {
    if (this.downloads.has(id) || this.isDownloaded(id)) return;
    const model = this.model(id);
    const controller = new AbortController();
    this.downloads.set(id, controller);
    const partial = `${this.path(id)}.part`;
    let received = 0;
    let total = model.sizeMb * 1_000_000;

    try {
      fs.mkdirSync(this.dir, { recursive: true });
      const res = await fetch(`${this.baseUrl}/${model.file}`, { signal: controller.signal });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      total = Number(res.headers.get('content-length')) || total;

      const hash = createHash('sha256');
      const out = fs.createWriteStream(partial);
      let lastReport = 0;
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        hash.update(chunk);
        received += chunk.length;
        if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
        if (Date.now() - lastReport > PROGRESS_INTERVAL_MS) {
          lastReport = Date.now();
          this.onProgress({ id, received, total, state: 'downloading' });
        }
      }
      await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())));

      if (hash.digest('hex') !== model.sha256) throw new Error('checksum mismatch, file corrupted');
      fs.renameSync(partial, this.path(id));
      this.onProgress({ id, received, total, state: 'done' });
    } catch (err) {
      fs.rmSync(partial, { force: true });
      const cancelled = controller.signal.aborted;
      this.onProgress({
        id,
        received,
        total,
        state: cancelled ? 'cancelled' : 'error',
        error: cancelled ? undefined : (err as Error).message,
      });
    } finally {
      this.downloads.delete(id);
    }
  }

  cancel(id: LocalModelId): void {
    this.downloads.get(id)?.abort();
  }

  remove(id: LocalModelId): void {
    this.cancel(id);
    fs.rmSync(this.path(id), { force: true });
  }
}
