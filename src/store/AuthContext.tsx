import * as Linking from 'expo-linking';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import * as authService from '@/services/auth';
import type { Credentials, SignUpInput, SignUpResult } from '@/services/auth';
import { supabase } from '@/services/supabase';
import type { User } from '@/types';

interface AuthValue {
  user: User | null;
  users: User[];
  loading: boolean;
  signIn: (credentials: Credentials) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<SignUpResult>;
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

  /**
   * Le retour du lien de confirmation.
   *
   * Le lien reçu par e-mail rouvre l'application par `archersmarket://` en
   * portant les jetons de session. Sans ce relais, il l'ouvre et il ne se
   * passe rien : le compte est bien confirmé côté serveur, mais l'archer
   * retombe sur l'écran de connexion sans comprendre ce qu'on attend de lui.
   *
   * Deux points d'entrée, parce que l'application peut être fermée — le lien
   * la démarre, `getInitialURL` le rend — ou déjà ouverte en arrière-plan, et
   * l'événement `url` la réveille.
   */
  useEffect(() => {
    let vivant = true;

    const ouvrir = async (url: string | null) => {
      if (!url) return;
      const tokens = authService.tokensFromUrl(url);
      if (!tokens) return;
      try {
        const profil = await authService.signInWithTokens(tokens);
        if (!vivant) return;
        setUser(profil);
        refreshUsers();
      } catch {
        // Lien périmé ou déjà consommé : l'écran de connexion reste ouvert,
        // et il n'y a rien d'utile à annoncer par-dessus.
      }
    };

    Linking.getInitialURL().then(ouvrir);
    const abonnement = Linking.addEventListener('url', ({ url }) => ouvrir(url));
    return () => {
      vivant = false;
      abonnement.remove();
    };
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
      const resultat = await authService.signUp(input);
      // Sans confirmation, il n'y a pas encore de session : on ne connecte
      // personne, on laisse l'écran d'inscription conduire vers l'e-mail.
      if (resultat.confirme) {
        setUser(resultat.user);
        refreshUsers();
      }
      return resultat;
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
