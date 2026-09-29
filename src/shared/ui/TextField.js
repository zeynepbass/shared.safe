import { forwardRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { useTheme, useThemedStyles } from '@/shared/theme';

import { AppText } from './AppText';

export const TextField = forwardRef(function TextField(
  { label, prefix, error, align = 'left', size = 'md', style, inputStyle, ...inputProps },
  ref,
) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.wrapper, style]}>
      {label ? (
        <AppText variant="caption" color="textMuted">
          {label}
        </AppText>
      ) : null}
      <View
        style={[
          styles.field,
          size === 'lg' && styles.fieldLg,
          focused && styles.focused,
          error && styles.error,
        ]}
      >
        {prefix ? (
          <AppText variant="caption" color="textMuted">
            {prefix}
          </AppText>
        ) : null}
        <TextInput
          ref={ref}
          placeholderTextColor={colors.textSubtle}
          selectionColor={colors.primary}
          accessibilityLabel={inputProps.accessibilityLabel ?? label}
          {...inputProps}
          onFocus={(e) => {
            setFocused(true);
            inputProps.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            inputProps.onBlur?.(e);
          }}
          style={[
            styles.input,
            align === 'right' && styles.inputRight,
            size === 'lg' && styles.inputLg,
            inputStyle,
          ]}
        />
      </View>
      {error ? (
        <AppText variant="caption" color="danger">
          {error}
        </AppText>
      ) : null}
    </View>
  );
});

const createStyles = ({ colors, spacing, layout, typography, borderWidth }) =>
  StyleSheet.create({
    wrapper: { gap: spacing.sm },
    field: {
      minHeight: layout.inputHeight,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      backgroundColor: colors.surface,
      borderWidth: borderWidth.hairline,
      borderColor: colors.border,
    },
    fieldLg: { minHeight: 52 },
    focused: { borderColor: colors.primary },
    error: { borderColor: colors.danger },
    input: {
      ...typography.body,
      flex: 1,
      color: colors.text,
      paddingVertical: spacing.sm,
    },
    inputRight: { textAlign: 'right', ...typography.amount },
    inputLg: { ...typography.bodyLg },
  });
