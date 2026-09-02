import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View,
} from 'react-native';

import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Field } from '@/components/Field';
import { Header, Screen } from '@/components/Screen';
import { categories, categoryById } from '@/data/catalog';
import { createWanted } from '@/services/wanted';
import { colors, radius, spacing } from '@/theme';
import { useAuth } from '@/store/AuthContext';
import type { CategoryId, Handedness } from '@/types';

/**
 * Publier une recherche.
 *
 * Deux champs obligatoires seulement — ce qu'on cherche, et dans quelle
 * catégorie. Le reste affine, et rien de ce qui n'est pas rempli ne
 * restreindra la correspondance : un formulaire long ferait renoncer
 * exactement les gens dont ce fil a besoin.
 *
 * La catégorie, elle, ne peut pas être facultative : c'est elle qui décide à
 * qui la notification part. Sans elle, il faudrait réveiller tout le monde.
 */
export default function NewWantedScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [titre, setTitre] = useState('');
  const [detail, setDetail] = useState('');
  const [categorie, setCategorie] = useState<CategoryId | null>(null);
  const [main, setMain] = useState<Handedness>('na');
  const [puissanceMin, setPuissanceMin] = useState('');
  const [puissanceMax, setPuissanceMax] = useState('');
  const [budget, setBudget] = useState('');

  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [envoi, setEnvoi] = useState(false);

  const specs = categorie ? categoryById(categorie).specs : [];
  const puissancePertinente = specs.includes('drawWeight');

  const nombre = (texte: string): number | undefined => {
    const propre = texte.replace(',', '.').trim();
    if (!propre) return undefined;
    const valeur = Number(propre);
    return Number.isFinite(valeur) ? valeur : undefined;
  };

  const publier = async () => {
    const prochaines: Record<string, string> = {};
    if (titre.trim().length < 3) prochaines.titre = 'Dites en quelques mots ce que vous cherchez.';
    if (titre.trim().length > 90) prochaines.titre = '90 caractères maximum.';
    if (!categorie) prochaines.categorie = 'Choisissez une catégorie.';

    const min = nombre(puissanceMin);
    const max = nombre(puissanceMax);
    if (min != null && max != null && min > max) {
      prochaines.puissance = 'La puissance minimale dépasse la maximale.';
    }
    setErreurs(prochaines);
    if (Object.keys(prochaines).length > 0 || !categorie || !user) return;

    setEnvoi(true);
    try {
      const demande = await createWanted(
        {
          title: titre,
          detail: detail.trim() || undefined,
          category: categorie,
          handedness: main === 'na' ? undefined : main,
          minDrawWeight: puissancePertinente ? min : undefined,
          maxDrawWeight: puissancePertinente ? max : undefined,
          maxPrice: nombre(budget),
        },
        user.id,
      );
      router.replace(`/wanted/${demande.id}`);
    } catch (err) {
      setErreurs({ global: (err as Error).message });
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Screen>
      <Header title="Je recherche" showBack />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.contenu} showsVerticalScrollIndicator={false}>
          <Text style={styles.intro}>
            Votre demande apparaîtra dans le fil des recherches, et les archers volontaires sur
            cette catégorie seront prévenus.
          </Text>

          <Field
            label="Ce que vous cherchez"
            placeholder="ex. Branches 68 pouces en 30 livres"
            value={titre}
            onChangeText={setTitre}
            maxLength={90}
            error={erreurs.titre}
          />

          <View>
            <Text style={styles.etiquette}>Catégorie</Text>
            <View style={styles.pastilles}>
              {categories.map((c) => (
                <Chip
                  key={c.id}
                  label={c.short}
                  icon={c.icon}
                  selected={categorie === c.id}
                  onPress={() => setCategorie(c.id)}
                />
              ))}
            </View>
            {erreurs.categorie ? <Text style={styles.erreur}>{erreurs.categorie}</Text> : null}
          </View>

          <Field
            label="Précisions (facultatif)"
            placeholder="Marque souhaitée, état accepté, ce que vous avez déjà essayé…"
            value={detail}
            onChangeText={setDetail}
            multiline
            numberOfLines={4}
            maxLength={700}
            style={styles.zone}
          />

          <View>
            <Text style={styles.etiquette}>Main d’arc</Text>
            <View style={styles.pastilles}>
              {(
                [
                  ['na', 'Peu importe'],
                  ['right', 'Droitier'],
                  ['left', 'Gaucher'],
                ] as Array<[Handedness, string]>
              ).map(([id, label]) => (
                <Chip key={id} label={label} selected={main === id} onPress={() => setMain(id)} />
              ))}
            </View>
          </View>

          {puissancePertinente ? (
            <View style={styles.paire}>
              <Field
                label="Puissance min."
                placeholder="26"
                value={puissanceMin}
                onChangeText={setPuissanceMin}
                keyboardType="decimal-pad"
                containerStyle={styles.moitie}
              />
              <Field
                label="Puissance max."
                placeholder="32"
                value={puissanceMax}
                onChangeText={setPuissanceMax}
                keyboardType="decimal-pad"
                containerStyle={styles.moitie}
                error={erreurs.puissance}
              />
            </View>
          ) : null}

          <Field
            label="Budget maximum (facultatif)"
            placeholder="250"
            value={budget}
            onChangeText={setBudget}
            keyboardType="decimal-pad"
            hint="Laissé vide, aucune annonce n’est écartée sur le prix."
          />

          {erreurs.global ? (
            <View style={styles.bandeau}>
              <MaterialCommunityIcons name="alert-circle-outline" size={18} color={colors.danger} />
              <Text style={styles.bandeauTexte}>{erreurs.global}</Text>
            </View>
          ) : null}

          <Button
            label="Publier ma recherche"
            icon="bullhorn-outline"
            onPress={publier}
            loading={envoi}
          />

          <Text style={styles.pied}>
            Trois recherches ouvertes au maximum, et chacune expire au bout de trente jours. On
            évite ainsi le fil de demandes satisfaites il y a six mois que personne n’a pensé à
            refermer.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  contenu: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  intro: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  etiquette: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  pastilles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  zone: { height: 110, textAlignVertical: 'top', paddingTop: spacing.md },
  paire: { flexDirection: 'row', gap: spacing.md },
  moitie: { flex: 1 },
  erreur: { fontSize: 12.5, color: colors.danger, marginTop: spacing.xs },
  bandeau: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  bandeauTexte: { flex: 1, fontSize: 13.5, color: colors.danger, lineHeight: 19 },
  pied: { fontSize: 12.5, color: colors.textFaint, lineHeight: 18 },
});
