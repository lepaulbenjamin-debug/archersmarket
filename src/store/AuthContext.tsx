import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import * as authService from '@/services/auth';
import type { Credentials, SignUpInput } from '@/services/auth';
import { init } from '@/services/db';
import type { User } from '@/types';

interface AuthValue {
  user: User | null;
  users: User[];
  loading: boolean;
  signIn: (credentials: Credentials) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (patch: Partial<User>) => Promise<void>;
  userById: (id: string) => User | undefined;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshUsers = useCallback(async () => {
    setUsers(await authService.getUsers());
  }, []);

  useEffect(() => {
    (async () => {
      await init();
      const [restored] = await Promise.all([authService.restoreSession(), refreshUsers()]);
      setUser(restored);
      setLoading(false);
    })();
  }, [refreshUsers]);

  const signIn = useCallback(
    async (credentials: Credentials) => {
      setUser(await authService.signIn(credentials));
      await refreshUsers();
    },
    [refreshUsers],
  );

  const signUp = useCallback(
    async (input: SignUpInput) => {
      setUser(await authService.signUp(input));
      await refreshUsers();
    },
    [refreshUsers],
  );

  const signOut = useCallback(async () => {
    await authService.signOut();
    setUser(null);
  }, []);

  const updateProfile = useCallback(
    async (patch: Partial<User>) => {
      if (!user) return;
      setUser(await authService.updateProfile(user.id, patch));
      await refreshUsers();
    },
    [refreshUsers, user],
  );

  const userById = useCallback((id: string) => users.find((u) => u.id === id), [users]);

  const value = useMemo<AuthValue>(
    () => ({ user, users, loading, signIn, signUp, signOut, updateProfile, userById }),
    [loading, signIn, signOut, signUp, updateProfile, user, userById, users],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans AuthProvider.');
  return ctx;
}
