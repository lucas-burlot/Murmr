# Murmr 🎙️

**Free, open-source voice dictation for macOS, Windows and Linux.** A Wispr Flow alternative.

**Hold a key → speak → release**: your words are transcribed and pasted wherever your cursor is, in any app (email, Slack, browser, code editor…).

- **Transcription**: Whisper large-v3 through Groq's **free** API (about 8 hours of audio per day, no credit card).
- **AI cleanup** (can be switched off): a free Groq LLM removes "um"s, applies your self-corrections ("Thursday, no actually Friday" → "Friday"), fixes punctuation and formats lists.
- **Floating pill** in the style of Wispr Flow: live waveform, then "Transcribing…", then "Pasted ✓".
- **Full desktop app**: home with stats, searchable history, personal dictionary, settings. It lives in the menu bar / system tray.
- **English or French interface**, switchable in Settings.
- **No middleman server**: audio only goes to the provider you configure. History stays on your machine.

## Two modes

| Mode | Result | API calls |
|------|--------|-----------|
| **Raw Whisper** | The transcription as is, fastest | 1 |
| **Whisper + AI cleanup** *(default)* | Clean text, no hesitations, proper punctuation | 2 |

Switch from the home page, Settings, or the tray menu. If cleanup fails (quota, network), the raw text is pasted, so a dictation is never lost.

## Quick start (development)

Requires [Node.js](https://nodejs.org) 22+.

```bash
git clone <repo-url> murmr && cd murmr
npm install
npm start
```

On first launch, the "Getting started" card walks you through:

1. **Free Groq API key**: create one at <https://console.groq.com/keys>, paste it in *Settings*, click "Test".
2. **Microphone**: allow access.
3. **Accessibility (macOS only)**: enable the app in *System Settings → Privacy & Security → Accessibility* (in development it shows up as "Electron"). It is needed to detect the hotkey and paste text.

## Build installers

```bash
npm run dist:mac     # .dmg
npm run dist:win     # .exe installer (NSIS)
npm run dist:linux   # .AppImage and .deb
```

Output goes to `dist/`. Build each installer on its own OS (or in CI).
Builds are unsigned: on first launch, macOS needs *right-click → Open*, and Windows shows SmartScreen.

## Hotkey

- Default: **Right Option** on macOS, **Right Ctrl** on Windows and Linux. The Fn key is not reliably available to cross-platform apps.
- Change it in *Settings → Shortcut*: click "Change" and press the key you want (a modifier or an F key).
- Two modes: **Hold** (push-to-talk) or **Press to start / stop** (handy for long dictations).
- `Esc` cancels. In Hold mode, pressing another key also cancels, so shortcuts such as Option+E keep working.

## How it works

```
hotkey (uiohook-napi) ─► pill: mic → Opus/WebM ─► Groq Whisper ─► [Groq LLM cleanup]
                                                                    │
                  clipboard restored ◄─ simulated Cmd/Ctrl+V ◄─ clipboard ◄┘
```

| File | Role |
|------|------|
| `src/main/main.ts` | Lifecycle, windows, tray, global hotkey, IPC |
| `src/main/dictation.ts` | Recording → transcription → cleanup → paste pipeline |
| `src/main/groq.ts` | OpenAI-compatible API client (Whisper + chat) |
| `src/main/text.ts` | Cleanup prompt, Whisper hallucination filter |
| `src/main/hotkey.ts` | Hold / toggle / cancel state machine |
| `src/main/paste.ts` | Paste and clipboard restore |
| `src/shared/i18n.ts` | English and French translations |
| `src/renderer/overlay/` | Floating pill: mic recording, waveform, states |
| `src/renderer/main/` | Main window (React) |

### Adding a language

Add a dictionary in `src/shared/i18n.ts` (TypeScript rejects missing keys), then add it to `Lang`, `UI_LANGUAGES` and `KEY_NAMES`.

### How it compares to Wispr Flow

Wispr Flow (Electron + a native Swift helper) follows the same idea with more features. It streams audio (gRPC, Opus) to its own hosted model, together with context from the active app (name, URL, text around the cursor, words visible on screen), your dictionary and a per-app style. The text is then pasted through the clipboard, which is restored afterwards.
Murmr keeps that core loop, on top of free APIs.

Similar open-source projects: [FreeFlow](https://github.com/zachlatta/freeflow) (macOS, Swift), [OpenWhisper](https://github.com/fsouza-dot/OpenWhisper).

## Known limitations

- **Linux / Wayland**: global hotkeys are blocked by the compositor. Use an X11 session.
- **Linux terminals**: pasting uses `Ctrl+V`, while many terminals expect `Ctrl+Shift+V`.
- **Groq free tier** (Whisper): 20 requests/min, 2,000/day, 8 h of audio/day, with each request counted as at least 10 s.

## Development

```bash
npm test            # unit tests (Vitest)
npm run typecheck   # TypeScript
npm run build       # compile to out/
```

Local data lives in the app data folder: `settings.json` (API key encrypted with the OS keychain when available) and `history.json`. The folder is `~/Library/Application Support/Murmr` on macOS, `%APPDATA%\Murmr` on Windows, `~/.config/Murmr` on Linux.

## License

MIT
