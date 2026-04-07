import { useEffect, useRef, useState } from 'react';

export type LocalStorageScope = 'user' | 'global';

export const DEFAULT_USER_ID = 'default';
export const ACTIVE_USER_ID_STORAGE_KEY = 'app.activeUserId.v1';
export const USER_SCOPE_CHANGED_EVENT = 'kalorifit:user-changed';
export const LOCAL_STORAGE_STATE_CHANGED_EVENT = 'kalorifit:local-storage-state-changed';

let localStorageStateChangeSequence = 0;

type LocalStorageStateOptions = {
  scope?: LocalStorageScope;
  userId?: string;
};

type UserScopeChangedDetail = {
  userId?: string;
};

type LocalStorageStateChangedDetail = {
  key: string;
  scope: LocalStorageScope;
  userId?: string;
  sourceId?: string;
  sequence: number;
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

export function emitUserScopeChanged(userId?: string) {
  if (!canUseLocalStorage()) return;
  window.dispatchEvent(new CustomEvent<UserScopeChangedDetail>(USER_SCOPE_CHANGED_EVENT, { detail: { userId } }));
}

export function emitLocalStorageStateChanged(
  key: string,
  options?: { scope?: LocalStorageScope; userId?: string; sourceId?: string }
) {
  if (!canUseLocalStorage()) return;
  const detail = {
    key,
    scope: options?.scope ?? 'user',
    userId: options?.userId ?? getActiveUserIdFromStorage(),
    sourceId: options?.sourceId,
    sequence: ++localStorageStateChangeSequence,
  };
  window.dispatchEvent(new CustomEvent<LocalStorageStateChangedDetail>(LOCAL_STORAGE_STATE_CHANGED_EVENT, { detail }));
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

function getUserIdFromStorageKey(storageKey: string, baseKey: string) {
  const prefix = 'u:';
  const suffix = `:${baseKey}`;
  if (!storageKey.startsWith(prefix) || !storageKey.endsWith(suffix)) return undefined;
  return storageKey.slice(prefix.length, storageKey.length - suffix.length);
}

export function useLocalStorageState<T>(key: string, initial: T, options?: LocalStorageStateOptions) {
  const scope = options?.scope ?? 'user';
  const explicitUserId = options?.userId;

  const [storageKey, setStorageKey] = useState<string>(() => getScopedStorageKey(key, scope, explicitUserId));
  const [value, setValue] = useState<T>(() => readStoredValue(key, initial, options));
  const [isReadyForWrite, setIsReadyForWrite] = useState(false);
  const instanceIdRef = useRef(`local-storage-state-${++localStorageStateChangeSequence}`);
  const lastNotifiedSequenceRef = useRef(0);

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
    const serializedValue = JSON.stringify(value);
    try {
      if (window.localStorage.getItem(storageKey) === serializedValue) return;
      window.localStorage.setItem(storageKey, serializedValue);
      emitLocalStorageStateChanged(key, {
        scope,
        userId: explicitUserId ?? getUserIdFromStorageKey(storageKey, key),
        sourceId: instanceIdRef.current,
      });
    } catch {
      // ignore write errors (private mode, quota, etc.)
    }
  }, [explicitUserId, isReadyForWrite, key, scope, storageKey, value]);

  useEffect(() => {
    if (!canUseLocalStorage()) return;
    const refreshValue = () => {
      setValue(readStoredValue(key, initial, { scope, userId: explicitUserId }));
    };
    const onUserScopeChange = (event: Event) => {
      if (scope === 'global') return;
      const detail = (event as CustomEvent<UserScopeChangedDetail>).detail;
      setStorageKey(getScopedStorageKey(key, scope, explicitUserId ?? detail?.userId));
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === ACTIVE_USER_ID_STORAGE_KEY && scope !== 'global') {
        setStorageKey(getScopedStorageKey(key, scope, explicitUserId ?? event.newValue ?? undefined));
        return;
      }
      if (event.key === storageKey) refreshValue();
    };
    const onLocalStorageStateChange = (event: Event) => {
      const detail = (event as CustomEvent<LocalStorageStateChangedDetail>).detail;
      if (!detail) return;
      if (detail.sourceId === instanceIdRef.current) return;
      if (detail.sequence <= lastNotifiedSequenceRef.current) return;
      if (detail.key !== key || detail.scope !== scope) return;
      if (scope === 'user' && (detail.userId ?? getActiveUserIdFromStorage()) !== (explicitUserId ?? getActiveUserIdFromStorage())) {
        return;
      }
      lastNotifiedSequenceRef.current = detail.sequence;
      refreshValue();
    };

    window.addEventListener(USER_SCOPE_CHANGED_EVENT, onUserScopeChange);
    window.addEventListener('storage', onStorage);
    window.addEventListener(LOCAL_STORAGE_STATE_CHANGED_EVENT, onLocalStorageStateChange);
    return () => {
      window.removeEventListener(USER_SCOPE_CHANGED_EVENT, onUserScopeChange);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(LOCAL_STORAGE_STATE_CHANGED_EVENT, onLocalStorageStateChange);
    };
  }, [explicitUserId, initial, key, scope, storageKey]);

  return [value, setValue] as const;
}
