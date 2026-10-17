# Changelog

## 1.0.0 — 2026-10-17

The first public release of Murmr: free, open-source voice dictation for macOS, Windows and Linux.

### Dictation
- Hold a key, speak, release: the text is pasted wherever your cursor is, in any app.
- Hold or press-to-toggle modes, any modifier or F-key as the hotkey, `Esc` to cancel.
- Floating pill with a live waveform, never stealing focus from the app you type in.
- The clipboard is restored after pasting, images and rich text included.

### Transcription, cloud or local
- **Cloud**: Whisper large-v3 through Groq's free API (about 8 hours of audio per day).
- **Local**: Whisper on your computer with whisper.cpp (Metal on Apple Silicon). No account, works offline, your voice never leaves your machine.
- Downloadable local models (Base 60 MB, Small 190 MB, Large v3 turbo 574 MB), verified by SHA-256.

### AI cleanup
- Optional cleanup by a free Groq LLM: removes fillers and stutters, applies self-corrections, fixes punctuation, formats lists.
- If the cleanup fails, the raw transcript is pasted: a dictation is never lost.

### App
- Home with the engine choice front and center, stats, recent dictations.
- Searchable history, personal dictionary, settings.
- English and French interface.
- Lives in the menu bar / system tray, optional launch at login.

### Downloads
- macOS: `.dmg` for Apple Silicon and Intel.
- Windows: `.exe` installer.
- Linux: `.AppImage` and `.deb`.

Builds are not code-signed by Apple or Microsoft yet: see the README for how to open them.
