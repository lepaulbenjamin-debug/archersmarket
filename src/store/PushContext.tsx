import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import {
  hasRegisteredDevice,
  registerForPush,
  unregisterPush,
  unavailableMessage,
  type PushUnavailable,
} from '@/services/push';
import { useAuth } from '@/store/AuthContext';

interface PushValue {
  enabled: boolean;
  /** Motif lisible quand l'activation n'est pas possible sur cet appareil. */
  unavailable: string | null;
  toggle: (next: boolean) => Promise<void>;
}

const PushContext = createContext<PushValue | null>(null);

export function PushProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();
  const [enabled, setEnabled] = useState(false);
  const [unavailable, setUnavailable] = useState<string | null>(null);

  // À la connexion, on réactive silencieusement si l'appareil était déjà connu.
  useEffect(() => {
    if (!user) {
      setEnabled(false);
      return;
    }
    (async () => {
      const known = await hasRegisteredDevice(user.id).catch(() => false);
      setEnabled(known);
      if (known) await registerForPush(user.id);
    })();
  }, [user]);

  // Toucher une notification ouvre la conversation concernée.
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as {
        type?: string;
        conversationId?: string;
        profileId?: string;
      };
      if (data?.type === 'message' && data.conversationId) {
        router.push(`/chat/${data.conversationId}`);
      } else if (data?.type === 'review' && data.profileId) {
        router.push(`/seller/${data.profileId}`);
      }
    });
    return () => subscription.remove();
  }, [router]);

  const toggle = useCallback(
    async (next: boolean) => {
      if (!user) return;
      if (!next) {
        await unregisterPush(user.id);
        setEnabled(false);
        setUnavailable(null);
        return;
      }
      const { token, reason } = await registerForPush(user.id);
      setEnabled(!!token);
      setUnavailable(token ? null : unavailableMessage[reason as PushUnavailable]);
    },
    [user],
  );

  const value = useMemo<PushValue>(() => ({ enabled, unavailable, toggle }), [
    enabled,
    toggle,
    unavailable,
  ]);

  return <PushContext.Provider value={value}>{children}</PushContext.Provider>;
}

export function usePush(): PushValue {
  const ctx = useContext(PushContext);
  if (!ctx) throw new Error('usePush doit être utilisé dans PushProvider.');
  return ctx;
}
