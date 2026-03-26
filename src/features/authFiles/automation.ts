import type { TFunction } from 'i18next';
import {
  ANTIGRAVITY_CONFIG,
  CLAUDE_CONFIG,
  CODEX_CONFIG,
  GEMINI_CLI_CONFIG,
  KIMI_CONFIG,
} from '@/components/quota';
import { authFilesApi } from '@/services/api';
import { useQuotaStore } from '@/stores';
import type {
  AntigravityQuotaState,
  AuthFileItem,
  ClaudeQuotaState,
  CodexQuotaState,
  GeminiCliQuotaState,
  KimiQuotaState,
} from '@/types';
import { getStatusFromError, isDisabledAuthFile, resolveAuthProvider } from '@/utils/quota';
import { getAuthFileStatusMessage, isRuntimeOnlyAuthFile } from '@/features/authFiles/constants';

export type AuthFilesSweepReason = 'status-401' | 'quota-401' | 'weekly-low';

export type AuthFilesSweepFinding = {
  name: string;
  provider: string;
  reasons: AuthFilesSweepReason[];
  message?: string;
  weeklyRemainingPercent: number | null;
};

export type AuthFilesSweepSettings = {
  enabled: boolean;
  intervalMinutes: number;
  autoDelete401: boolean;
  autoDeleteLowWeeklyQuota: boolean;
  weeklyThresholdPercent: number;
};

export type AuthFilesSweepProgress = {
  completed: number;
  total: number;
};

export type AuthFilesSweepResult = {
  startedAt: number;
  finishedAt: number;
  scannedCount: number;
  quotaCheckedCount: number;
  detected401Count: number;
  detectedLowWeeklyCount: number;
  deletedCount: number;
  failedDeleteCount: number;
  findings: AuthFilesSweepFinding[];
  deletedNames: string[];
  failedDeleteNames: string[];
};

type SweepQuotaConfig =
  | typeof ANTIGRAVITY_CONFIG
  | typeof CLAUDE_CONFIG
  | typeof CODEX_CONFIG
  | typeof GEMINI_CLI_CONFIG
  | typeof KIMI_CONFIG;

type MutableFinding = {
  name: string;
  provider: string;
  reasons: Set<AuthFilesSweepReason>;
  message?: string;
  weeklyRemainingPercent: number | null;
};

const AUTH_FILES_SWEEP_SETTINGS_KEY = 'authFilesPage.sweepSettings';
const DEFAULT_INTERVAL_MINUTES = 10;
const MIN_INTERVAL_MINUTES = 1;
const MAX_INTERVAL_MINUTES = 180;
const DEFAULT_WEEKLY_THRESHOLD_PERCENT = 5;
const MIN_WEEKLY_THRESHOLD_PERCENT = 1;
const MAX_WEEKLY_THRESHOLD_PERCENT = 50;
const SWEEP_QUOTA_CONCURRENCY = 8;
const SWEEP_DELETE_CONCURRENCY = 6;

const QUOTA_CONFIG_BY_PROVIDER: Record<string, SweepQuotaConfig> = {
  antigravity: ANTIGRAVITY_CONFIG,
  claude: CLAUDE_CONFIG,
  codex: CODEX_CONFIG,
  'gemini-cli': GEMINI_CLI_CONFIG,
  kimi: KIMI_CONFIG,
};

