// Insert text in the focused app: put it on the clipboard, simulate the paste
// shortcut, then restore what the clipboard held before (as Wispr Flow does).

import { clipboard, ClipboardItem } from 'electron';
import { UiohookKey, uIOhook } from 'uiohook-napi';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Snapshot = Array<Record<string, Blob | Electron.ClipboardBookmark>>;

async function snapshot(): Promise<Snapshot> {
  // Resolve every payload now: they must be read before the clipboard is overwritten.
  const items = await clipboard.read();
  return Promise.all(
    items.map(async (item) =>
      Object.fromEntries(await Promise.all(item.types.map(async (type) => [type, await item.getType(type)]))),
    ),
  );
}

async function restore(saved: Snapshot): Promise<void> {
  const items = saved.filter((data) => Object.keys(data).length);
  if (items.length) await clipboard.write(items.map((data) => new ClipboardItem(data)));
  else clipboard.clear();
}

export async function pasteText(text: string, restoreClipboard: boolean): Promise<void> {
  const saved = restoreClipboard ? await snapshot().catch(() => null) : null;
  await clipboard.writeText(text);
  await sleep(30); // let the clipboard settle before the target app reads it
  const modifier = process.platform === 'darwin' ? UiohookKey.Meta : UiohookKey.Ctrl;
  uIOhook.keyTap(UiohookKey.V, [modifier]);
  if (saved) {
    await sleep(600); // the target app reads the clipboard asynchronously
    await restore(saved).catch((err) => console.error('Clipboard restore failed', err));
  }
}
