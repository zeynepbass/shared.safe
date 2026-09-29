import {
  ArrowRight,
  Home,
  Pencil,
  Plane,
  Plus,
  QrCode,
  ShoppingCart,
  Trash2,
  Undo2,
  UserPlus,
  Utensils,
  Zap,
} from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import { applyKeypadInput } from '@/shared/lib/money';
import { ThemeScope, useTheme, useThemedStyles } from '@/shared/theme';
import {
  AmountInput,
  AppText,
  Avatar,
  AvatarGroup,
  BottomSheet,
  Button,
  Card,
  Chip,
  EmptyState,
  Header,
  IconBox,
  Input,
  ListItem,
  Money,
  Numpad,
  OfflineBanner,
  OptionSheet,
  Screen,
  SegmentedControl,
  Skeleton,
  SkeletonListItem,
  Snackbar,
  SyncBadge,
  useSnackbar,
} from '@/shared/ui';

const SCHEMES = {
  both: ['light', 'dark'],
  light: ['light'],
  dark: ['dark'],
};

const MEMBERS = ['Deniz', 'Ece', 'Mert', 'Selin', 'Can', 'Ayşe', 'Kaan', 'Zeynep', 'Umut'];

const noop = () => {};

export default function ComponentGallery() {
  const [mode, setMode] = useState('both');
  const styles = useThemedStyles(createStyles);

  return (
    <Screen
      scroll={false}
      padded={false}
      header={
        <>
          <Header title="Bileşenler" subtitle="src/shared/ui" />
          <View style={styles.modeBar}>
            <ModeSwitch value={mode} onChange={setMode} />
          </View>
        </>
      }
    >
      <ScrollView>
        {SCHEMES[mode].map((scheme) => (
          <ThemeScope key={scheme} scheme={scheme}>
            <Gallery scheme={scheme} />
          </ThemeScope>
        ))}
      </ScrollView>
    </Screen>
  );
}

function ModeSwitch({ value, onChange }) {
  return (
    <SegmentedControl
      size="sm"
      value={value}
      onChange={onChange}
      accessibilityLabel="Tema"
      options={[
        { value: 'both', label: 'İkisi' },
        { value: 'light', label: 'Açık' },
        { value: 'dark', label: 'Koyu' },
      ]}
    />
  );
}

function Gallery({ scheme }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.gallery}>
      <View style={styles.schemeBar}>
        <AppText variant="overline" color="textOnInverse" accessibilityRole="header">
          {scheme === 'light' ? 'Açık tema' : 'Koyu tema'}
        </AppText>
      </View>
      <ButtonSection />
      <CardSection />
      <InputSection />
      <AmountSection />
      <AvatarSection />
      <ChipSection />
      <ListItemSection />
      <EmptyStateSection />
      <SkeletonSection />
      <SnackbarSection />
      <StatusSection />
      <SheetSection />
      <HeaderSection />
      <SegmentedSection />
    </View>
  );
}

function Section({ title, padded = true, children }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.section}>
      <AppText variant="overline" color="primary" style={styles.sectionTitle}>
        {title}
      </AppText>
      <View style={[styles.sectionBody, padded && styles.padded]}>{children}</View>
    </View>
  );
}

function Label({ children }) {
  return (
    <AppText variant="mono" color="textMuted">
      {children}
    </AppText>
  );
}

function ButtonSection() {
  const styles = useThemedStyles(createStyles);
  const variants = ['primary', 'secondary', 'ghost', 'danger'];
  return (
    <Section title="Button">
      {variants.map((variant) => (
        <View key={variant} style={styles.stack}>
          <Label>{variant}</Label>
          <View style={styles.row}>
            <Button
              variant={variant}
              size="md"
              fullWidth={false}
              title="Varsayılan"
              onPress={noop}
            />
            <Button
              variant={variant}
              size="md"
              fullWidth={false}
              title="İkonlu"
              icon={variant === 'danger' ? Trash2 : Plus}
              onPress={noop}
            />
          </View>
          <View style={styles.row}>
            <Button
              variant={variant}
              size="md"
              fullWidth={false}
              title="Yükleniyor"
              loading
              onPress={noop}
            />
            <Button
              variant={variant}
              size="md"
              fullWidth={false}
              title="Devre dışı"
              disabled
              onPress={noop}
            />
          </View>
        </View>
      ))}
      <Label>boyutlar · lg / md / sm</Label>
      <Button title="Kaydet" iconRight={ArrowRight} onPress={noop} />
      <Button title="Hesaplaş" variant="secondary" size="md" onPress={noop} />
      <View style={styles.row}>
        <Button title="Düzenle" variant="secondary" size="sm" fullWidth={false} onPress={noop} />
        <Button title="Küçük" size="sm" fullWidth={false} onPress={noop} />
      </View>
    </Section>
  );
}

