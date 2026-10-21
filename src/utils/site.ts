import { Platform, useWindowDimensions } from 'react-native';

/**
 * La mise en page du site.
 *
 * L'application est dessinée pour un téléphone. Dans un navigateur d'ordinateur,
 * les mêmes écrans s'étireraient sur toute la largeur : deux cartes d'annonce
 * de 600 px, des formulaires d'un bout à l'autre de l'écran. Ces trois valeurs
 * suffisent à les ramener à des proportions lisibles.
 *
 * Rien de tout cela ne s'applique sur téléphone ni sur tablette : l'app native
 * garde exactement sa mise en page.
 */

/** Pages de lecture et formulaires : une fiche, un compte, une conversation. */
export const SITE_PAGE = 760;

/** Grilles : le fil d'annonces, les favoris. */
export const SITE_LARGE = 1200;

/**
 * En dessous, on est sur un téléphone, même dans un navigateur : la barre
 * d'onglets du bas reste la bonne navigation. Au-dessus, elle passe en haut.
 */
export const SITE_SEUIL_BUREAU = 768;

/** Le site, affiché sur un écran assez large pour une navigation en haut. */
export function useDesktopWeb(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= SITE_SEUIL_BUREAU;
}

/**
 * La largeur réellement disponible pour le contenu d'un écran.
 *
 * Sur le site, c'est la fenêtre bornée par la colonne de l'écran ; ailleurs,
 * la fenêtre entière. À utiliser partout où un écran calcule une taille à
 * partir de la largeur — sinon une photo de fiche ferait 1 920 px de large sur
 * un grand écran, dans une colonne de 760.
 */
export function useContentWidth(colonne: number = SITE_PAGE): number {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' ? Math.min(width, colonne) : width;
}
