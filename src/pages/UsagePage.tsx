import { useState, useMemo, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Select } from '@/components/ui/Select';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { Input } from '@/components/ui/Input';
import {
  IconDownload,
  IconInbox,
  IconRefreshCw,
  IconSlidersHorizontal,
  IconTimer
} from '@/components/ui/icons';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { useThemeStore, useConfigStore } from '@/stores';
import {
  StatCards,
  UsageChart,
  ChartLineSelector,
  ApiDetailsCard,
  ModelStatsCard,
  PriceSettingsCard,
  CredentialStatsCard,
  RequestEventsDetailsCard,
  TokenBreakdownChart,
  CostTrendChart,
  ServiceHealthCard,
  useUsageAutoRefresh,
  useUsageData,
  useSparklines,
  useChartData
} from '@/components/usage';
import {
  MAX_USAGE_AUTO_REFRESH_SECONDS,
  MIN_USAGE_AUTO_REFRESH_SECONDS,
  USAGE_AUTO_REFRESH_PRESET_SECONDS
} from '@/components/usage/hooks/usageAutoRefresh';
import {
  getModelNamesFromUsage,
  getApiStats,
  getModelStats,
  filterUsageByTimeRange,
  type UsageTimeRange
} from '@/utils/usage';
import styles from './UsagePage.module.scss';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const CHART_LINES_STORAGE_KEY = 'cli-proxy-usage-chart-lines-v1';
const TIME_RANGE_STORAGE_KEY = 'cli-proxy-usage-time-range-v1';
const DEFAULT_CHART_LINES = ['all'];
const DEFAULT_TIME_RANGE: UsageTimeRange = '24h';
const MAX_CHART_LINES = 9;
const AUTO_REFRESH_CUSTOM_INTERVAL_OPTION = 'custom';
const TIME_RANGE_OPTIONS: ReadonlyArray<{ value: UsageTimeRange; labelKey: string }> = [
  { value: 'all', labelKey: 'usage_stats.range_all' },
  { value: '7h', labelKey: 'usage_stats.range_7h' },
  { value: '24h', labelKey: 'usage_stats.range_24h' },
  { value: '7d', labelKey: 'usage_stats.range_7d' },
];
const HOUR_WINDOW_BY_TIME_RANGE: Record<Exclude<UsageTimeRange, 'all'>, number> = {
  '7h': 7,
  '24h': 24,
  '7d': 7 * 24
};

const isUsageTimeRange = (value: unknown): value is UsageTimeRange =>
  value === '7h' || value === '24h' || value === '7d' || value === 'all';

const normalizeChartLines = (value: unknown, maxLines = MAX_CHART_LINES): string[] => {
  if (!Array.isArray(value)) {
    return DEFAULT_CHART_LINES;
  }

  const filtered = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxLines);

  return filtered.length ? filtered : DEFAULT_CHART_LINES;
};

const loadChartLines = (): string[] => {
  try {
    if (typeof localStorage === 'undefined') {
      return DEFAULT_CHART_LINES;
    }
    const raw = localStorage.getItem(CHART_LINES_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_CHART_LINES;
    }
    return normalizeChartLines(JSON.parse(raw));
  } catch {
    return DEFAULT_CHART_LINES;
  }
};

const loadTimeRange = (): UsageTimeRange => {
  try {
    if (typeof localStorage === 'undefined') {
      return DEFAULT_TIME_RANGE;
    }
    const raw = localStorage.getItem(TIME_RANGE_STORAGE_KEY);
  return isUsageTimeRange(raw) ? raw : DEFAULT_TIME_RANGE;
  } catch {
    return DEFAULT_TIME_RANGE;
  }
};

type AutoRefreshStatusTone = 'running' | 'paused' | 'refreshing';

