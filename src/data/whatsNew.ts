/**
 * Ce qui a changé, annoncé une fois.
 *
 * Le numéro n'est pas celui de l'application : une mise à jour à distance ne
 * change pas la version publiée, et c'est précisément là que se glissent la
 * plupart des changements. On l'incrémente donc à la main, et seulement quand
 * il y a vraiment quelque chose à dire — un encart qui s'ouvre pour trois
 * corrections d'affichage ne sera bientôt plus lu.
 */
export interface Nouveautes {
  version: number;
  titre: string;
  points: Array<{ icon: string; texte: string }>;
}

export const NOUVEAUTES: Nouveautes = {
  version: 3,
  titre: 'Dites ce que vous cherchez',
  points: [
    {
      icon: 'bullhorn-outline',
      texte:
        'Un marché d’occasion se bloque toujours du même côté : vous cherchez une poignée 25 pouces depuis six mois, et quelqu’un en a une au fond d’un placard sans le savoir. Publiez votre recherche, elle apparaît dans l’onglet Rechercher.',
    },
    {
      icon: 'bell-ring-outline',
      texte:
        'Et l’inverse : choisissez les catégories que vous vendez, et vous serez prévenu quand un archer cherche quelque chose qui vous ressemble.',
    },
  ],
};
