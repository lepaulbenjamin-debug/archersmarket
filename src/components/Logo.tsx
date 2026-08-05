import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';

import { colors } from '@/theme';

interface MarkProps {
  size?: number;
  /** Couleur des flèches, ailes et poignée de main. */
  metal?: string;
  /** Couleur du bouclier. */
  shield?: string;
  /** Intérieur du bouclier : doit correspondre au fond sur lequel il est posé. */
  fill?: string;
}

/**
 * Emblème Archers Market : bouclier, flèches croisées, ailes déployées et
 * poignée de main. Vectoriel pour rester net à toutes les tailles.
 */
export function LogoMark({
  size = 40,
  metal = colors.grey,
  shield = colors.primary,
  fill = colors.surface,
}: MarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200">
      {/* Flèches croisées, derrière le bouclier */}
      <G stroke={metal} strokeWidth={6} strokeLinecap="round">
        <Path d="M40 40 L160 160" />
        <Path d="M160 40 L40 160" />
      </G>
      <G fill={metal}>
        {/* Pointes */}
        <Path d="M24 24 L52 33 L33 52 Z" />
        <Path d="M176 24 L167 52 L148 33 Z" />
        <Path d="M24 176 L33 148 L52 167 Z" />
        <Path d="M176 176 L148 167 L167 148 Z" />
        {/* Empennages */}
        <Path d="M44 62 L62 44 L70 52 L52 70 Z" />
        <Path d="M156 62 L138 44 L130 52 L148 70 Z" />
        <Path d="M44 138 L62 156 L70 148 L52 130 Z" />
        <Path d="M156 138 L138 156 L130 148 L148 130 Z" />
      </G>

      {/* Bouclier */}
      <Path
        d="M58 60 h84 v42 c0 30 -20 48 -42 60 c-22 -12 -42 -30 -42 -60 z"
        fill={fill}
        stroke={shield}
        strokeWidth={12}
        strokeLinejoin="round"
      />

      {/* Ailes déployées */}
      <G fill={metal}>
        <Path d="M6 86 L64 100 L12 102 Z" />
        <Path d="M14 108 L64 110 L28 121 Z" />
        <Path d="M194 86 L136 100 L188 102 Z" />
        <Path d="M186 108 L136 110 L172 121 Z" />
      </G>

      {/* Poignée de main */}
      <G stroke={metal} strokeWidth={13} strokeLinecap="round">
        <Path d="M66 116 L100 103" />
        <Path d="M134 106 L100 119" />
      </G>
      <Path d="M90 94 L110 101 L101 111 L86 103 Z" fill={metal} />
      <Path d="M88 108 L116 108" stroke={fill} strokeWidth={3} strokeLinecap="round" />
    </Svg>
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
  layout = 'row',
  tagline,
  metal,
  shield,
  fill,
  textColor = colors.text,
  taglineColor = colors.textMuted,
  wordSize = 18,
}: LogoProps) {
  return (
    <View style={layout === 'row' ? styles.row : styles.stacked}>
      <LogoMark size={size} metal={metal} shield={shield} fill={fill} />
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stacked: { alignItems: 'center', gap: 6 },
  rowText: { justifyContent: 'center' },
  stackedText: { alignItems: 'center', gap: 2 },
  word: { fontWeight: '800', letterSpacing: 1.6 },
  tagline: { fontSize: 11.5, letterSpacing: 0.2 },
});
