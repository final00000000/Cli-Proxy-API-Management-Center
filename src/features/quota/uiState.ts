export type QuotaPageUiState = {
  pageSize?: number;
  search?: string;
  autoRefreshEnabled?: boolean;
  autoRefreshIntervalMinutes?: number;
};

const QUOTA_PAGE_UI_STATE_KEY = 'quotaPage.uiState';

const readStateFromStorage = (storage: Storage | undefined): QuotaPageUiState | null => {
  if (!storage) return null;
  const raw = storage.getItem(QUOTA_PAGE_UI_STATE_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw) as QuotaPageUiState;
  return parsed && typeof parsed === 'object' ? parsed : null;
};

export const readQuotaPageUiState = (): QuotaPageUiState | null => {
  if (typeof window === 'undefined') return null;
  try {
    const persisted = readStateFromStorage(window.localStorage) ?? readStateFromStorage(window.sessionStorage);
    if (persisted && !window.localStorage.getItem(QUOTA_PAGE_UI_STATE_KEY)) {
      window.localStorage.setItem(QUOTA_PAGE_UI_STATE_KEY, JSON.stringify(persisted));
      window.sessionStorage.removeItem(QUOTA_PAGE_UI_STATE_KEY);
    }
    return persisted;
  } catch {
    return null;
  }
};

export const writeQuotaPageUiState = (state: QuotaPageUiState) => {
  if (typeof window === 'undefined') return;
  try {
    const serialized = JSON.stringify(state);
    window.localStorage.setItem(QUOTA_PAGE_UI_STATE_KEY, serialized);
    window.sessionStorage.removeItem(QUOTA_PAGE_UI_STATE_KEY);
  } catch {
    // ignore
  }
};
