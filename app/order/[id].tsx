import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { PaymentBadge } from '@/components/PaymentBadge';
import { Header, Screen } from '@/components/Screen';
import {
  confirmReceived,
  fetchOrder,
  formatCents,
  markShipped,
  openDispute,
  statusLabel,
  type Order,
} from '@/services/payments';
import { colors, radius, spacing } from '@/theme';
import { useAuth } from '@/store/AuthContext';

/** Les étapes d'une commande, dans l'ordre où l'acheteur les vit. */
const ETAPES = [
  { key: 'paid', label: 'Payé', icon: 'shield-check-outline' },
  { key: 'shipped', label: 'Expédié', icon: 'truck-outline' },
  { key: 'delivered', label: 'Reçu', icon: 'package-variant-closed-check' },
  { key: 'released', label: 'Vendeur payé', icon: 'check-circle-outline' },
] as const;

const RANG: Record<string, number> = { pending: -1, paid: 0, shipped: 1, delivered: 2, released: 3 };

export default function OrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [carrier, setCarrier] = useState('');
  const [tracking, setTracking] = useState('');

  const load = useCallback(async () => {
    try {
      setOrder(await fetchOrder(id));
    } catch (error) {
      Alert.alert('Commande indisponible', (error as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <Screen>
        <Header title="Commande" showBack />
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      </Screen>
    );
  }

  if (!order || !user) {
    return (
      <Screen>
        <Header title="Commande" showBack />
        <Text style={styles.absent}>Cette commande n’existe pas ou ne vous concerne pas.</Text>
      </Screen>
    );
  }

  const side: 'buyer' | 'seller' = order.sellerId === user.id ? 'seller' : 'buyer';
  const rang = RANG[order.status] ?? -1;

  const run = async (action: () => Promise<void>, echec: string) => {
    setBusy(true);
    try {
      await action();
      await load();
    } catch (error) {
      Alert.alert(echec, (error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const declarerEnvoi = () => {
    if (!tracking.trim()) {
      Alert.alert(
        'Envoyer sans numéro de suivi ?',
        'Sans suivi, rien ne prouvera la livraison si l’acheteur conteste. Le virement peut être bloqué.',
        [
          { text: 'Annuler', style: 'cancel' },
          {
            text: 'Envoyer quand même',
            style: 'destructive',
            onPress: () => run(() => markShipped(order.id, carrier, tracking), 'Déclaration impossible'),
          },
        ],
      );
      return;
    }
    run(() => markShipped(order.id, carrier, tracking), 'Déclaration impossible');
  };

  const confirmer = () =>
    Alert.alert(
      'Confirmer la réception',
      'Le vendeur sera payé. Ne confirmez qu’après avoir vérifié le matériel : c’est ce geste qui met fin à votre protection.',
      [
        { text: 'Pas encore', style: 'cancel' },
        {
          text: 'J’ai bien reçu',
          onPress: () => run(() => confirmReceived(order.id), 'Confirmation impossible'),
        },
      ],
    );

  const signaler = () =>
    Alert.alert(
      'Signaler un problème',
      'L’argent est gelé le temps que nous examinions la situation. Décrivez le problème au vendeur dans la conversation.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Geler le paiement',
          style: 'destructive',
          onPress: () => run(() => openDispute(order.id), 'Signalement impossible'),
        },
      ],
    );

  return (
    <Screen>
      <Header title="Commande" subtitle={side === 'seller' ? 'Vente' : 'Achat'} showBack />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.title}>{order.listingTitle}</Text>
          <PaymentBadge status={order.status} label={statusLabel(order.status, side)} />
        </View>

        {order.status !== 'cancelled' && order.status !== 'refunded' ? (
          <View style={styles.timeline}>
            {ETAPES.map((etape, index) => {
              const atteinte = rang >= index;
              return (
                <View key={etape.key} style={styles.etape}>
                  <View style={[styles.puce, atteinte && styles.puceActive]}>
                    <MaterialCommunityIcons
                      name={etape.icon}
                      size={15}
                      color={atteinte ? colors.onPrimary : colors.textFaint}
                    />
                  </View>
                  <Text style={[styles.etapeLabel, atteinte && styles.etapeLabelActive]}>
                    {etape.label}
                  </Text>
                  {index < ETAPES.length - 1 ? (
                    <View style={[styles.trait, rang > index && styles.traitActif]} />
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : null}

        <View style={styles.card}>
          <Ligne label="Article" value={formatCents(order.itemAmount)} />
          {order.shippingAmount > 0 ? (
            <Ligne label="Frais de port" value={formatCents(order.shippingAmount)} />
          ) : null}
          {side === 'buyer' ? (
            <Ligne label="Protection acheteur" value={formatCents(order.protectionAmount)} />
          ) : null}
          <View style={styles.separateur} />
          <Ligne
            label={side === 'buyer' ? 'Total payé' : 'Vous recevez'}
            value={formatCents(
              side === 'buyer' ? order.totalAmount : order.itemAmount + order.shippingAmount,
            )}
            fort
          />
        </View>

        {order.trackingNumber ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Suivi</Text>
            <Text style={styles.suivi}>
              {order.trackingCarrier ? `${order.trackingCarrier} · ` : ''}
              {order.trackingNumber}
            </Text>
          </View>
        ) : null}

        {/* Actions du vendeur */}
        {side === 'seller' && order.status === 'paid' ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Déclarer l’envoi</Text>
            <Text style={styles.aide}>
              Le numéro de suivi n’est pas obligatoire, mais c’est lui qui vous protège en cas de
              contestation.
            </Text>
            <Field
              label="Transporteur"
              placeholder="ex. Mondial Relay"
              value={carrier}
              onChangeText={setCarrier}
            />
            <Field
              label="Numéro de suivi"
              placeholder="ex. 6A12345678"
              value={tracking}
              onChangeText={setTracking}
              autoCapitalize="characters"
            />
            <Button label="J’ai expédié" icon="truck-fast-outline" onPress={declarerEnvoi} loading={busy} />
          </View>
        ) : null}

        {/* Actions de l'acheteur */}
        {side === 'buyer' && (order.status === 'paid' || order.status === 'shipped') ? (
          <>
            <Button
              label="J’ai bien reçu l’article"
              icon="check-circle-outline"
              onPress={confirmer}
              loading={busy}
            />
            <Pressable accessibilityRole="button" onPress={signaler} hitSlop={6}>
              <Text style={styles.probleme}>Un problème avec cette commande ?</Text>
            </Pressable>
          </>
        ) : null}

        {order.status === 'disputed' ? (
          <View style={styles.litige}>
            <MaterialCommunityIcons name="alert-outline" size={18} color={colors.danger} />
            <Text style={styles.litigeText}>
              L’argent est gelé. Nous examinons la situation et revenons vers vous par e-mail.
              Continuez à échanger dans la conversation : ce que vous vous écrivez nous aide à
              trancher.
            </Text>
          </View>
        ) : null}

        {side === 'buyer' && order.status === 'shipped' ? (
          <Text style={styles.note}>
            Sans nouvelle de votre part, le vendeur sera payé automatiquement quatorze jours après
            l’expédition.
          </Text>
        ) : null}

        {order.listingId ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(`/listing/${order.listingId}`)}
            hitSlop={6}
          >
            <Text style={styles.lien}>Voir l’annonce</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function Ligne({ label, value, fort }: { label: string; value: string; fort?: boolean }) {
  return (
    <View style={styles.ligne}>
      <Text style={[styles.ligneLabel, fort && styles.ligneFort]}>{label}</Text>
      <Text style={[styles.ligneValue, fort && styles.ligneFort]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  loader: { marginTop: spacing.xxl },
  absent: { textAlign: 'center', color: colors.textMuted, marginTop: spacing.xxl, paddingHorizontal: spacing.xl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardTitle: { fontSize: 14.5, fontWeight: '700', color: colors.text },
  title: { fontSize: 16, fontWeight: '800', color: colors.text, lineHeight: 21 },
  aide: { fontSize: 12, color: colors.textFaint, lineHeight: 17 },
  timeline: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.xs },
  etape: { flex: 1, alignItems: 'center', gap: 6 },
  puce: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  puceActive: { backgroundColor: colors.primary },
  etapeLabel: { fontSize: 11, color: colors.textFaint, fontWeight: '600', textAlign: 'center' },
  etapeLabelActive: { color: colors.text },
  trait: { position: 'absolute', top: 15, left: '60%', right: '-40%', height: 2, backgroundColor: colors.border },
  traitActif: { backgroundColor: colors.primary },
  ligne: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  ligneLabel: { fontSize: 14, color: colors.textMuted },
  ligneValue: { fontSize: 14, color: colors.text, fontWeight: '600' },
  ligneFort: { fontSize: 15.5, fontWeight: '800', color: colors.text },
  separateur: { height: 1, backgroundColor: colors.border, marginVertical: 2 },
  suivi: { fontSize: 14, color: colors.text, fontWeight: '600' },
  probleme: { fontSize: 13, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.xs },
  litige: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  litigeText: { flex: 1, fontSize: 12.5, color: colors.danger, lineHeight: 17 },
  note: { fontSize: 12, color: colors.textFaint, lineHeight: 17, textAlign: 'center' },
  lien: { fontSize: 13, fontWeight: '700', color: colors.primary, textAlign: 'center' },
});
