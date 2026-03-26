import type { TFunction } from 'i18next';
import { authFilesApi } from '@/services/api';
import type { CodexQuotaWindow } from '@/types';
import { normalizeNumberValue } from './parsers';

export const AUTH_FILE_WEEKLY_REMAINING_THRESHOLD_PERCENT = 10;

type QuotaFetchOutcome =
  | { status: 'success'; data: unknown }
  | { status: 'error'; errorStatus?: number };

export type QuotaAutoDeleteReason = 'unauthorized' | 'low-weekly-limit';

export interface QuotaAutoDeleteDecision {
  reason: QuotaAutoDeleteReason;
  remainingPercent?: number;
  thresholdPercent?: number;
}

export interface QuotaAutoDeleteCandidate {
  name: string;
  decision: QuotaAutoDeleteDecision;
}

const formatPercent = (value: number) => {
  if (!Number.isFinite(value)) return '0';
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
};

export const summarizeAuthFileNames = (names: string[], previewCount = 3) => {
  const normalized = Array.from(
    new Set(
      names
        .map((name) => String(name ?? '').trim())
        .filter(Boolean)
    )
  );

  if (normalized.length <= previewCount) {
    return normalized.join('、');
  }

  return `${normalized.slice(0, previewCount).join('、')}…`;
};

const getCodexWeeklyWindow = (data: unknown): CodexQuotaWindow | null => {
  if (!data || typeof data !== 'object') return null;
  const windows = (data as { windows?: CodexQuotaWindow[] }).windows;
  if (!Array.isArray(windows)) return null;
  return windows.find((window) => window?.id === 'weekly') ?? null;
};

export const resolveQuotaAutoDeleteDecision = (
  quotaType: string,
  outcome: QuotaFetchOutcome
): QuotaAutoDeleteDecision | null => {
  if (outcome.status === 'error') {
    if (outcome.errorStatus === 401) {
      return { reason: 'unauthorized' };
    }
    return null;
  }

  if (quotaType !== 'codex') {
    return null;
  }

  const weeklyWindow = getCodexWeeklyWindow(outcome.data);
  const usedPercent = normalizeNumberValue(weeklyWindow?.usedPercent);
  if (usedPercent === null) {
    return null;
  }

  const remainingPercent = Math.max(0, 100 - usedPercent);
  if (remainingPercent >= AUTH_FILE_WEEKLY_REMAINING_THRESHOLD_PERCENT) {
    return null;
  }

  return {
    reason: 'low-weekly-limit',
    remainingPercent,
    thresholdPercent: AUTH_FILE_WEEKLY_REMAINING_THRESHOLD_PERCENT
  };
};

const buildSingleDeleteMessage = (
  t: TFunction,
  candidate: QuotaAutoDeleteCandidate
): string => {
  if (candidate.decision.reason === 'unauthorized') {
    return t('quota_management.auto_delete_401_single', { name: candidate.name });
  }

  return t('quota_management.auto_delete_low_weekly_single', {
    name: candidate.name,
    remaining: formatPercent(candidate.decision.remainingPercent ?? 0),
    threshold: candidate.decision.thresholdPercent ?? AUTH_FILE_WEEKLY_REMAINING_THRESHOLD_PERCENT
  });
};

const buildBatchDeleteMessage = (
  t: TFunction,
  reason: QuotaAutoDeleteReason,
  candidates: QuotaAutoDeleteCandidate[]
): string => {
  const names = summarizeAuthFileNames(candidates.map((candidate) => candidate.name));

  if (reason === 'unauthorized') {
    return t('quota_management.auto_delete_401_batch', {
      count: candidates.length,
      names
    });
  }

  return t('quota_management.auto_delete_low_weekly_batch', {
    count: candidates.length,
    names,
    threshold:
      candidates[0]?.decision.thresholdPercent ?? AUTH_FILE_WEEKLY_REMAINING_THRESHOLD_PERCENT
  });
};

export async function autoDeleteAuthFiles(
  candidates: QuotaAutoDeleteCandidate[],
  t: TFunction,
  showNotification: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void
): Promise<{ deletedNames: string[]; failedNames: string[] }> {
  if (candidates.length === 0) {
    return { deletedNames: [], failedNames: [] };
  }

  const results = await Promise.allSettled(
    candidates.map((candidate) => authFilesApi.deleteFile(candidate.name))
  );

  const deletedNames: string[] = [];
  const failedNames: string[] = [];
  const deletedByReason = new Map<QuotaAutoDeleteReason, QuotaAutoDeleteCandidate[]>();

  results.forEach((result, index) => {
    const candidate = candidates[index];
    if (result.status === 'fulfilled') {
      deletedNames.push(candidate.name);
      const existing = deletedByReason.get(candidate.decision.reason) ?? [];
      existing.push(candidate);
      deletedByReason.set(candidate.decision.reason, existing);
      return;
    }

    failedNames.push(candidate.name);
  });

  deletedByReason.forEach((group, reason) => {
    if (group.length === 1) {
      showNotification(buildSingleDeleteMessage(t, group[0]), 'warning');
      return;
    }

    showNotification(buildBatchDeleteMessage(t, reason, group), 'warning');
  });

  if (failedNames.length > 0) {
    showNotification(
      t('quota_management.auto_delete_failed', {
        names: summarizeAuthFileNames(failedNames)
      }),
      'error'
    );
  }

  return { deletedNames, failedNames };
}
