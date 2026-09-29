import { Canvas, Rect, RoundedRect } from '@shopify/react-native-skia';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme, useThemedStyles } from '@/shared/theme';

import { AppText } from '../AppText';
import { Icon } from '../Icon';

const BAR_HEIGHT = 8;
const RADIUS = 4;

// Horizontal bars, one row per category, largest first. Every row carries its own label and
// value, so identity never depends on colour and a single hue is enough.
export function CategoryBarChart({ data, formatValue, labelOf, iconOf, a11yLabel }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [width, setWidth] = useState(0);
  const max = Math.max(1, ...data.map((d) => d.amount));

  return (
    <View style={styles.list}>
      {data.map((d) => {
        const barWidth = Math.max(BAR_HEIGHT, (d.amount / max) * width);
        return (
          <View key={d.category} style={styles.row} accessible accessibilityLabel={a11yLabel(d)}>
            <View style={styles.labelRow}>
              <Icon icon={iconOf(d.category)} size={16} color="textMuted" />
              <AppText variant="body" style={styles.label} numberOfLines={1}>
                {labelOf(d.category)}
              </AppText>
              <AppText variant="bodyStrong" style={styles.value}>
                {formatValue(d.amount)}
              </AppText>
            </View>
            <View
              style={styles.track}
              onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
              importantForAccessibility="no-hide-descendants"
            >
              {width > 0 ? (
                <Canvas style={StyleSheet.absoluteFill}>
                  <Rect x={0} y={0} width={1} height={BAR_HEIGHT} color={colors.borderStrong} />
                  <RoundedRect
                    x={0}
                    y={0}
                    width={barWidth}
                    height={BAR_HEIGHT}
                    r={RADIUS}
                    color={colors.primary}
                  />
                  <Rect
                    x={0}
                    y={0}
                    width={Math.min(RADIUS, barWidth)}
                    height={BAR_HEIGHT}
                    color={colors.primary}
                  />
                </Canvas>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const createStyles = ({ spacing }) =>
  StyleSheet.create({
    list: { gap: spacing.lg },
    row: { gap: spacing.sm },
    labelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    label: { flex: 1 },
    value: { fontVariant: ['tabular-nums'] },
    track: { height: BAR_HEIGHT },
  });
