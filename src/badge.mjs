import { addDays, midnight, openCredit, overlapMs } from './model.mjs';
import { formatDuration } from './duration.mjs';
import zhCN from './locales/zh-CN.json' with { type: 'json' };
import zhTW from './locales/zh-TW.json' with { type: 'json' };
import en from './locales/en.json' with { type: 'json' };
import ja from './locales/ja.json' with { type: 'json' };
import ko from './locales/ko.json' with { type: 'json' };
import de from './locales/de.json' with { type: 'json' };
import es from './locales/es.json' with { type: 'json' };
import fr from './locales/fr.json' with { type: 'json' };
import ptBR from './locales/pt-BR.json' with { type: 'json' };
import ru from './locales/ru.json' with { type: 'json' };

const resources = { 'zh-CN': zhCN, 'zh-TW': zhTW, en, ja, ko, de, es, fr, 'pt-BR': ptBR, ru };

// Active badge matches the light-blue analytics UI. Pause keeps a visible mark so an empty number is not mistaken for "still counting".
export const BADGE_COLOR = '#2875ff';
export const PAUSED_BADGE_TEXT = 'II';
export const PAUSED_BADGE_COLOR = '#94a3b8';

const SUPPORTED = Object.keys(resources);

export function resolveLocale(code) {
  if (typeof code !== 'string' || !code.trim()) return 'en';
  const normalized = code.trim().replaceAll('_', '-');
  const exact = SUPPORTED.find(item => item.toLowerCase() === normalized.toLowerCase());
  if (exact) return exact;
  if (/^zh-(hant|tw|hk|mo)\b/i.test(normalized)) return 'zh-TW';
  if (/^zh\b/i.test(normalized)) return 'zh-CN';
  if (/^pt\b/i.test(normalized)) return 'pt-BR';
  const base = normalized.split('-')[0].toLowerCase();
  return SUPPORTED.find(item => item.toLowerCase() === base) ?? 'en';
}

function lookup(messages, path) {
  let node = messages;
  for (const part of path.split('.')) {
    if (!node || typeof node !== 'object' || !(part in node)) return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

function translate(locale, key, options = {}) {
  const messages = resources[resolveLocale(locale)] ?? en;
  let template = lookup(messages, key) ?? lookup(en, key) ?? key;
  if (options.count !== undefined) {
    const category = new Intl.PluralRules(resolveLocale(locale)).select(options.count);
    template = lookup(messages, `${key}_${category}`) ?? lookup(messages, `${key}_other`) ?? lookup(en, `${key}_${category}`) ?? lookup(en, `${key}_other`) ?? template;
  }
  return template.replace(/{{\s*(\w+)\s*}}/g, (_, name) => options[name] ?? '');
}

// Chrome fits about four characters on the toolbar badge. Minutes are floored, never rounded up.
// | duration                         | text   |
// | 0 – 59s                          | 0m     |
// | 1 – 59 min                       | 1m–59m |
// | 1h00 – 9h59                      | 1h00–9h59 |
// | 10h – 99h                        | 10h–99h |
// | 100h and above                   | 99h+   |
export function badgeText(ms) {
  const safe = Number.isFinite(ms) ? Math.max(0, Math.floor(ms)) : 0;
  const minutes = Math.floor(safe / 60_000);
  if (minutes < 1) return '0m';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 10) return `${hours}h${String(minutes % 60).padStart(2, '0')}`;
  if (hours < 100) return `${hours}h`;
  return '99h+';
}

/**
 * Today's committed day rows plus the live cursor, capped like a tick and clipped to the local day.
 * @param {{ rows?: { domainId: number, ms: number }[], domains?: { id: number, host: string }[], cursor?: { domain: string, since: number } | null, lastEnd?: number, now: number, enabled?: boolean }} input
 */
export function todayFigures({ rows = [], domains = [], cursor = null, lastEnd, now, enabled = true }) {
  const host = new Map(domains.map(row => [row.id, row.host]));
  const byDomain = new Map();
  let stored = 0;
  for (const row of rows) {
    stored += row.ms;
    const domain = host.get(row.domainId);
    if (!domain) continue;
    byDomain.set(domain, (byDomain.get(domain) ?? 0) + row.ms);
  }
  const segment = enabled ? openCredit(cursor, lastEnd, now) : null;
  const dayStart = midnight(now);
  const added = overlapMs(segment, dayStart, addDays(dayStart, 1));
  const domain = enabled && typeof cursor?.domain === 'string' && cursor.domain ? cursor.domain : null;
  const siteAdded = segment && domain && segment.domain === domain ? added : 0;
  return { total: stored + added, domain, siteMs: domain ? (byDomain.get(domain) ?? 0) + siteAdded : 0 };
}

export function badgeLabels({ locale, total, domain, siteMs, paused }) {
  const t = (key, options) => translate(locale, key, options);
  if (paused) return { text: PAUSED_BADGE_TEXT, color: PAUSED_BADGE_COLOR, title: t('badge.paused') };
  const duration = formatDuration(total, t);
  const title = domain
    ? t('badge.todaySite', { duration, domain, siteDuration: formatDuration(siteMs, t) })
    : t('badge.today', { duration });
  return { text: badgeText(total), color: BADGE_COLOR, title };
}
