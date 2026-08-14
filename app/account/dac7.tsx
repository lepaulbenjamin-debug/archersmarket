import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { DateField } from '@/components/DateField';
import { Field } from '@/components/Field';
import { Header, Screen } from '@/components/Screen';
import {
  TAX_DETAILS_VIDES, dac7Statement, dac7Status, fetchTaxDetails, saveTaxDetails,
  type Dac7Quarter, type Dac7Status, type TaxDetails,
} from '@/services/dac7';
import { formatCents } from '@/services/payments';
import { colors, radius, spacing } from '@/theme';

/**
 * Le dossier fiscal du vendeur.
 *
 * Cet écran n'existe que parce que la loi l'impose, et il commence donc par
 * dire pourquoi. Un numéro fiscal réclamé sans explication ressemble à une
 * arnaque — c'est même exactement ce qu'une arnaque demanderait.
 *
 * Il montre aussi ce qui sera déclaré. L'obligation d'informer le vendeur des
 * données transmises est dans la directive ; la satisfaire avec les chiffres
 * eux-mêmes plutôt qu'avec une phrase vaut mieux pour tout le monde.
 */
export default function Dac7Screen() {
  const [status, setStatus] = useState<Dac7Status | null>(null);
  const [details, setDetails] = useState<TaxDetails>(TAX_DETAILS_VIDES);
  const [trimestres, setTrimestres] = useState<Dac7Quarter[]>([]);
  const [chargement, setChargement] = useState(true);
  const [busy, setBusy] = useState(false);

  const recharger = useCallback(async () => {
    setChargement(true);
    try {
      const etat = await dac7Status();
      setStatus(etat);
      setDetails(await fetchTaxDetails());
      if (etat) setTrimestres(await dac7Statement(etat.year));
    } catch {
      // Un dossier illisible ne doit pas bloquer l'écran : les champs vides
      // restent saisissables.
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    recharger();
  }, [recharger]);

  const modifier = <K extends keyof TaxDetails>(cle: K, valeur: TaxDetails[K]) =>
    setDetails((etat) => ({ ...etat, [cle]: valeur }));

  const complet =
    !!details.tin?.trim()
    && !!details.address?.trim()
    && !!details.zip?.trim()
    && !!details.city?.trim()
    && (details.isBusiness
      ? !!details.legalName?.trim() && !!details.businessNumber?.trim()
      : !!details.birthDate);

  const enregistrer = async () => {
    setBusy(true);
    try {
      await saveTaxDetails(details);
      await recharger();
      Alert.alert('Dossier enregistré', 'Vous n’avez plus rien à faire de ce côté.');
    } catch (error) {
      Alert.alert('Enregistrement impossible', (error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (chargement) {
    return (
      <Screen>
        <Header title="Déclaration fiscale" showBack />
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Header title="Déclaration fiscale" showBack />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Le cadre change de ton selon la situation : concerné et en retard,
            concerné et à jour, ou pas concerné du tout. */}
        {status?.reportable && !status.complete ? (
          <View style={[styles.cadre, styles.cadreUrgent]}>
            <MaterialCommunityIcons name="alert-outline" size={20} color={colors.danger} />
            <Text style={styles.cadreTexte}>
              Vos ventes de {status.year} dépassent le seuil à partir duquel la loi nous oblige à
              vous déclarer à l’administration fiscale. Sans ces informations, vos virements seront
              suspendus {status.graceDays} jours après notre demande — l’argent reste à vous et
              repart dès que le dossier est complet.
            </Text>
          </View>
        ) : status?.reportable ? (
          <View style={[styles.cadre, styles.cadreOk]}>
            <MaterialCommunityIcons name="check-circle-outline" size={20} color={colors.success} />
            <Text style={styles.cadreTexte}>
              Votre dossier est complet. Il sera transmis avec la déclaration de {status.year}, en
              janvier prochain, et vous en verrez le détail ci-dessous.
            </Text>
          </View>
        ) : (
          <View style={styles.cadre}>
            <MaterialCommunityIcons name="information-outline" size={20} color={colors.primary} />
            <Text style={styles.cadreTexte}>
              Vous n’êtes pas concerné. La déclaration ne vise que les vendeurs dépassant{' '}
              {status?.salesThreshold ?? 30} ventes ou {formatCents(status?.amountThreshold ?? 200000)} dans
              l’année. Vous pouvez renseigner ces informations à l’avance si vous le souhaitez,
              rien ne sera transmis tant que le seuil n’est pas franchi.
            </Text>
          </View>
        )}

        {status ? (
          <View style={styles.compteur}>
            <Compteur
              valeur={`${status.sales}`}
              sur={`${status.salesThreshold}`}
              libelle="ventes cette année"
            />
            <Compteur
              valeur={formatCents(status.amount)}
              sur={formatCents(status.amountThreshold)}
              libelle="encaissés"
            />
          </View>
        ) : null}

        <Text style={styles.section}>Qui vend</Text>
        <View style={styles.bascule}>
          {([false, true] as const).map((pro) => (
            <Pressable
              key={String(pro)}
              accessibilityRole="button"
              accessibilityState={{ selected: details.isBusiness === pro }}
              onPress={() => modifier('isBusiness', pro)}
              style={[styles.choix, details.isBusiness === pro && styles.choixActif]}
            >
              <Text style={[styles.choixTexte, details.isBusiness === pro && styles.choixTexteActif]}>
                {pro ? 'Une entreprise' : 'Un particulier'}
              </Text>
            </Pressable>
          ))}
        </View>

        {details.isBusiness ? (
          <>
            <Field
              label="Raison sociale"
              placeholder="Archerie du Doubs"
              value={details.legalName ?? ''}
              onChangeText={(v) => modifier('legalName', v)}
            />
            <Field
              label="SIREN ou numéro d’immatriculation"
              placeholder="123 456 789"
              value={details.businessNumber ?? ''}
              onChangeText={(v) => modifier('businessNumber', v)}
              keyboardType="numbers-and-punctuation"
            />
            <Field
              label="Numéro de TVA (si vous en avez un)"
              placeholder="FR12345678901"
              value={details.vatNumber ?? ''}
              onChangeText={(v) => modifier('vatNumber', v)}
              autoCapitalize="characters"
            />
          </>
        ) : (
          <>
            <DateField
              label="Date de naissance"
              value={details.birthDate ?? ''}
              onChange={(v) => modifier('birthDate', v)}
              min="1900-01-01"
              max={majoriteMax()}
              placeholder="Choisir une date"
              hint="Demandée par l’administration pour vous identifier sans ambiguïté."
            />
            <Field
              label="Lieu de naissance (facultatif)"
              placeholder="Besançon"
              value={details.birthPlace ?? ''}
              onChangeText={(v) => modifier('birthPlace', v)}
              hint="Nécessaire seulement si vous n’avez pas de numéro fiscal."
            />
          </>
        )}

        <Text style={styles.section}>Identification fiscale</Text>
        <Field
          label="Numéro fiscal"
          placeholder="13 chiffres, sur votre avis d’imposition"
          value={details.tin ?? ''}
          onChangeText={(v) => modifier('tin', v)}
          keyboardType="numbers-and-punctuation"
          hint="Votre numéro fiscal de référence, en haut à gauche de votre avis d’impôt."
        />
        <Field
          label="Pays qui l’a délivré"
          placeholder="FR"
          value={details.tinCountry}
          onChangeText={(v) => modifier('tinCountry', v.toUpperCase().slice(0, 2))}
          autoCapitalize="characters"
          maxLength={2}
        />

        <Text style={styles.section}>Adresse principale</Text>
        <Field
          label="Adresse"
          placeholder="3 rue de la Cible"
          value={details.address ?? ''}
          onChangeText={(v) => modifier('address', v)}
        />
        <Field
          label="Code postal"
          placeholder="25600"
          value={details.zip ?? ''}
          onChangeText={(v) => modifier('zip', v.replace(/\D/g, '').slice(0, 5))}
          keyboardType="number-pad"
        />
        <Field
          label="Ville"
          placeholder="Nommay"
          value={details.city ?? ''}
          onChangeText={(v) => modifier('city', v)}
        />

        <Button
          label="Enregistrer mon dossier"
          icon="shield-check-outline"
          onPress={enregistrer}
          disabled={!complet}
          loading={busy}
        />

        {trimestres.length > 0 ? (
          <>
            <Text style={styles.section}>Ce qui sera déclaré pour {status?.year}</Text>
            <View style={styles.tableau}>
              {trimestres.map((t) => (
                <View key={t.trimestre} style={styles.ligne}>
                  <Text style={styles.ligneCle}>{t.trimestre}ᵉ trimestre</Text>
                  <View style={styles.ligneValeurs}>
                    <Text style={styles.ligneValeur}>
                      {t.ventes_escrow + t.ventes_direct} vente
                      {t.ventes_escrow + t.ventes_direct > 1 ? 's' : ''}
                    </Text>
                    <Text style={styles.ligneDetail}>
                      {formatCents(t.montant_escrow + t.montant_direct)} · {formatCents(t.frais_escrow)} de
                      frais retenus
                    </Text>
                  </View>
                </View>
              ))}
            </View>
            <Text style={styles.aide}>
              Les ventes en main propre y figurent, mais leur montant est celui affiché sur
              l’annonce : l’argent n’est pas passé par nous, nous n’en connaissons pas le prix
              réellement convenu entre vous.
            </Text>
          </>
        ) : null}

        <Text style={styles.aide}>
          Ces informations ne servent qu’à la déclaration annuelle prévue par la directive
          européenne 2021/514. Elles ne sont visibles ni des acheteurs, ni des autres vendeurs, et
          ne servent à rien d’autre.
        </Text>
      </ScrollView>
    </Screen>
  );
}

function Compteur({ valeur, sur, libelle }: { valeur: string; sur: string; libelle: string }) {
  return (
    <View style={styles.compteurCase}>
      <Text style={styles.compteurValeur}>
        {valeur}
        <Text style={styles.compteurSur}> / {sur}</Text>
      </Text>
      <Text style={styles.compteurLibelle}>{libelle}</Text>
    </View>
  );
}

/** Dix-huit ans révolus : la contrainte existe aussi en base. */
function majoriteMax(): string {
  const jour = new Date();
  jour.setFullYear(jour.getFullYear() - 18);
  return jour.toISOString().slice(0, 10);
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  loader: { marginTop: spacing.xxl },
  cadre: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  cadreUrgent: { backgroundColor: colors.dangerSoft },
  cadreOk: { backgroundColor: colors.successSoft },
  cadreTexte: { flex: 1, fontSize: 13, color: colors.text, lineHeight: 19 },
  compteur: { flexDirection: 'row', gap: spacing.md },
  compteurCase: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  compteurValeur: { fontSize: 20, fontWeight: '800', color: colors.text },
  compteurSur: { fontSize: 14, fontWeight: '600', color: colors.textFaint },
  compteurLibelle: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  section: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: spacing.sm },
  bascule: { flexDirection: 'row', gap: spacing.sm },
  choix: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 11,
  },
  choixActif: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  choixTexte: { fontSize: 14, fontWeight: '700', color: colors.textMuted },
  choixTexteActif: { color: colors.primaryDark },
  tableau: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
  },
  ligne: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  ligneCle: { fontSize: 13.5, color: colors.textMuted },
  ligneValeurs: { alignItems: 'flex-end' },
  ligneValeur: { fontSize: 13.5, fontWeight: '700', color: colors.text },
  ligneDetail: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  aide: { fontSize: 12, color: colors.textMuted, lineHeight: 18 },
});
