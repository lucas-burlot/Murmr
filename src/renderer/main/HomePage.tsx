import type { Settings } from '../../shared/types';
import type { Page } from './App';
import { EngineCard } from './EngineCard';
import { HistoryItem } from './HistoryPage';
import { useHistory, useModels, usePermissions } from './hooks';
import { useI18n } from './i18n';
import { Card, Icon, Keycap } from './ui';

const TYPING_WPM = 40; // average typing speed, used for the "time saved" estimate

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => Promise<void>;
  navigate: (page: Page) => void;
}

export function HomePage({ settings, update, navigate }: Props) {
  const history = useHistory();
  const [perms, request] = usePermissions();
  const { models } = useModels();
  const local = settings.engine === 'local';
  const modelReady = models.some((m) => m.id === settings.localModel && m.downloaded);
  const { t, tn, keyName, locale } = useI18n();

  const words = history.reduce((n, e) => n + e.text.split(/\s+/).filter(Boolean).length, 0);
  const spokenMinutes = history.reduce((n, e) => n + e.durationMs, 0) / 60_000;
  const savedMinutes = Math.max(0, Math.round(words / TYPING_WPM - spokenMinutes));
  const hold = settings.mode === 'hold';

  type Step = {
    done: boolean;
    title: string;
    text: string;
    button: string;
    onClick: () => void;
    secondary?: { label: string; onClick: () => void };
  };
  const steps: Step[] = [
    local
      ? {
          done: modelReady,
          title: t('home.step.model.title'),
          text: t('home.step.model.text'),
          button: t('home.step.model.button'),
          onClick: () => navigate('settings'),
        }
      : {
          done: !!settings.apiKey,
          title: t('home.step.key.title'),
          text: t('home.step.key.text'),
          button: t('home.step.key.button'),
          onClick: () => navigate('settings'),
          secondary: {
            label: t('home.step.key.alt'),
            onClick: () => {
              void update({ engine: 'local' });
              navigate('settings');
            },
          },
        },
    {
      done: perms?.microphone === 'granted',
      title: t('home.step.mic.title'),
      text: t('home.step.mic.text'),
      button: t('home.step.mic.button'),
      onClick: () => request('microphone'),
    },
    ...(perms?.platform === 'darwin'
      ? [
          {
            done: perms.accessibility && perms.keyboardHookRunning,
            title: t('home.step.ax.title'),
            text: t(perms.devMode ? 'home.step.ax.textDev' : 'home.step.ax.text'),
            button: t('home.step.ax.button'),
            onClick: () => request('accessibility'),
          },
        ]
      : []),
  ];
  const ready = perms !== null && steps.every((s) => s.done);

  return (
    <div className="page">
      <header className="hero">
        <h1>{tn(hold ? 'home.title.hold' : 'home.title.toggle', { key: <Keycap>{keyName(settings.hotkey.name)}</Keycap> })}</h1>
        <p className="muted">
          {tn(hold ? 'home.subtitle.hold' : 'home.subtitle.toggle', { esc: <Keycap>{keyName('Escape')}</Keycap> })}
        </p>
      </header>

      {perms && !ready && (
        <Card title={t('home.setup.title')} description={t('home.setup.desc')}>
          <ol className="steps">
            {steps.map((step) => (
              <li key={step.title} className={step.done ? 'done' : ''}>
                <span className="step-check">{step.done ? <Icon name="check" size={14} /> : null}</span>
                <div className="step-text">
                  <strong>{step.title}</strong>
                  <span className="muted">{step.text}</span>
                  {!step.done && step.secondary && (
                    <button className="link-btn" onClick={step.secondary.onClick}>
                      {step.secondary.label}
                    </button>
                  )}
                </div>
                {!step.done && (
                  <button className="btn primary" onClick={step.onClick}>
                    {step.button}
                  </button>
                )}
              </li>
            ))}
          </ol>
        </Card>
      )}

      <EngineCard settings={settings} update={update} navigate={navigate} />

      <Card title={t('home.mode.title')} description={t('home.mode.desc')}>
        <div className="mode-choice">
          <button
            className={`mode-option ${!settings.cleanupEnabled ? 'selected' : ''}`}
            onClick={() => update({ cleanupEnabled: false })}
          >
            <Icon name="wave" size={22} />
            <strong>{t('home.mode.raw.title')}</strong>
            <span className="muted">{t('home.mode.raw.text')}</span>
          </button>
          <button
            className={`mode-option ${settings.cleanupEnabled ? 'selected' : ''}`}
            onClick={() => update({ cleanupEnabled: true })}
          >
            <Icon name="sparkles" size={22} />
            <strong>{t('home.mode.ai.title')}</strong>
            <span className="muted">{t('home.mode.ai.text')}</span>
            {!settings.apiKey && <span className="mode-note">{t('home.mode.ai.needsKey')}</span>}
          </button>
        </div>
      </Card>

      <div className="stats">
        <div className="stat">
          <span className="stat-value">{words.toLocaleString(locale)}</span>
          <span className="muted">{t('home.stats.words')}</span>
        </div>
        <div className="stat">
          <span className="stat-value">{history.length.toLocaleString(locale)}</span>
          <span className="muted">{t('home.stats.dictations')}</span>
        </div>
        <div className="stat">
          <span className="stat-value">{t('home.stats.minutes', { n: savedMinutes })}</span>
          <span className="muted">{t('home.stats.saved')}</span>
        </div>
      </div>

      {history.length > 0 && (
        <Card title={t('home.recent')}>
          <div className="history-list">
            {history.slice(0, 3).map((entry) => (
              <HistoryItem key={entry.id} entry={entry} />
            ))}
          </div>
          <button className="btn ghost" onClick={() => navigate('history')}>
            {t('home.seeAll')}
          </button>
        </Card>
      )}
    </div>
  );
}
