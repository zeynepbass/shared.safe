import { router, useIsFocused } from 'expo-router';
import { CameraOff, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, AppState, Linking, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Polygon } from 'react-native-svg';
import {
  Camera,
  CommonResolutions,
  useCameraDevice,
  useCameraPermission,
  usePhotoOutput,
} from 'react-native-vision-camera';

import { detectReceiptEdges } from '../../../modules/receipt-ocr';

import { deleteImage } from '@/shared/lib/images';
import { reportError } from '@/shared/monitoring';
import { useThemedStyles } from '@/shared/theme';
import { AppText, Button, EmptyState, IconButton, useSnackbar } from '@/shared/ui';

import { attachReceipt, fillDraftFromReceipt, saveReceiptImage } from './receipts';

// Text and marks over the camera picture: white on a dark scrim, whatever the theme and
// whatever the camera is pointed at.
const CAMERA_INK = '#FFFFFF';
const CAMERA_SCRIM = 'rgba(0, 0, 0, 0.6)';
// How often the picture is looked at for the outline of a receipt, and at what width.
const LOOK_EVERY_MS = 900;
const LOOK_WIDTH = 360;
const SHUTTER = 72;

function useAppActive() {
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (s) => setActive(s === 'active'));
    return () => subscription.remove();
  }, []);
  return active;
}

// Follows the outline of the receipt in the camera's picture. Every so often the preview is
// photographed at a small size and handed to the recogniser; the corners it finds are in
// fractions of that picture, which is exactly what is on screen. Returns null while no receipt
// stands out, and stays null on a device whose preview cannot be photographed.
function useReceiptEdges(cameraRef, enabled) {
  const [edges, setEdges] = useState(null);

  useEffect(() => {
    if (!enabled) return undefined;
    let stopped = false;
    let looking = false;

    const look = async () => {
      if (looking || stopped) return;
      looking = true;
      let path = null;
      try {
        const snapshot = await cameraRef.current.takeSnapshot();
        const small = await snapshot.resizeAsync(
          LOOK_WIDTH,
          Math.round((snapshot.height * LOOK_WIDTH) / snapshot.width),
        );
        path = await small.saveToTemporaryFileAsync('jpg', 60);
        small.dispose();
        snapshot.dispose();
        const found = await detectReceiptEdges(path);
        if (!stopped) setEdges(found ?? null);
      } catch (error) {
        // The plain frame stays; taking the photo does not depend on this.
        console.warn('Receipt outline is not available', error?.message ?? error);
        stopped = true;
      } finally {
        if (path) deleteImage(`file://${path}`);
        looking = false;
      }
    };

    const timer = setInterval(look, LOOK_EVERY_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
      setEdges(null);
    };
  }, [cameraRef, enabled]);

  return edges;
}

