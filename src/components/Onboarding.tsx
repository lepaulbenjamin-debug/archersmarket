import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import {
  Dimensions, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Logo } from '@/components/Logo';
import { colors, radius, spacing } from '@/theme';

const { width } = Dimensions.get('window');

/**
 * Ce que l'accueil doit faire comprendre.
 *
 * Un archer qui vend son arc a déjà des endroits où le faire : les petites
 * annonces généralistes, les groupes, les forums. La question n'est donc pas
 * « voici nos fonctionnalités » mais « qu'est-ce que j'y gagne, moi ».
 *
 * D'où quatre bénéfices et non quatre inventaires. « Dix-sept catégories,
 * soixante-dix-huit marques » ne dit rien à personne ; « vous achetez
 * compatible du premier coup », si.
 *
 * Les trois premiers écrans parlent à l'acheteur, qui vient d'installer et
 * regarde. Le dernier s'adresse au vendeur, juste avant l'inscription : c'est
 * de lui que ce marché a le plus besoin.
 *
 * Rien ici qu'on ne puisse tenir. Promettre ce qu'on ne fait pas se paie au
 * premier litige.
 */
const ECRANS = [
  {
    icon: 'filter-check-outline',
    titre: 'Des filtres faits pour le tir à l’arc',
    texte:
      'Gaucher, 38 livres, poignée 25 pouces : trois filtres et vous y êtes.',
    points: [
      'Main d’arc, puissance, catégorie, état, marque',
      'La fiche porte l’allonge, la longueur, le spine',
      'Fini les cinquante annonces à ouvrir pour vérifier la compatibilité',
    ],
  },
  {
    icon: 'content-duplicate',
    titre: 'Votre annonce en un copier-coller',
    texte:
      'Vous vendez déjà ailleurs ? Collez le lien : titre, description, prix et photos sont repris.',
    points: [
      'La catégorie et la marque sont devinées, pas ressaisies',
      'Vous relisez, vous corrigez, vous publiez',
      'Rien ne part sans que vous ayez validé',
    ],
  },
  {
    icon: 'shield-alert-outline',
    titre: 'Les arnaques repérées avant vous',
    texte:
      'Presque toutes commencent pareil : « payez-moi par virement, ce sera plus simple ».',
    points: [
      'Ces messages sont détectés, et vous êtes prévenu dans la conversation',
      'L’identité des vendeurs qui le veulent est contrôlée, et se voit',
      'Un avis après chaque vente, des deux côtés',
    ],
  },
  {
    icon: 'handshake-outline',
    titre: 'Essayez au club, ou faites livrer',
    texte:
      'Un arc doit vous aller. Tirez quelques volées avant de valider — ou faites-le venir, même en 130 cm.',
    points: [
      '0,99 € en main propre, avec un code donné après essai',
      'À distance : le port est demandé aux transporteurs, l’étiquette est prête',
      'Aucun plafond, là où ailleurs la protection s’arrête à 2 500 €',
    ],
  },
] as const;

export function Onboarding({
  onDone,
}: {
  onDone: (creerCompte: boolean) => void;
}) {
  const [index, setIndex] = useState(0);
  const defilement = useRef<ScrollView>(null);

  const dernier = index === ECRANS.length - 1;

  const suivant = () => {
    if (dernier) {
      onDone(true);
      return;
    }
    defilement.current?.scrollTo({ x: (index + 1) * width, animated: true });
  };

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.entete}>
        <Logo size={30} wordSize={15} />
        {/* Toujours accessible : forcer quatre écrans à quelqu'un qui veut
            seulement regarder les annonces le fait désinstaller. */}
        <Pressable accessibilityRole="button" onPress={() => onDone(false)} hitSlop={10}>
          <Text style={styles.passer}>Passer</Text>
        </Pressable>
      </SafeAreaView>

      <ScrollView
        ref={defilement}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(event) =>
          setIndex(Math.round(event.nativeEvent.contentOffset.x / width))
        }
      >
        {ECRANS.map((ecran) => (
          <View key={ecran.titre} style={styles.page}>
            <View style={styles.rond}>
              <MaterialCommunityIcons name={ecran.icon} size={46} color={colors.primary} />
            </View>

            <Text style={styles.titre}>{ecran.titre}</Text>
            <Text style={styles.texte}>{ecran.texte}</Text>

            <View style={styles.points}>
              {ecran.points.map((point) => (
                <View key={point} style={styles.point}>
                  <MaterialCommunityIcons name="check" size={16} color={colors.primary} />
                  <Text style={styles.pointTexte}>{point}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={styles.bas}>
        <View style={styles.puces}>
          {ECRANS.map((ecran, position) => (
            <View
              key={ecran.titre}
              style={[styles.puce, position === index && styles.puceActive]}
            />
          ))}
        </View>

        <Button
          label={dernier ? 'Créer mon compte' : 'Suivant'}
          icon={dernier ? 'account-plus-outline' : undefined}
          onPress={suivant}
        />

        {dernier ? (
          <Pressable accessibilityRole="button" onPress={() => onDone(false)} hitSlop={8}>
            <Text style={styles.regarder}>Regarder les annonces d’abord</Text>
          </Pressable>
        ) : null}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  entete: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  passer: { fontSize: 14, fontWeight: '700', color: colors.textMuted },
  page: { width, paddingHorizontal: spacing.xl, paddingTop: spacing.xl, gap: spacing.md },
  rond: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  titre: { fontSize: 25, fontWeight: '800', color: colors.text, lineHeight: 31 },
  texte: { fontSize: 15, color: colors.textMuted, lineHeight: 22 },
  points: { gap: spacing.sm, marginTop: spacing.sm },
  point: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  pointTexte: { flex: 1, fontSize: 14, color: colors.text, lineHeight: 20 },
  bas: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.md },
  puces: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  puce: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.border },
  puceActive: { backgroundColor: colors.primary, width: 20 },
  regarder: {
    fontSize: 13.5,
    fontWeight: '700',
    color: colors.textMuted,
    textAlign: 'center',
    paddingBottom: spacing.sm,
  },
});
