import { useTranslation } from 'react-i18next';
import { Image, StyleSheet, View } from 'react-native';

import { readableTextOn } from '@/shared/lib/color';
import { initialOf } from '@/shared/lib/text';
import { useTheme, useThemedStyles } from '@/shared/theme';

import { AppText } from './AppText';

export function Avatar({ name, color, image, size = 'md', accessibilityLabel, style }) {
  const { avatarColors, avatarInk, avatarSize, fontFamily } = useTheme();
  const { i18n } = useTranslation();
  const bg = color ?? avatarColors[3];
  const { box, fontSize, lineHeight } = avatarSize[size];
  const labelled = Boolean(accessibilityLabel);

  return (
    <View
      accessible={labelled}
      accessibilityRole={labelled ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
      importantForAccessibility={labelled ? 'yes' : 'no-hide-descendants'}
      style={[styles.box, { width: box, height: box, backgroundColor: bg }, style]}
    >
      {image ? (
        <Image source={{ uri: image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <AppText
          style={{
            fontFamily: fontFamily.display,
            fontSize,
            lineHeight,
            color: readableTextOn(bg, { dark: avatarInk.onLight, light: avatarInk.onDark }),
          }}
        >
          {initialOf(name, i18n.language)}
        </AppText>
      )}
    </View>
  );
}

export function AvatarGroup({ members, size = 'xs', max = 6, style }) {
  const { t } = useTranslation();
  const { avatarSize } = useTheme();
  const themed = useThemedStyles(createStyles);
  const visible = members.slice(0, max);
  const hidden = members.length - visible.length;
  const { box, fontSize, lineHeight } = avatarSize[size];
  const names = members.map((m) => m.label ?? m.name).join(', ');

  return (
    <View
      style={[themed.group, style]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={t('avatarGroup.label', { count: members.length, names })}
    >
      {visible.map((member) => (
        <Avatar
          key={member.id}
          name={member.name}
          color={member.avatarColor}
          image={member.avatarPath}
          size={size}
        />
      ))}
      {hidden > 0 ? (
        <View style={[themed.overflow, { minWidth: box, height: box }]}>
          <AppText color="textMuted" style={[themed.overflowText, { fontSize, lineHeight }]}>
            +{hidden}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});

const createStyles = ({ colors, spacing, borderWidth, fontFamily }) =>
  StyleSheet.create({
    group: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
    overflow: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xxs,
      borderWidth: borderWidth.hairline,
      borderColor: colors.borderStrong,
    },
    overflowText: { fontFamily: fontFamily.display },
  });
