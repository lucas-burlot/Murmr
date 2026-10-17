import { useState, type FormEvent } from 'react';
import type { Settings } from '../../shared/types';
import { useI18n } from './i18n';
import { Card, Icon } from './ui';

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => Promise<void>;
}

export function DictionaryPage({ settings, update }: Props) {
  const [word, setWord] = useState('');
  const { t } = useI18n();

  const add = (e: FormEvent) => {
    e.preventDefault();
    const words = word
      .split(',')
      .map((w) => w.trim())
      .filter((w) => w && !settings.dictionary.includes(w));
    if (words.length) void update({ dictionary: [...settings.dictionary, ...words] });
    setWord('');
  };

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>{t('dictionary.title')}</h1>
          <p className="muted">{t('dictionary.desc')}</p>
        </div>
      </header>

      <Card>
        <form className="inline-form" onSubmit={add}>
          <input
            className="input"
            placeholder={t('dictionary.placeholder')}
            value={word}
            onChange={(e) => setWord(e.target.value)}
          />
          <button className="btn primary" type="submit" disabled={!word.trim()}>
            {t('dictionary.add')}
          </button>
        </form>

        {settings.dictionary.length === 0 ? (
          <p className="muted empty-inline">{t('dictionary.empty')}</p>
        ) : (
          <div className="chips">
            {settings.dictionary.map((w) => (
              <span key={w} className="chip">
                {w}
                <button
                  aria-label={t('dictionary.remove', { word: w })}
                  onClick={() => update({ dictionary: settings.dictionary.filter((x) => x !== w) })}
                >
                  <Icon name="x" size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
