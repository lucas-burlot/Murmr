import { localModel } from '../../shared/models';
import type { Settings } from '../../shared/types';
import type { Page } from './App';
import { useModels } from './hooks';
import { useI18n } from './i18n';
import { Card, Icon } from './ui';

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => Promise<void>;
  navigate: (page: Page) => void;
}

/** Cloud vs local, front and center, with what each one still needs. */
export function EngineCard({ settings, update, navigate }: Props) {
  const { t } = useI18n();
  const { models, progress } = useModels();
  const model = localModel(settings.localModel);
  const modelName = t(`model.name.${model.id}`);
  const modelReady = models.some((m) => m.id === model.id && m.downloaded);
  const p = progress[model.id];
  const downloading = p?.state === 'downloading';
  const percent = p && p.total ? Math.floor((p.received / p.total) * 100) : 0;

  const cloudStatus = settings.apiKey ? (
    <span className="engine-status ok">
      <Icon name="check" size={14} /> {t('home.engine.cloud.ready')}
    </span>
  ) : (
    <button className="engine-status action" onClick={(e) => (e.stopPropagation(), navigate('settings'))}>
      {t('home.engine.cloud.missing')} →
    </button>
  );

  const localStatus = modelReady ? (
    <span className="engine-status ok">
      <Icon name="check" size={14} /> {t('home.engine.local.ready', { model: modelName })}
      <button className="link-btn inline" onClick={(e) => (e.stopPropagation(), navigate('settings'))}>
        {t('home.engine.change')}
      </button>
    </span>
  ) : downloading ? (
    <span className="engine-status">
      <span className="progress small">
        <span style={{ width: `${percent}%` }} />
      </span>
      {t('models.downloading', { percent })}
    </span>
  ) : (
    <button
      className="engine-status action"
      onClick={(e) => {
        e.stopPropagation();
        void update({ engine: 'local' });
        void window.murmr.models.download(model.id);
      }}
    >
      {t('home.engine.local.missing', { model: modelName, mb: model.sizeMb })} ↓
    </button>
  );

  return (
    <Card title={t('home.engine.title')} description={t('home.engine.desc')}>
      <div className="mode-choice">
        <div
          role="button"
          tabIndex={0}
          className={`mode-option ${settings.engine === 'cloud' ? 'selected' : ''}`}
          onClick={() => update({ engine: 'cloud' })}
          onKeyDown={(e) => e.key === 'Enter' && update({ engine: 'cloud' })}
        >
          <Icon name="cloud" size={22} />
          <strong>{t('home.engine.cloud.title')}</strong>
          <span className="muted">{t('home.engine.cloud.text')}</span>
          {cloudStatus}
        </div>
        <div
          role="button"
          tabIndex={0}
          className={`mode-option ${settings.engine === 'local' ? 'selected' : ''}`}
          onClick={() => update({ engine: 'local' })}
          onKeyDown={(e) => e.key === 'Enter' && update({ engine: 'local' })}
        >
          <Icon name="laptop" size={22} />
          <strong>{t('home.engine.local.title')}</strong>
          <span className="muted">{t('home.engine.local.text')}</span>
          {localStatus}
        </div>
      </div>
    </Card>
  );
}