export const DEFAULT_AUTH_FILES_SWEEP_SETTINGS: AuthFilesSweepSettings = {
  enabled: false,
  intervalMinutes: DEFAULT_INTERVAL_MINUTES,
  autoDelete401: true,
  autoDeleteLowWeeklyQuota: true,
  weeklyThresholdPercent: DEFAULT_WEEKLY_THRESHOLD_PERCENT,
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const clampSweepIntervalMinutes = (value: number) =>
  clamp(Math.round(value), MIN_INTERVAL_MINUTES, MAX_INTERVAL_MINUTES);

export const clampSweepWeeklyThresholdPercent = (value: number) =>
  clamp(Math.round(value), MIN_WEEKLY_THRESHOLD_PERCENT, MAX_WEEKLY_THRESHOLD_PERCENT);

export const readAuthFilesSweepSettings = (): AuthFilesSweepSettings => {
  if (typeof window === 'undefined') return DEFAULT_AUTH_FILES_SWEEP_SETTINGS;

  try {
    const raw = window.localStorage.getItem(AUTH_FILES_SWEEP_SETTINGS_KEY);
    if (!raw) return DEFAULT_AUTH_FILES_SWEEP_SETTINGS;

    const parsed = JSON.parse(raw) as Partial<AuthFilesSweepSettings>;
    return {
      enabled: parsed.enabled === true,
      intervalMinutes: clampSweepIntervalMinutes(
        Number.isFinite(parsed.intervalMinutes)
          ? Number(parsed.intervalMinutes)
          : DEFAULT_INTERVAL_MINUTES
      ),
      autoDelete401:
        typeof parsed.autoDelete401 === 'boolean'
          ? parsed.autoDelete401
          : DEFAULT_AUTH_FILES_SWEEP_SETTINGS.autoDelete401,
      autoDeleteLowWeeklyQuota:
        typeof parsed.autoDeleteLowWeeklyQuota === 'boolean'
          ? parsed.autoDeleteLowWeeklyQuota
          : DEFAULT_AUTH_FILES_SWEEP_SETTINGS.autoDeleteLowWeeklyQuota,
      weeklyThresholdPercent: clampSweepWeeklyThresholdPercent(
        Number.isFinite(parsed.weeklyThresholdPercent)
          ? Number(parsed.weeklyThresholdPercent)
          : DEFAULT_WEEKLY_THRESHOLD_PERCENT
      ),
    };
  } catch {
    return DEFAULT_AUTH_FILES_SWEEP_SETTINGS;
  }
};

export const writeAuthFilesSweepSettings = (settings: AuthFilesSweepSettings) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      AUTH_FILES_SWEEP_SETTINGS_KEY,
      JSON.stringify({
        ...settings,
        intervalMinutes: clampSweepIntervalMinutes(settings.intervalMinutes),
        weeklyThresholdPercent: clampSweepWeeklyThresholdPercent(
          settings.weeklyThresholdPercent
        ),
      })
    );
  } catch {
    // ignore
  }
};

const isUnauthorizedText = (value: string): boolean => {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  return (
    /\b401\b/.test(normalized) ||
    normalized.includes('unauthorized') ||
    normalized.includes('not authorized') ||
    normalized.includes('未授权') ||
    normalized.includes('认证失败') ||
    normalized.includes('鉴权失败') ||
    normalized.includes('invalid token') ||
    normalized.includes('token expired')
  );
};

const getQuotaConfigForFile = (file: AuthFileItem): SweepQuotaConfig | null => {
  const provider = resolveAuthProvider(file);
  return QUOTA_CONFIG_BY_PROVIDER[provider] ?? null;
};

const upsertFinding = (
  findings: Map<string, MutableFinding>,
  file: AuthFileItem,
  reason: AuthFilesSweepReason,
  meta?: { message?: string; weeklyRemainingPercent?: number | null }
) => {
  const key = file.name;
  const existing = findings.get(key);
  const provider = resolveAuthProvider(file) || 'unknown';

  if (existing) {
    existing.reasons.add(reason);
    if (!existing.message && meta?.message) {
      existing.message = meta.message;
    }
    if (meta?.weeklyRemainingPercent !== undefined && meta.weeklyRemainingPercent !== null) {
      existing.weeklyRemainingPercent =
        existing.weeklyRemainingPercent === null
          ? meta.weeklyRemainingPercent
          : Math.min(existing.weeklyRemainingPercent, meta.weeklyRemainingPercent);
    }
    return;
  }

  findings.set(key, {
    name: file.name,
    provider,
    reasons: new Set([reason]),
    message: meta?.message,
    weeklyRemainingPercent:
      meta?.weeklyRemainingPercent !== undefined ? meta.weeklyRemainingPercent : null,
  });
};

