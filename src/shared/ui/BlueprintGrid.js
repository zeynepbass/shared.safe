import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import { useTheme, useThemedStyles } from '@/shared/theme';

import { AppText } from './AppText';
import { CornerMarks } from './CornerMarks';

function GridLines({ width, height, cell, color }) {
  const lines = [];
  for (let x = cell; x < width; x += cell) {
    lines.push(
      <Line key={`v${x}`} x1={x} y1={0} x2={x} y2={height} stroke={color} strokeWidth={1} />,
    );
  }
  for (let y = cell; y < height; y += cell) {
    lines.push(
      <Line key={`h${y}`} x1={0} y1={y} x2={width} y2={y} stroke={color} strokeWidth={1} />,
    );
  }
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
      {lines}
    </Svg>
  );
}

export function BlueprintGrid({
  cell = 16,
  label,
  caption,
  corners = true,
  bordered = true,
  style,
  children,
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [size, setSize] = useState({ width: 0, height: 0 });

  return (
    <View
      style={[styles.frame, bordered && styles.bordered, style]}
      onLayout={(e) => setSize(e.nativeEvent.layout)}
    >
      {size.width > 0 ? (
        <GridLines width={size.width} height={size.height} cell={cell} color={colors.grid} />
      ) : null}
      {corners ? <CornerMarks /> : null}
      {label ? (
        <AppText variant="mono" color="textMuted" style={styles.label}>
          {label}
        </AppText>
      ) : null}
      <View style={styles.center}>{children}</View>
      {caption ? (
        <AppText variant="mono" color="textMuted" style={styles.caption}>
          {caption}
        </AppText>
      ) : null}
    </View>
  );
}

export function FigureBox({ size = 88, children }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={[styles.figure, { width: size, height: size }]}>
      <CornerMarks />
      {children}
    </View>
  );
}

const createStyles = ({ colors, spacing, borderWidth }) =>
  StyleSheet.create({
    frame: { overflow: 'visible', justifyContent: 'center', alignItems: 'center' },
    bordered: { borderWidth: borderWidth.hairline, borderColor: colors.border },
    center: { alignItems: 'center', justifyContent: 'center' },
    label: { position: 'absolute', top: spacing.md, left: spacing.md },
    caption: { position: 'absolute', bottom: spacing.md, right: spacing.md },
    figure: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bg,
      borderWidth: borderWidth.hairline,
      borderColor: colors.border,
    },
  });