function CardSection() {
  const styles = useThemedStyles(createStyles);
  return (
    <Section title="Card">
      <Card>
        <AppText variant="bodyStrong">plain</AppText>
        <AppText variant="caption" color="textMuted">
          Kenarlıklı, zeminsiz kart
        </AppText>
      </Card>
      <Card tone="surface">
        <AppText variant="bodyStrong">surface</AppText>
      </Card>
      <Card tone="primary">
        <AppText variant="bodyStrong">primary</AppText>
      </Card>
      <Card corners>
        <AppText variant="overline" color="primary">
          Net bakiyen
        </AppText>
        <Money minor={29113} tone="auto" signed variant="amountLg" />
      </Card>
      <Card onPress={noop} accessibilityLabel="Basılabilir kart" style={styles.rowCard}>
        <AppText variant="bodyStrong" style={styles.flex}>
          onPress
        </AppText>
        <SyncBadge status="pending" showLabel />
      </Card>
    </Section>
  );
}

function InputSection() {
  const [name, setName] = useState('');
  const [share, setShare] = useState('136,40');
  return (
    <Section title="Input">
      <Input
        label="Grup adı"
        placeholder="Örn. Moda'daki Ev"
        value={name}
        onChangeText={setName}
        helper="En fazla 40 karakter"
      />
      <Input label="Hata" value="?" error="Bu alan boş bırakılamaz" onChangeText={noop} />
      <Input label="Devre dışı" value="Sabit değer" disabled />
      <Input
        label="Önek · sağa hizalı"
        prefix="₺"
        align="right"
        keyboardType="decimal-pad"
        value={share}
        onChangeText={setShare}
      />
      <Input size="lg" placeholder="lg · Harcama başlığı" accessibilityLabel="Harcama başlığı" />
    </Section>
  );
}

function AmountSection() {
  const { i18n } = useTranslation();
  const [amount, setAmount] = useState('486,4');
  const [disabled, setDisabled] = useState(false);
  const styles = useThemedStyles(createStyles);

  return (
    <Section title="AmountInput · Numpad">
      <AmountInput value="" currency="TRY" />
      <AmountInput value="1250" currency="EUR" size="lg" />
      <AmountInput value="0" currency="TRY" error="Tutar sıfırdan büyük olmalı" />
      <AmountInput
        value={amount}
        currency="TRY"
        accessory={
          <Button
            title="Temizle"
            variant="ghost"
            onPress={() => setAmount('')}
            disabled={!amount}
          />
        }
      />
      <Numpad
        disabled={disabled}
        onKey={(key) => setAmount((a) => applyKeypadInput(a, key, { locale: i18n.language }))}
        onClear={() => setAmount('')}
      />
      <View style={styles.row}>
        <Chip
          label="Numpad devre dışı"
          role="checkbox"
          selected={disabled}
          onPress={() => setDisabled((d) => !d)}
        />
      </View>
    </Section>
  );
}