const getCodexWeeklyRemainingPercent = (state: CodexQuotaState): number | null => {
  const weeklyValues = state.windows
    .filter((window) => window.id.includes('weekly'))
    .map((window) =>
      window.usedPercent === null ? null : Math.max(0, Math.min(100, 100 - window.usedPercent))
    )
    .filter((value): value is number => value !== null);

  return weeklyValues.length > 0 ? Math.min(...weeklyValues) : null;
};

const getClaudeWeeklyRemainingPercent = (state: ClaudeQuotaState): number | null => {
  const weeklyValues = state.windows
    .filter((window) => window.id.startsWith('seven-day'))
    .map((window) =>
      window.usedPercent === null ? null : Math.max(0, Math.min(100, 100 - window.usedPercent))
    )
    .filter((value): value is number => value !== null);

  return weeklyValues.length > 0 ? Math.min(...weeklyValues) : null;
};

const getKimiWeeklyRemainingPercent = (state: KimiQuotaState): number | null => {
  const weeklyValues = state.rows
    .filter((row) => row.id.includes('weekly') || row.labelKey === 'kimi_quota.weekly_limit')
    .map((row) => {
      if (!Number.isFinite(row.limit) || row.limit <= 0) return null;
      return Math.max(0, Math.min(100, ((row.limit - row.used) / row.limit) * 100));
    })
    .filter((value): value is number => value !== null);

  return weeklyValues.length > 0 ? Math.min(...weeklyValues) : null;
};

const getWeeklyRemainingPercent = (
  config: SweepQuotaConfig,
  quotaState:
    | AntigravityQuotaState
    | ClaudeQuotaState
    | CodexQuotaState
    | GeminiCliQuotaState
    | KimiQuotaState
): number | null => {
  if (config.type === 'codex') return getCodexWeeklyRemainingPercent(quotaState as CodexQuotaState);
  if (config.type === 'claude')
    return getClaudeWeeklyRemainingPercent(quotaState as ClaudeQuotaState);
  if (config.type === 'kimi') return getKimiWeeklyRemainingPercent(quotaState as KimiQuotaState);
  return null;
};

const updateQuotaCache = <TState extends object>(
  config: SweepQuotaConfig,
  name: string,
  quotaState: TState
) => {
  const setter = useQuotaStore.getState()[config.storeSetter] as (
    updater: (prev: Record<string, TState>) => Record<string, TState>
  ) => void;

  setter((prev) => ({
    ...prev,
    [name]: quotaState,
  }));
};

const cleanupQuotaCache = (names: string[]) => {
  if (names.length === 0) return;

  const uniqueNames = new Set(names);
  const store = useQuotaStore.getState();
  const setters = [
    store.setAntigravityQuota,
    store.setClaudeQuota,
    store.setCodexQuota,
    store.setGeminiCliQuota,
    store.setKimiQuota,
  ] as Array<
    (
      updater:
        | Record<string, unknown>
        | ((prev: Record<string, unknown>) => Record<string, unknown>)
    ) => void
  >;

  setters.forEach((setter) => {
    setter((prev: Record<string, unknown>) => {
      let changed = false;
      const next = { ...prev };
      uniqueNames.forEach((name) => {
        if (!(name in next)) return;
        delete next[name];
        changed = true;
      });
      return changed ? next : prev;
    });
  });
};

const runWithConcurrency = async <T>(
  tasks: T[],
  concurrency: number,
  handler: (task: T, index: number) => Promise<void>
) => {
  if (tasks.length === 0) return;

  let cursor = 0;
  const workerCount = Math.max(1, Math.min(concurrency, tasks.length));

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= tasks.length) return;
        await handler(tasks[index], index);
      }
    })
  );
};

