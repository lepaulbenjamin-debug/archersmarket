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
 * Les quatre premiers écrans parlent à l'acheteur, qui vient d'installer et
 * regarde. Le quatrième répond à la seule question qui l'arrête vraiment :
 * « et si je me fais avoir ? » On y parle donc de ce que son argent devient,
 * et non de ce qu'il nous coûte — le tarif se lit au moment de payer, où il
 * est vérifiable ; ici il ne rassure personne.
 *
 * Le dernier s'adresse au vendeur, juste avant l'inscription : c'est de lui
 * que ce marché a le plus besoin, et ce qui le retient n'est pas le prix mais
 * la corvée. Expédier 130 cm est une vraie difficulté — beaucoup de
 * transporteurs plafonnent bien en dessous — et c'est nous qui la portons :
 * la cotation écarte les offres irréalisables avant de les montrer.
 *
 * Rien ici qu'on ne puisse tenir. Promettre ce qu'on ne fait pas se paie au
 * premier litige. D'où le « quatorze jours » : le séquestre a une fin, et un
 * acheteur qui l'apprend le jour du virement l'aurait mal pris.
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
    icon: 'lock-check-outline',
    titre: 'Le vendeur n’est payé qu’après vous',
    texte:
      'Vous réglez à la commande, mais la somme reste bloquée tant que l’arc n’est pas chez vous.',
    points: [
      'Le virement part à votre confirmation, ou quatorze jours après l’envoi',
      'Un doute, une casse ? Signalez-le : rien n’est versé tant que ce n’est pas réglé',
      'En main propre, vous ne réglez le vendeur qu’après avoir testé si besoin',
      'Protégé quel que soit le prix, là où ailleurs ça s’arrête à 2 500 €',
    ],
  },
  {
    icon: 'truck-check-outline',
    titre: 'On trouve qui prend votre colis',
    texte:
      'Branches, tube de flèches, arc en valise : on ne propose que les transporteurs qui acceptent la longueur.',
    points: [
      'Vous indiquez le format, l’acheteur voit le prix réel et choisit',
      'L’étiquette, c’est nous qui l’achetons : rien à avancer, aucun compte à ouvrir',
      'Vous imprimez, vous déposez, le suivi se met à jour tout seul',
      'Au-delà de 100 €, le colis part assuré, compris dans le prix',
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
