import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { UseUsageDataReturn } from '@/components/usage/hooks/useUsageData';
import { UsagePage } from './UsagePage';

const useUsageDataMock = vi.hoisted(() => vi.fn<() => UseUsageDataReturn>());
const loadUsageMock = vi.hoisted(() => vi.fn<() => Promise<void>>());

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const dictionary: Record<string, string> = {
        'common.loading': 'Loading...',
        'usage_stats.title': 'Usage Statistics',
        'usage_stats.range_filter': 'Time Range',
        'usage_stats.range_all': 'All Time',
        'usage_stats.range_7h': 'Last 7 Hours',
        'usage_stats.range_24h': 'Last 24 Hours',
        'usage_stats.range_7d': 'Last 7 Days',
        'usage_stats.header_controls': 'Usage controls',
        'usage_stats.export': 'Export',
        'usage_stats.import': 'Import',
        'usage_stats.refresh': 'Refresh',
        'usage_stats.auto_refresh_enabled': 'Enable auto-refresh',
        'usage_stats.auto_refresh_label': 'Auto-refresh',
        'usage_stats.auto_refresh_interval': 'Auto-refresh interval',
        'usage_stats.auto_refresh_interval_15': 'Every 15s',
        'usage_stats.auto_refresh_interval_30': 'Every 30s',
        'usage_stats.auto_refresh_interval_60': 'Every 60s',
        'usage_stats.auto_refresh_interval_120': 'Every 120s',
        'usage_stats.auto_refresh_interval_custom': 'Custom',
        'usage_stats.auto_refresh_custom_seconds_label': 'Custom interval in seconds',
        'usage_stats.auto_refresh_status_running': 'Auto-refresh running',
        'usage_stats.auto_refresh_status_hidden': 'Paused: tab hidden',
        'usage_stats.auto_refresh_status_unfocused': 'Paused: window unfocused',
        'usage_stats.auto_refresh_status_disabled': 'Paused: disabled',
        'usage_stats.auto_refresh_status_refreshing': 'Refreshing now',
        'usage_stats.auto_refresh_last_refreshed_at': 'Last refreshed at {{time}}',
        'usage_stats.auto_refresh_custom_hint_clamped': 'Adjusted to {{value}} seconds. Allowed range: {{min}}-{{max}} seconds.',
        'usage_stats.requests_trend': 'Request Trends',
        'usage_stats.tokens_trend': 'Token Usage Trends',
        'usage_stats.no_data': 'No data',
      };

      let template = dictionary[key] ?? key;
      if (!options) {
        return template;
      }

      Object.entries(options).forEach(([optionKey, optionValue]) => {
        template = template.replace(`{{${optionKey}}}`, String(optionValue));
      });
      return template;
    },
  }),
}));

vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: () => false,
}));

vi.mock('@/hooks/useHeaderRefresh', () => ({
  useHeaderRefresh: () => undefined,
}));

vi.mock('@/stores', () => ({
  useThemeStore: (selector: (state: { resolvedTheme: 'light' | 'dark' }) => unknown) =>
    selector({ resolvedTheme: 'light' }),
  useConfigStore: (selector: (state: { config: null }) => unknown) => selector({ config: null }),
}));

vi.mock('@/components/usage', async () => {
  const { useUsageAutoRefresh } = await vi.importActual<
    typeof import('@/components/usage/hooks/useUsageAutoRefresh')
  >('@/components/usage/hooks/useUsageAutoRefresh');

  return {
    useUsageData: useUsageDataMock,
    useUsageAutoRefresh,
    useSparklines: () => ({
      requestsSparkline: null,
      tokensSparkline: null,
      rpmSparkline: null,
      tpmSparkline: null,
      costSparkline: null,
    }),
    useChartData: () => ({
      requestsPeriod: 'hour' as const,
      setRequestsPeriod: vi.fn(),
      tokensPeriod: 'hour' as const,
      setTokensPeriod: vi.fn(),
      requestsChartData: { labels: [], datasets: [] },
      tokensChartData: { labels: [], datasets: [] },
      requestsChartOptions: {},
      tokensChartOptions: {},
    }),
    StatCards: () => <div data-testid="stat-cards" />,
    UsageChart: () => <div data-testid="usage-chart" />,
    ChartLineSelector: () => <div data-testid="chart-line-selector" />,
    ApiDetailsCard: () => <div data-testid="api-details" />,
    ModelStatsCard: () => <div data-testid="model-stats" />,
    PriceSettingsCard: () => <div data-testid="price-settings" />,
    CredentialStatsCard: () => <div data-testid="credential-stats" />,
    RequestEventsDetailsCard: () => <div data-testid="request-events" />,
    TokenBreakdownChart: () => <div data-testid="token-breakdown" />,
    CostTrendChart: () => <div data-testid="cost-trend" />,
    ServiceHealthCard: () => <div data-testid="service-health" />,
  };
});

