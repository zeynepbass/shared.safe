import { z } from 'zod';

import { GROUP_TYPES } from '@/shared/db/schema';
import { CURRENCY_CODES } from '@ortak-kasa/core/money';

export const NAME_MAX = 40;
// The local user is always the first member, so this leaves room for 49 others.
export const MAX_MEMBERS = 50;

const normalize = (name) => name.trim().toLocaleLowerCase('tr');

export const memberNameSchema = z
  .string()
  .trim()
  .min(1, 'groupForm.memberRequired')
  .max(NAME_MAX, 'groupForm.memberTooLong');

// Messages are i18n keys, translated where they are shown.
export const groupFormSchema = z
  .object({
    name: z.string().trim().min(1, 'groupForm.nameRequired').max(NAME_MAX, 'groupForm.nameTooLong'),
    type: z.enum(GROUP_TYPES),
    currency: z.enum(CURRENCY_CODES),
    selfName: z.string(),
    members: z
      .array(z.object({ name: memberNameSchema, avatarColor: z.string().min(1) }))
      .max(MAX_MEMBERS - 1, 'groupForm.tooManyMembers'),
  })
  .superRefine((values, ctx) => {
    const seen = new Set([normalize(values.selfName)]);
    values.members.forEach((member, index) => {
      const key = normalize(member.name);
      if (seen.has(key)) {
        ctx.addIssue({
          code: 'custom',
          message: 'groupForm.memberDuplicate',
          path: ['members', index, 'name'],
        });
      }
      seen.add(key);
    });
  });

// Validates the name typed into the "add member" field before it joins the list.
export function validateNewMember(name, { selfName, members }) {
  const parsed = memberNameSchema.safeParse(name);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const key = normalize(parsed.data);
  const taken = [selfName, ...members.map((m) => m.name)].some((n) => normalize(n) === key);
  if (taken) return { error: 'groupForm.memberDuplicate' };
  if (members.length >= MAX_MEMBERS - 1) return { error: 'groupForm.tooManyMembers' };
  return { name: parsed.data };
}
