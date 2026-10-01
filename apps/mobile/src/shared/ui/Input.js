import { forwardRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { useTheme, useThemedStyles } from '@/shared/theme';

import { AppText } from './AppText';

export const Input = forwardRef(function Input(
  {
    label,
    prefix,
    suffix,
    helper,
    error,
    disabled = false,
    align = 'left',
    size = 'md',
    style,
    inputStyle,
    ...inputProps
  },
  ref,
) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [focused, setFocused] = useState(false);
  const message = error || helper;

  return (
    <View style={[styles.wrapper, disabled && styles.disabled, style]}>
      {label ? (
        <AppText variant="caption" color="textMuted" importantForAccessibility="no">
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
          <AppText variant="caption" color="textMuted" importantForAccessibility="no">
            {prefix}
          </AppText>
        ) : null}
        <TextInput
          ref={ref}
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.primary}
          cursorColor={colors.primary}
          editable={!disabled}
          accessibilityLabel={inputProps.accessibilityLabel ?? label}
          accessibilityHint={inputProps.accessibilityHint ?? message}
          accessibilityState={{ disabled }}
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
        {suffix ? (
          <AppText variant="caption" color="textMuted" importantForAccessibility="no">
            {suffix}
          </AppText>
        ) : null}
      </View>
      {message ? (
        <AppText
          variant="caption"
          color={error ? 'danger' : 'textMuted'}
          accessibilityLiveRegion={error ? 'polite' : 'none'}
        >
          {message}
        </AppText>
      ) : null}
    </View>
  );
});

const createStyles = ({ colors, spacing, layout, typography, borderWidth, radius, opacity }) =>
  StyleSheet.create({
    wrapper: { gap: spacing.sm },
    disabled: { opacity: opacity.disabled },
    field: {
      minHeight: layout.inputHeight,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      backgroundColor: colors.surface,
      borderWidth: borderWidth.hairline,
      borderColor: colors.border,
      borderRadius: radius.control,
    },
    fieldLg: { minHeight: layout.inputHeightLg },
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
