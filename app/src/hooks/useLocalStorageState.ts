import { useEffect, useState } from 'react';

export type LocalStorageScope = 'user' | 'global';

export const DEFAULT_USER_ID = 'default';
export const ACTIVE_USER_ID_STORAGE_KEY = 'app.activeUserId.v1';
export const USER_SCOPE_CHANGED_EVENT = 'kalorifit:user-changed';
export const LOCAL_STORAGE_STATE_CHANGED_EVENT = 'kalorifit:local-storage-state-changed';

type LocalStorageStateOptions = {
  scope?: LocalStorageScope;
  userId?: string;
};

type LocalStorageStateChangedDetail = {
  baseKey: string;
  scope: LocalStorageScope;
  scopedKey: string;
};

function canUseLocalStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function getActiveUserIdFromStorage() {
  if (!canUseLocalStorage()) return DEFAULT_USER_ID;
  return window.localStorage.getItem(ACTIVE_USER_ID_STORAGE_KEY) || DEFAULT_USER_ID;
}

export function getScopedStorageKey(baseKey: string, scope: LocalStorageScope = 'user', userId?: string) {
  if (scope === 'global') return baseKey;
  const resolvedUserId = userId || getActiveUserIdFromStorage();
  return `u:${resolvedUserId}:${baseKey}`;
}

export function emitUserScopeChanged() {
  if (!canUseLocalStorage()) return;
  window.dispatchEvent(new Event(USER_SCOPE_CHANGED_EVENT));
}

export function emitLocalStorageStateChanged(baseKey: string, options?: LocalStorageStateOptions) {
  if (!canUseLocalStorage()) return;
  const scope = options?.scope ?? 'user';
  const scopedKey = getScopedStorageKey(baseKey, scope, options?.userId);
  window.dispatchEvent(
    new CustomEvent<LocalStorageStateChangedDetail>(LOCAL_STORAGE_STATE_CHANGED_EVENT, {
      detail: {
        baseKey,
        scope,
        scopedKey,
      },
    }),
  );
}

function parseStoredValue<T>(raw: string | null, initial: T) {
  if (!raw) return initial;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return initial;
  }
}

function readStoredValue<T>(baseKey: string, initial: T, options?: LocalStorageStateOptions) {
  if (!canUseLocalStorage()) return initial;
  const scope = options?.scope ?? 'user';
  const scopedKey = getScopedStorageKey(baseKey, scope, options?.userId);
  const scopedRaw = window.localStorage.getItem(scopedKey);
  if (scopedRaw !== null) return parseStoredValue(scopedRaw, initial);

  if (scope === 'user') {
    // Backward compatibility for pre-user-scoped keys.
    const legacyRaw = window.localStorage.getItem(baseKey);
    if (legacyRaw !== null) return parseStoredValue(legacyRaw, initial);
  }

  return initial;
}

export function useLocalStorageState<T>(key: string, initial: T, options?: LocalStorageStateOptions) {
  const scope = options?.scope ?? 'user';
  const explicitUserId = options?.userId;

  const [storageKey, setStorageKey] = useState<string>(() => getScopedStorageKey(key, scope, explicitUserId));
  const [value, setValue] = useState<T>(() => readStoredValue(key, initial, options));
  const [isReadyForWrite, setIsReadyForWrite] = useState(false);

  useEffect(() => {
    setStorageKey(getScopedStorageKey(key, scope, explicitUserId));
  }, [explicitUserId, key, scope]);

  useEffect(() => {
    setIsReadyForWrite(false);
  }, [storageKey]);

  useEffect(() => {
    setValue(readStoredValue(key, initial, options));
    setIsReadyForWrite(true);
  }, [explicitUserId, initial, key, scope, storageKey]);

  useEffect(() => {
    if (!canUseLocalStorage() || !isReadyForWrite) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // ignore write errors (private mode, quota, etc.)
    }
  }, [isReadyForWrite, storageKey, value]);

  useEffect(() => {
    if (!canUseLocalStorage() || scope === 'global') return;
    const onUserScopeChange = () => {
      setStorageKey(getScopedStorageKey(key, scope, explicitUserId));
    };
    const onLocalStorageStateChanged = (event: Event) => {
      const customEvent = event as CustomEvent<LocalStorageStateChangedDetail>;
      const detail = customEvent.detail;
      if (!detail) return;
      if (detail.baseKey !== key) return;
      if (detail.scope !== scope) return;
      if (detail.scopedKey !== storageKey) return;
      setValue(readStoredValue(key, initial, { scope, userId: explicitUserId }));
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === ACTIVE_USER_ID_STORAGE_KEY) {
        setStorageKey(getScopedStorageKey(key, scope, explicitUserId));
      }
    };

    window.addEventListener(USER_SCOPE_CHANGED_EVENT, onUserScopeChange);
    window.addEventListener(LOCAL_STORAGE_STATE_CHANGED_EVENT, onLocalStorageStateChanged);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(USER_SCOPE_CHANGED_EVENT, onUserScopeChange);
      window.removeEventListener(LOCAL_STORAGE_STATE_CHANGED_EVENT, onLocalStorageStateChanged);
      window.removeEventListener('storage', onStorage);
    };
  }, [explicitUserId, initial, key, scope, storageKey]);

  return [value, setValue] as const;
}
