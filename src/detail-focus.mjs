export function detailFocusTarget(trigger, heading) {
  if (trigger?.isConnected) return trigger;
  return heading ?? null;
}
