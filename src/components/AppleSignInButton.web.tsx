import type { StyleProp, ViewStyle } from 'react-native';

/**
 * Pas de bouton Apple sur le site.
 *
 * La connexion Apple sur le web passe par un « Services ID » à déclarer chez
 * Apple, distinct de l'identifiant de l'application. Tant qu'il n'existe pas,
 * proposer le bouton mènerait à une erreur. `appleSignInAvailable` répond de
 * toute façon non sur le web : ce composant ne devrait jamais être rendu.
 */
export function AppleSignInButton(_props: { onPress: () => void; style?: StyleProp<ViewStyle> }) {
  return null;
}
