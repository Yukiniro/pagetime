import { useEffect, useLayoutEffect, useState } from 'react';
import { applyDocumentTheme, resolveTheme } from './theme.mjs';

const QUERY = '(prefers-color-scheme: dark)';

export function useDocumentTheme(preference, ready) {
  const [systemDark, setSystemDark] = useState(() => window.matchMedia(QUERY).matches);
  useEffect(() => {
    const media = window.matchMedia(QUERY);
    const onChange = () => setSystemDark(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  const isDark = resolveTheme(preference, systemDark) === 'dark';
  useLayoutEffect(() => {
    if (ready) applyDocumentTheme(isDark);
  }, [ready, isDark]);
  return isDark;
}
