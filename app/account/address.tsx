import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { AddressField } from '@/components/AddressField';
import { Field } from '@/components/Field';
import { Header, Screen } from '@/components/Screen';
import { fetchSellerAddress, saveSellerAddress, type Civility, type SellerAddress } from '@/services/shipping';
import { CivilityPicker } from '@/components/CivilityPicker';
import { useAuth } from '@/store/AuthContext';
import { colors, radius, spacing } from '@/theme';

/**
 * L'adresse d'où partent les colis du vendeur.
 *
 * Elle est privée : une étiquette porte deux adresses, mais celle-ci ne
 * s'affiche nulle part sur le profil. Seule la fonction qui achète
 * l'étiquette la lit.
 */
export default function SellerAddressScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [form, setForm] = useState<SellerAddress>({
    civility: 'M',
    fullName: user?.name ?? '',
    address: '',
    zip: '',
    city: user?.city ?? '',
    country: 'FR',
    phone: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSellerAddress()
      .then((existante) => { if (existante) setForm(existante); })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  const complet =
    form.fullName.trim().length > 2 &&
    form.address.trim().length > 4 &&
    /^[0-9]{5}$/.test(form.zip.trim()) &&
    form.city.trim().length > 1 &&
    form.phone.replace(/\D/g, '').length >= 9;

  const enregistrer = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveSellerAddress(form);
      router.back();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <Header title="Adresse d’expédition" showBack />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.intro}>
            <Text style={styles.introText}>
              C’est l’adresse imprimée sur l’étiquette, celle d’où part le colis.
              Elle reste privée : les autres membres ne la voient jamais.
            </Text>
          </View>

          <CivilityPicker
            value={form.civility}
            onChange={(civility: Civility) => setForm((prev) => ({ ...prev, civility }))}
          />
          <Field
            label="Nom et prénom"
            value={form.fullName}
            onChangeText={(fullName) => setForm((prev) => ({ ...prev, fullName }))}
            autoComplete="name"
            editable={!loading}
          />
          <AddressField
            placeholder="12 rue des Archers"
            value={form.address}
            onChangeText={(address) => setForm((prev) => ({ ...prev, address }))}
            onSelect={(choix) =>
              setForm((prev) => ({
                ...prev,
                address: choix.street,
                zip: choix.zip,
                city: choix.city,
              }))
            }
            editable={!loading}
          />
          <View style={styles.row}>
            <Field
              label="Code postal"
              placeholder="25000"
              value={form.zip}
              onChangeText={(zip) => setForm((prev) => ({ ...prev, zip }))}
              keyboardType="number-pad"
              maxLength={5}
              containerStyle={styles.zip}
              editable={!loading}
            />
            <Field
              label="Ville"
              placeholder="Besançon"
              value={form.city}
              onChangeText={(city) => setForm((prev) => ({ ...prev, city }))}
              containerStyle={styles.flex}
              editable={!loading}
            />
          </View>
          <Field
            label="Téléphone"
            hint="Demandé par les transporteurs en cas de souci sur l’enlèvement."
            placeholder="06 12 34 56 78"
            value={form.phone}
            onChangeText={(phone) => setForm((prev) => ({ ...prev, phone }))}
            keyboardType="phone-pad"
            editable={!loading}
            error={error ?? undefined}
          />

          <Button
            label="Enregistrer"
            onPress={enregistrer}
            loading={saving}
            disabled={!complet || loading}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  intro: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md },
  introText: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  row: { flexDirection: 'row', gap: spacing.sm },
  zip: { width: 110 },
});
