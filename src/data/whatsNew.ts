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
  version: 1,
  titre: 'Acheter et vendre vient de changer',
  points: [
    {
      icon: 'handshake-outline',
      texte:
        'Remise en main propre à 0,99 €, avec un code que vous ne donnez qu’après avoir essayé l’arc. Le vendeur n’a plus besoin d’être vérifié.',
    },
    {
      icon: 'truck-outline',
      texte:
        'Les transporteurs sont rangés entre point relais et domicile, avec la date de livraison et une carte des points relais.',
    },
    {
      icon: 'bell-ring-outline',
      texte:
        'Enregistrez une recherche et soyez prévenu dès qu’une annonce y correspond.',
    },
    {
      icon: 'map-marker-outline',
      texte:
        'Les adresses se complètent toutes seules, et la vôtre est reprise de votre compte.',
    },
  ],
};