// Takes a photo of a receipt, reads it on the device and fills the expense form with what it
// found; the photo becomes the expense's receipt. The form stays open underneath, so going back
// returns to it with the fields filled in and still editable.
export default function ScanReceiptScreen() {
  const { t, i18n } = useTranslation();
  const styles = useThemedStyles(createStyles);
  const snackbar = useSnackbar();
  const device = useCameraDevice('back');
  const { hasPermission, canRequestPermission, requestPermission } = useCameraPermission();
  const focused = useIsFocused();
  const appActive = useAppActive();
  const cameraRef = useRef(null);
  const photoOutput = usePhotoOutput({
    targetResolution: CommonResolutions.FHD_4_3,
    containerFormat: 'jpeg',
    qualityPrioritization: 'quality',
  });
  const [previewing, setPreviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [size, setSize] = useState(null);
  const active = focused && appActive;
  const edges = useReceiptEdges(cameraRef, active && previewing && !busy);

  useEffect(() => {
    if (!hasPermission && canRequestPermission) requestPermission();
  }, [hasPermission, canRequestPermission, requestPermission]);

  const capture = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const photo = await photoOutput.capturePhoto({ flashMode: 'off' }, {});
      const image = await photo.toImageAsync();
      const uri = await saveReceiptImage(image);
      image.dispose();
      photo.dispose();
      attachReceipt(uri);
      const found = await fillDraftFromReceipt(uri, { locale: i18n.language, mode: 'replace' });
      snackbar.show({
        message: found.length
          ? t('expenseForm.receiptRead', {
              fields: found.map((field) => t(`expenseForm.receiptFields.${field}`)).join(', '),
            })
          : t('expenseForm.receiptUnread'),
      });
      router.back();
    } catch (error) {
      reportError(error, 'receipt-scan');
      snackbar.show({ message: t('receiptScan.failed') });
      setBusy(false);
    }
  };

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
          description={device ? t('receiptScan.permissionBody') : t('receiptScan.noCameraBody')}
        >
          {device && !canRequestPermission ? (
            <Button
              title={t('scan.openSettings')}
              variant="secondary"
              fullWidth={false}
              onPress={() => Linking.openSettings()}
            />
          ) : null}
        </EmptyState>
      </SafeAreaView>
    );
  }

  const outline =
    edges && size ? edges.map((p) => `${p.x * size.width},${p.y * size.height}`).join(' ') : null;

  return (
    <View style={styles.root}>
      <View
        style={styles.picture}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setSize({ width, height });
        }}
      >
        <Camera
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={active}
          outputs={[photoOutput]}
          enableNativeTapToFocusGesture
          onPreviewStarted={() => setPreviewing(true)}
          onPreviewStopped={() => setPreviewing(false)}
          onError={(error) => console.warn('Camera error', error?.message ?? error)}
        />
        {outline ? (
          <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
            <Polygon
              points={outline}
              fill="rgba(255, 255, 255, 0.14)"
              stroke={CAMERA_INK}
              strokeWidth={3}
              strokeLinejoin="round"
            />
          </Svg>
        ) : (
          <View style={styles.guideWrap} pointerEvents="none">
            <View style={styles.guide}>
              <View style={[styles.corner, styles.topLeft]} />
              <View style={[styles.corner, styles.topRight]} />
              <View style={[styles.corner, styles.bottomLeft]} />
              <View style={[styles.corner, styles.bottomRight]} />
            </View>
          </View>
        )}
        <SafeAreaView style={styles.overlay} edges={['top']} pointerEvents="box-none">
          <View style={styles.header}>
            <IconButton
              icon={X}
              color={CAMERA_INK}
              onPress={() => router.back()}
              accessibilityLabel={t('common.close')}
              disabled={busy}
            />
            <AppText variant="headerTitle" color={CAMERA_INK} accessibilityRole="header">
              {t('receiptScan.header')}
            </AppText>
            <View style={styles.headerSide} />
          </View>
        </SafeAreaView>
        {busy ? (
          <View style={styles.reading}>
            <ActivityIndicator color={CAMERA_INK} size="large" />
          </View>
        ) : null}
      </View>

      <SafeAreaView style={styles.controls} edges={['bottom']}>
        <AppText
          variant="bodyStrong"
          color={CAMERA_INK}
          align="center"
          accessibilityLiveRegion="polite"
        >
          {busy
            ? t('receiptScan.reading')
            : outline
              ? t('receiptScan.detected')
              : t('receiptScan.hint')}
        </AppText>
        <Pressable
          onPress={capture}
          disabled={busy || !previewing}
          accessibilityRole="button"
          accessibilityLabel={t('receiptScan.capture')}
          accessibilityState={{ disabled: busy || !previewing, busy }}
          testID="receipt-capture"
          style={({ pressed }) => [
            styles.shutter,
            (busy || !previewing) && styles.shutterDisabled,
            pressed && styles.shutterPressed,
          ]}
        >
          <View style={styles.shutterInner} />
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const createStyles = ({ colors, spacing, layout, opacity }) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: '#000000' },
    plain: { flex: 1, backgroundColor: colors.bg },
    plainHeader: { paddingHorizontal: layout.gutter - spacing.sm, minHeight: layout.headerHeight },
    picture: { flex: 1, overflow: 'hidden' },
    overlay: { ...StyleSheet.absoluteFillObject, bottom: undefined },
    header: {
      minHeight: layout.headerHeight,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: layout.gutter - spacing.sm,
      backgroundColor: CAMERA_SCRIM,
    },
    headerSide: { width: layout.iconButton },
    // A receipt is taller than it is wide; the frame suggests holding the phone upright over it.
    guideWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
    guide: { width: '70%', aspectRatio: 0.6 },
    corner: { position: 'absolute', width: 28, height: 28, borderColor: CAMERA_INK },
    topLeft: { top: 0, left: 0, borderTopWidth: 2, borderLeftWidth: 2 },
    topRight: { top: 0, right: 0, borderTopWidth: 2, borderRightWidth: 2 },
    bottomLeft: { bottom: 0, left: 0, borderBottomWidth: 2, borderLeftWidth: 2 },
    bottomRight: { bottom: 0, right: 0, borderBottomWidth: 2, borderRightWidth: 2 },
    reading: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: CAMERA_SCRIM,
    },
    controls: {
      alignItems: 'center',
      gap: spacing.lg,
      paddingHorizontal: layout.gutter,
      paddingTop: spacing.lg,
      paddingBottom: spacing.lg,
      backgroundColor: '#000000',
    },
    shutter: {
      width: SHUTTER,
      height: SHUTTER,
      borderRadius: SHUTTER / 2,
      borderWidth: 4,
      borderColor: CAMERA_INK,
      alignItems: 'center',
      justifyContent: 'center',
    },
    shutterInner: {
      width: SHUTTER - 16,
      height: SHUTTER - 16,
      borderRadius: (SHUTTER - 16) / 2,
      backgroundColor: CAMERA_INK,
    },
    shutterDisabled: { opacity: opacity.disabled },
    shutterPressed: { opacity: opacity.pressed },
  });
