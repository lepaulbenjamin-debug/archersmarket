import { useLocalSearchParams } from 'expo-router';
import React from 'react';

import { categoryBySlug } from '@/data/catalog';
import { BrowseScreen } from '@/screens/BrowseScreen';

/**
 * Une catégorie, à sa propre adresse : `/categorie/branches`.
 *
 * Pour l'application, ce n'est que le fil d'annonces avec un filtre posé.
 * Pour le référencement, c'est ce qui donne à « branches d'arc d'occasion »
 * une page à elle dans Google, avec son titre et sa liste d'annonces —
 * générée par `scripts/site/construire.mjs`. Un filtre en paramètre
 * (`/?category=limbs`) ne le permettait pas : il servait la page de l'accueil,
 * avec le titre de l'accueil.
 *
 * Une adresse inconnue retombe sur le fil complet plutôt que sur une erreur.
 */
export default function Categorie() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return <BrowseScreen category={categoryBySlug(slug)?.id} />;
}
