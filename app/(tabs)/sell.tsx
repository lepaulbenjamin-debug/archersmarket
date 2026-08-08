import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import { BrandPicker } from '@/components/BrandPicker';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { EmptyState } from '@/components/EmptyState';
import { Field } from '@/components/Field';
import { Header, Screen } from '@/components/Screen';
import { categories, categoryById, conditions, handednessOptions } from '@/data/catalog';
import { consumeImportDraft } from '@/services/importListing';
import { colors, radius, spacing } from '@/theme';
import { useAuth } from '@/store/AuthContext';
import { useListings } from '@/store/ListingsContext';
import type { CategoryId, ConditionId, Handedness } from '@/types';
import { imageSource } from '@/utils/images';

const SPEC_LABELS = {
  drawWeight: { label: 'Puissance (livres)', placeholder: 'ex. 38' },
  bowLength: { label: 'Longueur (pouces)', placeholder: 'ex. 68' },
  drawLength: { label: 'Allonge (pouces)', placeholder: 'ex. 29.5' },
  spine: { label: 'Spine', placeholder: 'ex. 500' },
  size: { label: 'Taille', placeholder: 'ex. M' },
} as const;

export default function SellScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { createListing } = useListings();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState<CategoryId>('bow-recurve');
  const [brand, setBrand] = useState('Hoyt');
  const [condition, setCondition] = useState<ConditionId>('very-good');
  const [handedness, setHandedness] = useState<Handedness>('right');
  const [specs, setSpecs] = useState<Record<string, string>>({});
  const [city, setCity] = useState(user?.city ?? '');
  const [shipping, setShipping] = useState(true);
  const [shippingPrice, setShippingPrice] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [imported, setImported] = useState(false);

  const activeCategory = useMemo(() => categoryById(category), [category]);

  /**
   * Un import déposé par l'écran « Importer une annonce » remplit le formulaire.
   * Rien n'est publié : le vendeur relit et corrige avant d'envoyer.
   */
  useFocusEffect(
    useCallback(() => {
      // Tant que personne n'est connecté, le brouillon attend : le consommer
      // ici le perdrait au profit de l'invitation à se connecter.
      if (!user) return;
      const draft = consumeImportDraft();
      if (!draft) return;

      if (draft.title) setTitle(draft.title.slice(0, 80));
      if (draft.description) setDescription(draft.description);
      if (draft.price) setPrice(String(draft.price));
      if (draft.city) setCity(draft.city);
      if (draft.category) setCategory(draft.category);
      if (draft.brand) setBrand(draft.brand);
      if (draft.condition) setCondition(draft.condition);
      if (draft.handedness) setHandedness(draft.handedness);
      if (draft.shipping != null) setShipping(draft.shipping);
      if (draft.photoUrls?.length) setPhotos(draft.photoUrls.slice(0, 4));

      const specsFromImport: Record<string, string> = {};
      for (const key of ['drawWeight', 'bowLength', 'drawLength', 'spine'] as const) {
        if (draft[key] != null) specsFromImport[key] = String(draft[key]);
      }
      if (draft.size) specsFromImport.size = draft.size;
      if (Object.keys(specsFromImport).length) setSpecs(specsFromImport);

      setErrors({});
      setImported(true);
    }, [user]),
  );

  if (!user) {
    return (
      <Screen>
        <Header title="Publier" />
        <EmptyState
          icon="account-lock-outline"
          title="Connectez-vous pour publier"
          description="Créez un compte gratuit pour publier vos annonces et échanger avec les acheteurs."
          actionLabel="Se connecter"
          onAction={() => router.push('/login')}
        />
      </Screen>
    );
  }

  const pickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Accès aux photos refusé',
        'Autorisez l’accès à la galerie pour ajouter vos propres photos. Un visuel par défaut sera utilisé.',
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsMultipleSelection: true,
      selectionLimit: 4,
    });
    if (!result.canceled) {
      setPhotos((prev) => [...prev, ...result.assets.map((a) => a.uri)].slice(0, 4));
    }
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (title.trim().length < 6) next.title = 'Un titre d’au moins 6 caractères.';
    if (description.trim().length < 20) next.description = 'Décrivez l’état et l’usage (20 caractères min.).';
    const parsedPrice = Number(price.replace(',', '.'));
    if (!price || Number.isNaN(parsedPrice) || parsedPrice <= 0) next.price = 'Indiquez un prix valide.';
    if (!city.trim()) next.city = 'Indiquez votre ville.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const num = (key: string) => {
    const value = specs[key];
    if (!value) return undefined;
    const parsed = Number(value.replace(',', '.'));
    return Number.isNaN(parsed) ? undefined : parsed;
  };

  const submit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const listing = await createListing({
        title: title.trim(),
        description: description.trim(),
        price: Number(price.replace(',', '.')),
        category,
        brand,
        condition,
        handedness,
        drawWeight: num('drawWeight'),
        bowLength: num('bowLength'),
        drawLength: num('drawLength'),
        spine: num('spine'),
        size: specs.size?.trim() || undefined,
        city: city.trim(),
        shipping,
        shippingPrice: shipping ? Number(shippingPrice.replace(',', '.')) || undefined : undefined,
        photos,
      });
      setTitle('');
      setDescription('');
      setPrice('');
      setSpecs({});
      setPhotos([]);
      setShippingPrice('');
      setErrors({});
      router.push(`/listing/${listing.id}`);
    } catch (error) {
      Alert.alert('Publication impossible', (error as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <Header title="Publier une annonce" subtitle="Gratuit et sans commission" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {imported ? (
            <View style={styles.banner}>
              <MaterialCommunityIcons name="import" size={18} color={colors.primaryDark} />
              <Text style={styles.bannerText}>
                Annonce importée. Vérifiez la catégorie, l’état et le prix : ces valeurs ont été
                déduites du texte d’origine.
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Masquer le message"
                hitSlop={8}
                onPress={() => setImported(false)}
              >
                <MaterialCommunityIcons name="close" size={16} color={colors.primaryDark} />
              </Pressable>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/import')}
              style={({ pressed }) => [styles.importCta, pressed && styles.pressed]}
            >
              <MaterialCommunityIcons name="link-variant" size={20} color={colors.primary} />
              <View style={styles.flex}>
                <Text style={styles.importTitle}>Importer depuis une annonce en ligne</Text>
                <Text style={styles.importHint}>
                  Collez un lien leboncoin : titre, photos et caractéristiques repris.
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textFaint} />
            </Pressable>
          )}

          <Group title="Photos" hint="Jusqu’à 4 photos. Sans photo, un visuel de catégorie est utilisé.">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Ajouter une photo"
                onPress={pickPhoto}
                style={({ pressed }) => [styles.photoAdd, pressed && styles.pressed]}
              >
                <MaterialCommunityIcons name="camera-plus-outline" size={22} color={colors.primary} />
                <Text style={styles.photoAddText}>Ajouter</Text>
              </Pressable>
              {(photos.length ? photos : [category]).map((photo, index) => (
                <View key={`${photo}-${index}`} style={styles.photoWrap}>
                  <Image source={imageSource(photo, category)} style={styles.photo} contentFit="cover" />
                  {photos.length ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Retirer la photo"
                      hitSlop={6}
                      onPress={() => setPhotos((prev) => prev.filter((_, i) => i !== index))}
                      style={styles.photoRemove}
                    >
                      <MaterialCommunityIcons name="close" size={13} color={colors.onPrimary} />
                    </Pressable>
                  ) : (
                    <View style={styles.photoDefault}>
                      <Text style={styles.photoDefaultText}>Visuel par défaut</Text>
                    </View>
                  )}
                </View>
              ))}
            </ScrollView>
          </Group>

          <Field
            label="Titre de l’annonce"
            placeholder={'ex. Branches Uukha VX+ 68" 38 lbs'}
            value={title}
            onChangeText={setTitle}
            error={errors.title}
            maxLength={80}
          />

          <Group title="Catégorie">
            <View style={styles.wrap}>
              {categories.map((item) => (
                <Chip
                  key={item.id}
                  label={item.short}
                  icon={item.icon}
                  selected={category === item.id}
                  onPress={() => setCategory(item.id)}
                />
              ))}
            </View>
          </Group>

          <Group title="Marque">
            <BrandPicker value={brand} onChange={setBrand} />
          </Group>

          <Group title="État">
            <View style={styles.wrap}>
              {conditions.map((item) => (
                <Chip
                  key={item.id}
                  label={item.label}
                  selected={condition === item.id}
                  onPress={() => setCondition(item.id)}
                />
              ))}
            </View>
            <Text style={styles.hint}>
              {conditions.find((c) => c.id === condition)?.hint}
            </Text>
          </Group>

          <Group title="Main d’arc">
            <View style={styles.wrap}>
              {handednessOptions.map((item) => (
                <Chip
                  key={item.id}
                  label={item.label}
                  selected={handedness === item.id}
                  onPress={() => setHandedness(item.id)}
                />
              ))}
            </View>
          </Group>

          {activeCategory.specs.length > 0 ? (
            <Group title="Caractéristiques techniques">
              <View style={styles.specGrid}>
                {activeCategory.specs.map((spec) => (
                  <Field
                    key={spec}
                    containerStyle={styles.specField}
                    label={SPEC_LABELS[spec].label}
                    placeholder={SPEC_LABELS[spec].placeholder}
                    keyboardType={spec === 'size' ? 'default' : 'numeric'}
                    value={specs[spec] ?? ''}
                    onChangeText={(value) => setSpecs((prev) => ({ ...prev, [spec]: value }))}
                  />
                ))}
              </View>
            </Group>
          ) : null}

          <Field
            label="Description"
            placeholder="Nombre de flèches tirées, défauts, accessoires inclus…"
            value={description}
            onChangeText={setDescription}
            error={errors.description}
            multiline
            numberOfLines={5}
            style={styles.textarea}
          />

          <View style={styles.row}>
            <Field
              containerStyle={styles.flex}
              label="Prix (€)"
              placeholder="0"
              keyboardType="numeric"
              value={price}
              onChangeText={setPrice}
              error={errors.price}
            />
            <Field
              containerStyle={styles.flex}
              label="Ville"
              placeholder="ex. Nantes"
              value={city}
              onChangeText={setCity}
              error={errors.city}
            />
          </View>

          <View style={styles.switchRow}>
            <View style={styles.flex}>
              <Text style={styles.switchLabel}>Envoi possible</Text>
              <Text style={styles.switchHint}>Sinon, remise en main propre uniquement.</Text>
            </View>
            <Switch
              value={shipping}
              onValueChange={setShipping}
              trackColor={{ true: colors.primaryDark, false: colors.borderStrong }}
              thumbColor={colors.surface}
            />
          </View>

          {shipping ? (
            <Field
              label="Frais de port (€)"
              placeholder="ex. 12"
              keyboardType="numeric"
              value={shippingPrice}
              onChangeText={setShippingPrice}
              hint="Laissez vide si les frais sont à convenir."
            />
          ) : null}

          <Button
            label="Publier l’annonce"
            icon="check-circle-outline"
            onPress={submit}
            loading={submitting}
            style={styles.submit}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Group({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl * 2, gap: spacing.xl },
  group: { gap: spacing.sm },
  groupTitle: { fontSize: 14.5, fontWeight: '700', color: colors.text },
  hint: { fontSize: 12, color: colors.textFaint, lineHeight: 16 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  photoRow: { gap: spacing.md, paddingVertical: 2 },
  photoAdd: {
    width: 96,
    height: 96,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: colors.surface,
  },
  photoAddText: { fontSize: 11.5, fontWeight: '700', color: colors.primary },
  photoWrap: { width: 96, height: 96, borderRadius: radius.md, overflow: 'hidden' },
  photo: { width: '100%', height: '100%' },
  photoRemove: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(20,32,27,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoDefault: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(20,32,27,0.62)',
    paddingVertical: 3,
    alignItems: 'center',
  },
  photoDefaultText: { fontSize: 9.5, fontWeight: '700', color: colors.onPrimary },
  specGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  specField: { flexGrow: 1, flexBasis: '45%' },
  textarea: { minHeight: 120, textAlignVertical: 'top', paddingTop: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  switchLabel: { fontSize: 14.5, fontWeight: '700', color: colors.text },
  switchHint: { fontSize: 12, color: colors.textFaint, marginTop: 2 },
  submit: { marginTop: spacing.sm },
  pressed: { opacity: 0.8 },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  bannerText: { flex: 1, fontSize: 12.5, color: colors.primaryDark, lineHeight: 17 },
  importCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  importTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  importHint: { fontSize: 12, color: colors.textFaint, marginTop: 2, lineHeight: 16 },
});
