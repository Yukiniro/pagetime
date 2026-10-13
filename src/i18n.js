import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import zh from './locales/zh.json';
import en from './locales/en.json';

export const languages = [['zh', '简体中文'], ['en', 'English']];

i18n.on('languageChanged', () => {
  document.documentElement.lang = i18n.resolvedLanguage === 'zh' ? 'zh-CN' : 'en';
  document.title = i18n.t('appTitle');
});

i18n.use(LanguageDetector).use(initReactI18next).init({
  resources: { zh: { translation: zh }, en: { translation: en } },
  supportedLngs: languages.map(([code]) => code),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  detection: { order: ['localStorage', 'navigator'], lookupLocalStorage: 'pagetime-language', caches: ['localStorage'] },
});

export const formatDate = (at, options) => new Date(at).toLocaleDateString(i18n.resolvedLanguage, options);
export const timeLabel = at => new Date(at).toLocaleTimeString(i18n.resolvedLanguage, { hour: '2-digit', minute: '2-digit', hour12: false });

export function duration(ms) {
  if (ms < 60_000) return ms ? i18n.t('duration.underMinute') : i18n.t('duration.minutes', { count: 0 });
  const mins = Math.floor(ms / 60_000);
  return mins >= 60 ? i18n.t('duration.hours', { hours: Math.floor(mins / 60), minutes: mins % 60 }) : i18n.t('duration.minutes', { count: mins });
}

export default i18n;
