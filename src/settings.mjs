export const MERGE_MODES = ['none', 'prefix', 'registrable'];
export const DEFAULT_SETTINGS = { schema: 1, idleSeconds: 60, countAudible: true, siteMerge: 'prefix' };
export const IDLE_OPTIONS = [60, 120, 300, 600];

export function validateSettings(value) {
  return {
    schema: value?.schema === 1 ? 1 : DEFAULT_SETTINGS.schema,
    idleSeconds: IDLE_OPTIONS.includes(value?.idleSeconds) ? value.idleSeconds : DEFAULT_SETTINGS.idleSeconds,
    countAudible: typeof value?.countAudible === 'boolean' ? value.countAudible : DEFAULT_SETTINGS.countAudible,
    siteMerge: MERGE_MODES.includes(value?.siteMerge) ? value.siteMerge : DEFAULT_SETTINGS.siteMerge,
  };
}
