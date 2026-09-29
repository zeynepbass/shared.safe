import { Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { upper } from '@/shared/lib/text';
import { uppercaseVariants, useTheme } from '@/shared/theme';

function mapChildren(children, fn) {
  if (typeof children === 'string') return fn(children);
  if (Array.isArray(children)) return children.map((c) => (typeof c === 'string' ? fn(c) : c));
  return children;
}

export function AppText({
  variant = 'body',
  color = 'text',
  align,
  uppercase,
  tabular,
  style,
  children,
  ...rest
}) {
  const { colors, typography } = useTheme();
  const { i18n } = useTranslation();
  const shouldUpper = uppercase ?? uppercaseVariants.includes(variant);
  const content = shouldUpper ? mapChildren(children, (s) => upper(s, i18n.language)) : children;

  return (
    <Text
      {...rest}
      style={[
        typography[variant],
        { color: colors[color] ?? color },
        align && { textAlign: align },
        tabular && { fontVariant: ['tabular-nums'] },
        style,
      ]}
    >
      {content}
    </Text>
  );
}
