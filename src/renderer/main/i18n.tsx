import { createContext, Fragment, useContext, useMemo, type ReactNode } from 'react';
import { keyLabel, translate, type Lang, type MessageKey, type Vars } from '../../shared/i18n';

interface I18n {
  lang: Lang;
  locale: string; // for Intl formatting
  t(key: MessageKey, vars?: Vars): string;
  /** Like t(), but placeholders can be React nodes (e.g. a keycap inside a sentence). */
  tn(key: MessageKey, nodes: Record<string, ReactNode>): ReactNode;
  keyName(name: string): string;
}

function createI18n(lang: Lang): I18n {
  return {
    lang,
    locale: lang === 'fr' ? 'fr-FR' : 'en-US',
    t: (key, vars) => translate(lang, key, vars),
    tn: (key, nodes) =>
      translate(lang, key)
        .split(/(\{\w+\})/)
        .map((part, i) => {
          const name = /^\{(\w+)\}$/.exec(part)?.[1];
          return <Fragment key={i}>{name && name in nodes ? nodes[name] : part}</Fragment>;
        }),
    keyName: (name) => keyLabel(name, window.murmr.platform, lang),
  };
}

const I18nContext = createContext<I18n>(createI18n('en'));

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  const value = useMemo(() => createI18n(lang), [lang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  return useContext(I18nContext);
}
