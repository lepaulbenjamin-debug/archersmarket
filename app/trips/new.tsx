import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AddressField } from '@/components/AddressField';
import { Button } from '@/components/Button';
import { DateField, isoAujourdhui } from '@/components/DateField';
import { Field } from '@/components/Field';
import { Header, Screen } from '@/components/Screen';
import { formatCents } from '@/services/payments';
import { COFFRES, MAX_CONTRIBUTION, createTrip, type ParcelSize } from '@/services/trips';
import { colors, radius, spacing } from '@/theme';

/**
 * Déclarer un trajet.
 *
 * L'écran demande peu, et refuse plutôt que de laisser passer : une
 * participation au-delà du plafond ferait du convoyeur un transporteur au sens
 * du code des transports, ce qui n'est ni son intention ni la nôtre. La base
 * le refuserait de toute façon ; autant l'expliquer avant.
 */
export default function NewTripScreen() {
  const router = useRouter();

  const [depart, setDepart] = useState({ ville: '', cp: '' });
  const [arrivee, setArrivee] = useState({ ville: '', cp: '' });
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [coffre, setCoffre] = useState<ParcelSize>('long');
  const [participation, setParticipation] = useState('10');
  const [busy, setBusy] = useState(false);

  const centimes = Math.round(Number(participation.replace(',', '.')) * 100) || 0;
  // Le calendrier ne laisse pas choisir dans le passé, mais un écran laissé
  // ouvert toute la nuit, si : la veille reste affichée, et il est minuit.
  const dateValide = date !== '' && date >= isoAujourdhui();

  const complet =
    depart.cp.length === 5 && depart.ville.length >= 2
    && arrivee.cp.length === 5 && arrivee.ville.length >= 2
    && dateValide
    && centimes >= 0 && centimes <= MAX_CONTRIBUTION;

  const enregistrer = async () => {
    setBusy(true);
    try {
      await createTrip({
        fromZip: depart.cp,
        fromCity: depart.ville,
        toZip: arrivee.cp,
        toCity: arrivee.ville,
        departOn: date,
        note: note.trim() || undefined,
        maxParcel: coffre,
        contribution: centimes,
      });
      router.back();
    } catch (error) {
      Alert.alert('Trajet non enregistré', (error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Header title="Déclarer un trajet" showBack />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.intro}>
          <MaterialCommunityIcons name="car-outline" size={20} color={colors.primary} />
          <Text style={styles.introText}>
            Vous allez à une compétition, un stage, une sortie de club ? Un archer près de vous
            cherche peut-être à faire voyager un arc sur ce trajet.
          </Text>
        </View>

        <AddressField
          label="Je pars de"
          placeholder="Ville de départ"
          value={depart.ville}
          onChangeText={(ville) => setDepart((etat) => ({ ...etat, ville }))}
          onSelect={(a) => setDepart({ ville: a.city, cp: a.zip })}
          municipality
        />
        <AddressField
          label="Je vais à"
          placeholder="Ville d’arrivée"
          value={arrivee.ville}
          onChangeText={(ville) => setArrivee((etat) => ({ ...etat, ville }))}
          onSelect={(a) => setArrivee({ ville: a.city, cp: a.zip })}
          municipality
        />

        <DateField
          label="Date du départ"
          value={date}
          onChange={setDate}
          hint="Le trajet reste proposé aux archers jusqu’au jour du départ."
          error={date && !dateValide ? 'Cette date est passée.' : undefined}
        />

        <View style={styles.bloc}>
          <Text style={styles.blocTitre}>Ce que le coffre accepte</Text>
          {COFFRES.map((choix) => {
            const actif = coffre === choix.value;
            return (
              <Pressable
                key={choix.value}
                accessibilityRole="button"
                onPress={() => setCoffre(choix.value)}
                style={[styles.option, actif && styles.optionActive]}
              >
                <MaterialCommunityIcons
                  name={actif ? 'radiobox-marked' : 'radiobox-blank'}
                  size={20}
                  color={actif ? colors.primary : colors.textFaint}
                />
                <View style={styles.flex}>
                  <Text style={styles.optionLabel}>{choix.label}</Text>
                  <Text style={styles.optionDetail}>{choix.detail}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <Field
          label="Participation aux frais"
          placeholder="10"
          value={participation}
          onChangeText={setParticipation}
          keyboardType="decimal-pad"
          hint={`En euros, ${formatCents(MAX_CONTRIBUTION)} au maximum.`}
          error={centimes > MAX_CONTRIBUTION ? 'Au-delà du plafond autorisé.' : undefined}
        />
        <Text style={styles.aide}>
          C’est une participation à votre essence et à votre péage, pas un revenu : au-delà de{' '}
          {formatCents(MAX_CONTRIBUTION)}, vous seriez un transporteur au sens de la loi, avec
          l’inscription au registre que cela suppose.
        </Text>

        <Field
          label="Précision (facultatif)"
          placeholder="Championnat régional, je passe par l’A6"
          value={note}
          onChangeText={setNote}
          maxLength={200}
        />

        <Button
          label="Publier le trajet"
          icon="map-marker-path"
          onPress={enregistrer}
          disabled={!complet}
          loading={busy}
        />
        <Text style={styles.aide}>
          Votre identité doit être vérifiée pour convoyer. On ne confie pas un arc à mille euros à
          un pseudonyme, et vous n’aimeriez pas non plus.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  flex: { flex: 1 },
  intro: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  introText: { flex: 1, fontSize: 13, color: colors.text, lineHeight: 19 },
  bloc: { gap: spacing.sm },
  blocTitre: { fontSize: 13, fontWeight: '700', color: colors.text },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  optionActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  optionLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  optionDetail: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  aide: { fontSize: 12, color: colors.textMuted, lineHeight: 18 },
});