const finalizeFindings = (findings: Map<string, MutableFinding>): AuthFilesSweepFinding[] =>
  Array.from(findings.values())
    .map((item) => ({
      name: item.name,
      provider: item.provider,
      reasons: Array.from(item.reasons).sort(),
      message: item.message,
      weeklyRemainingPercent: item.weeklyRemainingPercent,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

const shouldDeleteFinding = (
  finding: AuthFilesSweepFinding,
  settings: AuthFilesSweepSettings
): boolean => {
  if (
    settings.autoDelete401 &&
    (finding.reasons.includes('status-401') || finding.reasons.includes('quota-401'))
  ) {
    return true;
  }

  return settings.autoDeleteLowWeeklyQuota && finding.reasons.includes('weekly-low');
};

export const executeAuthFilesSweep = async ({
  files,
  settings,
  t,
  onProgress,
}: {
  files: AuthFileItem[];
  settings: AuthFilesSweepSettings;
  t: TFunction;
  onProgress?: (progress: AuthFilesSweepProgress) => void;
}): Promise<AuthFilesSweepResult> => {
  const startedAt = Date.now();
  const findings = new Map<string, MutableFinding>();
  const scannedFiles = files.filter((file) => !isRuntimeOnlyAuthFile(file));

  scannedFiles.forEach((file) => {
    const statusMessage = getAuthFileStatusMessage(file);
    if (!isUnauthorizedText(statusMessage)) return;
    upsertFinding(findings, file, 'status-401', { message: statusMessage });
  });

  const quotaTargets = scannedFiles.filter((file) => !isDisabledAuthFile(file) && getQuotaConfigForFile(file));

  let completed = 0;
  onProgress?.({ completed, total: quotaTargets.length });

  await runWithConcurrency(quotaTargets, SWEEP_QUOTA_CONCURRENCY, async (file) => {
    const config = getQuotaConfigForFile(file);
    if (!config) {
      completed += 1;
      onProgress?.({ completed, total: quotaTargets.length });
      return;
    }

    try {
      const data = await config.fetchQuota(file, t);
      const quotaState = config.buildSuccessState(data as never) as
        | AntigravityQuotaState
        | ClaudeQuotaState
        | CodexQuotaState
        | GeminiCliQuotaState
        | KimiQuotaState;

      updateQuotaCache(config, file.name, quotaState);

      const weeklyRemainingPercent = getWeeklyRemainingPercent(config, quotaState);
      if (
        weeklyRemainingPercent !== null &&
        weeklyRemainingPercent < settings.weeklyThresholdPercent
      ) {
        upsertFinding(findings, file, 'weekly-low', { weeklyRemainingPercent });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('common.unknown_error');
      const errorStatus = getStatusFromError(error);
      const quotaState = config.buildErrorState(message, errorStatus) as
        | AntigravityQuotaState
        | ClaudeQuotaState
        | CodexQuotaState
        | GeminiCliQuotaState
        | KimiQuotaState;

      updateQuotaCache(config, file.name, quotaState);

      if (errorStatus === 401 || isUnauthorizedText(message)) {
        upsertFinding(findings, file, 'quota-401', { message });
      }
    } finally {
      completed += 1;
      onProgress?.({ completed, total: quotaTargets.length });
    }
  });

  const finalizedFindings = finalizeFindings(findings);
  const namesToDelete = finalizedFindings
    .filter((finding) => shouldDeleteFinding(finding, settings))
    .map((finding) => finding.name);

  const deletedNames: string[] = [];
  const failedDeleteNames: string[] = [];

  await runWithConcurrency(namesToDelete, SWEEP_DELETE_CONCURRENCY, async (name) => {
    try {
      await authFilesApi.deleteFile(name);
      deletedNames.push(name);
    } catch {
      failedDeleteNames.push(name);
    }
  });

  cleanupQuotaCache(deletedNames);

  const unique401Names = new Set(
    finalizedFindings
      .filter(
        (finding) =>
          finding.reasons.includes('status-401') || finding.reasons.includes('quota-401')
      )
      .map((finding) => finding.name)
  );

  const uniqueLowWeeklyNames = new Set(
    finalizedFindings
      .filter((finding) => finding.reasons.includes('weekly-low'))
      .map((finding) => finding.name)
  );

  return {
    startedAt,
    finishedAt: Date.now(),
    scannedCount: scannedFiles.length,
    quotaCheckedCount: quotaTargets.length,
    detected401Count: unique401Names.size,
    detectedLowWeeklyCount: uniqueLowWeeklyNames.size,
    deletedCount: deletedNames.length,
    failedDeleteCount: failedDeleteNames.length,
    findings: finalizedFindings,
    deletedNames,
    failedDeleteNames,
  };
};
