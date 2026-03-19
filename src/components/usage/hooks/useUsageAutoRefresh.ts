import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useInterval } from '@/hooks/useInterval';
import { useLocalStorage } from '@/hooks/useLocalStorage';

import {
  clampUsageAutoRefreshSeconds,
  DEFAULT_USAGE_AUTO_REFRESH_SECONDS,
  getUsageAutoRefreshPauseReason,
  MAX_USAGE_AUTO_REFRESH_SECONDS,
  MIN_USAGE_AUTO_REFRESH_SECONDS,
  type UsageAutoRefreshMode,
  type UsageAutoRefreshPauseReason,
} from './usageAutoRefresh';

export const USAGE_AUTO_REFRESH_STORAGE_KEY = 'cli-proxy-usage-auto-refresh-v1';

const DEFAULT_SETTINGS = {
  enabled: true,
  mode: 'preset' as const,
  intervalSeconds: DEFAULT_USAGE_AUTO_REFRESH_SECONDS,
};

export interface UsageAutoRefreshSettings {
  enabled: boolean;
  mode: UsageAutoRefreshMode;
  intervalSeconds: number;
}

export interface UseUsageAutoRefreshReturn {
  settings: UsageAutoRefreshSettings;
  runRefresh: (source: 'auto' | 'manual') => Promise<void>;
  setEnabled: (enabled: boolean) => void;
  setMode: (mode: UsageAutoRefreshMode) => void;
  setPresetIntervalSeconds: (value: number) => void;
  customIntervalInput: string;
  setCustomIntervalInput: (value: string) => void;
  applyCustomInterval: () => void;
  customIntervalHint: string;
  isDocumentVisible: boolean;
  isWindowFocused: boolean;
  isRefreshing: boolean;
  pauseReason: UsageAutoRefreshPauseReason;
}

function normalizeUsageAutoRefreshSettings(
  value: Partial<UsageAutoRefreshSettings> | undefined,
): UsageAutoRefreshSettings {
  const enabled = value?.enabled ?? DEFAULT_SETTINGS.enabled;
  const mode = value?.mode === 'custom' ? 'custom' : 'preset';
  const intervalSeconds = clampUsageAutoRefreshSeconds(
    value?.intervalSeconds ?? DEFAULT_SETTINGS.intervalSeconds,
  );

  return {
    enabled: Boolean(enabled),
    mode,
    intervalSeconds,
  };
}

function updateStoredSettings(
  next: Partial<UsageAutoRefreshSettings>,
): (prev: UsageAutoRefreshSettings) => UsageAutoRefreshSettings {
  return (prev) => {
    const normalized = normalizeUsageAutoRefreshSettings(prev);
    return {
      ...normalized,
      ...next,
    };
  };
}

