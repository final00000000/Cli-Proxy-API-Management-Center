/**
 * Quota management page - coordinates the three quota sections.
 */

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { IconTimer } from '@/components/ui/icons';
import {
  MAX_CARD_PAGE_SIZE,
  MIN_CARD_PAGE_SIZE,
  clampCardPageSize
} from '@/features/authFiles/constants';
import { readQuotaPageUiState, writeQuotaPageUiState } from '@/features/quota/uiState';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { useInterval } from '@/hooks/useInterval';
import { useAuthStore } from '@/stores';
import { authFilesApi, configFileApi } from '@/services/api';
import {
  QuotaSection,
  ANTIGRAVITY_CONFIG,
  CLAUDE_CONFIG,
  CODEX_CONFIG,
  GEMINI_CLI_CONFIG,
  KIMI_CONFIG
} from '@/components/quota';
import type { AuthFileItem } from '@/types';
import styles from './QuotaPage.module.scss';

const DEFAULT_QUOTA_PAGE_SIZE = 15;
const DEFAULT_AUTO_REFRESH_ENABLED = false;
const DEFAULT_AUTO_REFRESH_INTERVAL_MS = 240_000;
const MIN_AUTO_REFRESH_INTERVAL_MINUTES = 1;
const MAX_AUTO_REFRESH_INTERVAL_MINUTES = 60;

const clampAutoRefreshIntervalMinutes = (value: number) =>
  Math.min(
    MAX_AUTO_REFRESH_INTERVAL_MINUTES,
    Math.max(MIN_AUTO_REFRESH_INTERVAL_MINUTES, Math.round(value))
  );

const matchesQuotaSearch = (file: AuthFileItem, keyword: string) => {
  const normalizedKeyword = keyword.trim().toLowerCase();
  if (!normalizedKeyword) return true;

  return [file.name, file.type, file.provider, file.authIndex]
    .map((value) => String(value ?? '').trim().toLowerCase())
    .some((value) => value.includes(normalizedKeyword));
};

