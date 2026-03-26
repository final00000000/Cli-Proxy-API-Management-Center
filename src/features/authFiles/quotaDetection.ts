import type { TFunction } from 'i18next';
import {
  ANTIGRAVITY_CONFIG,
  CLAUDE_CONFIG,
  CODEX_CONFIG,
  GEMINI_CLI_CONFIG,
  KIMI_CONFIG,
  type QuotaConfig,
} from '@/components/quota';
import type { AuthFileItem } from '@/types';
import { autoDeleteAuthFiles, getStatusFromError } from '@/utils/quota';

type AuthFileQuotaDetectionConfig = Pick<QuotaConfig<unknown, unknown>, 'filterFn' | 'fetchQuota'>;

type DetectableAuthFile = {
  file: AuthFileItem;
  config: AuthFileQuotaDetectionConfig;
};

export type AuthFile401DetectionResult = {
  scannedCount: number;
  skippedCount: number;
  deletedNames: string[];
  failedDeleteNames: string[];
};

const AUTH_FILE_401_DETECTION_CONFIGS: AuthFileQuotaDetectionConfig[] = [
  CLAUDE_CONFIG,
  ANTIGRAVITY_CONFIG,
  CODEX_CONFIG,
  GEMINI_CLI_CONFIG,
  KIMI_CONFIG,
];

const DETECT_401_BATCH_SIZE = 4;

const dedupeAuthFiles = (files: AuthFileItem[]): AuthFileItem[] => {
  const seen = new Set<string>();

  return files.filter((file) => {
    const name = String(file?.name ?? '').trim();
    if (!name || seen.has(name)) return false;
    seen.add(name);
    return true;
  });
};

export const getAuthFile401DetectionConfig = (
  file: AuthFileItem
): AuthFileQuotaDetectionConfig | null =>
  AUTH_FILE_401_DETECTION_CONFIGS.find((config) => config.filterFn(file)) ?? null;

export const isAuthFile401Detectable = (file: AuthFileItem): boolean =>
  getAuthFile401DetectionConfig(file) !== null;

const toDetectableAuthFiles = (files: AuthFileItem[]): DetectableAuthFile[] =>
  dedupeAuthFiles(files)
    .map((file) => {
      const config = getAuthFile401DetectionConfig(file);
      return config ? { file, config } : null;
    })
    .filter((entry): entry is DetectableAuthFile => entry !== null);

export async function detectAndCleanupAuthFiles401(
  files: AuthFileItem[],
  t: TFunction,
  showNotification: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void
): Promise<AuthFile401DetectionResult> {
  const uniqueFiles = dedupeAuthFiles(files);
  const detectableFiles = toDetectableAuthFiles(uniqueFiles);
  const deleteCandidates: Array<{
    name: string;
    decision: { reason: 'unauthorized' };
  }> = [];

  for (let index = 0; index < detectableFiles.length; index += DETECT_401_BATCH_SIZE) {
    const batch = detectableFiles.slice(index, index + DETECT_401_BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async ({ file, config }) => {
        try {
          await config.fetchQuota(file, t);
          return null;
        } catch (err: unknown) {
          return getStatusFromError(err) === 401
            ? {
                name: file.name,
                decision: { reason: 'unauthorized' as const },
              }
            : null;
        }
      })
    );

    results.forEach((candidate) => {
      if (candidate) {
        deleteCandidates.push(candidate);
      }
    });
  }

  const { deletedNames, failedNames } = await autoDeleteAuthFiles(deleteCandidates, t, showNotification);

  return {
    scannedCount: detectableFiles.length,
    skippedCount: Math.max(0, uniqueFiles.length - detectableFiles.length),
    deletedNames,
    failedDeleteNames: failedNames,
  };
}