export function useUsageAutoRefresh(
  onRefresh: () => Promise<void>,
  loading: boolean,
): UseUsageAutoRefreshReturn {
  const [storedSettings, setStoredSettings] = useLocalStorage<UsageAutoRefreshSettings>(
    USAGE_AUTO_REFRESH_STORAGE_KEY,
    DEFAULT_SETTINGS,
  );
  const settings = useMemo(
    () => normalizeUsageAutoRefreshSettings(storedSettings),
    [storedSettings],
  );

  const [customIntervalInput, setCustomIntervalInputState] = useState(
    String(settings.intervalSeconds),
  );
  const [customIntervalHint, setCustomIntervalHint] = useState('');
  const [isDocumentVisible, setIsDocumentVisible] = useState(
    document.visibilityState === 'visible',
  );
  const [isWindowFocused, setIsWindowFocused] = useState(document.hasFocus());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshInFlightRef = useRef(false);
  const didPersistInitialSettingsRef = useRef(false);

  useEffect(() => {
    if (didPersistInitialSettingsRef.current) {
      return;
    }

    didPersistInitialSettingsRef.current = true;
    setStoredSettings((previous) => {
      const normalized = normalizeUsageAutoRefreshSettings(previous);
      if (
        previous.enabled === normalized.enabled &&
        previous.mode === normalized.mode &&
        previous.intervalSeconds === normalized.intervalSeconds
      ) {
        return previous;
      }

      return normalized;
    });
  }, [setStoredSettings]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsDocumentVisible(document.visibilityState === 'visible');
    };
    const handleFocus = () => {
      setIsWindowFocused(true);
    };
    const handleBlur = () => {
      setIsWindowFocused(false);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  const pauseReason = useMemo(
    () =>
      getUsageAutoRefreshPauseReason({
        disabled: !settings.enabled,
        documentHidden: !isDocumentVisible,
        windowFocused: isWindowFocused,
      }),
    [isDocumentVisible, isWindowFocused, settings.enabled],
  );

  const runRefresh = useCallback(
    async (source: 'auto' | 'manual') => {
      void source;

      if (refreshInFlightRef.current || loading) {
        return;
      }

      refreshInFlightRef.current = true;
      setIsRefreshing(true);

      try {
        await onRefresh();
      } finally {
        refreshInFlightRef.current = false;
        setIsRefreshing(false);
      }
    },
    [loading, onRefresh],
  );

  useInterval(
    () => {
      void runRefresh('auto').catch((error: unknown) => {
        console.error('[useUsageAutoRefresh] auto refresh failed', error);
      });
    },
    pauseReason === null ? settings.intervalSeconds * 1000 : null,
  );

  const setEnabled = useCallback(
    (enabled: boolean) => {
      setStoredSettings(updateStoredSettings({ enabled }));
    },
    [setStoredSettings],
  );

  const setMode = useCallback(
    (mode: UsageAutoRefreshMode) => {
      setStoredSettings(updateStoredSettings({ mode }));

      if (mode === 'custom') {
        setCustomIntervalInputState(String(settings.intervalSeconds));
      } else {
        setCustomIntervalHint('');
      }
    },
    [setStoredSettings, settings.intervalSeconds],
  );

  const setPresetIntervalSeconds = useCallback(
    (value: number) => {
      const intervalSeconds = clampUsageAutoRefreshSeconds(value);

      setStoredSettings(
        updateStoredSettings({
          mode: 'preset',
          intervalSeconds,
        }),
      );
      setCustomIntervalInputState(String(intervalSeconds));
      setCustomIntervalHint('');
    },
    [setStoredSettings],
  );

  const setCustomIntervalInput = useCallback((value: string) => {
    setCustomIntervalInputState(value);
  }, []);

  const applyCustomInterval = useCallback(() => {
    const rawValue = Number(customIntervalInput);
    const roundedValue = Number.isFinite(rawValue) ? Math.round(rawValue) : rawValue;
    const intervalSeconds = clampUsageAutoRefreshSeconds(rawValue);
    const isWithinRange =
      Number.isFinite(roundedValue) &&
      roundedValue >= MIN_USAGE_AUTO_REFRESH_SECONDS &&
      roundedValue <= MAX_USAGE_AUTO_REFRESH_SECONDS;

    setStoredSettings(
      updateStoredSettings({
        mode: 'custom',
        intervalSeconds,
      }),
    );
    setCustomIntervalInputState(String(intervalSeconds));

    if (isWithinRange) {
      setCustomIntervalHint('');
      return;
    }

    setCustomIntervalHint(
      `Enter a value between ${MIN_USAGE_AUTO_REFRESH_SECONDS} and ${MAX_USAGE_AUTO_REFRESH_SECONDS} seconds. Adjusted to ${intervalSeconds} seconds.`,
    );
  }, [customIntervalInput, setStoredSettings]);

  return {
    settings,
    runRefresh,
    setEnabled,
    setMode,
    setPresetIntervalSeconds,
    customIntervalInput,
    setCustomIntervalInput,
    applyCustomInterval,
    customIntervalHint,
    isDocumentVisible,
    isWindowFocused,
    isRefreshing,
    pauseReason,
  };
}
