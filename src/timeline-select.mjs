import { addDays, midnight } from './model.mjs';

// Spans that overlap the local day [midnight, next midnight). The timeline tooltip,
// custom series, screen-reader list, and segment buttons all use this list, so a
// click dataIndex addresses the same span as Enter or Space on that button.
export function spansOnDay(spans, day) {
  const start = midnight(day);
  const end = addDays(start, 1);
  return (spans ?? []).filter(span => span.end > start && span.start < end);
}

// Grouped site key for one block. Gray blocks that sit outside the legend still
// return `site || domain`, never the legend label for the rest. A blank track
// has no integer dataIndex into this list.
export function timelineDomainAt(spans, dataIndex) {
  if (!Number.isInteger(dataIndex) || dataIndex < 0 || dataIndex >= (spans?.length ?? 0)) return '';
  const span = spans[dataIndex];
  return span?.site || span?.domain || '';
}