export function QuotaPage() {
  const { t } = useTranslation();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);

  const [files, setFiles] = useState<AuthFileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(DEFAULT_QUOTA_PAGE_SIZE);
  const [pageSizeInput, setPageSizeInput] = useState(String(DEFAULT_QUOTA_PAGE_SIZE));
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(DEFAULT_AUTO_REFRESH_ENABLED);
  const [autoRefreshIntervalMs, setAutoRefreshIntervalMs] = useState(
    DEFAULT_AUTO_REFRESH_INTERVAL_MS
  );
  const [autoRefreshInput, setAutoRefreshInput] = useState(
    String(Math.round(DEFAULT_AUTO_REFRESH_INTERVAL_MS / 60_000))
  );
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [refreshingAll, setRefreshingAll] = useState(false);

  const disableControls = connectionStatus !== 'connected';

  useEffect(() => {
    const persisted = readQuotaPageUiState();
    if (!persisted) return;

    if (typeof persisted.pageSize === 'number' && Number.isFinite(persisted.pageSize)) {
      setPageSize(clampCardPageSize(persisted.pageSize));
    }
    if (typeof persisted.search === 'string') {
      setSearch(persisted.search);
    }
    if (typeof persisted.autoRefreshEnabled === 'boolean') {
      setAutoRefreshEnabled(persisted.autoRefreshEnabled);
    }
    if (
      typeof persisted.autoRefreshIntervalMinutes === 'number' &&
      Number.isFinite(persisted.autoRefreshIntervalMinutes)
    ) {
      setAutoRefreshIntervalMs(
        clampAutoRefreshIntervalMinutes(persisted.autoRefreshIntervalMinutes) * 60_000
      );
    }
  }, []);

  useEffect(() => {
    writeQuotaPageUiState({
      pageSize,
      search,
      autoRefreshEnabled,
      autoRefreshIntervalMinutes: Math.round(autoRefreshIntervalMs / 60_000)
    });
  }, [pageSize, search, autoRefreshEnabled, autoRefreshIntervalMs]);

  useEffect(() => {
    setPageSizeInput(String(pageSize));
  }, [pageSize]);

  useEffect(() => {
    setAutoRefreshInput(String(Math.round(autoRefreshIntervalMs / 60_000)));
  }, [autoRefreshIntervalMs]);

  const commitPageSizeInput = (rawValue: string) => {
    const trimmed = rawValue.trim();
    if (!trimmed) {
      setPageSizeInput(String(pageSize));
      return;
    }

    const value = Number(trimmed);
    if (!Number.isFinite(value)) {
      setPageSizeInput(String(pageSize));
      return;
    }

    const next = clampCardPageSize(value);
    setPageSize(next);
    setPageSizeInput(String(next));
  };

  const handlePageSizeChange = (event: ChangeEvent<HTMLInputElement>) => {
    const rawValue = event.currentTarget.value;
    setPageSizeInput(rawValue);

    const trimmed = rawValue.trim();
    if (!trimmed) return;

    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return;

    const rounded = Math.round(parsed);
    if (rounded < MIN_CARD_PAGE_SIZE || rounded > MAX_CARD_PAGE_SIZE) return;

    setPageSize(rounded);
  };

  const commitAutoRefreshInput = (rawValue: string) => {
    const trimmed = rawValue.trim();
    if (!trimmed) {
      setAutoRefreshInput(String(Math.round(autoRefreshIntervalMs / 60_000)));
      return;
    }

    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      setAutoRefreshInput(String(Math.round(autoRefreshIntervalMs / 60_000)));
      return;
    }

    const nextMinutes = clampAutoRefreshIntervalMinutes(parsed);
    setAutoRefreshIntervalMs(nextMinutes * 60_000);
    setAutoRefreshInput(String(nextMinutes));
  };

  const loadConfig = useCallback(async () => {
    try {
      await configFileApi.fetchConfigYaml();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : t('notification.refresh_failed');
      setError((prev) => prev || errorMessage);
    }
  }, [t]);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await authFilesApi.list();
      setFiles(data?.files || []);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : t('notification.refresh_failed');
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [t]);

  const handleHeaderRefresh = useCallback(async () => {
    await Promise.all([loadConfig(), loadFiles()]);
  }, [loadConfig, loadFiles]);

  useHeaderRefresh(handleHeaderRefresh);

  const refreshAllQuota = useCallback(async () => {
    if (disableControls || refreshingAll) return;

    setRefreshingAll(true);
    setRefreshSignal((prev) => prev + 1);

    try {
      await handleHeaderRefresh();
    } finally {
      setRefreshingAll(false);
    }
  }, [disableControls, refreshingAll, handleHeaderRefresh]);

  useEffect(() => {
    loadFiles();
    loadConfig();
  }, [loadFiles, loadConfig]);

  useInterval(
    () => {
      void refreshAllQuota().catch(() => {});
    },
    autoRefreshEnabled && !disableControls ? autoRefreshIntervalMs : null
  );

  const filteredFiles = useMemo(() => {
    if (!search.trim()) return files;
    return files.filter((file) => matchesQuotaSearch(file, search));
  }, [files, search]);

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{t('quota_management.title')}</h1>
        <p className={styles.description}>{t('quota_management.description')}</p>
        <div className={styles.pageToolbar}>
          <div className={`${styles.toolbarItem} ${styles.searchItem}`}>
            <label htmlFor="quota-search">{t('auth_files.search_label')}</label>
            <input
              id="quota-search"
              className={styles.searchInput}
              type="text"
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
              placeholder={t('auth_files.search_placeholder')}
            />
          </div>
          <div className={styles.toolbarItem}>
            <label htmlFor="quota-page-size">{t('auth_files.page_size_label')}</label>
            <input
              id="quota-page-size"
              className={styles.pageSizeSelect}
              type="number"
              min={MIN_CARD_PAGE_SIZE}
              max={MAX_CARD_PAGE_SIZE}
              step={1}
              value={pageSizeInput}
              onChange={handlePageSizeChange}
              onBlur={(e) => commitPageSizeInput(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur();
                }
              }}
            />
          </div>
          <div className={styles.toolbarActions}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void refreshAllQuota()}
              disabled={disableControls || refreshingAll || loading}
              loading={refreshingAll || loading}
            >
              {t('quota_management.refresh_files_and_quota')}
            </Button>
            <ToggleSwitch
              checked={autoRefreshEnabled}
              onChange={setAutoRefreshEnabled}
              disabled={disableControls || refreshingAll || loading}
              label={
                <span className={styles.autoRefreshLabel}>
                  <IconTimer size={16} />
                  {t('usage_stats.auto_refresh')}
                </span>
              }
            />
            <div className={styles.autoRefreshIntervalGroup}>
              <span className={styles.autoRefreshIntervalLabel}>
                {t('usage_stats.auto_refresh_interval')}
              </span>
              <input
                className={styles.autoRefreshIntervalInput}
                type="number"
                min={MIN_AUTO_REFRESH_INTERVAL_MINUTES}
                max={MAX_AUTO_REFRESH_INTERVAL_MINUTES}
                step={1}
                value={autoRefreshInput}
                onChange={(event) => setAutoRefreshInput(event.currentTarget.value)}
                onBlur={(event) => commitAutoRefreshInput(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.currentTarget.blur();
                  }
                }}
                disabled={disableControls || refreshingAll || loading}
              />
              <span className={styles.autoRefreshIntervalSuffix}>
                {t('usage_stats.auto_refresh_interval_unit')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {error && <div className={styles.errorBox}>{error}</div>}

      <QuotaSection
        config={CLAUDE_CONFIG}
        files={filteredFiles}
        pageSize={pageSize}
        refreshSignal={refreshSignal}
        loading={loading}
        disabled={disableControls}
      />
      <QuotaSection
        config={ANTIGRAVITY_CONFIG}
        files={filteredFiles}
        pageSize={pageSize}
        refreshSignal={refreshSignal}
        loading={loading}
        disabled={disableControls}
      />
      <QuotaSection
        config={CODEX_CONFIG}
        files={filteredFiles}
        pageSize={pageSize}
        refreshSignal={refreshSignal}
        loading={loading}
        disabled={disableControls}
      />
      <QuotaSection
        config={GEMINI_CLI_CONFIG}
        files={filteredFiles}
        pageSize={pageSize}
        refreshSignal={refreshSignal}
        loading={loading}
        disabled={disableControls}
      />
      <QuotaSection
        config={KIMI_CONFIG}
        files={filteredFiles}
        pageSize={pageSize}
        refreshSignal={refreshSignal}
        loading={loading}
        disabled={disableControls}
      />
    </div>
  );
}
