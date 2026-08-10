import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * L'écran d'accueil ne se montre qu'une fois.
 *
 * Le drapeau est local à l'appareil, pas au compte : quelqu'un qui réinstalle
 * l'application a de bonnes chances d'avoir oublié ce qu'elle propose, et
 * quelqu'un qui se déconnecte n'a pas besoin de le relire.
 */
const CLE = 'archersmarket.onboarding.v1';

export async function hasSeenOnboarding(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(CLE)) === 'vu';
  } catch {
    // Stockage indisponible : on préfère montrer l'accueil une fois de trop
    // que bloquer quelqu'un derrière une erreur de lecture.
    return false;
  }
}

export async function markOnboardingSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(CLE, 'vu');
  } catch {
    // Tant pis : il se remontrera au prochain lancement.
  }
}
