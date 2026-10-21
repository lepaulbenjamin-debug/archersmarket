import React from 'react';

import { colors } from '@/theme';
import { SITE_LARGE } from '@/utils/site';

/**
 * Le pied de page du site.
 *
 * Il existe d'abord parce que la loi l'exige : un site marchand français doit
 * rendre ses mentions légales accessibles (LCEN, article 6). Dans
 * l'application, elles sont dans l'écran Compte ; sur le site, on y arrive
 * depuis n'importe quelle grille d'annonces.
 *
 * Les guides y figurent aussi, pour le lecteur et pour les moteurs : ce sont
 * ces pages qui répondent aux questions qu'on pose avant d'acheter, et un lien
 * depuis l'accueil leur donne du poids.
 *
 * De vraies balises <a> plutôt que des composants de navigation : ces pages
 * sont des fichiers HTML servis à côté de l'application, hors de son routeur.
 * Un lien du routeur chercherait un écran qui n'existe pas.
 */

const GUIDES: Array<[string, string]> = [
  ['Matériel d’occasion', '/materiel-occasion.html'],
  ['Arc classique d’occasion', '/arc-classique-occasion.html'],
  ['Arc à poulies d’occasion', '/arc-a-poulies-occasion.html'],
  ['Flèches d’occasion', '/fleches-occasion.html'],
  ['Combien ça vaut', '/prix-materiel-occasion.html'],
  ['Vendre son matériel', '/vendre-son-materiel.html'],
  ['Expédier un arc', '/expedier-un-arc.html'],
];

const SITE: Array<[string, string]> = [
  ['À propos', '/a-propos.html'],
  ['Installer l’application', '/installer.html'],
  ['Aide et contact', '/support.html'],
  ['Conditions d’utilisation', '/cgu.html'],
  ['Confidentialité', '/confidentialite.html'],
  ['Mentions légales', '/mentions-legales.html'],
  ['Supprimer son compte', '/suppression-compte.html'],
];

const styles: Record<string, React.CSSProperties> = {
  pied: {
    marginTop: 40,
    borderTop: `1px solid ${colors.border}`,
    background: colors.surfaceAlt,
    padding: '32px 16px 40px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  interieur: {
    maxWidth: SITE_LARGE,
    margin: '0 auto',
    display: 'flex',
    flexWrap: 'wrap',
    gap: 40,
  },
  colonne: { minWidth: 220, flex: '1 1 220px' },
  titre: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: colors.textFaint,
    margin: '0 0 12px',
  },
  liste: { listStyle: 'none', margin: 0, padding: 0 },
  element: { margin: '0 0 8px' },
  lien: { color: colors.textMuted, textDecoration: 'none', fontSize: 14 },
  marque: { fontSize: 14, color: colors.textMuted, lineHeight: 1.6, margin: 0 },
};

function Colonne({ titre, liens }: { titre: string; liens: Array<[string, string]> }) {
  return (
    <nav style={styles.colonne} aria-label={titre}>
      <p style={styles.titre}>{titre}</p>
      <ul style={styles.liste}>
        {liens.map(([label, href]) => (
          <li key={href} style={styles.element}>
            <a href={href} style={styles.lien}>
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function SiteFooter() {
  return (
    <footer style={styles.pied}>
      <div style={styles.interieur}>
        <div style={styles.colonne}>
          <p style={styles.titre}>Archers Market</p>
          <p style={styles.marque}>
            Le marché d’occasion entre archers. Publier est gratuit, et le vendeur touche son
            prix entier.
            <br />
            <a href="mailto:contact@archersmarket.fr" style={styles.lien}>
              contact@archersmarket.fr
            </a>
          </p>
        </div>
        <Colonne titre="Guides" liens={GUIDES} />
        <Colonne titre="Le site" liens={SITE} />
      </div>
    </footer>
  );
}
