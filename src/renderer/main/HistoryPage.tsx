import { useMemo, useState } from 'react';
import type { HistoryEntry } from '../../shared/types';
import { useHistory } from './hooks';
import { useI18n } from './i18n';
import { Icon } from './ui';

export function HistoryItem({ entry }: { entry: HistoryEntry }) {
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);
  const { t, locale } = useI18n();
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(entry.createdAt);

  const copy = async () => {
    await window.murmr.copy(entry.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <article className="history-item">
      <div className="history-meta">
        <span>{time}</span>
        <span className={`badge ${entry.cleaned ? 'badge-ai' : ''}`}>
          {t(entry.cleaned ? 'history.badge.ai' : 'history.badge.raw')}
        </span>
      </div>
      <div className="history-body">
        <p>{entry.text}</p>
        {showRaw && <p className="raw">{t('history.original', { text: entry.raw })}</p>}
      </div>
      <div className="history-actions">
        <button className="icon-btn" title={t('history.copy')} onClick={copy}>
          <Icon name={copied ? 'check' : 'copy'} size={16} />
        </button>
        {entry.cleaned && entry.raw !== entry.text && (
          <button className="icon-btn" title={t('history.showOriginal')} onClick={() => setShowRaw(!showRaw)}>
            <Icon name="eye" size={16} />
          </button>
        )}
        <button className="icon-btn danger" title={t('history.delete')} onClick={() => window.murmr.history.remove(entry.id)}>
          <Icon name="trash" size={16} />
        </button>
      </div>
    </article>
  );
}

export function HistoryPage() {
  const history = useHistory();
  const [query, setQuery] = useState('');
  const { t, locale } = useI18n();

  const groups = useMemo(() => {
    const dayFormat = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' });
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86_400_000).toDateString();
    const dayLabel = (ts: number) => {
      const day = new Date(ts).toDateString();
      if (day === today) return t('history.today');
      if (day === yesterday) return t('history.yesterday');
      return dayFormat.format(ts);
    };

    const q = query.trim().toLowerCase();
    const filtered = q ? history.filter((e) => e.text.toLowerCase().includes(q) || e.raw.toLowerCase().includes(q)) : history;
    const map = new Map<string, HistoryEntry[]>();
    for (const entry of filtered) {
      const label = dayLabel(entry.createdAt);
      map.set(label, [...(map.get(label) ?? []), entry]);
    }
    return [...map.entries()];
  }, [history, query, t, locale]);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>{t('history.title')}</h1>
          <p className="muted">{t('history.desc')}</p>
        </div>
        {history.length > 0 && (
          <button
            className="btn ghost danger"
            onClick={() => window.confirm(t('history.clearConfirm')) && window.murmr.history.clear()}
          >
            {t('history.clear')}
          </button>
        )}
      </header>

      {history.length === 0 ? (
        <div className="empty-state">
          <Icon name="history" size={32} />
          <p>{t('history.empty')}</p>
        </div>
      ) : (
        <>
          <input
            className="input search"
            placeholder={t('history.search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {groups.map(([day, entries]) => (
            <section key={day} className="history-group">
              <h4>{day}</h4>
              <div className="history-list">
                {entries.map((entry) => (
                  <HistoryItem key={entry.id} entry={entry} />
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
