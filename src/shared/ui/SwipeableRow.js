import { Trash2 } from 'lucide-react-native';
import { useRef } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import { useThemedStyles } from '@/shared/theme';

import { AppText } from './AppText';
import { Icon } from './Icon';

// Swipe left to reveal a destructive action. The row inside should also offer it through
// `accessibilityActions`, since screen reader users cannot perform the swipe.
export function SwipeableRow({ children, onDelete, deleteLabel }) {
  const styles = useThemedStyles(createStyles);
  const ref = useRef(null);

  const remove = () => {
    ref.current?.close();
    onDelete();
  };

  return (
    <ReanimatedSwipeable
      ref={ref}
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      renderRightActions={() => (
        <Pressable
          onPress={remove}
          accessibilityRole="button"
          accessibilityLabel={deleteLabel}
          style={styles.action}
        >
          <Icon icon={Trash2} size={18} color="textOnPrimary" />
          <AppText variant="caption" color="textOnPrimary">
            {deleteLabel}
          </AppText>
        </Pressable>
      )}
      containerStyle={styles.container}
      childrenContainerStyle={styles.container}
    >
      {children}
    </ReanimatedSwipeable>
  );
}

const createStyles = ({ colors, spacing }) =>
  StyleSheet.create({
    container: { backgroundColor: colors.bg },
    action: {
      width: 88,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xxs,
      backgroundColor: colors.danger,
    },
  });
