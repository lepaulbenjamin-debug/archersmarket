import React from 'react';

import rubriques from '@/data/rubriques.json';
import { colors } from '@/theme';
import type { CategoryId } from '@/types';

/**
 * L'en-tête du fil d'annonces, sur le site : un titre et, sur une page de
 * catégorie, le texte qui l'accompagne.
 *
 * Il existe pour les moteurs de recherche, qui exécutent la page et indexent
 * ce qu'elle affiche. Le résumé pré-rendu par `scripts/site/construire.mjs`
 * porte déjà ce titre et ce texte, mais l'application le remplace en
 * démarrant : sans cet en-tête, le moteur verrait une grille sans titre ni
 * texte — exactement la page « mince » qu'on veut éviter. Les deux lisent le
 * même fichier, `src/data/rubriques.json`, et disent donc la même chose.
 *
 * De vraies balises — <h1>, <p>, <a> — plutôt que des composants : c'est la
 * structure qu'un moteur lit, et le lien vers le guide mène à une page HTML
 * servie hors du routeur de l'application.
 */

type Rubrique = { titre: string; intro: string; guide: { href: string; label: string } };
const RUBRIQUES = rubriques as unknown as Record<CategoryId, Rubrique>;

const styles: Record<string, React.CSSProperties> = {
  entete: {
    // La grille ajoute déjà sa marge latérale : l'en-tête s'aligne sur les cartes.
    padding: '4px 0 12px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  titre: { fontSize: 22, fontWeight: 800, color: colors.text, margin: '0 0 6px', letterSpacing: '-0.01em' },
  texte: { fontSize: 14.5, lineHeight: 1.55, color: colors.textMuted, margin: '0 0 6px', maxWidth: 820 },
  lien: { fontSize: 14, color: colors.primaryDark, textDecoration: 'none', fontWeight: 600 },
};

export function FeedIntro({ category }: { category?: CategoryId }) {
  const rubrique = category ? RUBRIQUES[category] : undefined;

  if (!rubrique) {
    return (
      <header style={styles.entete}>
        <h1 style={{ ...styles.titre, fontSize: 18 }}>Matériel de tir à l’arc d’occasion, entre archers</h1>
      </header>
    );
  }

  return (
    <header style={styles.entete}>
      <h1 style={styles.titre}>{rubrique.titre}</h1>
      <p style={styles.texte}>{rubrique.intro}</p>
      <a href={rubrique.guide.href} style={styles.lien}>
        À lire avant d’acheter : {rubrique.guide.label} →
      </a>
    </header>
  );
}
