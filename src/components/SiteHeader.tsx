import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Link, usePathname, type Href } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Logo } from '@/components/Logo';
import { colors, radius, spacing } from '@/theme';
import { useAuth } from '@/store/AuthContext';
import { useMessages } from '@/store/MessagesContext';
import { SITE_LARGE, useDesktopWeb } from '@/utils/site';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

/**
 * Un lien du bandeau, avec son état de survol.
 *
 * Le survol passe par un état et non par un style en fonction
 * (`style={({ hovered }) => …}`) : `Link asChild` fusionne les styles de son
 * enfant, et un style donné sous forme de fonction s'y perd — c'est ce qui
 * rendait le bouton « Déposer une annonce » invisible, texte blanc sur fond
 * blanc.
 */
function LienBandeau({
  href,
  style,
  styleSurvol,
  label,
  children,
}: {
  href: Href;
  style: object;
  styleSurvol: object;
  label?: string;
  children: React.ReactNode;
}) {
  const [survol, setSurvol] = useState(false);
  return (
    <Link href={href} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={label}
        onHoverIn={() => setSurvol(true)}
        onHoverOut={() => setSurvol(false)}
        // Un objet, jamais un tableau : `Link asChild` transmet le style tel quel
        // à la balise <a>, et un navigateur refuse un tableau comme style.
        style={StyleSheet.flatten([style, survol && styleSurvol])}
      >
        {children}
      </Pressable>
    </Link>
  );
}

export function SiteHeader() {
  const bureau = useDesktopWeb();
  const { user } = useAuth();
  const { unreadCount } = useMessages();
  const chemin = usePathname();

  if (!bureau) return null;

  return (
    <View style={styles.bandeau}>
      <View style={styles.interieur}>
        <Link href="/" accessibilityLabel="Archers Market, accueil" style={styles.marque}>
          <Logo size={30} wordSize={15} />
        </Link>

        <LienBandeau href="/sell" style={styles.publier} styleSurvol={styles.publierSurvol}>
          <MaterialCommunityIcons name="plus" size={18} color={colors.onPrimary} />
          <Text style={styles.publierTexte}>Déposer une annonce</Text>
        </LienBandeau>

        <View style={styles.espace} />

        <Entree href="/wanted" icone="text-search" label="Recherches" actif={chemin.startsWith('/wanted')} />
        <Entree href="/favorites" icone="heart-outline" label="Favoris" actif={chemin === '/favorites'} />
        <Entree
          href="/messages"
          icone="message-outline"
          label="Messages"
          actif={chemin.startsWith('/messages') || chemin.startsWith('/chat')}
          pastille={unreadCount > 0}
        />
        {user ? (
          <Entree href="/profile" icone="account-circle-outline" label="Compte" actif={chemin === '/profile'} />
        ) : (
          <Entree href="/login" icone="login" label="Se connecter" actif={chemin === '/login'} />
        )}
      </View>
    </View>
  );
}

function Entree({
  href,
  icone,
  label,
  actif,
  pastille,
}: {
  href: Href;
  icone: IconName;
  label: string;
  actif: boolean;
  pastille?: boolean;
}) {
  const couleur = actif ? colors.primary : colors.text;
  return (
    <LienBandeau href={href} label={label} style={styles.entree} styleSurvol={styles.entreeSurvol}>
      <View>
        <MaterialCommunityIcons name={icone} size={22} color={couleur} />
        {pastille ? <View style={styles.pastille} /> : null}
      </View>
      <Text style={[styles.entreeTexte, { color: couleur }]}>{label}</Text>
    </LienBandeau>
  );
}

const styles = StyleSheet.create({
  bandeau: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  interieur: {
    width: '100%',
    maxWidth: SITE_LARGE,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: 68,
  },
  marque: { textDecorationLine: 'none' },
  publier: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
  },
  publierSurvol: { backgroundColor: colors.primaryDark },
  publierTexte: { color: colors.onPrimary, fontWeight: '700', fontSize: 14.5 },
  espace: { flex: 1 },
  entree: {
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    minWidth: 64,
  },
  entreeSurvol: { backgroundColor: colors.surfaceAlt },
  entreeTexte: { fontSize: 12, fontWeight: '600' },
  pastille: {
    position: 'absolute',
    top: -1,
    right: -3,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.primary,
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
});
