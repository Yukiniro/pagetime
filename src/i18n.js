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
import { formatDuration } from './duration.mjs';

const resources = { 'zh-CN': zhCN, 'zh-TW': zhTW, en, ja, ko, de, es, fr, 'pt-BR': ptBR, ru };
export const languages = [['zh-CN', '简体中文'], ['zh-TW', '繁體中文'], ['en', 'English'], ['ja', '日本語'], ['ko', '한국어'], ['de', 'Deutsch'], ['es', 'Español'], ['fr', 'Français'], ['pt-BR', 'Português (Brasil)'], ['ru', 'Русский']];

function rememberLanguage(lng) {
  if (typeof location === 'undefined' || !['chrome-extension:', 'moz-extension:'].includes(location.protocol)) return;
  import('wxt/browser').then(({ browser }) => browser.storage.local.set({ language: lng })).catch(error => console.error('PageTime could not store the language', error));
}

i18n.on('languageChanged', () => {
  document.documentElement.lang = i18n.resolvedLanguage;
  document.title = i18n.t('appTitle');
  rememberLanguage(i18n.resolvedLanguage);
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

// A change that rounds to zero keeps its direction.
export function signedPercent(percent) {
  const abs = Math.abs(percent);
  const digits = abs < 1 ? 1 : 0;
  const rounded = Number(abs.toFixed(digits));
  const text = new Intl.NumberFormat(i18n.resolvedLanguage, { style: 'percent', maximumFractionDigits: digits }).format(rounded / 100);
  return `${percent < 0 ? '−' : '+'}${text}`;
}

export function duration(ms) {
  return formatDuration(ms, (key, options) => i18n.t(key, options));
}

export default i18n;
