import type { NotificationTarget, PushRegistration } from '@/services/pushShared';

export { unavailableMessage } from '@/services/pushShared';
export type { NotificationTarget, PushRegistration, PushUnavailable } from '@/services/pushShared';

/**
 * Le site n'a pas de notifications.
 *
 * Les notifications web exigeraient un service worker et des clés VAPID, pour
 * prévenir un archer qui a de toute façon l'application dans sa poche. Le site
 * le dit franchement plutôt que de proposer un interrupteur qui ne ferait rien.
 */
export async function registerForPush(_userId: string): Promise<PushRegistration> {
  return { reason: 'web' };
}

export async function unregisterPush(_userId: string): Promise<void> {}

/**
 * Toujours faux sur le site, même si le membre a activé les notifications sur
 * son téléphone : la question posée est « cet appareil-ci est-il prévenu ? »,
 * et la réponse honnête est non. Répondre oui afficherait l'interrupteur allumé
 * sur un écran qui ne recevra jamais rien.
 */
export async function hasRegisteredDevice(_userId: string): Promise<boolean> {
  return false;
}

export function onNotificationOpened(_handler: (target: NotificationTarget) => void): () => void {
  return () => {};
}
