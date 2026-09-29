import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { fromISODate, relativeDay } from './dates';

export function useDateFormat() {
  const { t, i18n } = useTranslation();

  return useMemo(() => {
    const months = t('date.months', { returnObjects: true });
    const weekdays = t('date.weekdays', { returnObjects: true });

    const parts = (iso) => {
      const date = fromISODate(iso);
      return {
        day: date.getDate(),
        month: months[date.getMonth()],
        weekday: weekdays[date.getDay()],
        year: date.getFullYear(),
      };
    };

    const dayMonth = (iso) => t('date.dayMonth', parts(iso));
    const full = (iso) => t('date.full', parts(iso));

    const short = (iso) => {
      const relative = relativeDay(iso);
      return relative ? t(`common.${relative}`) : dayMonth(iso);
    };

    const sectionHeader = (iso) => {
      const relative = relativeDay(iso);
      if (relative) {
        return t('date.relativeHeader', { relative: t(`common.${relative}`), date: dayMonth(iso) });
      }
      return t('date.dayMonthWeekday', parts(iso));
    };

    return { dayMonth, full, short, sectionHeader };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, i18n.language]);
}
