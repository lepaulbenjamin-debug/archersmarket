/**
 * Design tokens d'Archers Market.
 * Charte historique : orange de marque + gris anthracite, fond clair.
 */

export const colors = {
  // Fonds
  background: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceAlt: '#F4F4F5',

  // Marque
  primary: '#F5843C',
  primaryDark: '#DF6F27',
  primarySoft: '#FDEEE3',

  dark: '#1B1B1D',
  darkSoft: '#2C2C2F',
  grey: '#58585A',

  // Texte
  text: '#1B1B1D',
  textMuted: '#5F5F63',
  textFaint: '#909095',
  onPrimary: '#FFFFFF',
  onDark: '#F7F7F8',

  // Utilitaires
  border: '#E4E4E7',
  borderStrong: '#CFCFD4',
  success: '#2E8B57',
  successSoft: '#E3F2EA',
  warning: '#C98A1E',
  danger: '#D2483C',
  dangerSoft: '#FBE9E7',
  overlay: 'rgba(27, 27, 29, 0.55)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 26,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 28, fontWeight: '800' as const, letterSpacing: -0.6 },
  title: { fontSize: 21, fontWeight: '700' as const, letterSpacing: -0.3 },
  section: { fontSize: 16, fontWeight: '700' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  bodyStrong: { fontSize: 15, fontWeight: '600' as const },
  small: { fontSize: 13, fontWeight: '400' as const },
  caption: { fontSize: 11.5, fontWeight: '600' as const, letterSpacing: 0.4 },
} as const;

export const shadow = {
  card: {
    shadowColor: '#1B1B1D',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  floating: {
    shadowColor: '#1B1B1D',
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
} as const;
