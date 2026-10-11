export type SortMode = 'frequency' | 'recent';
export interface RelatedTagsSettings { enabled: boolean; prioritizeTitle: boolean; sortMode: SortMode; experimentalMobile: boolean }
export const DEFAULT_SETTINGS: RelatedTagsSettings = { enabled: true, prioritizeTitle: true, sortMode: 'frequency', experimentalMobile: false };
export function readSettings(value: unknown): RelatedTagsSettings {
  const settings = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    enabled: typeof settings.enabled === 'boolean' ? settings.enabled : DEFAULT_SETTINGS.enabled,
    prioritizeTitle: typeof settings.prioritizeTitle === 'boolean' ? settings.prioritizeTitle : DEFAULT_SETTINGS.prioritizeTitle,
    sortMode: settings.sortMode === 'recent' ? 'recent' : 'frequency',
    experimentalMobile: settings.experimentalMobile === true,
  };
}
export const TESTED_VERSION = '1.14.4';
export function compatibilityReason(desktop: boolean, atLeastTested: boolean, atLeastNext: boolean, method: unknown, experimentalMobile = false): string | null {
  if (!desktop && !experimentalMobile) return 'Mobile experiment is off. Enable it only in a test vault; real iPhone validation is pending.';
  if (!atLeastTested || atLeastNext) return `Tested on Obsidian ${TESTED_VERSION} only. Standard suggestions are unchanged on other versions.`;
  if (typeof method !== 'function') return 'This app does not expose the expected suggestions interface. Standard suggestions are unchanged.';
  return null;
}
