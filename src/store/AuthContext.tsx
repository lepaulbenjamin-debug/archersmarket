import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import * as authService from '@/services/auth';
import type { Credentials, SignUpInput } from '@/services/auth';
import { supabase } from '@/services/supabase';
import type { User } from '@/types';

interface AuthValue {
  user: User | null;
  users: User[];
  loading: boolean;
  signIn: (credentials: Credentials) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string, token: string, password: string) => Promise<void>;
  deleteAccount: () => Promise<void>;
  updateProfile: (patch: Partial<User>) => Promise<void>;
  /** Relit le profil connecté : sa capacité à encaisser peut changer côté Stripe. */
  refreshUser: () => Promise<User | null>;
  userById: (id: string) => User | undefined;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshUsers = useCallback(async () => {
    try {
      setUsers(await authService.getUsers());
    } catch {
      // L'annuaire des profils n'est qu'un cache d'affichage : son échec ne
      // doit pas empêcher l'utilisation de l'app.
    }
  }, []);

  useEffect(() => {
    (async () => {
      const restored = await authService.restoreSession().catch(() => null);
      setUser(restored);
      setLoading(false);
      refreshUsers();
    })();

    // Déconnexion depuis un autre onglet, jeton expiré, etc.
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') setUser(null);
    });
    return () => data.subscription.unsubscribe();
  }, [refreshUsers]);

  const signIn = useCallback(
    async (credentials: Credentials) => {
      setUser(await authService.signIn(credentials));
      refreshUsers();
    },
    [refreshUsers],
  );

  const signUp = useCallback(
    async (input: SignUpInput) => {
      setUser(await authService.signUp(input));
      refreshUsers();
    },
    [refreshUsers],
  );

  /** Fin de la réinitialisation : le nouveau mot de passe ouvre la session. */
  const resetPassword = useCallback(
    async (email: string, token: string, password: string) => {
      setUser(await authService.confirmPasswordReset(email, token, password));
      refreshUsers();
    },
    [refreshUsers],
  );

  const refreshUser = useCallback(async () => {
    const restored = await authService.restoreSession().catch(() => null);
    if (restored) setUser(restored);
    return restored;
  }, []);

  const signOut = useCallback(async () => {
    await authService.signOut();
    setUser(null);
  }, []);

  const deleteAccount = useCallback(async () => {
    if (!user) return;
    await authService.deleteAccount(user.id);
    setUser(null);
    refreshUsers();
  }, [refreshUsers, user]);

  const updateProfile = useCallback(
    async (patch: Partial<User>) => {
      if (!user) return;
      setUser(await authService.updateProfile(user.id, { ...patch, email: user.email }));
      refreshUsers();
    },
    [refreshUsers, user],
  );

  const userById = useCallback(
    (id: string) => (user?.id === id ? user : users.find((u) => u.id === id)),
    [user, users],
  );

  const value = useMemo<AuthValue>(
    () => ({
      user, users, loading, signIn, signUp, signOut, resetPassword,
      deleteAccount, updateProfile, refreshUser, userById,
    }),
    [deleteAccount, loading, refreshUser, resetPassword, signIn, signOut, signUp, updateProfile, user, userById, users],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans AuthProvider.');
  return ctx;
}
