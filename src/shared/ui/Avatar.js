import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { readableTextOn } from '@/shared/lib/color';
import { initialOf } from '@/shared/lib/text';
import { useTheme } from '@/shared/theme';

import { AppText } from './AppText';

const SIZES = {
  xs: { box: 18, font: 9 },
  sm: { box: 24, font: 11 },
  md: { box: 32, font: 14 },
  lg: { box: 96, font: 40 },
};

export function Avatar({ name, color, size = 'md', style }) {
  const { avatarColors, fontFamily } = useTheme();
  const { i18n } = useTranslation();
  const bg = color ?? avatarColors[3];
  const { box, font } = SIZES[size];

  return (
    <View
      accessible={false}
      style={[styles.box, { width: box, height: box, backgroundColor: bg }, style]}
    >
      <AppText
        style={{
          fontFamily: fontFamily.display,
          fontSize: font,
          lineHeight: font * 1.15,
          color: readableTextOn(bg),
        }}
      >
        {initialOf(name, i18n.language)}
      </AppText>
    </View>
  );
}

export function AvatarStack({ members, size = 'xs', max = 6 }) {
  const visible = members.slice(0, max);
  return (
    <View style={styles.stack}>
      {visible.map((member) => (
        <Avatar key={member.id} name={member.name} color={member.color} size={size} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center' },
  stack: { flexDirection: 'row', gap: 2 },
});
