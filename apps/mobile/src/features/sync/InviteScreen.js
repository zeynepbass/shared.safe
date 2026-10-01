import { useLocalSearchParams } from 'expo-router';
import { Share2, ShieldCheck } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Share, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { createInvite, getGroup, useDbQuery } from '@/shared/db';
import { useTheme, useThemedStyles } from '@/shared/theme';
import { AppText, BottomBar, Button, Card, Header, InfoBox, Screen } from '@/shared/ui';

function loadInvite(db, groupId) {
  const group = getGroup(db, groupId);
  return group ? { group, link: createInvite(db, groupId) } : null;
}

export default function InviteScreen() {
  const { groupId } = useLocalSearchParams();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { data } = useDbQuery(
    (db) => loadInvite(db, groupId),
    [groupId],
    ['groups', 'sync_groups'],
  );

  const header = <Header title={t('invite.header')} subtitle={data?.group.name} leading="close" />;
  if (!data) return <Screen header={header} />;

  const share = () =>
    Share.share({ message: t('invite.shareMessage', { link: data.link }) }).catch((error) =>
      console.warn('Invite could not be shared', error),
    );

  return (
    <Screen
      header={header}
      footer={
        <BottomBar>
          <Button title={t('invite.share')} icon={Share2} onPress={share} />
        </BottomBar>
      }
    >
      <View style={styles.content}>
        <AppText variant="heading">{t('invite.title')}</AppText>
        <Card corners style={styles.qrCard}>
          <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={t('invite.qrLabel', { name: data.group.name })}
          >
            <QRCode
              value={data.link}
              size={220}
              color={colors.text}
              backgroundColor={colors.surface}
            />
          </View>
        </Card>
        <AppText variant="caption" color="textMuted" selectable>
          {data.link}
        </AppText>
        <InfoBox icon={ShieldCheck}>{t('invite.body')}</InfoBox>
      </View>
    </Screen>
  );
}

const createStyles = ({ spacing }) =>
  StyleSheet.create({
    content: { gap: spacing.xl, paddingTop: spacing.md },
    qrCard: { alignItems: 'center', paddingVertical: spacing.xl },
  });
