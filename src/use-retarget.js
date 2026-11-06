import { useLayoutEffect, useRef } from 'react';
import { reducedMotion, retarget } from './retarget-motion.mjs';

export function useSettle(token) {
  const ref = useRef(null);
  const seen = useRef(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || seen.current === token) return;
    const first = seen.current === null;
    seen.current = token;
    retarget(node, [{ opacity: '0.72' }, { opacity: '1' }], { first, reduce: reducedMotion() });
  }, [token]);
  return ref;
}