function createDeferredPromise() {
  let resolvePromise: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve: () => resolvePromise?.(),
  };
}

function createUsageDataMockReturn(
  overrides: Partial<UseUsageDataReturn> = {},
): UseUsageDataReturn {
  return {
    usage: null,
    loading: false,
    error: '',
    lastRefreshedAt: new Date('2026-03-19T08:30:00.000Z'),
    modelPrices: {},
    setModelPrices: vi.fn(),
    loadUsage: loadUsageMock,
    handleExport: vi.fn(async () => undefined),
    handleImport: vi.fn(),
    handleImportChange: vi.fn(async () => undefined),
    importInputRef: { current: null },
    exporting: false,
    importing: false,
    ...overrides,
  };
}

describe('UsagePage auto-refresh controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    loadUsageMock.mockResolvedValue(undefined);
    useUsageDataMock.mockReturnValue(createUsageDataMockReturn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders auto-refresh controls', () => {
    render(<UsagePage />);

    expect(
      screen.getByRole('checkbox', { name: 'Enable auto-refresh' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Auto-refresh interval' }),
    ).toBeInTheDocument();
  });

  it('keeps time range and auto-refresh controls in the same top control group', () => {
    render(<UsagePage />);

    const controlsGroup = screen.getByRole('group', { name: 'Usage controls' });

    expect(within(controlsGroup).getByRole('button', { name: 'Time Range' })).toBeInTheDocument();
    expect(within(controlsGroup).getByRole('button', { name: 'Export' })).toBeInTheDocument();
    expect(within(controlsGroup).getByRole('button', { name: 'Import' })).toBeInTheDocument();
    expect(
      within(controlsGroup).getByRole('checkbox', { name: 'Enable auto-refresh' }),
    ).toBeInTheDocument();
    expect(
      within(controlsGroup).getByRole('button', { name: 'Auto-refresh interval' }),
    ).toBeInTheDocument();
    expect(within(controlsGroup).getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });

  it('renders live status text and last refreshed text', () => {
    render(<UsagePage />);

    expect(screen.getByText('Auto-refresh running')).toBeInTheDocument();
    expect(screen.getByText(/Last refreshed at/)).toBeInTheDocument();
  });

  it('clamps custom interval input value 5 to 15', async () => {
    render(<UsagePage />);

    fireEvent.click(screen.getByRole('button', { name: 'Auto-refresh interval' }));
    fireEvent.click(screen.getByRole('option', { name: 'Custom' }));

    const customIntervalInput = screen.getByRole('spinbutton', {
      name: 'Custom interval in seconds',
    });
    fireEvent.change(customIntervalInput, { target: { value: '5' } });
    fireEvent.blur(customIntervalInput);

    await waitFor(() => {
      expect(customIntervalInput).toHaveValue(15);
    });
  });

  it('shows inline guidance after clamping custom interval', async () => {
    render(<UsagePage />);

    fireEvent.click(screen.getByRole('button', { name: 'Auto-refresh interval' }));
    fireEvent.click(screen.getByRole('option', { name: 'Custom' }));

    const customIntervalInput = screen.getByRole('spinbutton', {
      name: 'Custom interval in seconds',
    });
    fireEvent.change(customIntervalInput, { target: { value: '5' } });
    fireEvent.blur(customIntervalInput);

    expect(
      await screen.findByText('Adjusted to 15 seconds. Allowed range: 15-3600 seconds.'),
    ).toBeInTheDocument();
  });

  it('uses runRefresh("manual") concurrency guard for manual refresh button', async () => {
    const deferred = createDeferredPromise();
    loadUsageMock.mockImplementationOnce(() => deferred.promise);

    render(<UsagePage />);

    const refreshButton = screen.getByRole('button', { name: 'Refresh' });
    fireEvent.click(refreshButton);
    fireEvent.click(refreshButton);

    expect(loadUsageMock).toHaveBeenCalledTimes(1);

    deferred.resolve();
    await deferred.promise;
  });
});
