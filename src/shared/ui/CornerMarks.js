import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/shared/theme';

const POSITIONS = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'];

function Mark({ position, size, color }) {
  const half = size / 2;
  const place = {
    topLeft: { top: -half, left: -half },
    topRight: { top: -half, right: -half },
    bottomLeft: { bottom: -half, left: -half },
    bottomRight: { bottom: -half, right: -half },
  }[position];

  return (
    <View pointerEvents="none" style={[styles.mark, { width: size, height: size }, place]}>
      <View style={[styles.horizontal, { backgroundColor: color, top: half - 0.5 }]} />
      <View style={[styles.vertical, { backgroundColor: color, left: half - 0.5 }]} />
    </View>
  );
}

export function CornerMarks({ size = 9, color = 'cornerMark', only = POSITIONS }) {
  const { colors } = useTheme();
  const resolved = colors[color] ?? color;
  return only.map((position) => (
    <Mark key={position} position={position} size={size} color={resolved} />
  ));
}

const styles = StyleSheet.create({
  mark: { position: 'absolute', zIndex: 1 },
  horizontal: { position: 'absolute', left: 0, right: 0, height: 1 },
  vertical: { position: 'absolute', top: 0, bottom: 0, width: 1 },
});
