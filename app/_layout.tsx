import { StripeProvider } from '@stripe/stripe-react-native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Onboarding } from '@/components/Onboarding';
import { WhatsNew } from '@/components/WhatsNew';
import { NOUVEAUTES } from '@/data/whatsNew';
import {
  hasSeenOnboarding, lastSeenNews, markNewsSeen, markOnboardingSeen,
} from '@/services/onboarding';
import { colors } from '@/theme';
import { AuthProvider, useAuth } from '@/store/AuthContext';
import { ListingsProvider } from '@/store/ListingsContext';
import { MessagesProvider } from '@/store/MessagesContext';
import { PushProvider } from '@/store/PushContext';

function RootNavigator() {
  const { loading } = useAuth();
  const router = useRouter();

  // `null` tant qu'on ne sait pas : afficher l'accueil puis le retirer
  // aussitôt donnerait un clignotement à chaque lancement.
  const [accueilVu, setAccueilVu] = useState<boolean | null>(null);
  const [nouveautes, setNouveautes] = useState(false);

  useEffect(() => {
    Promise.all([hasSeenOnboarding(), lastSeenNews()]).then(([vu, dernier]) => {
      setAccueilVu(vu);
      // Les nouveautés ne s'annoncent qu'à qui connaissait déjà l'application.
      // Les montrer juste après l'accueil reviendrait à répéter ce qu'on vient
      // de lire, en moins bien.
      setNouveautes(vu && dernier < NOUVEAUTES.version);
    });
  }, []);

  const fermerAccueil = (creerCompte: boolean) => {
    setAccueilVu(true);
    markOnboardingSeen();
    // Celui qui découvre l'application vient de tout lire : ses nouveautés
    // sont déjà à jour.
    markNewsSeen(NOUVEAUTES.version);
    if (creerCompte) router.push('/register');
  };

  const fermerNouveautes = () => {
    setNouveautes(false);
    markNewsSeen(NOUVEAUTES.version);
  };

  if (loading || accueilVu === null) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="listing/[id]" />
        <Stack.Screen name="chat/[id]" />
        <Stack.Screen name="seller/[id]" />
        <Stack.Screen name="review/[id]" />
        <Stack.Screen name="import" />
        <Stack.Screen name="orders" />
        <Stack.Screen name="moderation" />
        <Stack.Screen name="account/payment" />
        <Stack.Screen name="account/setup" />
        <Stack.Screen name="account/address" />
        <Stack.Screen name="account/alerts" />
        <Stack.Screen name="order/[id]" />
        <Stack.Screen name="checkout/[id]" />
        <Stack.Screen name="login" options={{ presentation: 'modal' }} />
        <Stack.Screen name="forgot-password" options={{ presentation: 'modal' }} />
        <Stack.Screen name="register" options={{ presentation: 'modal' }} />
      </Stack>

      {/* Posé par-dessus le navigateur plutôt qu'à sa place : il doit pouvoir
          ouvrir l'inscription en se retirant, ce qu'un écran monté hors du
          navigateur ne saurait pas faire. */}
      {accueilVu ? null : (
        <View style={styles.accueil}>
          <Onboarding onDone={fermerAccueil} />
        </View>
      )}

      <WhatsNew visible={nouveautes} onClose={fermerNouveautes} />
    </View>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <AuthProvider>
          <ListingsProvider>
            <MessagesProvider>
              <PushProvider>
                <StripeProvider publishableKey={process.env.EXPO_PUBLIC_STRIPE_KEY ?? ''}>
                  <StatusBar style="dark" />
                  <RootNavigator />
                </StripeProvider>
              </PushProvider>
            </MessagesProvider>
          </ListingsProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  accueil: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
  },
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
});
