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

    const time = (ms) => {
      const date = new Date(ms);
      const pad = (n) => String(n).padStart(2, '0');
      return t('date.time', { hours: pad(date.getHours()), minutes: pad(date.getMinutes()) });
    };

    // 'YYYY-MM' → "Eyl" / "Sep"; three letters is the usual short form in both languages.
    const monthShort = (yearMonth) =>
      months[Number(yearMonth.slice(5, 7)) - 1].slice(0, 3).toLocaleUpperCase(i18n.language);

    return { dayMonth, full, short, sectionHeader, time, monthShort };
  }, [t, i18n.language]);
}
