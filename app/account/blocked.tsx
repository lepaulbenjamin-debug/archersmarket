import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { Header, Screen } from '@/components/Screen';
import { fetchBlocked, unblockMember } from '@/services/blocks';
import { colors, radius, spacing } from '@/theme';
import { useAuth } from '@/store/AuthContext';
import { useListings } from '@/store/ListingsContext';
import type { BlockedMember } from '@/types';

export default function BlockedScreen() {
  const { user } = useAuth();
  const { refresh } = useListings();
  const [members, setMembers] = useState<BlockedMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      setLoading(true);
      fetchBlocked(user.id)
        .then(setMembers)
        .catch(() => setMembers([]))
        .finally(() => setLoading(false));
    }, [user]),
  );

  const unblock = (member: BlockedMember) => {
    if (!user) return;
    Alert.alert(
      `Débloquer ${member.name} ?`,
      'Ses annonces réapparaîtront dans le fil et vous pourrez de nouveau vous écrire.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Débloquer',
          onPress: async () => {
            setWorking(member.id);
            try {
              await unblockMember(user.id, member.id);
              setMembers((prev) => prev.filter((m) => m.id !== member.id));
              // Ses annonces redeviennent visibles : le fil doit être rechargé.
              await refresh();
            } catch (error) {
              Alert.alert('Déblocage impossible', (error as Error).message);
            } finally {
              setWorking(null);
            }
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <Header title="Membres bloqués" showBack />
      {loading ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : members.length === 0 ? (
        <EmptyState
          icon="account-off-outline"
          title="Personne n’est bloqué"
          description="Depuis le profil d’un membre ou une conversation, vous pouvez couper le contact : ses annonces disparaissent de votre fil et vos échanges s’arrêtent."
        />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.intro}>
            Ces membres ne peuvent plus vous écrire et leurs annonces n’apparaissent plus dans votre
            fil. Ils n’en sont pas informés.
          </Text>
          {members.map((member) => (
            <View key={member.id} style={styles.row}>
              <Avatar name={member.name} color={member.avatarColor} size={40} />
              <View style={styles.identity}>
                <Text style={styles.name} numberOfLines={1}>
                  {member.name}
                </Text>
                <Text style={styles.handle} numberOfLines={1}>
                  @{member.handle}
                </Text>
              </View>
              <Button
                label="Débloquer"
                variant="secondary"
                size="sm"
                loading={working === member.id}
                onPress={() => unblock(member)}
              />
            </View>
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loader: { marginTop: spacing.xxl },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  intro: { fontSize: 12.5, color: colors.textFaint, lineHeight: 17 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  identity: { flex: 1 },
  name: { fontSize: 14.5, fontWeight: '700', color: colors.text },
  handle: { fontSize: 12.5, color: colors.textFaint, marginTop: 1 },
});
