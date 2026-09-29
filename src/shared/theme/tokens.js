export const palette = {
  light: {
    bg: '#F2F2F3',
    surface: '#E9E9EA',
    surfaceMuted: '#EBEBEC',
    border: '#E1E0E1',
    borderStrong: '#CFD0D1',
    divider: '#EBEBEC',
    text: '#1D1F20',
    textMuted: '#878889',
    textSubtle: '#A5A6A7',
    textOnPrimary: '#FFFFFF',
    primary: '#5980A6',
    primaryDisabled: '#ADBFD0',
    primarySoft: '#EEF6FF',
    danger: '#BA3F39',
    dangerSoft: '#FBE9E8',
    success: '#227C45',
    successSoft: '#E4F2E9',
    toast: '#1D1F20',
    textOnToast: '#F2F2F3',
    skeleton: '#E4E4E5',
    cornerMark: '#9D9E9F',
    grid: '#E1E0E1',
  },
  dark: {
    bg: '#131517',
    surface: '#1B1E21',
    surfaceMuted: '#191B1D',
    border: '#26282B',
    borderStrong: '#333739',
    divider: '#1E1F21',
    text: '#E4E6E8',
    textMuted: '#7D7F81',
    textSubtle: '#5E6062',
    textOnPrimary: '#131517',
    primary: '#80A6CB',
    primaryDisabled: '#4F6377',
    primarySoft: '#1C2631',
    danger: '#F58C81',
    dangerSoft: '#3A2220',
    success: '#78CD90',
    successSoft: '#1D3325',
    toast: '#E4E6E8',
    textOnToast: '#131517',
    skeleton: '#1E2123',
    cornerMark: '#5E6062',
    grid: '#1E1F21',
  },
};

export const avatarColors = ['#B5D9FD', '#94BCE3', '#749DC4', '#597EA3', '#416180', '#2C455D'];

export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
};

export const layout = {
  gutter: 20,
  buttonHeight: 56,
  inputHeight: 48,
  rowHeight: 64,
  headerHeight: 52,
  iconBox: 36,
  hitSlop: 8,
};

export const radius = {
  none: 0,
  xs: 2,
};

export const borderWidth = {
  hairline: 1,
  thick: 2,
};

export const fontFamily = {
  display: 'BarlowCondensed_700Bold',
  displaySemi: 'BarlowCondensed_600SemiBold',
  body: 'Barlow_400Regular',
  bodyMedium: 'Barlow_500Medium',
  bodySemi: 'Barlow_600SemiBold',
  mono: 'JetBrainsMono_400Regular',
  monoMedium: 'JetBrainsMono_500Medium',
};

export const typography = {
  amountXl: { fontFamily: fontFamily.display, fontSize: 48, lineHeight: 52 },
  amountLg: { fontFamily: fontFamily.display, fontSize: 40, lineHeight: 44 },
  title: { fontFamily: fontFamily.display, fontSize: 34, lineHeight: 38 },
  heading: { fontFamily: fontFamily.display, fontSize: 28, lineHeight: 32 },
  headerTitle: { fontFamily: fontFamily.display, fontSize: 18, lineHeight: 22 },
  amount: { fontFamily: fontFamily.display, fontSize: 17, lineHeight: 22 },
  bodyLg: { fontFamily: fontFamily.bodyMedium, fontSize: 17, lineHeight: 22 },
  body: { fontFamily: fontFamily.body, fontSize: 15, lineHeight: 21 },
  bodyStrong: { fontFamily: fontFamily.bodySemi, fontSize: 15, lineHeight: 21 },
  caption: { fontFamily: fontFamily.body, fontSize: 13, lineHeight: 17 },
  button: { fontFamily: fontFamily.displaySemi, fontSize: 17, lineHeight: 22 },
  overline: {
    fontFamily: fontFamily.displaySemi,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.6,
  },
  mono: {
    fontFamily: fontFamily.mono,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.2,
  },
  keypad: { fontFamily: fontFamily.bodyMedium, fontSize: 26, lineHeight: 32 },
};

export const uppercaseVariants = ['overline', 'mono'];
