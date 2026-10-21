import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '@/services/supabase';

/** Motif d'indisponibilité, à afficher tel quel à l'utilisateur. */
import type { NotificationTarget, PushRegistration } from '@/services/pushShared';

export { unavailableMessage } from '@/services/pushShared';
export type { NotificationTarget, PushRegistration, PushUnavailable } from '@/services/pushShared';

// Notification reçue application ouverte : bandeau + son, sans badge.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const projectId = () =>
  Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

/**
 * Demande l'autorisation, récupère le jeton Expo de l'appareil et l'associe au
 * compte. Retourne le motif quand ce n'est pas possible, pour l'expliquer.
 */
export async function registerForPush(userId: string): Promise<PushRegistration> {
  if (!Device.isDevice) return { reason: 'simulator' };

  // Depuis le SDK 53, Expo Go ne reçoit plus les notifications distantes.
  if (Constants.appOwnership === 'expo') return { reason: 'expo-go' };

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Notifications',
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: '#F5843C',
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== 'granted') return { reason: 'denied' };

  const id = projectId();
  if (!id) return { reason: 'no-project-id' };

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    await supabase
      .from('push_tokens')
      .upsert({ token, user_id: userId, platform: Platform.OS, updated_at: new Date().toISOString() });
    return { token };
  } catch {
    return { reason: 'error' };
  }
}

/** Coupe les notifications sur cet appareil. */
export async function unregisterPush(userId: string): Promise<void> {
  const id = projectId();
  if (!id) return;
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    await supabase.from('push_tokens').delete().eq('token', token).eq('user_id', userId);
  } catch {
    // Jeton indisponible : rien à retirer.
  }
}

export async function hasRegisteredDevice(userId: string): Promise<boolean> {
  const { data } = await supabase.from('push_tokens').select('token').eq('user_id', userId).limit(1);
  return (data ?? []).length > 0;
}

/**
 * Toucher une notification ouvre ce qu'elle annonce. L'écouteur vit ici plutôt
 * que dans le contexte, pour que celui-ci reste commun au web — qui n'a pas de
 * notifications, donc rien à écouter.
 */
export function onNotificationOpened(handler: (target: NotificationTarget) => void): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    handler(response.notification.request.content.data as NotificationTarget);
  });
  return () => subscription.remove();
}
