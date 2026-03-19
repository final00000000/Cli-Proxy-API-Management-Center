import { describe, expect, it } from 'vitest';

import {
  DEFAULT_USAGE_AUTO_REFRESH_SECONDS,
  clampUsageAutoRefreshSeconds,
  getUsageAutoRefreshPauseReason,
} from './usageAutoRefresh';

describe('usageAutoRefresh helpers', () => {
  it('exports a default value of 60 seconds', () => {
    expect(DEFAULT_USAGE_AUTO_REFRESH_SECONDS).toBe(60);
  });

  it('clamps values below the minimum to 15 seconds', () => {
    expect(clampUsageAutoRefreshSeconds(10)).toBe(15);
  });

  it('clamps values above the maximum to 3600 seconds', () => {
    expect(clampUsageAutoRefreshSeconds(10000)).toBe(3600);
  });

  it('falls back to the default for non-finite inputs', () => {
    expect(clampUsageAutoRefreshSeconds(NaN)).toBe(60);
  });

  it('reports disabled when auto-refresh is disabled', () => {
    expect(
      getUsageAutoRefreshPauseReason({
        disabled: true,
        documentHidden: false,
        windowFocused: true,
      }),
    ).toBe('disabled');
  });

  it('prefers hidden when the document is hidden even if unfocused', () => {
    expect(
      getUsageAutoRefreshPauseReason({
        disabled: false,
        documentHidden: true,
        windowFocused: false,
      }),
    ).toBe('hidden');
  });

  it('reports unfocused when visible but the window is not focused', () => {
    expect(
      getUsageAutoRefreshPauseReason({
        disabled: false,
        documentHidden: false,
        windowFocused: false,
      }),
    ).toBe('unfocused');
  });

  it('returns null when enabled and active', () => {
    expect(
      getUsageAutoRefreshPauseReason({
        disabled: false,
        documentHidden: false,
        windowFocused: true,
      }),
    ).toBeNull();
  });
});
