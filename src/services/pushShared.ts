/**
 * Ce qui est commun aux notifications sur toutes les plateformes : les motifs
 * d'indisponibilité et leur libellé. Le reste — le jeton, les autorisations —
 * dépend du système, et vit dans `push.ts` et `push.web.ts`.
 */

export type PushUnavailable =
  | 'simulator'
  | 'denied'
  | 'expo-go'
  | 'no-project-id'
  | 'web'
  | 'error';

export interface PushRegistration {
  token?: string;
  reason?: PushUnavailable;
}

/** Ce que porte une notification, pour ouvrir l'écran qu'elle annonce. */
export interface NotificationTarget {
  type?: string;
  conversationId?: string;
  profileId?: string;
  listingId?: string;
}

export const unavailableMessage: Record<PushUnavailable, string> = {
  simulator: 'Les notifications ne fonctionnent que sur un téléphone, pas sur un simulateur.',
  denied:
    'Notifications refusées. Autorisez-les dans les réglages de votre téléphone pour être prévenu des messages.',
  'expo-go': 'Les notifications nécessitent l’application installée, pas Expo Go.',
  'no-project-id':
    'Configuration incomplète : cette version de l’application n’est pas reliée à un projet EAS.',
  web: 'Sur le site, pas de notifications : installez l’application sur votre téléphone pour être prévenu des messages et des recherches.',
  error: 'Impossible d’activer les notifications pour l’instant.',
};
