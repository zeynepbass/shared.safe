import { router } from 'expo-router';
import { ArrowRight, Receipt, WifiOff } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useThemedStyles } from '@/shared/theme';
import { AppText, BlueprintGrid, BrandBar, Button, FigureBox, Icon, PageDots } from '@/shared/ui';

const SLIDES = [
  { key: 'offline', icon: WifiOff },
  { key: 'receipt', icon: Receipt },
];

export default function WelcomeScreen() {
  const { t } = useTranslation();
  const styles = useThemedStyles(createStyles);
  const { width } = useWindowDimensions();
  const scrollRef = useRef(null);
  const [index, setIndex] = useState(0);
  const isLast = index === SLIDES.length - 1;

  const goToProfile = () => router.push('/onboarding/profile');

  const next = () => {
    if (isLast) {
      goToProfile();
      return;
    }
    scrollRef.current?.scrollTo({ x: width * (index + 1), animated: true });
    setIndex(index + 1);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <BrandBar
        trailing={
          isLast ? null : <Button variant="ghost" title={t('common.skip')} onPress={goToProfile} />
        }
      />
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        style={styles.pager}
      >
        {SLIDES.map((slide) => (
          <View
            key={slide.key}
            style={[styles.slide, { width }]}
            accessible
            accessibilityLabel={`${t(`onboarding.slides.${slide.key}.title`)}. ${t(
              `onboarding.slides.${slide.key}.body`,
            )}`}
          >
            <BlueprintGrid
              cell={18}
              label={t(`onboarding.slides.${slide.key}.figure`)}
              caption={t(`onboarding.slides.${slide.key}.caption`)}
              style={styles.figure}
            >
              <FigureBox size={96}>
                <Icon icon={slide.icon} size={36} color="primary" strokeWidth={1.5} />
              </FigureBox>
            </BlueprintGrid>
            <View style={styles.texts}>
              <AppText variant="overline" color="primary">
                {t(`onboarding.slides.${slide.key}.eyebrow`)}
              </AppText>
              <AppText variant="heading">{t(`onboarding.slides.${slide.key}.title`)}</AppText>
              <AppText variant="body" color="textMuted">
                {t(`onboarding.slides.${slide.key}.body`)}
              </AppText>
            </View>
          </View>
        ))}
      </ScrollView>
      <View style={styles.footer}>
        <PageDots count={SLIDES.length} index={index} />
        <Button
          title={isLast ? t('onboarding.start') : t('common.continue')}
          iconRight={ArrowRight}
          onPress={next}
          fullWidth={false}
          corners
          style={styles.cta}
        />
      </View>
    </SafeAreaView>
  );
}

const createStyles = ({ colors, spacing, layout }) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    pager: { flex: 1 },
    slide: { paddingHorizontal: layout.gutter, paddingTop: spacing.sm, gap: spacing.xxl },
    figure: { aspectRatio: 1, width: '100%', maxHeight: 360 },
    texts: { gap: spacing.sm },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: layout.gutter,
      paddingVertical: spacing.lg,
    },
    cta: { minWidth: 160 },
  });
