// Runs Whisper on this computer with whisper.cpp (@fugood/whisper.node,
// prebuilt per platform; Metal on Apple Silicon). The model stays loaded
// between dictations: the first load takes a few seconds.

import type { WhisperContext } from '@fugood/whisper.node';
import { filterHallucination, vocabularyPrompt } from './text';

export interface LocalTranscribeOptions {
  language: string; // '' = auto-detect
  dictionary: string[];
}

export class LocalWhisper {
  private context: Promise<WhisperContext> | null = null;
  private loadedPath = '';

  /** Loads (or switches to) a model. Safe to call repeatedly with the same path. */
  load(modelPath: string): Promise<WhisperContext> {
    if (this.context && this.loadedPath === modelPath) return this.context;
    void this.release();
    this.loadedPath = modelPath;
    // Required lazily: the native module is only loaded when local mode is used.
    const { initWhisper } = require('@fugood/whisper.node') as typeof import('@fugood/whisper.node');
    const context = initWhisper({ filePath: modelPath, useGpu: true });
    this.context = context;
    context.catch(() => {
      if (this.context === context) this.context = null; // allow a retry
    });
    return context;
  }

  async transcribe(modelPath: string, pcm16: ArrayBuffer, opts: LocalTranscribeOptions): Promise<string> {
    const context = await this.load(modelPath);
    const prompt = vocabularyPrompt(opts.dictionary);
    const { promise } = context.transcribeData(pcm16, {
      language: opts.language || 'auto',
      temperature: 0,
      ...(prompt ? { prompt } : {}),
    });
    const result = await promise;
    return filterHallucination(result.result);
  }

  async release(): Promise<void> {
    const context = this.context;
    this.context = null;
    this.loadedPath = '';
    if (context) await context.then((c) => c.release()).catch(() => undefined);
  }
}
