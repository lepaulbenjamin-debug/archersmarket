import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Chip } from '@/components/Chip';
import { EmptyState } from '@/components/EmptyState';
import { PaymentBadge } from '@/components/PaymentBadge';
import { Header, Screen } from '@/components/Screen';
import { fetchOrders, formatCents, statusLabel, type Order } from '@/services/payments';
import { colors, radius, spacing } from '@/theme';
import { useAuth } from '@/store/AuthContext';

type Side = 'buyer' | 'seller';

export default function OrdersScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [side, setSide] = useState<Side>('buyer');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setOrders(await fetchOrders());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!user) {
    return (
      <Screen>
        <Header title="Mes transactions" showBack />
        <EmptyState
          icon="account-lock-outline"
          title="Connectez-vous"
          description="Vos achats et vos ventes s’affichent ici une fois connecté."
          actionLabel="Se connecter"
          onAction={() => router.push('/login')}
        />
      </Screen>
    );
  }

  const mine = orders.filter((order) =>
    side === 'buyer' ? order.buyerId === user.id : order.sellerId === user.id,
  );

  return (
    <Screen>
      <Header title="Mes transactions" subtitle="Achats et ventes protégés" showBack />

      <View style={styles.tabs}>
        <Chip label="Mes achats" selected={side === 'buyer'} onPress={() => setSide('buyer')} />
        <Chip label="Mes ventes" selected={side === 'seller'} onPress={() => setSide('seller')} />
      </View>

      {error ? (
        <Pressable onPress={load} style={styles.error}>
          <MaterialCommunityIcons name="wifi-off" size={17} color={colors.danger} />
          <Text style={styles.errorText}>{error} Touchez pour réessayer.</Text>
        </Pressable>
      ) : null}

      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : mine.length === 0 ? (
        <EmptyState
          icon={side === 'buyer' ? 'shopping-outline' : 'tag-outline'}
          title={side === 'buyer' ? 'Aucun achat protégé' : 'Aucune vente protégée'}
          description={
            side === 'buyer'
              ? 'Les annonces payées dans l’application apparaissent ici, avec leur suivi.'
              : 'Vos ventes réglées par paiement sécurisé apparaissent ici.'
          }
        />
      ) : (
        <FlatList
          data={mine}
          keyExtractor={(order) => order.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/order/${item.id}`)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <View style={styles.rowText}>
                <Text style={styles.title} numberOfLines={2}>
                  {item.listingTitle}
                </Text>
                <PaymentBadge status={item.status} label={statusLabel(item.status, side)} />
                <Text style={styles.amount}>
                  {side === 'buyer'
                    ? `${formatCents(item.totalAmount)} payés`
                    : `${formatCents(item.itemAmount + item.shippingAmount)} à recevoir`}
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textFaint} />
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  rowText: { flex: 1, gap: 7 },
  title: { fontSize: 14.5, fontWeight: '700', color: colors.text, lineHeight: 19 },
  amount: { fontSize: 13, color: colors.textMuted },
  loader: { marginTop: spacing.xxl },
  error: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  errorText: { flex: 1, fontSize: 12.5, color: colors.danger },
  pressed: { opacity: 0.85 },
});
