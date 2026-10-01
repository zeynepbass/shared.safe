import { groupFormSchema, MAX_MEMBERS, validateNewMember } from '../groupFormSchema';

const valid = {
  name: ' Kaş 2026 ',
  type: 'trip',
  currency: 'TRY',
  selfName: 'Zeynep',
  members: [{ name: 'Ece', avatarColor: '#222' }],
};
const messages = (result) => result.error.issues.map((issue) => issue.message);

describe('groupFormSchema', () => {
  it('accepts a complete form and trims names', () => {
    const result = groupFormSchema.safeParse(valid);
    expect(result.success).toBe(true);
    expect(result.data.name).toBe('Kaş 2026');
  });

  it('requires a name of at most 40 characters', () => {
    expect(messages(groupFormSchema.safeParse({ ...valid, name: '   ' }))).toEqual([
      'groupForm.nameRequired',
    ]);
    expect(messages(groupFormSchema.safeParse({ ...valid, name: 'x'.repeat(41) }))).toEqual([
      'groupForm.nameTooLong',
    ]);
  });

  it('only allows known types and currencies', () => {
    expect(groupFormSchema.safeParse({ ...valid, type: 'office' }).success).toBe(false);
    expect(groupFormSchema.safeParse({ ...valid, currency: 'JPY' }).success).toBe(false);
  });

  it('rejects duplicate member names, including the local user, ignoring case', () => {
    const result = groupFormSchema.safeParse({
      ...valid,
      members: [
        { name: 'ece', avatarColor: '#1' },
        { name: 'ECE', avatarColor: '#2' },
        { name: 'zeynep', avatarColor: '#3' },
      ],
    });
    expect(result.error.issues.map((i) => [i.path.join('.'), i.message])).toEqual([
      ['members.1.name', 'groupForm.memberDuplicate'],
      ['members.2.name', 'groupForm.memberDuplicate'],
    ]);
  });

  it('uses Turkish casing when comparing names', () => {
    const result = groupFormSchema.safeParse({
      ...valid,
      selfName: 'İpek',
      members: [{ name: 'ipek', avatarColor: '#1' }],
    });
    expect(messages(result)).toEqual(['groupForm.memberDuplicate']);
  });

  it('caps the group size', () => {
    const members = Array.from({ length: MAX_MEMBERS }, (_, i) => ({
      name: `Üye ${i}`,
      avatarColor: '#1',
    }));
    expect(messages(groupFormSchema.safeParse({ ...valid, members }))).toEqual([
      'groupForm.tooManyMembers',
    ]);
  });

  it('allows a group with only the local user', () => {
    expect(groupFormSchema.safeParse({ ...valid, members: [] }).success).toBe(true);
  });
});

describe('validateNewMember', () => {
  const form = { selfName: 'Zeynep', members: [{ name: 'Ece' }] };

  it('returns the trimmed name', () => {
    expect(validateNewMember('  Mert ', form)).toEqual({ name: 'Mert' });
  });

  it('explains why a name cannot be added', () => {
    expect(validateNewMember('  ', form)).toEqual({ error: 'groupForm.memberRequired' });
    expect(validateNewMember('x'.repeat(41), form)).toEqual({ error: 'groupForm.memberTooLong' });
    expect(validateNewMember('ece', form)).toEqual({ error: 'groupForm.memberDuplicate' });
    expect(validateNewMember('ZEYNEP', form)).toEqual({ error: 'groupForm.memberDuplicate' });
  });

  it('stops at the member limit', () => {
    const full = {
      selfName: 'Zeynep',
      members: Array.from({ length: MAX_MEMBERS - 1 }, (_, i) => ({ name: `Üye ${i}` })),
    };
    expect(validateNewMember('Yeni', full)).toEqual({ error: 'groupForm.tooManyMembers' });
  });
});
