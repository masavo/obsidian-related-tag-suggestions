export type SortMode = 'frequency' | 'recent' | 'alphabetical';
export interface RelatedTagsSettings { enabled: boolean; prioritizeTitle: boolean; sortMode: SortMode; experimentalMobile: boolean }
export const DEFAULT_SETTINGS: RelatedTagsSettings = { enabled: true, prioritizeTitle: true, sortMode: 'frequency', experimentalMobile: false };
export function readSettings(value: unknown): RelatedTagsSettings {
  const settings = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    enabled: typeof settings.enabled === 'boolean' ? settings.enabled : DEFAULT_SETTINGS.enabled,
    prioritizeTitle: typeof settings.prioritizeTitle === 'boolean' ? settings.prioritizeTitle : DEFAULT_SETTINGS.prioritizeTitle,
    sortMode: settings.sortMode === 'recent' || settings.sortMode === 'alphabetical' ? settings.sortMode : 'frequency',
    experimentalMobile: settings.experimentalMobile === true,
  };
}
export const TESTED_VERSION = '1.14.4';
export const DESKTOP_PATCH_VERSION = '1.14.5';
export const SORT_MODES = ['frequency', 'recent', 'alphabetical'] as const;
export const SORT_LABELS: Record<SortMode, string> = { frequency: '頻度順', recent: '履歴順', alphabetical: 'ABC順' };
export function nextSortMode(mode: SortMode): SortMode { return SORT_MODES[(SORT_MODES.indexOf(mode) + 1) % SORT_MODES.length]!; }
export const IOS_TRIAL_VERSION = '1.14.5';
export interface AdapterEnvironment { apiVersion: string; isDesktopApp: boolean; isMobileApp: boolean; isIosApp: boolean }
export function compatibilityReason(environment: AdapterEnvironment, method: unknown, experimentalMobile = false): string | null {
  const { apiVersion, isDesktopApp, isMobileApp, isIosApp } = environment;
  if (!isDesktopApp && !experimentalMobile) return 'モバイル実験モードはオフです。隔離したテスト Vault で有効にしてください。実 iPhone の検証は継続中です。';
  // Exact API strings: the iOS package/build label is never treated as a core API version.
  const baseline = apiVersion === TESTED_VERSION;
  const iosTrial = apiVersion === IOS_TRIAL_VERSION && !isDesktopApp && isMobileApp && isIosApp && experimentalMobile;
  const desktopPatch = apiVersion === DESKTOP_PATCH_VERSION && isDesktopApp && !isMobileApp;
  if (!baseline && !desktopPatch && !iosTrial) return `現在の API: ${apiVersion}。API ${TESTED_VERSION}、デスクトップ API ${DESKTOP_PATCH_VERSION} と、明示的な iOS 実験の API ${IOS_TRIAL_VERSION} だけを対象にします。対象外では並び替えを停止し、標準候補を表示します。`;
  if (typeof method !== 'function') return '想定する候補インターフェースがありません。並び替えを停止し、標準候補を表示します。';
  return null;
}
