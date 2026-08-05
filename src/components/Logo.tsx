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
      <G stroke={metal} strokeWidth={5} strokeLinecap="round">
        <Path d="M40 40 L160 160" />
        <Path d="M160 40 L40 160" />
      </G>
      <G fill={metal}>
        {/* Pointes */}
        <Path d="M22 22 L52 31 L31 52 Z" />
        <Path d="M178 22 L169 52 L148 31 Z" />
        <Path d="M22 178 L31 148 L52 169 Z" />
        <Path d="M178 178 L148 169 L169 148 Z" />
        {/* Empennages */}
        <Path d="M45 61 L61 45 L69 53 L53 69 Z" />
        <Path d="M155 61 L139 45 L131 53 L147 69 Z" />
        <Path d="M45 139 L61 155 L69 147 L53 131 Z" />
        <Path d="M155 139 L139 155 L131 147 L147 131 Z" />
      </G>

      {/* Bouclier */}
      <Path
        d="M58 60 h84 v42 c0 30 -20 48 -42 60 c-22 -12 -42 -30 -42 -60 z"
        fill={fill}
        stroke={shield}
        strokeWidth={12}
        strokeLinejoin="round"
      />

      {/* Ailes déployées : trois plumes par côté */}
      <G fill={metal}>
        <Path d="M68 90 L6 74 L16 90 L66 97 Z" />
        <Path d="M68 98 L10 96 L26 106 L67 104 Z" />
        <Path d="M72 120 L24 124 L46 130 L74 126 Z" />
        <Path d="M132 90 L194 74 L184 90 L134 97 Z" />
        <Path d="M132 98 L190 96 L174 106 L133 104 Z" />
        <Path d="M128 120 L176 124 L154 130 L126 126 Z" />
      </G>

      {/* Poignée de main */}
      <G stroke={metal} strokeWidth={13} strokeLinecap="round">
        <Path d="M74 116 L100 106" />
        <Path d="M126 103 L100 113" />
      </G>
      <Path d="M90 96 L108 103 L100 111 L84 104 Z" fill={metal} />
      <Path d="M88 109 L112 101" stroke={fill} strokeWidth={2.6} strokeLinecap="round" />
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
