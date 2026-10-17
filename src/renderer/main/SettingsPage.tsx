import { useEffect, useState } from 'react';
import { UI_LANGUAGES, type Lang, type MessageKey } from '../../shared/i18n';
import type { Settings, TestResult } from '../../shared/types';
import { useI18n } from './i18n';
import { Card, Icon, Keycap, Row, Switch } from './ui';

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => Promise<void>;
}

// Spoken languages offered for Whisper (ISO-639-1); names come from Intl.
const SPOKEN_LANGUAGES = ['en', 'fr', 'es', 'de', 'it', 'pt', 'nl', 'pl', 'ru', 'uk', 'tr', 'ar', 'hi', 'ja', 'ko', 'zh'];

const TRANSCRIPTION_MODELS: Array<[string, MessageKey]> = [
  ['whisper-large-v3', 'model.whisper'],
  ['whisper-large-v3-turbo', 'model.whisperTurbo'],
];

const CLEANUP_MODELS: Array<[string, MessageKey]> = [
  ['openai/gpt-oss-20b', 'model.gptOss20'],
  ['openai/gpt-oss-120b', 'model.gptOss120'],
  ['llama-3.3-70b-versatile', 'model.llama70'],
];

function useMicrophones(): MediaDeviceInfo[] {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => {
    const refresh = () =>
      void navigator.mediaDevices
        .enumerateDevices()
        .then((all) => setDevices(all.filter((d) => d.kind === 'audioinput' && d.deviceId !== 'default')));
    refresh();
    navigator.mediaDevices.addEventListener('devicechange', refresh);
    return () => navigator.mediaDevices.removeEventListener('devicechange', refresh);
  }, []);
  return devices;
}

