import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, View } from 'react-native';

import { addDays, fromISODate, toISODate, todayISO } from '@/shared/lib/dates';
import { useTheme } from '@/shared/theme';
import { Button, OptionSheet } from '@/shared/ui';

export function DateSheet({ visible, value, onChange, onClose }) {
  const { t, i18n } = useTranslation();
  const { isDark, colors, layout } = useTheme();
  const [custom, setCustom] = useState(false);
  const [pending, setPending] = useState(value);

  const today = todayISO();
  const yesterday = addDays(today, -1);
  const isPreset = value === today || value === yesterday;

  const close = () => {
    setCustom(false);
    onClose();
  };

  const select = (choice) => {
    if (choice !== 'other') {
      onChange(choice);
      close();
      return;
    }
    if (Platform.OS === 'android') {
      close();
      DateTimePickerAndroid.open({
        value: fromISODate(value),
        maximumDate: new Date(),
        onChange: (event, date) => {
          if (event.type === 'set' && date) onChange(toISODate(date));
        },
      });
      return;
    }
    setPending(value);
    setCustom(true);
  };

  return (
    <OptionSheet
      visible={visible}
      title={t('date.pick')}
      value={isPreset ? value : 'other'}
      onSelect={select}
      onClose={close}
      options={
        custom
          ? []
          : [
              { value: today, label: t('common.today') },
              { value: yesterday, label: t('common.yesterday') },
              { value: 'other', label: t('date.other') },
            ]
      }
    >
      {custom ? (
        <View style={[styles.picker, { paddingHorizontal: layout.gutter }]}>
          <DateTimePicker
            value={fromISODate(pending)}
            mode="date"
            display="inline"
            maximumDate={new Date()}
            locale={i18n.language === 'tr' ? 'tr-TR' : 'en-US'}
            themeVariant={isDark ? 'dark' : 'light'}
            accentColor={colors.primary}
            onChange={(event, date) => date && setPending(toISODate(date))}
          />
          <Button
            title={t('common.done')}
            onPress={() => {
              onChange(pending);
              close();
            }}
          />
        </View>
      ) : null}
    </OptionSheet>
  );
}

const styles = StyleSheet.create({
  picker: { gap: 12 },
});
