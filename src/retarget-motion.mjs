// Cancel in-flight motion and keep the latest end state. First paint and
// reduced motion apply that state immediately: no count-up and no slide.

const EASING = 'cubic-bezier(0.2, 0, 0, 1)';

export function reducedMotion() {
  return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
}

export function nextTabKey(keys, current, key) {
  const index = keys.indexOf(current);
  if (index < 0 || keys.length === 0) return null;
  if (key === 'ArrowRight') return keys[(index + 1) % keys.length];
  if (key === 'ArrowLeft') return keys[(index + keys.length - 1) % keys.length];
  if (key === 'Home') return keys[0];
  if (key === 'End') return keys[keys.length - 1];
  return null;
}

export function indicatorFrame(tab, list) {
  const left = tab.offsetLeft - list.offsetLeft;
  const top = tab.offsetTop - list.offsetTop + tab.offsetHeight - 2;
  return { transform: `translate3d(${left}px, ${top}px, 0)`, width: `${tab.offsetWidth}px` };
}

function paint(node, frame) {
  for (const [key, value] of Object.entries(frame)) node.style[key] = value;
}

function heldFrame(node, end) {
  const computed = node.ownerDocument?.defaultView?.getComputedStyle?.(node);
  if (!computed) return null;
  const held = {};
  for (const key of Object.keys(end)) {
    const value = computed[key];
    if (value) held[key] = value;
  }
  return Object.keys(held).length ? held : null;
}

export function retarget(node, frames, { first = false, reduce = false, duration = 160 } = {}) {
  if (!node || !frames?.length) return 'missing';
  const end = frames[frames.length - 1];
  const running = node.getAnimations?.() ?? [];
  let sequence = frames;
  if (!first && !reduce && running.length) {
    const held = heldFrame(node, end);
    if (held) {
      paint(node, held);
      sequence = [held, end];
    }
  }
  for (const animation of running) animation.cancel();
  if (first || reduce || typeof node.animate !== 'function') {
    paint(node, end);
    return 'still';
  }
  try {
    node.animate(sequence, { duration, easing: EASING, fill: 'forwards' });
  } catch {
    paint(node, end);
    return 'still';
  }
  return 'played';
}