export function UsagePage() {
  const { t } = useTranslation();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const isDark = resolvedTheme === 'dark';
  const config = useConfigStore((state) => state.config);

  // Data hook
  const {
    usage,
    loading,
    error,
    lastRefreshedAt,
    modelPrices,
    setModelPrices,
    loadUsage,
    handleExport,
    handleImport,
    handleImportChange,
    importInputRef,
    exporting,
    importing
  } = useUsageData();

  const {
    settings: autoRefreshSettings,
    runRefresh,
    setEnabled: setAutoRefreshEnabled,
    setMode: setAutoRefreshMode,
    setPresetIntervalSeconds,
    customIntervalInput,
    setCustomIntervalInput,
    applyCustomInterval,
    customIntervalHint,
    isRefreshing,
    pauseReason
  } = useUsageAutoRefresh(loadUsage, loading);

  const handleManualRefresh = useCallback(async () => {
    await runRefresh('manual');
  }, [runRefresh]);

  useHeaderRefresh(handleManualRefresh);

  // Chart lines state
  const [chartLines, setChartLines] = useState<string[]>(loadChartLines);
  const [timeRange, setTimeRange] = useState<UsageTimeRange>(loadTimeRange);

  const timeRangeOptions = useMemo(
    () =>
      TIME_RANGE_OPTIONS.map((opt) => ({
        value: opt.value,
        label: t(opt.labelKey)
      })),
    [t]
  );
  const autoRefreshIntervalOptions = useMemo(
    () => [
      ...USAGE_AUTO_REFRESH_PRESET_SECONDS.map((seconds) => ({
        value: String(seconds),
        label: t(`usage_stats.auto_refresh_interval_${seconds}`)
      })),
      {
        value: AUTO_REFRESH_CUSTOM_INTERVAL_OPTION,
        label: t('usage_stats.auto_refresh_interval_custom')
      }
    ],
    [t]
  );
  const autoRefreshIntervalSelectValue =
    autoRefreshSettings.mode === 'custom'
      ? AUTO_REFRESH_CUSTOM_INTERVAL_OPTION
      : String(autoRefreshSettings.intervalSeconds);
  const autoRefreshStatus = useMemo((): { label: string; tone: AutoRefreshStatusTone } => {
    if (isRefreshing) {
      return {
        label: t('usage_stats.auto_refresh_status_refreshing'),
        tone: 'refreshing'
      };
    }

    if (pauseReason === 'hidden') {
      return {
        label: t('usage_stats.auto_refresh_status_hidden'),
        tone: 'paused'
      };
    }

    if (pauseReason === 'unfocused') {
      return {
        label: t('usage_stats.auto_refresh_status_unfocused'),
        tone: 'paused'
      };
    }

    if (pauseReason === 'disabled') {
      return {
        label: t('usage_stats.auto_refresh_status_disabled'),
        tone: 'paused'
      };
    }

    return {
      label: t('usage_stats.auto_refresh_status_running'),
      tone: 'running'
    };
  }, [isRefreshing, pauseReason, t]);
  const autoRefreshCustomHint = useMemo(() => {
    if (!customIntervalHint || autoRefreshSettings.mode !== 'custom') {
      return '';
    }

    if (
      autoRefreshSettings.intervalSeconds === MIN_USAGE_AUTO_REFRESH_SECONDS ||
      autoRefreshSettings.intervalSeconds === MAX_USAGE_AUTO_REFRESH_SECONDS
    ) {
      return t('usage_stats.auto_refresh_custom_hint_clamped', {
        value: autoRefreshSettings.intervalSeconds,
        min: MIN_USAGE_AUTO_REFRESH_SECONDS,
        max: MAX_USAGE_AUTO_REFRESH_SECONDS
      });
    }

    return t('usage_stats.auto_refresh_custom_hint_adjusted', {
      value: autoRefreshSettings.intervalSeconds,
      min: MIN_USAGE_AUTO_REFRESH_SECONDS,
      max: MAX_USAGE_AUTO_REFRESH_SECONDS
    });
  }, [autoRefreshSettings.intervalSeconds, autoRefreshSettings.mode, customIntervalHint, t]);
  const lastRefreshedText = useMemo(() => {
    if (!lastRefreshedAt) {
      return t('usage_stats.auto_refresh_last_refreshed_never');
    }

    return t('usage_stats.auto_refresh_last_refreshed_at', {
      time: lastRefreshedAt.toLocaleTimeString()
    });
  }, [lastRefreshedAt, t]);

  const filteredUsage = useMemo(
    () => (usage ? filterUsageByTimeRange(usage, timeRange) : null),
    [usage, timeRange]
  );
  const hourWindowHours =
    timeRange === 'all' ? undefined : HOUR_WINDOW_BY_TIME_RANGE[timeRange];

  const handleChartLinesChange = useCallback((lines: string[]) => {
    setChartLines(normalizeChartLines(lines));
  }, []);

  useEffect(() => {
    try {
      if (typeof localStorage === 'undefined') {
        return;
      }
      localStorage.setItem(CHART_LINES_STORAGE_KEY, JSON.stringify(chartLines));
    } catch {
      // Ignore storage errors.
    }
  }, [chartLines]);

  useEffect(() => {
    try {
      if (typeof localStorage === 'undefined') {
        return;
      }
      localStorage.setItem(TIME_RANGE_STORAGE_KEY, timeRange);
    } catch {
      // Ignore storage errors.
    }
  }, [timeRange]);

  const nowMs = lastRefreshedAt?.getTime() ?? 0;

  // Sparklines hook
  const {
    requestsSparkline,
    tokensSparkline,
    rpmSparkline,
    tpmSparkline,
    costSparkline
  } = useSparklines({ usage: filteredUsage, loading, nowMs });

  // Chart data hook
  const {
    requestsPeriod,
    setRequestsPeriod,
    tokensPeriod,
    setTokensPeriod,
    requestsChartData,
    tokensChartData,
    requestsChartOptions,
    tokensChartOptions
  } = useChartData({ usage: filteredUsage, chartLines, isDark, isMobile, hourWindowHours });

  // Derived data
  const modelNames = useMemo(() => getModelNamesFromUsage(usage), [usage]);
  const apiStats = useMemo(
    () => getApiStats(filteredUsage, modelPrices),
    [filteredUsage, modelPrices]
  );
  const modelStats = useMemo(
    () => getModelStats(filteredUsage, modelPrices),
    [filteredUsage, modelPrices]
  );
  const hasPrices = Object.keys(modelPrices).length > 0;

  return (
    <div className={styles.container}>
      {loading && !usage && (
        <div className={styles.loadingOverlay} aria-busy="true">
          <div className={styles.loadingOverlayContent}>
            <LoadingSpinner size={28} className={styles.loadingOverlaySpinner} />
            <span className={styles.loadingOverlayText}>{t('common.loading')}</span>
          </div>
        </div>
      )}

      <div className={styles.header} role="group" aria-label={t('usage_stats.header_controls')}>
        <div className={styles.headerTitleGroup}>
          <div className={styles.headerTitleBlock}>
            <h1 className={styles.pageTitle}>{t('usage_stats.title')}</h1>
            <div className={styles.headerSummary}>
              <span className={styles.headerSummaryItem}>{lastRefreshedText}</span>
            </div>
          </div>
          <div className={styles.headerActions}>
            <Button
              variant="ghost"
              size="sm"
              className={styles.headerActionButton}
              onClick={handleExport}
              loading={exporting}
              disabled={loading || importing}
            >
              <IconDownload size={14} className={styles.actionIcon} />
              {t('usage_stats.export')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={styles.headerActionButton}
              onClick={handleImport}
              loading={importing}
              disabled={loading || exporting}
            >
              <IconInbox size={14} className={styles.actionIcon} />
              {t('usage_stats.import')}
            </Button>
          </div>
        </div>
        <div className={styles.controlDeck}>
          <div className={styles.timeRangeGroup}>
            <div className={styles.controlSectionHeader}>
              <span className={styles.controlSectionLabel}>
                <IconSlidersHorizontal size={14} className={styles.controlSectionIcon} />
                {t('usage_stats.range_filter')}
              </span>
            </div>
            <div className={styles.timeRangeControls}>
              <Select
                value={timeRange}
                options={timeRangeOptions}
                onChange={(value) => setTimeRange(value as UsageTimeRange)}
                className={styles.timeRangeSelectControl}
                ariaLabel={t('usage_stats.range_filter')}
                fullWidth={false}
              />
              <Button
                variant="secondary"
                size="sm"
                className={styles.autoRefreshActionButton}
                loading={isRefreshing || loading}
                onClick={() => {
                  void handleManualRefresh().catch(() => {});
                }}
                disabled={loading || exporting || importing}
              >
                <IconRefreshCw size={14} className={styles.actionIcon} />
                {t('usage_stats.refresh')}
              </Button>
            </div>
          </div>
          <div className={styles.controlDivider} aria-hidden="true" />
          <div className={styles.autoRefreshPanel}>
            <div className={styles.controlSectionHeader}>
              <span className={styles.controlSectionLabel}>
                <IconTimer size={14} className={styles.controlSectionIcon} />
                {t('usage_stats.auto_refresh_label')}
              </span>
              <span
                className={`${styles.autoRefreshStatusBadge} ${
                  autoRefreshStatus.tone === 'running'
                    ? styles.autoRefreshStatusRunning
                    : autoRefreshStatus.tone === 'refreshing'
                    ? styles.autoRefreshStatusRefreshing
                    : styles.autoRefreshStatusPaused
                }`}
              >
                <span className={styles.autoRefreshStatusDot} aria-hidden="true" />
                {autoRefreshStatus.label}
              </span>
            </div>
            <div className={styles.autoRefreshToolbar}>
              <div className={`${styles.autoRefreshField} ${styles.autoRefreshToggleField}`}>
                <span className={styles.autoRefreshFieldLabel}>
                  {t('usage_stats.auto_refresh_enabled')}
                </span>
                <div className={styles.autoRefreshToggleControl}>
                  <ToggleSwitch
                    checked={autoRefreshSettings.enabled}
                    onChange={setAutoRefreshEnabled}
                    ariaLabel={t('usage_stats.auto_refresh_enabled')}
                  />
                </div>
              </div>
              <div className={styles.autoRefreshField}>
                <span className={styles.autoRefreshFieldLabel}>
                  {t('usage_stats.auto_refresh_interval')}
                </span>
                <Select
                  value={autoRefreshIntervalSelectValue}
                  options={autoRefreshIntervalOptions}
                  onChange={(value) => {
                    if (value === AUTO_REFRESH_CUSTOM_INTERVAL_OPTION) {
                      setAutoRefreshMode('custom');
                      return;
                    }

                    setPresetIntervalSeconds(Number(value));
                  }}
                  className={styles.autoRefreshSelect}
                  ariaLabel={t('usage_stats.auto_refresh_interval')}
                  fullWidth={false}
                />
              </div>
            </div>
            {autoRefreshSettings.mode === 'custom' && (
              <div className={styles.autoRefreshCustomRow}>
                <div className={`${styles.autoRefreshField} ${styles.autoRefreshCustomField}`}>
                  <span className={styles.autoRefreshFieldLabel}>
                    {t('usage_stats.auto_refresh_custom_seconds_label')}
                  </span>
                  <div className={styles.autoRefreshCustomInput}>
                    <Input
                      type="number"
                      min={MIN_USAGE_AUTO_REFRESH_SECONDS}
                      max={MAX_USAGE_AUTO_REFRESH_SECONDS}
                      step={1}
                      value={customIntervalInput}
                      onChange={(event) => setCustomIntervalInput(event.target.value)}
                      onBlur={applyCustomInterval}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter') {
                          return;
                        }
                        event.preventDefault();
                        applyCustomInterval();
                      }}
                      aria-label={t('usage_stats.auto_refresh_custom_seconds_label')}
                      placeholder={t('usage_stats.auto_refresh_custom_seconds_placeholder')}
                      hint={autoRefreshCustomHint || undefined}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className={styles.headerUtilities}>
          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={handleImportChange}
          />
        </div>
      </div>

      {error && <div className={styles.errorBox}>{error}</div>}

      {/* Stats Overview Cards */}
      <StatCards
        usage={filteredUsage}
        loading={loading}
        modelPrices={modelPrices}
        nowMs={nowMs}
        sparklines={{
          requests: requestsSparkline,
          tokens: tokensSparkline,
          rpm: rpmSparkline,
          tpm: tpmSparkline,
          cost: costSparkline
        }}
      />

      {/* Chart Line Selection */}
      <ChartLineSelector
        chartLines={chartLines}
        modelNames={modelNames}
        maxLines={MAX_CHART_LINES}
        onChange={handleChartLinesChange}
      />

      {/* Service Health */}
      <ServiceHealthCard usage={usage} loading={loading} />

      {/* Charts Grid */}
      <div className={styles.chartsGrid}>
        <UsageChart
          title={t('usage_stats.requests_trend')}
          period={requestsPeriod}
          onPeriodChange={setRequestsPeriod}
          chartData={requestsChartData}
          chartOptions={requestsChartOptions}
          loading={loading}
          isMobile={isMobile}
          emptyText={t('usage_stats.no_data')}
        />
        <UsageChart
          title={t('usage_stats.tokens_trend')}
          period={tokensPeriod}
          onPeriodChange={setTokensPeriod}
          chartData={tokensChartData}
          chartOptions={tokensChartOptions}
          loading={loading}
          isMobile={isMobile}
          emptyText={t('usage_stats.no_data')}
        />
      </div>

      {/* Token Breakdown Chart */}
      <TokenBreakdownChart
        usage={filteredUsage}
        loading={loading}
        isDark={isDark}
        isMobile={isMobile}
        hourWindowHours={hourWindowHours}
      />

      {/* Cost Trend Chart */}
      <CostTrendChart
        usage={filteredUsage}
        loading={loading}
        isDark={isDark}
        isMobile={isMobile}
        modelPrices={modelPrices}
        hourWindowHours={hourWindowHours}
      />

      {/* Details Grid */}
      <div className={styles.detailsGrid}>
        <ApiDetailsCard apiStats={apiStats} loading={loading} hasPrices={hasPrices} />
        <ModelStatsCard modelStats={modelStats} loading={loading} hasPrices={hasPrices} />
      </div>

      <RequestEventsDetailsCard
        usage={filteredUsage}
        loading={loading}
        geminiKeys={config?.geminiApiKeys || []}
        claudeConfigs={config?.claudeApiKeys || []}
        codexConfigs={config?.codexApiKeys || []}
        vertexConfigs={config?.vertexApiKeys || []}
        openaiProviders={config?.openaiCompatibility || []}
      />

      {/* Credential Stats */}
      <CredentialStatsCard
        usage={filteredUsage}
        loading={loading}
        geminiKeys={config?.geminiApiKeys || []}
        claudeConfigs={config?.claudeApiKeys || []}
        codexConfigs={config?.codexApiKeys || []}
        vertexConfigs={config?.vertexApiKeys || []}
        openaiProviders={config?.openaiCompatibility || []}
      />

      {/* Price Settings */}
      <PriceSettingsCard
        modelNames={modelNames}
        modelPrices={modelPrices}
        onPricesChange={setModelPrices}
      />
    </div>
  );
}