export function SettingsPage({ settings, update }: Props) {
  const { t, keyName, lang } = useI18n();
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [showKey, setShowKey] = useState(false);
  const [test, setTest] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [captureError, setCaptureError] = useState('');
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl);
  const microphones = useMicrophones();

  const languageNames = new Intl.DisplayNames([lang], { type: 'language' });
  const spokenLanguage = (code: string) => {
    const name = languageNames.of(code) ?? code;
    return name.charAt(0).toLocaleUpperCase(lang) + name.slice(1);
  };

  const modelOptions = (options: Array<[string, MessageKey]>, current: string) => {
    const known = options.map(([value, key]) => [value, t(key)]);
    return known.some(([value]) => value === current) ? known : [...known, [current, current]];
  };

  const saveKey = async () => {
    if (apiKey.trim() !== settings.apiKey) await update({ apiKey: apiKey.trim() });
  };

  const testKey = async () => {
    setTesting(true);
    await saveKey();
    setTest(await window.murmr.testApiKey(apiKey.trim(), settings.baseUrl));
    setTesting(false);
  };

  const captureHotkey = async () => {
    setCapturing(true);
    setCaptureError('');
    const result = await window.murmr.captureHotkey();
    setCapturing(false);
    if (result.ok) await update({ hotkey: result.hotkey });
    else if (result.reason === 'notAllowed') setCaptureError(t('capture.notAllowed', { key: keyName(result.keyName ?? '') }));
    else if (result.reason === 'hookInactive') setCaptureError(t('capture.hookInactive'));
  };

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>{t('settings.title')}</h1>
          <p className="muted">{t('settings.desc')}</p>
        </div>
      </header>

      <Card
        title={t('settings.key.title')}
        description={
          <>
            {t('settings.key.desc')}{' '}
            <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer">
              {t('settings.key.link')}
            </a>
          </>
        }
      >
        <div className="inline-form">
          <div className="input-with-button">
            <input
              className="input mono"
              type={showKey ? 'text' : 'password'}
              placeholder="gsk_…"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setTest(null);
              }}
              onBlur={saveKey}
              spellCheck={false}
            />
            <button
              className="icon-btn"
              title={t(showKey ? 'settings.key.hide' : 'settings.key.show')}
              onClick={() => setShowKey(!showKey)}
            >
              <Icon name="eye" size={16} />
            </button>
          </div>
          <button className="btn primary" onClick={testKey} disabled={testing || !apiKey.trim()}>
            {t(testing ? 'settings.key.testing' : 'settings.key.test')}
          </button>
        </div>
        {test && (
          <p className={`feedback ${test.ok ? 'ok' : 'error'}`}>{t(test.messageKey, { detail: test.detail ?? '' })}</p>
        )}
      </Card>

      <Card title={t('settings.dictation')}>
        <Row label={t('settings.hotkey')} hint={t('settings.hotkey.hint')}>
          <div className="hotkey-control">
            <Keycap>{capturing ? t('settings.hotkey.press') : keyName(settings.hotkey.name)}</Keycap>
            <button className="btn" onClick={captureHotkey} disabled={capturing}>
              {t('settings.hotkey.change')}
            </button>
          </div>
        </Row>
        {captureError && <p className="feedback error">{captureError}</p>}
        <Row label={t('settings.mode')} hint={t('settings.mode.hint')}>
          <div className="segmented">
            <button className={settings.mode === 'hold' ? 'active' : ''} onClick={() => update({ mode: 'hold' })}>
              {t('settings.mode.hold')}
            </button>
            <button className={settings.mode === 'toggle' ? 'active' : ''} onClick={() => update({ mode: 'toggle' })}>
              {t('settings.mode.toggle')}
            </button>
          </div>
        </Row>
        <Row label={t('settings.language')}>
          <select className="select" value={settings.language} onChange={(e) => update({ language: e.target.value })}>
            <option value="">{t('settings.language.auto')}</option>
            {SPOKEN_LANGUAGES.map((code) => (
              <option key={code} value={code}>
                {spokenLanguage(code)}
              </option>
            ))}
          </select>
        </Row>
        <Row label={t('settings.mic')}>
          <select
            className="select"
            value={settings.microphoneId}
            onChange={(e) => update({ microphoneId: e.target.value })}
          >
            <option value="">{t('settings.mic.default')}</option>
            {microphones.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || t('settings.mic.unnamed')}
              </option>
            ))}
          </select>
        </Row>
      </Card>

      <Card title={t('settings.models')}>
        <Row label={t('settings.transcriptionModel')}>
          <select
            className="select"
            value={settings.transcriptionModel}
            onChange={(e) => update({ transcriptionModel: e.target.value })}
          >
            {modelOptions(TRANSCRIPTION_MODELS, settings.transcriptionModel).map(([value, name]) => (
              <option key={value} value={value}>
                {name}
              </option>
            ))}
          </select>
        </Row>
        <Row label={t('settings.cleanup')} hint={t('settings.cleanup.hint')}>
          <Switch
            label={t('settings.cleanup')}
            checked={settings.cleanupEnabled}
            onChange={(v) => update({ cleanupEnabled: v })}
          />
        </Row>
        {settings.cleanupEnabled && (
          <Row label={t('settings.cleanupModel')}>
            <select
              className="select"
              value={settings.cleanupModel}
              onChange={(e) => update({ cleanupModel: e.target.value })}
            >
              {modelOptions(CLEANUP_MODELS, settings.cleanupModel).map(([value, name]) => (
                <option key={value} value={value}>
                  {name}
                </option>
              ))}
            </select>
          </Row>
        )}
      </Card>

      <Card title={t('settings.general')}>
        <Row label={t('settings.uiLanguage')}>
          <select
            className="select"
            value={settings.uiLanguage}
            onChange={(e) => update({ uiLanguage: e.target.value as Lang })}
          >
            {UI_LANGUAGES.map(({ code, name }) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </Row>
        <Row label={t('settings.sounds')} hint={t('settings.sounds.hint')}>
          <Switch label={t('settings.sounds')} checked={settings.sounds} onChange={(v) => update({ sounds: v })} />
        </Row>
        <Row label={t('settings.restoreClipboard')} hint={t('settings.restoreClipboard.hint')}>
          <Switch
            label={t('settings.restoreClipboard')}
            checked={settings.restoreClipboard}
            onChange={(v) => update({ restoreClipboard: v })}
          />
        </Row>
        {window.murmr.platform !== 'linux' && (
          <Row label={t('settings.openAtLogin')}>
            <Switch
              label={t('settings.openAtLogin')}
              checked={settings.openAtLogin}
              onChange={(v) => update({ openAtLogin: v })}
            />
          </Row>
        )}
      </Card>

      <Card title={t('settings.advanced')} description={t('settings.advanced.desc')}>
        <Row label={t('settings.baseUrl')}>
          <input
            className="input mono"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            onBlur={() => baseUrl.trim() && baseUrl !== settings.baseUrl && update({ baseUrl: baseUrl.trim() })}
            spellCheck={false}
          />
        </Row>
      </Card>
    </div>
  );
}
