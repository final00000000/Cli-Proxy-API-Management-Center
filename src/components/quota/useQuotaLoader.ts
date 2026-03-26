/**
 * Generic hook for quota data fetching and management.
 */

import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { triggerHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { useNotificationStore } from '@/stores';
import type { AuthFileItem } from '@/types';
import { useQuotaStore } from '@/stores';
import {
  autoDeleteAuthFiles,
  getStatusFromError,
  resolveQuotaAutoDeleteDecision
} from '@/utils/quota';
import type { QuotaConfig } from './quotaConfigs';

type QuotaScope = 'page' | 'all';

type QuotaUpdater<T> = T | ((prev: T) => T);

type QuotaSetter<T> = (updater: QuotaUpdater<T>) => void;

interface LoadQuotaResult<TData> {
  name: string;
  status: 'success' | 'error';
  data?: TData;
  error?: string;
  errorStatus?: number;
}

export function useQuotaLoader<TState, TData>(config: QuotaConfig<TState, TData>) {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const quota = useQuotaStore(config.storeSelector);
  const setQuota = useQuotaStore((state) => state[config.storeSetter]) as QuotaSetter<
    Record<string, TState>
  >;

  const loadingRef = useRef(false);
  const requestIdRef = useRef(0);

  const loadQuota = useCallback(
    async (
      targets: AuthFileItem[],
      scope: QuotaScope,
      setLoading: (loading: boolean, scope?: QuotaScope | null) => void
    ) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      const requestId = ++requestIdRef.current;
      setLoading(true, scope);

      try {
        if (targets.length === 0) return;

        setQuota((prev) => {
          const nextState = { ...prev };
          targets.forEach((file) => {
            nextState[file.name] = config.buildLoadingState();
          });
          return nextState;
        });

        const results = await Promise.all(
          targets.map(async (file): Promise<LoadQuotaResult<TData>> => {
            try {
              const data = await config.fetchQuota(file, t);
              return { name: file.name, status: 'success', data };
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : t('common.unknown_error');
              const errorStatus = getStatusFromError(err);
              return { name: file.name, status: 'error', error: message, errorStatus };
            }
          })
        );

        if (requestId !== requestIdRef.current) return;

        const autoDeleteCandidates = results
          .map((result) => {
            const decision =
              result.status === 'success'
                ? resolveQuotaAutoDeleteDecision(config.type, {
                    status: 'success',
                    data: result.data
                  })
                : resolveQuotaAutoDeleteDecision(config.type, {
                    status: 'error',
                    errorStatus: result.errorStatus
                  });

            return decision ? { name: result.name, decision } : null;
          })
          .filter(
            (
              candidate
            ): candidate is {
              name: string;
              decision: NonNullable<ReturnType<typeof resolveQuotaAutoDeleteDecision>>;
            } => candidate !== null
          );

        const { deletedNames } = await autoDeleteAuthFiles(
          autoDeleteCandidates,
          t,
          showNotification
        );
        const deletedSet = new Set(deletedNames);

        setQuota((prev) => {
          const nextState = { ...prev };
          results.forEach((result) => {
            if (deletedSet.has(result.name)) {
              delete nextState[result.name];
              return;
            }

            if (result.status === 'success') {
              nextState[result.name] = config.buildSuccessState(result.data as TData);
            } else {
              nextState[result.name] = config.buildErrorState(
                result.error || t('common.unknown_error'),
                result.errorStatus
              );
            }
          });
          return nextState;
        });

        if (deletedSet.size > 0) {
          try {
            await triggerHeaderRefresh();
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : '';
            showNotification(
              `${t('notification.refresh_failed')}${message ? `: ${message}` : ''}`,
              'error'
            );
          }
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
          loadingRef.current = false;
        }
      }
    },
    [config, setQuota, showNotification, t]
  );

  return { quota, loadQuota };
}