function AvatarSection() {
  const { avatarColors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const members = MEMBERS.map((name, i) => ({
    id: name,
    name,
    avatarColor: avatarColors[i % avatarColors.length],
  }));

  return (
    <Section title="Avatar · AvatarGroup">
      <Label>boyutlar · xs / sm / md / lg</Label>
      <View style={styles.rowCenter}>
        {['xs', 'sm', 'md', 'lg'].map((size) => (
          <Avatar key={size} name="Deniz" size={size} accessibilityLabel={`Deniz, ${size}`} />
        ))}
      </View>
      <Label>renkler</Label>
      <View style={styles.row}>
        {avatarColors.map((color, i) => (
          <Avatar key={color} name={MEMBERS[i]} color={color} size="md" />
        ))}
      </View>
      <Label>grup · 3 kişi</Label>
      <AvatarGroup members={members.slice(0, 3)} />
      <Label>grup · taşma (max 5)</Label>
      <AvatarGroup members={members} max={5} size="sm" />
    </Section>
  );
}

function ChipSection() {
  const styles = useThemedStyles(createStyles);
  const [category, setCategory] = useState('market');
  const categories = [
    { id: 'market', label: 'Market', icon: ShoppingCart },
    { id: 'food', label: 'Yemek', icon: Utensils },
    { id: 'bill', label: 'Fatura', icon: Zap },
    { id: 'home', label: 'Ev', icon: Home },
  ];

  return (
    <Section title="Chip">
      <View style={styles.row} accessibilityRole="radiogroup">
        {categories.map((c) => (
          <Chip
            key={c.id}
            icon={c.icon}
            label={c.label}
            selected={category === c.id}
            onPress={() => setCategory(c.id)}
          />
        ))}
      </View>
      <View style={styles.row}>
        <Chip label="İkonsuz" onPress={noop} />
        <Chip label="Seçili" selected onPress={noop} />
        <Chip label="Devre dışı" disabled onPress={noop} />
      </View>
    </Section>
  );
}

function ListItemSection() {
  return (
    <Section title="ListItem" padded={false}>
      <ListItem
        onPress={noop}
        leading={<IconBox icon={Home} />}
        title="Moda'daki Ev"
        titleAccessory={<SyncBadge status="offline" />}
        subtitle="Ece · Migros alışverişi · Bugün"
        trailing={<Money minor={29113} tone="auto" />}
        trailingCaption="alacaklısın"
      />
      <ListItem
        onPress={noop}
        leading={<IconBox icon={Plane} />}
        title="Kaş Tatili"
        subtitle="Selin · Pansiyon — 3 gece"
        trailing={<Money minor={-285750} tone="auto" />}
        trailingCaption="borçlusun"
      />
      <ListItem
        onPress={noop}
        leading={<Avatar name="Ece" size="md" />}
        title="Değer + chevron"
        value="₺ TRY"
        chevron
      />
      <ListItem
        onPress={noop}
        disabled
        leading={<IconBox icon={Zap} color="textMuted" />}
        title="Devre dışı"
        subtitle="Basılamaz"
      />
      <ListItem title="Etkileşimsiz" subtitle="onPress yok" divider={false} />
    </Section>
  );
}

function EmptyStateSection() {
  return (
    <Section title="EmptyState" padded={false}>
      <EmptyState
        icon={Home}
        title="Henüz grubun yok"
        description="Ev arkadaşların, tatil ekibin ya da partnerinle ilk ortak kasayı aç."
      >
        <Button title="Grup oluştur" icon={Plus} onPress={noop} />
      </EmptyState>
      <EmptyState title="Yalnızca başlık" />
    </Section>
  );
}

function SkeletonSection() {
  const styles = useThemedStyles(createStyles);
  const { spacing, layout } = useTheme();
  return (
    <Section title="Skeleton" padded={false}>
      <View style={[styles.padded, styles.stack]}>
        <Skeleton height={layout.buttonHeight * 2} />
        <Skeleton width="40%" height={spacing.sm + spacing.xxs} />
      </View>
      <SkeletonListItem />
      <SkeletonListItem divider={false} />
    </Section>
  );
}

function SnackbarSection() {
  const snackbar = useSnackbar();
  return (
    <Section title="Snackbar">
      <Snackbar message="Grup kaydedildi" />
      <Snackbar
        message="Harcama silindi"
        actionLabel="Geri al"
        actionIcon={Undo2}
        onAction={noop}
      />
      <Button
        title="Canlı snackbar göster (geri al)"
        variant="secondary"
        size="md"
        onPress={() =>
          snackbar.show({
            message: 'Harcama silindi',
            onUndo: () => snackbar.show({ message: 'Geri alındı' }),
          })
        }
      />
    </Section>
  );
}

function StatusSection() {
  const styles = useThemedStyles(createStyles);
  const statuses = ['synced', 'pending', 'offline', 'error'];
  return (
    <Section title="OfflineBanner · SyncBadge" padded={false}>
      <OfflineBanner />
      <OfflineBanner pendingCount={3} />
      <View style={[styles.padded, styles.stack]}>
        <Label>ikon</Label>
        <View style={styles.rowCenter}>
          {statuses.map((status) => (
            <SyncBadge key={status} status={status} />
          ))}
        </View>
        <Label>etiketli</Label>
        <View style={styles.row}>
          {statuses.map((status) => (
            <SyncBadge key={status} status={status} showLabel />
          ))}
        </View>
      </View>
    </Section>
  );
}

function SheetSection() {
  const styles = useThemedStyles(createStyles);
  const [sheet, setSheet] = useState(null);
  const [payer, setPayer] = useState('Deniz');
  const close = () => setSheet(null);

  return (
    <Section title="BottomSheet">
      <View style={styles.row}>
        <Button
          title="İçerikli"
          variant="secondary"
          size="md"
          fullWidth={false}
          onPress={() => setSheet('content')}
        />
        <Button
          title="Seçenekli"
          variant="secondary"
          size="md"
          fullWidth={false}
          onPress={() => setSheet('options')}
        />
      </View>
      <BottomSheet
        visible={sheet === 'content'}
        title="Davet et"
        showClose
        onClose={close}
        footer={
          <View style={[styles.padded, styles.sheetFooter]}>
            <Button title="Tamam" onPress={close} />
          </View>
        }
      >
        <View style={[styles.padded, styles.stack]}>
          <AppText variant="body">
            QR kodu okutarak ya da bağlantıyı paylaşarak gruba yeni üye ekleyebilirsin.
          </AppText>
          <Button title="QR göster" icon={QrCode} variant="secondary" size="md" onPress={noop} />
        </View>
      </BottomSheet>
      <OptionSheet
        visible={sheet === 'options'}
        title="Ödeyen"
        value={payer}
        onClose={close}
        onSelect={(value) => {
          setPayer(value);
          close();
        }}
        options={MEMBERS.slice(0, 3).map((name) => ({
          value: name,
          label: name,
          leading: <Avatar name={name} size="sm" />,
        }))}
      />
    </Section>
  );
}

function HeaderSection() {
  return (
    <Section title="Header" padded={false}>
      <Header
        title="Moda'daki Ev"
        subtitle="Ev · 3 kişi"
        onLeadingPress={noop}
        actions={[{ icon: UserPlus, label: 'Üye ekle', onPress: noop }]}
      />
      <Header
        title="Harcama ekle"
        subtitle="Moda'daki Ev"
        leading="close"
        onLeadingPress={noop}
        actions={[{ icon: QrCode, label: 'Fiş tara', onPress: noop }]}
      />
      <Header
        title="Harcama"
        onLeadingPress={noop}
        actions={[
          { icon: Pencil, label: 'Düzenle', onPress: noop },
          { icon: Trash2, label: 'Sil', onPress: noop, color: 'danger' },
        ]}
      />
      <Header title="Başlık yalnız" leading={null} />
    </Section>
  );
}

function SegmentedSection() {
  const [split, setSplit] = useState('amount');
  const [theme, setTheme] = useState('light');
  return (
    <Section title="SegmentedControl">
      <SegmentedControl
        accessibilityLabel="Bölüşüm türü"
        value={split}
        onChange={setSplit}
        options={[
          { value: 'equal', label: 'Eşit' },
          { value: 'amount', label: 'Tutar' },
          { value: 'percent', label: 'Yüzde' },
          { value: 'shares', label: 'Pay' },
        ]}
      />
      <SegmentedControl
        size="sm"
        accessibilityLabel="Tema"
        value={theme}
        onChange={setTheme}
        options={[
          { value: 'light', label: 'Açık' },
          { value: 'dark', label: 'Koyu' },
          { value: 'system', label: 'Sistem', disabled: true },
        ]}
      />
      <SegmentedControl
        disabled
        accessibilityLabel="Devre dışı"
        value="a"
        onChange={noop}
        options={[
          { value: 'a', label: 'Devre' },
          { value: 'b', label: 'Dışı' },
        ]}
      />
    </Section>
  );
}

const createStyles = ({ colors, spacing, layout, borderWidth }) =>
  StyleSheet.create({
    flex: { flex: 1 },
    modeBar: { paddingHorizontal: layout.gutter, paddingBottom: spacing.sm },
    gallery: { backgroundColor: colors.bg, paddingBottom: spacing.huge },
    schemeBar: {
      paddingHorizontal: layout.gutter,
      paddingVertical: spacing.sm,
      backgroundColor: colors.inverse,
    },
    section: {
      paddingTop: spacing.xl,
      paddingBottom: spacing.lg,
      borderBottomWidth: borderWidth.hairline,
      borderBottomColor: colors.divider,
    },
    sectionTitle: { paddingHorizontal: layout.gutter, paddingBottom: spacing.md },
    sectionBody: { gap: spacing.md },
    padded: { paddingHorizontal: layout.gutter },
    stack: { gap: spacing.sm },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    rowCenter: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    rowCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    sheetFooter: { paddingTop: spacing.md },
  });
