export const AUTH_FILES_SORT_MODES = ['default', 'az', 'priority'] as const;

export type AuthFilesSortMode = (typeof AUTH_FILES_SORT_MODES)[number];

export type AuthFilesUiState = {
  filter?: string;
  problemOnly?: boolean;
  compactMode?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
  regularPageSize?: number;
  compactPageSize?: number;
  sortMode?: AuthFilesSortMode;
};

const AUTH_FILES_UI_STATE_KEY = 'authFilesPage.uiState';
const AUTH_FILES_SORT_MODE_SET = new Set<AuthFilesSortMode>(AUTH_FILES_SORT_MODES);

const readStateFromStorage = (storage: Storage | undefined): AuthFilesUiState | null => {
  if (!storage) return null;
  const raw = storage.getItem(AUTH_FILES_UI_STATE_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw) as AuthFilesUiState;
  return parsed && typeof parsed === 'object' ? parsed : null;
};

export const isAuthFilesSortMode = (value: unknown): value is AuthFilesSortMode =>
  typeof value === 'string' && AUTH_FILES_SORT_MODE_SET.has(value as AuthFilesSortMode);

export const readAuthFilesUiState = (): AuthFilesUiState | null => {
  if (typeof window === 'undefined') return null;
  try {
    const persisted = readStateFromStorage(window.localStorage) ?? readStateFromStorage(window.sessionStorage);
    if (persisted && !window.localStorage.getItem(AUTH_FILES_UI_STATE_KEY)) {
      window.localStorage.setItem(AUTH_FILES_UI_STATE_KEY, JSON.stringify(persisted));
      window.sessionStorage.removeItem(AUTH_FILES_UI_STATE_KEY);
    }
    return persisted;
  } catch {
    return null;
  }
};

export const writeAuthFilesUiState = (state: AuthFilesUiState) => {
  if (typeof window === 'undefined') return;
  try {
    const serialized = JSON.stringify(state);
    window.localStorage.setItem(AUTH_FILES_UI_STATE_KEY, serialized);
    window.sessionStorage.removeItem(AUTH_FILES_UI_STATE_KEY);
  } catch {
    // ignore
  }
};
