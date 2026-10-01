import { Canvas, Rect, RoundedRect } from '@shopify/react-native-skia';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme, useThemedStyles } from '@/shared/theme';

import { AppText } from '../AppText';

const RADIUS = 4;
const BAR_GAP = 2;

// Vertical bars on one baseline. Tapping a month selects it and prints its value above the
// plot; without a selection the latest month is labelled so the chart always reads.
export function MonthlyBarChart({ data, height = 160, formatValue, formatLabel, a11yLabel }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState(null);

  const max = Math.max(1, ...data.map((d) => d.amount));
  const slot = data.length > 0 ? width / data.length : 0;
  const barWidth = Math.max(4, Math.min(28, slot * 0.56));
  const active = selected ?? data.length - 1;

  return (
    <View>
      <AppText variant="caption" color="textMuted" style={styles.readout}>
        {data[active]
          ? `${formatLabel(data[active].month)} · ${formatValue(data[active].amount)}`
          : ''}
      </AppText>
      <View style={{ height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 ? (
          <Canvas style={StyleSheet.absoluteFill}>
            {data.map((d, i) => {
              const barHeight = d.amount === 0 ? 0 : Math.max(2, (d.amount / max) * (height - 8));
              const x = i * slot + (slot - barWidth) / 2;
              const y = height - barHeight;
              if (barHeight === 0) return null;
              return (
                <Bar key={d.month} x={x} y={y} w={barWidth} h={barHeight} color={colors.primary} />
              );
            })}
            <Rect x={0} y={height - 1} width={width} height={1} color={colors.borderStrong} />
          </Canvas>
        ) : null}
        <View style={styles.hitRow}>
          {data.map((d, i) => (
            <Pressable
              key={d.month}
              style={styles.hit}
              onPress={() => setSelected(i)}
              accessibilityRole="button"
              accessibilityState={{ selected: i === active }}
              accessibilityLabel={a11yLabel(d)}
            />
          ))}
        </View>
      </View>
      <View style={styles.axis}>
        {data.map((d, i) => (
          <AppText
            key={d.month}
            variant="caption"
            color={i === active ? 'text' : 'textMuted'}
            style={styles.axisLabel}
            importantForAccessibility="no"
          >
            {formatLabel(d.month)}
          </AppText>
        ))}
      </View>
    </View>
  );
}

// Rounded top, square foot: a plain rect over the base of the rounded one keeps the bar flat on
// the axis. Bars stay one hue (a lighter tint would drop below 3:1 on the background), so the
// selection is carried by the readout and the axis label instead.
function Bar({ x, y, w, h, color }) {
  const r = Math.min(RADIUS, w / 2, h);
  return (
    <>
      <RoundedRect x={x + BAR_GAP / 2} y={y} width={w - BAR_GAP} height={h} r={r} color={color} />
      <Rect x={x + BAR_GAP / 2} y={y + h - r} width={w - BAR_GAP} height={r} color={color} />
    </>
  );
}

const createStyles = ({ spacing }) =>
  StyleSheet.create({
    readout: { marginBottom: spacing.sm, fontVariant: ['tabular-nums'] },
    hitRow: { ...StyleSheet.absoluteFillObject, flexDirection: 'row' },
    hit: { flex: 1 },
    axis: { flexDirection: 'row', marginTop: spacing.xs },
    axisLabel: { flex: 1, textAlign: 'center' },
  });
