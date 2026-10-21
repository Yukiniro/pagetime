import { midnight } from './model.mjs';

// Today keeps the existing timeline copy. Any other chart day uses the neutral
// title, a label that does not say today, and an empty line that names the date.
export function timelineCopy(day, today) {
  if (midnight(day) === midnight(today)) {
    return { today: true, titleKey: 'timeline.title', labelKey: 'timeline.label', emptyKey: 'timeline.empty' };
  }
  return { today: false, titleKey: 'timeline.dayTitle', labelKey: 'timeline.dayLabel', emptyKey: 'timeline.dayEmpty' };
}
