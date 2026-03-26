import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotificationStore } from '@/stores';
import type { AuthFileItem } from '@/types';
import {
  type AuthFilesSweepFinding,
  type AuthFilesSweepProgress,
  type AuthFilesSweepResult,
  type AuthFilesSweepSettings,
  clampSweepIntervalMinutes,
  clampSweepWeeklyThresholdPercent,
  executeAuthFilesSweep,
  readAuthFilesSweepSettings,
  writeAuthFilesSweepSettings,
} from '@/features/authFiles/automation';

type UseAuthFilesSweepOptions = {
  files: AuthFileItem[];
  loading: boolean;
  disableControls: boolean;
  isCurrentLayer: boolean;
  loadFiles: () => Promise<void>;
  refreshKeyStats: () => Promise<void>;
};

type SweepTrigger = 'manual' | 'scheduled';

export function useAuthFilesSweep(options: UseAuthFilesSweepOptions) {
  const { files, loading, disableControls, isCurrentLayer, loadFiles, refreshKeyStats } = options;
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);

  const [settings, setSettings] = useState<AuthFilesSweepSettings>(() => readAuthFilesSweepSettings());
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<AuthFilesSweepProgress>({ completed: 0, total: 0 });
  const [result, setResult] = useState<AuthFilesSweepResult | null>(null);
  const [findingsMap, setFindingsMap] = useState<Record<string, AuthFilesSweepFinding>>({});
  const [nextRunAt, setNextRunAt] = useState<number | null>(null);
  const runningRef = useRef(false);

  useEffect(() => {
    writeAuthFilesSweepSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (!settings.enabled) {
      setNextRunAt(null);
      return;
    }

    if (loading || disableControls || !isCurrentLayer) return;
    setNextRunAt((prev) => {
      const base = Date.now() + clampSweepIntervalMinutes(settings.intervalMinutes) * 60_000;
      if (prev === null) {
        return Date.now() + 1_000;
      }
      return base;
    });
  }, [disableControls, isCurrentLayer, loading, settings.enabled, settings.intervalMinutes]);

  const updateSettings = useCallback(
    (updater: AuthFilesSweepSettings | ((prev: AuthFilesSweepSettings) => AuthFilesSweepSettings)) => {
      setSettings((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        return {
          ...next,
          intervalMinutes: clampSweepIntervalMinutes(next.intervalMinutes),
          weeklyThresholdPercent: clampSweepWeeklyThresholdPercent(next.weeklyThresholdPercent),
        };
      });
    },
    []
  );

  const runSweep = useCallback(
    async (trigger: SweepTrigger = 'manual') => {
      if (runningRef.current || disableControls || loading) return;

      runningRef.current = true;
      setRunning(true);
      setProgress({ completed: 0, total: 0 });

      try {
        const sweepResult = await executeAuthFilesSweep({
          files,
          settings,
          t,
          onProgress: setProgress,
        });

        setResult(sweepResult);
        setFindingsMap(
          sweepResult.findings.reduce<Record<string, AuthFilesSweepFinding>>((accumulator, finding) => {
            accumulator[finding.name] = finding;
            return accumulator;
          }, {})
        );

        await Promise.all([loadFiles(), refreshKeyStats()]);

        if (trigger === 'manual') {
          if (sweepResult.failedDeleteCount > 0) {
            showNotification(
              t('auth_files.sweep_result_partial', {
                found401: sweepResult.detected401Count,
                foundLowWeekly: sweepResult.detectedLowWeeklyCount,
                deleted: sweepResult.deletedCount,
                failed: sweepResult.failedDeleteCount,
              }),
              'warning'
            );
          } else {
            showNotification(
              t('auth_files.sweep_result_success', {
                found401: sweepResult.detected401Count,
                foundLowWeekly: sweepResult.detectedLowWeeklyCount,
                deleted: sweepResult.deletedCount,
              }),
              'success'
            );
          }
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : t('common.unknown_error');
        showNotification(t('auth_files.sweep_result_error', { message }), 'error');
      } finally {
        runningRef.current = false;
        setRunning(false);
        setProgress((prev) => ({ ...prev, completed: prev.total }));
        setNextRunAt(
          settings.enabled
            ? Date.now() + clampSweepIntervalMinutes(settings.intervalMinutes) * 60_000
            : null
        );
      }
    },
    [disableControls, files, loadFiles, loading, refreshKeyStats, settings, showNotification, t]
  );

  useEffect(() => {
    if (!settings.enabled || !isCurrentLayer || disableControls || loading || running) return;
    if (nextRunAt === null) return;

    const delay = Math.max(nextRunAt - Date.now(), 0);
    const timer = window.setTimeout(() => {
      void runSweep('scheduled');
    }, delay);

    return () => window.clearTimeout(timer);
  }, [disableControls, isCurrentLayer, loading, nextRunAt, runSweep, running, settings.enabled]);

  const counts = useMemo(
    () => ({
      findings: Object.keys(findingsMap).length,
      files: files.filter((file) => !file.runtimeOnly && file['runtime_only'] !== true).length,
    }),
    [files, findingsMap]
  );

  return {
    settings,
    running,
    progress,
    result,
    findingsMap,
    nextRunAt,
    counts,
    updateSettings,
    runSweep,
  };
}
