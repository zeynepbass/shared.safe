import { router, useIsFocused } from 'expo-router';
import { CameraOff, Keyboard, X } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Linking, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { useBarcodeScannerOutput } from 'react-native-vision-camera-barcode-scanner';

import { parseInvite } from '@/shared/db/sync/invite';
import { useThemedStyles } from '@/shared/theme';
import { AppText, Button, EmptyState, IconButton } from '@/shared/ui';

const FRAME = 240;

function useAppActive() {
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (s) => setActive(s === 'active'));
    return () => subscription.remove();
  }, []);
  return active;
}

// Reads an invite QR code with the camera and hands it to the join screen. The camera only runs
// while this screen is in front and the app is active.
export default function ScanInviteScreen() {
  const { t } = useTranslation();
  const styles = useThemedStyles(createStyles);
  const device = useCameraDevice('back');
  const { hasPermission, canRequestPermission, requestPermission } = useCameraPermission();
  const focused = useIsFocused();
  const appActive = useAppActive();
  const [notInvite, setNotInvite] = useState(false);
  const handled = useRef(false);

  useEffect(() => {
    if (!hasPermission && canRequestPermission) requestPermission();
  }, [hasPermission, canRequestPermission, requestPermission]);

  const onBarcodeScanned = useCallback((barcodes) => {
    if (handled.current) return;
    const values = barcodes.map((b) => b.rawValue).filter(Boolean);
    const invite = values.find((value) => parseInvite(value));
    if (!invite) {
      if (values.length) setNotInvite(true);
      return;
    }
    handled.current = true;
    router.replace({ pathname: '/groups/join', params: { invite } });
  }, []);

  const output = useBarcodeScannerOutput({
    barcodeFormats: ['qr-code'],
    onBarcodeScanned,
    onError: (error) => console.warn('QR scanning failed', error?.message ?? error),
  });

  const typeInstead = () => router.replace('/groups/join');

  if (!hasPermission || !device) {
    return (
      <SafeAreaView style={styles.plain}>
        <View style={styles.plainHeader}>
          <IconButton
            icon={X}
            onPress={() => router.back()}
            accessibilityLabel={t('common.close')}
          />
        </View>
        <EmptyState
          icon={CameraOff}
          title={device ? t('scan.permissionTitle') : t('scan.noCameraTitle')}
          description={device ? t('scan.permissionBody') : t('scan.noCameraBody')}
        >
          {device && !canRequestPermission ? (
            <Button
              title={t('scan.openSettings')}
              variant="secondary"
              fullWidth={false}
              onPress={() => Linking.openSettings()}
            />
          ) : null}
          <Button title={t('scan.typeInstead')} variant="ghost" onPress={typeInstead} />
        </EmptyState>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.root}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={focused && appActive}
        outputs={[output]}
        onError={(error) => console.warn('Camera error', error?.message ?? error)}
      />
      <SafeAreaView style={styles.overlay} edges={['top']}>
        <View style={styles.header}>
          <IconButton
            icon={X}
            color="textOnInverse"
            onPress={() => router.back()}
            accessibilityLabel={t('common.close')}
          />
          <AppText variant="headerTitle" color="textOnInverse">
            {t('scan.header')}
          </AppText>
          <View style={styles.headerSide} />
        </View>
        <View style={styles.center}>
          <View style={styles.frame} accessible accessibilityLabel={t('scan.frameLabel')}>
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />
          </View>
          <AppText
            variant="bodyStrong"
            color="textOnInverse"
            style={styles.hint}
            accessibilityLiveRegion="polite"
          >
            {notInvite ? t('scan.notInvite') : t('scan.hint')}
          </AppText>
        </View>
      </SafeAreaView>
      <SafeAreaView style={styles.sheet} edges={['bottom']}>
        <Button
          title={t('scan.typeInstead')}
          icon={Keyboard}
          variant="secondary"
          onPress={typeInstead}
        />
      </SafeAreaView>
    </View>
  );
}

const createStyles = ({ colors, spacing, layout }) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.inverse },
    plain: { flex: 1, backgroundColor: colors.bg },
    plainHeader: { paddingHorizontal: layout.gutter - spacing.sm, minHeight: layout.headerHeight },
    overlay: { flex: 1 },
    header: {
      minHeight: layout.headerHeight,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: layout.gutter - spacing.sm,
    },
    headerSide: { width: layout.iconButton },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xl },
    frame: { width: FRAME, height: FRAME },
    corner: { position: 'absolute', width: 28, height: 28, borderColor: colors.textOnInverse },
    topLeft: { top: 0, left: 0, borderTopWidth: 2, borderLeftWidth: 2 },
    topRight: { top: 0, right: 0, borderTopWidth: 2, borderRightWidth: 2 },
    bottomLeft: { bottom: 0, left: 0, borderBottomWidth: 2, borderLeftWidth: 2 },
    bottomRight: { bottom: 0, right: 0, borderBottomWidth: 2, borderRightWidth: 2 },
    hint: { textAlign: 'center', paddingHorizontal: layout.gutter },
    sheet: {
      backgroundColor: colors.bg,
      paddingHorizontal: layout.gutter,
      paddingTop: spacing.lg,
      paddingBottom: spacing.lg,
    },
  });
