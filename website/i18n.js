import { createInstance } from 'i18next';
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
import { formatDuration } from '../src/duration.mjs';

const resources = { 'zh-CN': zhCN, 'zh-TW': zhTW, en, ja, ko, de, es, fr, 'pt-BR': ptBR, ru };
export const languages = [['zh-CN', '简体中文'], ['zh-TW', '繁體中文'], ['en', 'English'], ['ja', '日本語'], ['ko', '한국어'], ['de', 'Deutsch'], ['es', 'Español'], ['fr', 'Français'], ['pt-BR', 'Português (Brasil)'], ['ru', 'Русский']];
const i18n = createInstance();
i18n.on('languageChanged', () => {
  document.documentElement.lang = i18n.resolvedLanguage;
  document.title = i18n.t('home.title');
});
i18n.use(LanguageDetector).use(initReactI18next).init({
  resources: Object.fromEntries(Object.entries(resources).map(([code, translation]) => [code, { translation }])),
  supportedLngs: languages.map(([code]) => code),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  detection: {
    order: ['localStorage', 'navigator'],
    lookupLocalStorage: 'pagetime-website-language',
    caches: ['localStorage'],
    convertDetectedLanguage: lng => /^zh-(hant|tw|hk|mo)\b/i.test(lng) ? 'zh-TW' : lng,
  },
});

export const formatDate = (at, options) => new Date(at).toLocaleDateString(i18n.resolvedLanguage, options);
export const timeLabel = at => new Date(at).toLocaleTimeString(i18n.resolvedLanguage, { hour: '2-digit', minute: '2-digit', hour12: false });
export const duration = ms => formatDuration(ms, (key, options) => i18n.t(key, options));
export default i18n;
