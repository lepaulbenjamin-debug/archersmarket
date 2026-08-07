import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Header, Screen } from '@/components/Screen';
import { categoryById, conditions } from '@/data/catalog';
import {
  PAGE_SCRIPT,
  buildImport,
  consumeImportDraft,
  importFromPage,
  isSupportedUrl,
  setImportDraft,
  type ImportedListing,
  type PagePayload,
} from '@/services/importListing';
import { cacheRemotePhoto } from '@/services/photos';
import { colors, radius, spacing } from '@/theme';

/** Au-delà, la page est probablement bloquée : on propose le copier-coller. */
const PAGE_TIMEOUT = 25_000;
const MAX_PHOTOS = 4;

type Phase = 'form' | 'loading' | 'preview';

export default function ImportScreen() {
  const router = useRouter();

  const [url, setUrl] = useState('');
  const [pasted, setPasted] = useState('');
  const [showPaste, setShowPaste] = useState(Platform.OS === 'web');
  const [phase, setPhase] = useState<Phase>('form');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportedListing | null>(null);
  const [preparing, setPreparing] = useState(false);

  // L'URL réellement chargée : la changer remonte une WebView neuve.
  const [target, setTarget] = useState<string | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopBrowsing = useCallback(() => {
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = null;
    setTarget(null);
  }, []);

  useEffect(() => stopBrowsing, [stopBrowsing]);

  const giveUp = useCallback(
    (message: string) => {
      stopBrowsing();
      setPhase('form');
      setShowPaste(true);
      setError(message);
    },
    [stopBrowsing],
  );

  const browse = () => {
    const value = url.trim();
    if (!isSupportedUrl(value)) {
      setError('Collez le lien complet de l’annonce, en commençant par https://');
      return;
    }
    setError(null);
    setPhase('loading');
    setTarget(value);
    timeout.current = setTimeout(
      () =>
        giveUp(
          'La page n’a pas répondu à temps. Copiez le texte de l’annonce ci-dessous, cela marche à tous les coups.',
        ),
      PAGE_TIMEOUT,
    );
  };

  const onMessage = (event: WebViewMessageEvent) => {
    let imported: ImportedListing | null = null;
    try {
      imported = importFromPage(JSON.parse(event.nativeEvent.data) as PagePayload);
    } catch {
      imported = null;
    }
    if (!imported) {
      giveUp(
        'Cette page n’a pas livré son contenu — certains sites bloquent la lecture automatique. Copiez le texte de l’annonce ci-dessous.',
      );
      return;
    }
    stopBrowsing();
    setResult(imported);
    setPhase('preview');
  };

  const readPasted = () => {
    const text = pasted.trim();
    if (text.length < 30) {
      setError('Collez au moins le titre, la description et le prix de l’annonce.');
      return;
    }
    setError(null);
    setResult(buildImport(null, text));
    setPhase('preview');
  };

  /** Rapatrie les photos puis passe la main à l'écran de publication. */
  const useResult = async () => {
    if (!result) return;
    setPreparing(true);
    try {
      const urls = (result.photoUrls ?? []).slice(0, MAX_PHOTOS);
      const files = await Promise.all(urls.map((photo, index) => cacheRemotePhoto(photo, index)));
      setImportDraft({ ...result, photoUrls: files.filter((file): file is string => !!file) });
      router.replace('/(tabs)/sell');
    } finally {
      setPreparing(false);
    }
  };

  const restart = () => {
    consumeImportDraft();
    setResult(null);
    setError(null);
    setPhase('form');
  };

  return (
    <Screen>
      <Header
        title="Importer une annonce"
        subtitle="leboncoin, forum, groupe…"
        showBack
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {phase === 'preview' && result ? (
            <Preview listing={result} onRestart={restart} onUse={useResult} busy={preparing} />
          ) : (
            <>
              <View style={styles.intro}>
                <MaterialCommunityIcons name="link-variant" size={20} color={colors.primary} />
                <Text style={styles.introText}>
                  Collez le lien d’une annonce existante : le titre, le prix, les photos et les
                  caractéristiques sont repris. Tout reste modifiable avant publication.
                </Text>
              </View>

              {Platform.OS !== 'web' ? (
                <>
                  <Field
                    label="Lien de l’annonce"
                    placeholder="https://www.leboncoin.fr/ad/sports_hobbies/…"
                    value={url}
                    onChangeText={setUrl}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    editable={phase !== 'loading'}
                  />
                  <Button
                    label={phase === 'loading' ? 'Lecture de la page…' : 'Lire l’annonce'}
                    icon="download-outline"
                    onPress={browse}
                    loading={phase === 'loading'}
                  />
                  {phase === 'loading' ? (
                    <Pressable accessibilityRole="button" onPress={() => giveUp('Lecture annulée.')}>
                      <Text style={styles.cancel}>Annuler</Text>
                    </Pressable>
                  ) : null}
                </>
              ) : null}

              {error ? (
                <View style={styles.notice}>
                  <MaterialCommunityIcons
                    name="information-outline"
                    size={17}
                    color={colors.primaryDark}
                  />
                  <Text style={styles.noticeText}>{error}</Text>
                </View>
              ) : null}

              {showPaste ? (
                <View style={styles.pasteBlock}>
                  <Field
                    label="Ou collez le texte de l’annonce"
                    placeholder={'Branches Uukha VX+ 68" 38 lbs\nTrès bon état…\n490 €'}
                    value={pasted}
                    onChangeText={setPasted}
                    multiline
                    numberOfLines={8}
                    style={styles.textarea}
                    hint="Titre, description et prix suffisent."
                  />
                  <Button
                    label="Décoder le texte"
                    icon="text-search"
                    variant="secondary"
                    onPress={readPasted}
                  />
                </View>
              ) : (
                <Pressable accessibilityRole="button" onPress={() => setShowPaste(true)}>
                  <Text style={styles.link}>Le lien ne marche pas ? Coller le texte à la place</Text>
                </Pressable>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Hors écran : la page est chargée pour être lue, pas pour être vue. */}
      {target ? (
        <View style={styles.hidden} pointerEvents="none">
          <WebView
            source={{ uri: target }}
            injectedJavaScript={PAGE_SCRIPT}
            onMessage={onMessage}
            onError={() =>
              giveUp('Impossible d’ouvrir la page. Copiez le texte de l’annonce ci-dessous.')
            }
            javaScriptEnabled
            domStorageEnabled
            thirdPartyCookiesEnabled
          />
        </View>
      ) : null}
    </Screen>
  );
}

function Preview({
  listing,
  onRestart,
  onUse,
  busy,
}: {
  listing: ImportedListing;
  onRestart: () => void;
  onUse: () => void;
  busy: boolean;
}) {
  const photos = (listing.photoUrls ?? []).slice(0, MAX_PHOTOS);
  const facts = [
    listing.category ? categoryById(listing.category).label : null,
    listing.brand,
    listing.condition ? conditions.find((c) => c.id === listing.condition)?.label : null,
    listing.drawWeight ? `${listing.drawWeight} lbs` : null,
    listing.bowLength ? `${listing.bowLength}"` : null,
    listing.drawLength ? `allonge ${listing.drawLength}"` : null,
    listing.spine ? `spine ${listing.spine}` : null,
    listing.handedness === 'left' ? 'Gaucher' : listing.handedness === 'right' ? 'Droitier' : null,
    listing.shipping ? 'Envoi possible' : null,
  ].filter(Boolean) as string[];

  return (
    <>
      {photos.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoRow}>
          {photos.map((photo) => (
            <Image key={photo} source={{ uri: photo }} style={styles.photo} contentFit="cover" />
          ))}
        </ScrollView>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{listing.title ?? 'Annonce sans titre'}</Text>
        <Text style={styles.price}>
          {listing.price ? `${listing.price} €` : 'Prix à renseigner'}
          {listing.city ? `  ·  ${listing.city}` : ''}
        </Text>
        {listing.description ? (
          <Text style={styles.description} numberOfLines={6}>
            {listing.description}
          </Text>
        ) : null}
      </View>

      {facts.length ? (
        <View style={styles.facts}>
          {facts.map((fact) => (
            <View key={fact} style={styles.fact}>
              <Text style={styles.factText}>{fact}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.notice}>
        <MaterialCommunityIcons name="pencil-outline" size={17} color={colors.primaryDark} />
        <Text style={styles.noticeText}>
          Ces valeurs sont déduites du texte de l’annonce. Relisez-les à l’étape suivante : c’est
          vous qui publiez.
        </Text>
      </View>

      <Button
        label={busy ? 'Préparation…' : 'Continuer vers la publication'}
        icon="arrow-right"
        onPress={onUse}
        loading={busy}
      />
      <Button label="Recommencer" variant="ghost" onPress={onRestart} />
      {busy && photos.length ? (
        <View style={styles.busyRow}>
          <ActivityIndicator color={colors.primary} size="small" />
          <Text style={styles.busyText}>Récupération des photos…</Text>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  intro: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  introText: { flex: 1, fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  textarea: { minHeight: 150, textAlignVertical: 'top', paddingTop: spacing.md },
  pasteBlock: { gap: spacing.md },
  link: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },
  cancel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textFaint,
    textAlign: 'center',
    paddingVertical: spacing.xs,
  },
  notice: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  noticeText: { flex: 1, fontSize: 12.5, color: colors.primaryDark, lineHeight: 17 },
  hidden: { position: 'absolute', left: -10_000, top: 0, width: 360, height: 640, opacity: 0 },
  photoRow: { gap: spacing.md },
  photo: { width: 120, height: 120, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: 6,
  },
  cardTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  price: { fontSize: 14, fontWeight: '700', color: colors.primary },
  description: { fontSize: 13, color: colors.textMuted, lineHeight: 18, marginTop: 2 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  fact: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  factText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  busyRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', justifyContent: 'center' },
  busyText: { fontSize: 12.5, color: colors.textFaint },
});
