import { z } from 'zod';

import { CURRENCY_CODES } from '@ortak-kasa/core/money';

export const NAME_MAX = 40;

// Messages are i18n keys, translated where they are shown.
export const profileSchema = z.object({
  name: z.string().trim().min(1, 'profile.nameRequired').max(NAME_MAX, 'profile.nameTooLong'),
  avatarColor: z.string().min(1),
  avatarPath: z.string().nullable(),
  defaultCurrency: z.enum(CURRENCY_CODES),
});
