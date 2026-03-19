export const DEFAULT_USAGE_AUTO_REFRESH_SECONDS = 60;
export const MIN_USAGE_AUTO_REFRESH_SECONDS = 15;
export const MAX_USAGE_AUTO_REFRESH_SECONDS = 3600;
export const USAGE_AUTO_REFRESH_PRESET_SECONDS = [15, 30, 60, 120] as const;

export type UsageAutoRefreshMode = 'preset' | 'custom';
export type UsageAutoRefreshPauseReason = 'disabled' | 'hidden' | 'unfocused' | null;

export function clampUsageAutoRefreshSeconds(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_USAGE_AUTO_REFRESH_SECONDS;
  }

  const roundedValue = Math.round(value);
  if (roundedValue < MIN_USAGE_AUTO_REFRESH_SECONDS) {
    return MIN_USAGE_AUTO_REFRESH_SECONDS;
  }

  if (roundedValue > MAX_USAGE_AUTO_REFRESH_SECONDS) {
    return MAX_USAGE_AUTO_REFRESH_SECONDS;
  }

  return roundedValue;
}

export interface UsageAutoRefreshState {
  disabled: boolean;
  documentHidden: boolean;
  windowFocused: boolean;
}

export function getUsageAutoRefreshPauseReason(
  state: UsageAutoRefreshState,
): UsageAutoRefreshPauseReason {
  if (state.disabled) {
    return 'disabled';
  }

  if (state.documentHidden) {
    return 'hidden';
  }

  if (!state.windowFocused) {
    return 'unfocused';
  }

  return null;
}
