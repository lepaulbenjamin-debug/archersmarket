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

// ---------------------------------------------------------------------------
// Les nouveautés
//
// Un encart, pas un second accueil : après une mise à jour, on veut savoir ce
// qui a bougé, pas relire à quoi sert l'application.
//
// Le numéro suivi ici est celui des nouveautés, pas celui de l'application :
// une mise à jour à distance ne change pas la version publiée, et c'est
// pourtant là que passe l'essentiel des changements.
// ---------------------------------------------------------------------------

const CLE_NOUVEAUTES = 'archersmarket.news';

/** Le dernier numéro vu sur cet appareil, 0 s'il n'en a vu aucun. */
export async function lastSeenNews(): Promise<number> {
  try {
    return Number((await AsyncStorage.getItem(CLE_NOUVEAUTES)) ?? 0) || 0;
  } catch {
    return 0;
  }
}

export async function markNewsSeen(version: number): Promise<void> {
  try {
    await AsyncStorage.setItem(CLE_NOUVEAUTES, String(version));
  } catch {
    // Sans conséquence : l'encart se represente une fois.
  }
}
