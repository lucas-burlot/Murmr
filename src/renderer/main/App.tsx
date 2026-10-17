import { useState } from 'react';
import type { MessageKey } from '../../shared/i18n';
import { localModel } from '../../shared/models';
import logoMark from './assets/logo-mark.png';
import { DictionaryPage } from './DictionaryPage';
import { HistoryPage } from './HistoryPage';
import { HomePage } from './HomePage';
import { useDictationState, usePermissions, useSettings } from './hooks';
import { I18nProvider, useI18n } from './i18n';
import { SettingsPage } from './SettingsPage';
import { Icon, Keycap } from './ui';

export type Page = 'home' | 'history' | 'dictionary' | 'settings';

const NAV: Array<{ id: Page; label: MessageKey; icon: Parameters<typeof Icon>[0]['name'] }> = [
  { id: 'home', label: 'nav.home', icon: 'home' },
  { id: 'history', label: 'nav.history', icon: 'history' },
  { id: 'dictionary', label: 'nav.dictionary', icon: 'book' },
  { id: 'settings', label: 'nav.settings', icon: 'settings' },
];

export function App() {
  const [settings, update] = useSettings();
  if (!settings) return null;
  return (
    <I18nProvider lang={settings.uiLanguage}>
      <Shell settings={settings} update={update} />
    </I18nProvider>
  );
}

type Props = { settings: NonNullable<ReturnType<typeof useSettings>[0]>; update: ReturnType<typeof useSettings>[1] };

function Shell({ settings, update }: Props) {
  const [page, setPage] = useState<Page>('home');
  const { state } = useDictationState();
  const [perms] = usePermissions();
  const { t, tn, keyName } = useI18n();
  const hookInactive = perms !== null && !perms.keyboardHookRunning;

  return (
    <div className={`app platform-${window.murmr.platform}`}>
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-mark" src={logoMark} alt="" />
          <span>Murmr</span>
        </div>
        <nav>
          {NAV.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? 'active' : ''}`}
              onClick={() => setPage(item.id)}
            >
              <Icon name={item.icon} />
              {t(item.label)}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className={`status status-${hookInactive ? 'error' : state}`}>
            <span className="status-dot" />
            {hookInactive ? t('state.hookInactive') : t(`state.${state}`)}
          </div>
          <button className="engine-chip" onClick={() => setPage('settings')}>
            <Icon name={settings.engine === 'local' ? 'laptop' : 'cloud'} size={14} />
            {settings.engine === 'local'
              ? t('engine.local.short', { model: t(`model.name.${localModel(settings.localModel).id}`) })
              : t('engine.cloud.short')}
          </button>
          <div className="muted small">
            {tn(settings.mode === 'hold' ? 'sidebar.hold' : 'sidebar.press', {
              key: <Keycap>{keyName(settings.hotkey.name)}</Keycap>,
            })}
          </div>
        </div>
      </aside>
      <main className="content">
        {page === 'home' && <HomePage settings={settings} update={update} navigate={setPage} />}
        {page === 'history' && <HistoryPage />}
        {page === 'dictionary' && <DictionaryPage settings={settings} update={update} />}
        {page === 'settings' && <SettingsPage settings={settings} update={update} />}
      </main>
    </div>
  );
}
