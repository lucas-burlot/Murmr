// Dictation history kept locally as JSON (most recent first).

import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { HistoryEntry } from '../shared/types';

const MAX_ENTRIES = 500;

export class HistoryStore {
  private entries: HistoryEntry[] = [];

  constructor(
    private readonly file: string,
    private readonly onChange: (entries: HistoryEntry[]) => void,
  ) {
    try {
      this.entries = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      this.entries = [];
    }
  }

  all(): HistoryEntry[] {
    return this.entries;
  }

  add(entry: Omit<HistoryEntry, 'id' | 'createdAt'>): void {
    this.entries = [{ id: randomUUID(), createdAt: Date.now(), ...entry }, ...this.entries].slice(0, MAX_ENTRIES);
    this.persist();
  }

  remove(id: string): void {
    this.entries = this.entries.filter((e) => e.id !== id);
    this.persist();
  }

  clear(): void {
    this.entries = [];
    this.persist();
  }

  private persist(): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.entries), 'utf8');
    this.onChange(this.entries);
  }
}
