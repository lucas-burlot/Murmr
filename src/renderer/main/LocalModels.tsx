import type { Settings } from '../../shared/types';
import { useModels } from './hooks';
import { useI18n } from './i18n';
import { Icon } from './ui';

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => Promise<void>;
}

export function LocalModels({ settings, update }: Props) {
  const { models, progress } = useModels();
  const { t } = useI18n();

  return (
    <div className="model-list">
      {models.map((model) => {
        const p = progress[model.id];
        const downloading = p?.state === 'downloading';
        const percent = p && p.total ? Math.floor((p.received / p.total) * 100) : 0;
        const selected = settings.localModel === model.id;

        return (
          <div key={model.id} className={`model-row ${selected && model.downloaded ? 'selected' : ''}`}>
            <div className="model-text">
              <strong>{t(`model.local.${model.id}`)}</strong>
              <span className="muted small">{t('models.size', { mb: model.sizeMb })}</span>
              {p?.state === 'error' && (
                <span className="feedback error">{t('models.error', { detail: p.error ?? '' })}</span>
              )}
            </div>
            <div className="model-actions">
              {downloading ? (
                <>
                  <div className="progress" aria-label={t('models.downloading', { percent })}>
                    <span style={{ width: `${percent}%` }} />
                  </div>
                  <span className="small muted progress-label">{percent}%</span>
                  <button className="btn" onClick={() => window.murmr.models.cancel(model.id)}>
                    {t('models.cancel')}
                  </button>
                </>
              ) : model.downloaded ? (
                <>
                  {selected ? (
                    <span className="badge badge-ai">{t('models.inUse')}</span>
                  ) : (
                    <button className="btn" onClick={() => update({ localModel: model.id })}>
                      {t('models.use')}
                    </button>
                  )}
                  <button
                    className="icon-btn danger"
                    title={t('models.delete')}
                    onClick={() => window.murmr.models.remove(model.id)}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </>
              ) : (
                <button
                  className="btn primary"
                  onClick={() => {
                    void update({ localModel: model.id });
                    void window.murmr.models.download(model.id);
                  }}
                >
                  {t('models.download')}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
