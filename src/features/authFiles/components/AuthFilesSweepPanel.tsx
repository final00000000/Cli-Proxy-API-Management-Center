import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import type {
  AuthFilesSweepProgress,
  AuthFilesSweepResult,
  AuthFilesSweepSettings,
} from '@/features/authFiles/automation';
import styles from './AuthFilesSweepPanel.module.scss';

type AuthFilesSweepPanelProps = {
  settings: AuthFilesSweepSettings;
  running: boolean;
  progress: AuthFilesSweepProgress;
  result: AuthFilesSweepResult | null;
  nextRunAt: number | null;
  disabled: boolean;
  onRun: () => void;
  onSettingsChange: (updater: (prev: AuthFilesSweepSettings) => AuthFilesSweepSettings) => void;
};

const formatDateTime = (value: number | null, fallback: string) => {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toLocaleString();
};

const formatDuration = (ms: number, locale: string) => {
  const isChinese = locale.startsWith('zh');
  if (!Number.isFinite(ms) || ms <= 0) return isChinese ? '0秒' : '0s';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return isChinese ? `${hours}小时 ${minutes}分` : `${hours}h ${minutes}m`;
  if (minutes > 0) return isChinese ? `${minutes}分 ${seconds}秒` : `${minutes}m ${seconds}s`;
  if (isChinese) return `${seconds}秒`;
  return `${seconds}s`;
};

