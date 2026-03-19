import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_USAGE_AUTO_REFRESH_SECONDS,
  MAX_USAGE_AUTO_REFRESH_SECONDS,
  MIN_USAGE_AUTO_REFRESH_SECONDS,
} from './usageAutoRefresh';
import {
  USAGE_AUTO_REFRESH_STORAGE_KEY,
  useUsageAutoRefresh,
} from './useUsageAutoRefresh';

function createDeferred() {
  let resolvePromise: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve: () => resolvePromise?.(),
  };
}

describe('useUsageAutoRefresh', () => {
  const originalVisibilityStateDescriptor = Object.getOwnPropertyDescriptor(
    document,
    'visibilityState',
  );
  let documentVisible = true;
  let windowFocused = true;

  beforeEach(() => {
    vi.useFakeTimers();
    documentVisible = true;
    windowFocused = true;

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => (documentVisible ? 'visible' : 'hidden'),
    });

    vi.spyOn(document, 'hasFocus').mockImplementation(() => windowFocused);
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();

    if (originalVisibilityStateDescriptor) {
      Object.defineProperty(document, 'visibilityState', originalVisibilityStateDescriptor);
      return;
    }

    delete (document as Document & { visibilityState?: DocumentVisibilityState }).visibilityState;
  });

  const setDocumentVisibility = (visible: boolean) => {
    documentVisible = visible;
    document.dispatchEvent(new Event('visibilitychange'));
  };

  const setWindowFocus = (focused: boolean) => {
    windowFocused = focused;
    window.dispatchEvent(new Event(focused ? 'focus' : 'blur'));
  };

  it('fires while visible and focused', () => {
    const onRefresh = vi.fn(async () => undefined);

    renderHook(() => useUsageAutoRefresh(onRefresh, false));

    act(() => {
      vi.advanceTimersByTime(DEFAULT_USAGE_AUTO_REFRESH_SECONDS * 1000);
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('handles storage write failures through safe localStorage behavior', () => {
    const onRefresh = vi.fn(async () => undefined);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });

    expect(() => {
      const { result } = renderHook(() => useUsageAutoRefresh(onRefresh, false));

      act(() => {
        result.current.setEnabled(false);
      });
    }).not.toThrow();

    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('catches and logs auto-refresh rejections', async () => {
    const refreshError = new Error('refresh failed');
    const onRefresh = vi.fn().mockRejectedValue(refreshError);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    renderHook(() => useUsageAutoRefresh(onRefresh, false));

    act(() => {
      vi.advanceTimersByTime(DEFAULT_USAGE_AUTO_REFRESH_SECONDS * 1000);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[useUsageAutoRefresh] auto refresh failed',
      refreshError,
    );
  });

  it('skips ticks while a refresh is already in flight', async () => {
    const pendingRefresh = createDeferred();
    const onRefresh = vi
      .fn()
      .mockImplementationOnce(() => pendingRefresh.promise)
      .mockResolvedValue(undefined);

    renderHook(() => useUsageAutoRefresh(onRefresh, false));

    act(() => {
      vi.advanceTimersByTime(DEFAULT_USAGE_AUTO_REFRESH_SECONDS * 1000);
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(DEFAULT_USAGE_AUTO_REFRESH_SECONDS * 2000);
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);

    await act(async () => {
      pendingRefresh.resolve();
      await pendingRefresh.promise;
    });

    act(() => {
      vi.advanceTimersByTime(DEFAULT_USAGE_AUTO_REFRESH_SECONDS * 1000);
    });

    expect(onRefresh).toHaveBeenCalledTimes(2);
  });

  it('skips an auto-refresh tick while a manual refresh is running via runRefresh("manual")', async () => {
    const pendingRefresh = createDeferred();
    const onRefresh = vi
      .fn()
      .mockImplementationOnce(() => pendingRefresh.promise)
      .mockResolvedValue(undefined);

    const { result } = renderHook(() => useUsageAutoRefresh(onRefresh, false));

    act(() => {
      void result.current.runRefresh('manual');
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(result.current.isRefreshing).toBe(true);

    act(() => {
      vi.advanceTimersByTime(DEFAULT_USAGE_AUTO_REFRESH_SECONDS * 1000);
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);

    await act(async () => {
      pendingRefresh.resolve();
      await pendingRefresh.promise;
    });

    act(() => {
      vi.advanceTimersByTime(DEFAULT_USAGE_AUTO_REFRESH_SECONDS * 1000);
    });

    expect(onRefresh).toHaveBeenCalledTimes(2);
  });

  it('resumes after the page becomes active again after being hidden', () => {
    const onRefresh = vi.fn(async () => undefined);
    const { result } = renderHook(() => useUsageAutoRefresh(onRefresh, false));

    act(() => {
      setDocumentVisibility(false);
    });

    expect(result.current.pauseReason).toBe('hidden');

    act(() => {
      vi.advanceTimersByTime(DEFAULT_USAGE_AUTO_REFRESH_SECONDS * 2000);
    });

    expect(onRefresh).toHaveBeenCalledTimes(0);

    act(() => {
      setDocumentVisibility(true);
    });

    expect(result.current.pauseReason).toBeNull();

    act(() => {
      vi.advanceTimersByTime(DEFAULT_USAGE_AUTO_REFRESH_SECONDS * 1000);
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('reports hidden/unfocused states correctly', () => {
    const onRefresh = vi.fn(async () => undefined);
    const { result } = renderHook(() => useUsageAutoRefresh(onRefresh, false));

    expect(result.current.isDocumentVisible).toBe(true);
    expect(result.current.isWindowFocused).toBe(true);
    expect(result.current.pauseReason).toBeNull();

    act(() => {
      setWindowFocus(false);
    });

    expect(result.current.isWindowFocused).toBe(false);
    expect(result.current.pauseReason).toBe('unfocused');

    act(() => {
      setDocumentVisibility(false);
    });

    expect(result.current.isDocumentVisible).toBe(false);
    expect(result.current.pauseReason).toBe('hidden');

    act(() => {
      result.current.setEnabled(false);
    });

    expect(result.current.pauseReason).toBe('disabled');
  });

  it('exposes inline guidance when a custom value is clamped', () => {
    const onRefresh = vi.fn(async () => undefined);
    const { result } = renderHook(() => useUsageAutoRefresh(onRefresh, false));

    act(() => {
      result.current.setMode('custom');
    });

    act(() => {
      result.current.setCustomIntervalInput('5');
    });

    act(() => {
      result.current.applyCustomInterval();
    });

    expect(result.current.settings.mode).toBe('custom');
    expect(result.current.settings.intervalSeconds).toBe(MIN_USAGE_AUTO_REFRESH_SECONDS);
    expect(result.current.customIntervalInput).toBe(String(MIN_USAGE_AUTO_REFRESH_SECONDS));
    expect(result.current.customIntervalHint).toBe(
      `Enter a value between ${MIN_USAGE_AUTO_REFRESH_SECONDS} and ${MAX_USAGE_AUTO_REFRESH_SECONDS} seconds. Adjusted to ${MIN_USAGE_AUTO_REFRESH_SECONDS} seconds.`,
    );
  });

  it('clears hint for valid custom value', () => {
    const onRefresh = vi.fn(async () => undefined);
    const { result } = renderHook(() => useUsageAutoRefresh(onRefresh, false));

    act(() => {
      result.current.setMode('custom');
    });

    act(() => {
      result.current.setCustomIntervalInput('2');
    });

    act(() => {
      result.current.applyCustomInterval();
    });

    expect(result.current.customIntervalHint).not.toBe('');

    act(() => {
      result.current.setCustomIntervalInput('120');
    });

    act(() => {
      result.current.applyCustomInterval();
    });

    expect(result.current.settings.intervalSeconds).toBe(120);
    expect(result.current.customIntervalInput).toBe('120');
    expect(result.current.customIntervalHint).toBe('');
  });

  it('cleans up listeners/timers on unmount', () => {
    const addDocumentListenerSpy = vi.spyOn(document, 'addEventListener');
    const removeDocumentListenerSpy = vi.spyOn(document, 'removeEventListener');
    const addWindowListenerSpy = vi.spyOn(window, 'addEventListener');
    const removeWindowListenerSpy = vi.spyOn(window, 'removeEventListener');
    const onRefresh = vi.fn(async () => undefined);

    const { unmount } = renderHook(() => useUsageAutoRefresh(onRefresh, false));

    const visibilityListener = addDocumentListenerSpy.mock.calls.find(
      ([eventName]) => eventName === 'visibilitychange',
    )?.[1] as EventListener;
    const focusListener = addWindowListenerSpy.mock.calls.find(
      ([eventName]) => eventName === 'focus',
    )?.[1] as EventListener;
    const blurListener = addWindowListenerSpy.mock.calls.find(
      ([eventName]) => eventName === 'blur',
    )?.[1] as EventListener;

    unmount();

    expect(visibilityListener).toBeTypeOf('function');
    expect(focusListener).toBeTypeOf('function');
    expect(blurListener).toBeTypeOf('function');

    expect(removeDocumentListenerSpy).toHaveBeenCalledWith('visibilitychange', visibilityListener);
    expect(removeWindowListenerSpy).toHaveBeenCalledWith('focus', focusListener);
    expect(removeWindowListenerSpy).toHaveBeenCalledWith('blur', blurListener);

    act(() => {
      vi.advanceTimersByTime(DEFAULT_USAGE_AUTO_REFRESH_SECONDS * 3000);
    });

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('persists defaults and updated settings through localStorage', () => {
    const onRefresh = vi.fn(async () => undefined);
    const { result, unmount } = renderHook(() => useUsageAutoRefresh(onRefresh, false));

    expect(localStorage.getItem(USAGE_AUTO_REFRESH_STORAGE_KEY)).toBe(
      JSON.stringify({
        enabled: true,
        mode: 'preset',
        intervalSeconds: DEFAULT_USAGE_AUTO_REFRESH_SECONDS,
      }),
    );

    act(() => {
      result.current.setEnabled(false);
    });

    act(() => {
      result.current.setPresetIntervalSeconds(120);
    });

    expect(localStorage.getItem(USAGE_AUTO_REFRESH_STORAGE_KEY)).toBe(
      JSON.stringify({
        enabled: false,
        mode: 'preset',
        intervalSeconds: 120,
      }),
    );

    unmount();

    const onRefreshAfterRemount = vi.fn(async () => undefined);
    const { result: remountedResult } = renderHook(() =>
      useUsageAutoRefresh(onRefreshAfterRemount, false),
    );

    expect(remountedResult.current.settings).toEqual({
      enabled: false,
      mode: 'preset',
      intervalSeconds: 120,
    });
  });
});
