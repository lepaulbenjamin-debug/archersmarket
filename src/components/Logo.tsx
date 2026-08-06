import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme';

/** Emblème officiel, détouré depuis assets/icon.png. */
const EMBLEM = {
  light: require('../../assets/brand/emblem-light.png'),
  dark: require('../../assets/brand/emblem-dark.png'),
};

/** Rapport largeur/hauteur du dessin (ailes déployées). */
const RATIO = 735 / 573;

/** 'light' : métal gris, pour les fonds clairs. 'dark' : métal blanc, pour les fonds sombres. */
export type LogoTone = 'light' | 'dark';

interface MarkProps {
  /** Hauteur de l'emblème ; la largeur suit le rapport d'origine. */
  size?: number;
  tone?: LogoTone;
}

export function LogoMark({ size = 40, tone = 'light' }: MarkProps) {
  return (
    <Image
      source={EMBLEM[tone]}
      style={{ width: size * RATIO, height: size }}
      contentFit="contain"
      accessibilityLabel="Archers Market"
    />
  );
}

interface LogoProps extends MarkProps {
  /** 'row' : emblème et nom côte à côte. 'stacked' : nom sous l'emblème. */
  layout?: 'row' | 'stacked';
  tagline?: boolean;
  textColor?: string;
  taglineColor?: string;
  wordSize?: number;
}

export function Logo({
  size = 40,
  tone = 'light',
  layout = 'row',
  tagline,
  textColor = colors.text,
  taglineColor = colors.textMuted,
  wordSize = 18,
}: LogoProps) {
  return (
    <View style={layout === 'row' ? styles.row : styles.stacked}>
      <LogoMark size={size} tone={tone} />
      <View style={layout === 'row' ? styles.rowText : styles.stackedText}>
        <Text style={[styles.word, { fontSize: wordSize, color: textColor }]}>ARCHERSMARKET</Text>
        {tagline ? (
          <Text style={[styles.tagline, { color: taglineColor }]}>
            Le marché d’occasion entre archers
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stacked: { alignItems: 'center', gap: 8 },
  rowText: { justifyContent: 'center' },
  stackedText: { alignItems: 'center', gap: 2 },
  word: { fontWeight: '800', letterSpacing: 1.6 },
  tagline: { fontSize: 11.5, letterSpacing: 0.2 },
});