export function AuthFilesSweepPanel(props: AuthFilesSweepPanelProps) {
  const { t, i18n } = useTranslation();
  const { settings, running, progress, result, nextRunAt, disabled, onRun, onSettingsChange } = props;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!settings.enabled || nextRunAt === null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [nextRunAt, settings.enabled]);

  const progressPercent =
    progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
  const nextRunLabel =
    settings.enabled && nextRunAt
      ? `${formatDateTime(nextRunAt, t('auth_files.sweep_never_run'))} · ${t(
          'auth_files.sweep_countdown',
          { duration: formatDuration(Math.max(nextRunAt - now, 0), i18n.language) }
        )}`
      : t('auth_files.sweep_status_paused');

  const stateMeta = useMemo(() => {
    if (running) {
      return {
        label: t('auth_files.sweep_status_running'),
        className: `${styles.stateBadge} ${styles.stateRunning}`,
      };
    }

    if (settings.enabled) {
      return {
        label: t('auth_files.sweep_status_scheduled'),
        className: `${styles.stateBadge} ${styles.stateScheduled}`,
      };
    }

    return {
      label: t('auth_files.sweep_status_idle'),
      className: `${styles.stateBadge} ${styles.stateIdle}`,
    };
  }, [running, settings.enabled, t]);

  const lastRunDuration =
    result === null
      ? t('auth_files.sweep_never_run')
      : formatDuration(result.finishedAt - result.startedAt, i18n.language);

  const summaryText =
    result === null
      ? t('auth_files.sweep_result_empty')
      : result.failedDeleteCount > 0
        ? t('auth_files.sweep_result_partial', {
            found401: result.detected401Count,
            foundLowWeekly: result.detectedLowWeeklyCount,
            deleted: result.deletedCount,
            failed: result.failedDeleteCount,
          })
        : t('auth_files.sweep_result_success', {
            found401: result.detected401Count,
            foundLowWeekly: result.detectedLowWeeklyCount,
            deleted: result.deletedCount,
          });

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.titleBlock}>
          <h3 className={styles.title}>{t('auth_files.sweep_title')}</h3>
          <p className={styles.description}>{t('auth_files.sweep_description')}</p>
        </div>

        <div className={styles.headerActions}>
          <span className={stateMeta.className}>{stateMeta.label}</span>
          <Button size="sm" onClick={onRun} disabled={disabled || running}>
            {running ? t('auth_files.sweep_running') : t('auth_files.sweep_run_now')}
          </Button>
        </div>
      </div>

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>{t('auth_files.sweep_scanned')}</span>
          <span className={styles.statValue}>{result?.scannedCount ?? 0}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>{t('auth_files.sweep_quota_checked')}</span>
          <span className={styles.statValue}>{result?.quotaCheckedCount ?? 0}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>{t('auth_files.sweep_detected_401')}</span>
          <span className={styles.statValue}>{result?.detected401Count ?? 0}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>{t('auth_files.sweep_detected_low_weekly')}</span>
          <span className={styles.statValue}>{result?.detectedLowWeeklyCount ?? 0}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>{t('auth_files.sweep_deleted')}</span>
          <span className={styles.statValue}>{result?.deletedCount ?? 0}</span>
        </div>
      </div>

      <div className={styles.controlsGrid}>
        <div className={styles.controlCard}>
          <div className={styles.controlHeader}>
            <span className={styles.controlTitle}>{t('auth_files.sweep_scheduler_label')}</span>
            <ToggleSwitch
              ariaLabel={t('auth_files.sweep_scheduler_label')}
              checked={settings.enabled}
              disabled={disabled || running}
              onChange={(value) =>
                onSettingsChange((prev) => ({
                  ...prev,
                  enabled: value,
                }))
              }
            />
          </div>
          <span className={styles.controlHint}>{t('auth_files.sweep_scheduler_hint')}</span>
        </div>

        <div className={styles.controlCard}>
          <div className={styles.controlHeader}>
            <span className={styles.controlTitle}>{t('auth_files.sweep_interval_label')}</span>
          </div>
          <input
            className={styles.numberInput}
            type="number"
            min={1}
            max={180}
            step={1}
            value={settings.intervalMinutes}
            disabled={disabled || running}
            onChange={(event) => {
              const value = Number(event.currentTarget.value);
              onSettingsChange((prev) => ({
                ...prev,
                intervalMinutes: Number.isFinite(value) ? value : prev.intervalMinutes,
              }));
            }}
          />
          <span className={styles.controlHint}>{t('auth_files.sweep_interval_hint')}</span>
        </div>

        <div className={styles.controlCard}>
          <div className={styles.controlHeader}>
            <span className={styles.controlTitle}>{t('auth_files.sweep_auto_delete_401')}</span>
            <ToggleSwitch
              ariaLabel={t('auth_files.sweep_auto_delete_401')}
              checked={settings.autoDelete401}
              disabled={disabled || running}
              onChange={(value) =>
                onSettingsChange((prev) => ({
                  ...prev,
                  autoDelete401: value,
                }))
              }
            />
          </div>
          <span className={styles.controlHint}>{t('auth_files.sweep_auto_delete_401_hint')}</span>
        </div>

        <div className={styles.controlCard}>
          <div className={styles.controlHeader}>
            <span className={styles.controlTitle}>
              {t('auth_files.sweep_auto_delete_low_weekly')}
            </span>
            <ToggleSwitch
              ariaLabel={t('auth_files.sweep_auto_delete_low_weekly')}
              checked={settings.autoDeleteLowWeeklyQuota}
              disabled={disabled || running}
              onChange={(value) =>
                onSettingsChange((prev) => ({
                  ...prev,
                  autoDeleteLowWeeklyQuota: value,
                }))
              }
            />
          </div>
          <input
            className={styles.numberInput}
            type="number"
            min={1}
            max={50}
            step={1}
            value={settings.weeklyThresholdPercent}
            disabled={disabled || running}
            onChange={(event) => {
              const value = Number(event.currentTarget.value);
              onSettingsChange((prev) => ({
                ...prev,
                weeklyThresholdPercent: Number.isFinite(value)
                  ? value
                  : prev.weeklyThresholdPercent,
              }));
            }}
          />
          <span className={styles.controlHint}>
            {t('auth_files.sweep_auto_delete_low_weekly_hint')}
          </span>
        </div>
      </div>

      <div className={styles.footer}>
        {running && (
          <div className={styles.progressWrap}>
            <div className={styles.progressHeader}>
              <span>
                {t('auth_files.sweep_progress', {
                  current: progress.completed,
                  total: progress.total,
                })}
              </span>
              <span>{progressPercent}%</span>
            </div>
            <div className={styles.progressBar}>
              <div className={styles.progressFill} style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
        )}

        <div className={styles.footerMeta}>
          <span>
            {t('auth_files.sweep_last_run')}:&nbsp;
            {formatDateTime(result?.finishedAt ?? null, t('auth_files.sweep_never_run'))}
          </span>
          <span>
            {t('auth_files.sweep_duration')}:&nbsp;
            {lastRunDuration}
          </span>
          <span>
            {t('auth_files.sweep_next_run')}:&nbsp;
            {nextRunLabel}
          </span>
        </div>

        <div className={styles.resultText}>{summaryText}</div>
      </div>
    </div>
  );
}
