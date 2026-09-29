import { StyleSheet, View } from 'react-native';

import { useThemedStyles } from '@/shared/theme';

export function BalanceBar({ value, max }) {
  const styles = useThemedStyles(createStyles);
  const ratio = max > 0 ? Math.min(Math.abs(value) / max, 1) : 0;
  const width = `${ratio * 50}%`;

  return (
    <View style={styles.track} accessible={false}>
      <View style={styles.center} />
      {value !== 0 ? (
        <View
          style={[
            styles.fill,
            value > 0 ? styles.positive : styles.negative,
            value > 0 ? { left: '50%', width } : { right: '50%', width },
          ]}
        />
      ) : null}
    </View>
  );
}

const createStyles = ({ colors }) =>
  StyleSheet.create({
    track: { height: 4, backgroundColor: colors.surface, justifyContent: 'center' },
    center: {
      position: 'absolute',
      left: '50%',
      width: 1,
      height: 8,
      backgroundColor: colors.borderStrong,
    },
    fill: { position: 'absolute', top: 0, bottom: 0 },
    positive: { backgroundColor: colors.success },
    negative: { backgroundColor: colors.danger },
  });
