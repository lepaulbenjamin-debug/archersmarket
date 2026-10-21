import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { colors } from '@/theme';
import { useDesktopWeb } from '@/utils/site';
import { useMessages } from '@/store/MessagesContext';

export default function TabsLayout() {
  const { unreadCount } = useMessages();
  // Sur écran d'ordinateur, la navigation est en haut (SiteHeader) : une barre
  // d'onglets collée au bas d'un écran de 27 pouces ne se trouve pas.
  const bureau = useDesktopWeb();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: bureau ? { display: 'none' } : {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: Platform.OS === 'ios' ? 86 : 62,
          paddingTop: 6,
          paddingBottom: Platform.OS === 'ios' ? 28 : 8,
        },
        // Police compacte : « Rechercher » doit tenir sans être tronqué.
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600', letterSpacing: -0.2 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Rechercher',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="magnify" size={size} color={color} />
          ),
        }}
      />
      {/* Le fil filtré sur une catégorie, à sa propre adresse. Pas d'onglet à
          lui : c'est l'onglet Rechercher, vu par une autre porte. */}
      <Tabs.Screen name="categorie/[slug]" options={{ href: null }} />
      <Tabs.Screen
        name="favorites"
        options={{
          title: 'Favoris',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="heart-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="sell"
        options={{
          title: 'Publier',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="plus-box" size={size + 4} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarIcon: ({ color, size }) => (
            <View>
              <MaterialCommunityIcons name="message-outline" size={size} color={color} />
              {unreadCount > 0 ? <View style={styles.badge} /> : null}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Compte',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account-circle-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -1,
    right: -2,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
});
