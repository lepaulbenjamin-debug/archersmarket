import { Alert, type AlertButton } from 'react-native';

/**
 * Les boîtes de dialogue, sur le site.
 *
 * Dans react-native-web, `Alert.alert` est une fonction vide : elle ne fait
 * rien, et ne le dit pas. L'application l'appelle pourtant partout — pour
 * confirmer une suppression, annoncer une erreur, valider une vente. Sur le
 * site, « Supprimer l'annonce » ne supprimait donc rien, et une publication
 * refusée ne disait pas pourquoi.
 *
 * On la remplace, au démarrage, par les boîtes du navigateur :
 * `window.alert` pour un message, `window.confirm` pour un choix. Aucun écran
 * de l'application ne propose plus de deux issues — une action et
 * « Annuler » —, et c'est précisément ce que sait faire `confirm`. Le libellé
 * de l'action est rappelé dans le texte, puisque le navigateur n'affiche que
 * « OK ».
 *
 * `Alert.prompt` — la saisie libre, qui n'existe que sur iOS — est rendu de
 * la même façon par `window.prompt`.
 */

const texteDe = (titre: string, message?: string) => [titre, message].filter(Boolean).join('\n\n');

function alerte(titre: string, message?: string, boutons?: AlertButton[]): void {
  const liste = boutons ?? [];
  const annuler = liste.find((b) => b.style === 'cancel');
  const actions = liste.filter((b) => b.style !== 'cancel');

  // Un simple message, avec au plus un bouton pour le refermer.
  if (actions.length === 0 || (actions.length === 1 && !annuler)) {
    window.alert(texteDe(titre, message));
    (actions[0] ?? annuler)?.onPress?.();
    return;
  }

  // Un choix. S'il y a plusieurs actions — aucun écran n'en propose
  // aujourd'hui —, on les propose l'une après l'autre plutôt que d'en
  // choisir une à la place de la personne.
  for (const action of actions) {
    const question = actions.length === 1
      ? `${texteDe(titre, message)}\n\n« OK » : ${action.text ?? 'confirmer'}`
      : `${texteDe(titre, message)}\n\n${action.text ?? 'Confirmer'} ?`;
    if (window.confirm(question)) {
      action.onPress?.();
      return;
    }
  }
  annuler?.onPress?.();
}

function saisie(
  titre: string,
  message?: string,
  rappelOuBoutons?: ((texte: string) => void) | AlertButton[],
  _type?: string,
  valeurParDefaut?: string,
): void {
  const reponse = window.prompt(texteDe(titre, message), valeurParDefaut ?? '');
  const boutons = typeof rappelOuBoutons === 'function' ? undefined : rappelOuBoutons;
  if (reponse === null) {
    boutons?.find((b) => b.style === 'cancel')?.onPress?.();
    return;
  }
  if (typeof rappelOuBoutons === 'function') {
    rappelOuBoutons(reponse);
    return;
  }
  // Le bouton d'action reçoit la saisie, comme sur iOS.
  const action = boutons?.find((b) => b.style !== 'cancel') as
    | (AlertButton & { onPress?: (valeur?: string) => void })
    | undefined;
  action?.onPress?.(reponse);
}

let installe = false;

export function installerDialoguesWeb(): void {
  if (installe || typeof window === 'undefined') return;
  installe = true;
  Alert.alert = alerte;
  (Alert as { prompt?: typeof saisie }).prompt = saisie;
}
