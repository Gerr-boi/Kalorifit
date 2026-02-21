import { useEffect, useMemo } from 'react';
import {
  ACTIVE_USER_ID_STORAGE_KEY,
  DEFAULT_USER_ID,
  emitUserScopeChanged,
  useLocalStorageState,
} from './useLocalStorageState';

export type AppUser = {
  id: string;
  name: string;
  createdAt: number;
};

const USERS_STORAGE_KEY = 'app.users.v1';
const EMPTY_USERS: AppUser[] = [];

function createUserId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `user-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function createDefaultUser(): AppUser {
  return {
    id: DEFAULT_USER_ID,
    name: 'Member',
    createdAt: Date.now(),
  };
}

export function useCurrentUser() {
  const [users, setUsers] = useLocalStorageState<AppUser[]>(USERS_STORAGE_KEY, EMPTY_USERS, { scope: 'global' });
  const [activeUserId, setActiveUserIdRaw] = useLocalStorageState<string>(
    ACTIVE_USER_ID_STORAGE_KEY,
    DEFAULT_USER_ID,
    { scope: 'global' },
  );

  useEffect(() => {
    if (users.length > 0) return;
    const nextDefault = createDefaultUser();
    setUsers([nextDefault]);
    setActiveUserIdRaw(nextDefault.id);
    emitUserScopeChanged();
  }, [setActiveUserIdRaw, setUsers, users.length]);

  useEffect(() => {
    if (!users.length) return;
    if (users.some((user) => user.id === activeUserId)) return;
    setActiveUserIdRaw(users[0].id);
    emitUserScopeChanged();
  }, [activeUserId, setActiveUserIdRaw, users]);

  const currentUser = useMemo(() => {
    if (!users.length) return createDefaultUser();
    return users.find((user) => user.id === activeUserId) ?? users[0];
  }, [activeUserId, users]);

  function setActiveUserId(nextUserId: string) {
    if (!nextUserId) return;
    setActiveUserIdRaw(nextUserId);
    emitUserScopeChanged();
  }

  function createUser(name: string) {
    const cleanName = name.trim();
    const nextName = cleanName || `Member ${users.length + 1}`;
    const nextUser: AppUser = {
      id: createUserId(),
      name: nextName,
      createdAt: Date.now(),
    };
    setUsers((prev) => [...prev, nextUser]);
    setActiveUserIdRaw(nextUser.id);
    emitUserScopeChanged();
    return nextUser;
  }

  function updateUserName(userId: string, name: string) {
    const clean = name.trim();
    if (!clean) return;
    setUsers((prev) => prev.map((user) => (user.id === userId ? { ...user, name: clean } : user)));
  }

  return {
    users,
    activeUserId: currentUser.id,
    currentUser,
    setActiveUserId,
    createUser,
    updateUserName,
  };
}
