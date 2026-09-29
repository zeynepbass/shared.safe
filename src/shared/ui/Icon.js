import { useTheme } from '@/shared/theme';

export function Icon({
  icon: IconComponent,
  size = 20,
  color = 'text',
  strokeWidth = 1.75,
  style,
}) {
  const { colors } = useTheme();
  return (
    <IconComponent
      size={size}
      color={colors[color] ?? color}
      strokeWidth={strokeWidth}
      style={style}
    />
  );
}
