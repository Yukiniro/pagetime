import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import zhCN from './locales/zh-CN.json';
import zhTW from './locales/zh-TW.json';
import en from './locales/en.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';
import de from './locales/de.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import ptBR from './locales/pt-BR.json';
import ru from './locales/ru.json';

const resources = { 'zh-CN': zhCN, 'zh-TW': zhTW, en, ja, ko, de, es, fr, 'pt-BR': ptBR, ru };
export const languages = [['zh-CN', '简体中文'], ['zh-TW', '繁體中文'], ['en', 'English'], ['ja', '日本語'], ['ko', '한국어'], ['de', 'Deutsch'], ['es', 'Español'], ['fr', 'Français'], ['pt-BR', 'Português (Brasil)'], ['ru', 'Русский']];

i18n.on('languageChanged', () => {
  document.documentElement.lang = i18n.resolvedLanguage;
  document.title = i18n.t('appTitle');
});

i18n.use(LanguageDetector).use(initReactI18next).init({
  resources: Object.fromEntries(Object.entries(resources).map(([code, translation]) => [code, { translation }])),
  supportedLngs: languages.map(([code]) => code),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  detection: {
    order: ['localStorage', 'navigator'],
    lookupLocalStorage: 'pagetime-language',
    caches: ['localStorage'],
    // Traditional Chinese regions would otherwise resolve to zh-CN through the bare "zh" match.
    convertDetectedLanguage: lng => /^zh-(hant|tw|hk|mo)\b/i.test(lng) ? 'zh-TW' : lng,
  },
});

export const formatDate = (at, options) => new Date(at).toLocaleDateString(i18n.resolvedLanguage, options);
export const timeLabel = at => new Date(at).toLocaleTimeString(i18n.resolvedLanguage, { hour: '2-digit', minute: '2-digit', hour12: false });

export function duration(ms) {
  if (ms < 60_000) return ms ? i18n.t('duration.underMinute') : i18n.t('duration.minutes', { count: 0 });
  const mins = Math.floor(ms / 60_000);
  return mins >= 60 ? i18n.t('duration.hours', { hours: Math.floor(mins / 60), minutes: mins % 60 }) : i18n.t('duration.minutes', { count: mins });
}

export default i18n;
