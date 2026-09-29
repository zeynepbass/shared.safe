import { profileSchema } from '../profileSchema';

const valid = { name: ' Deniz ', avatarColor: '#597EA3', avatarPath: null, defaultCurrency: 'TRY' };

describe('profileSchema', () => {
  it('accepts a profile with a colour or a photo', () => {
    expect(profileSchema.parse(valid).name).toBe('Deniz');
    expect(profileSchema.safeParse({ ...valid, avatarPath: 'file:///a.jpg' }).success).toBe(true);
  });

  it('requires a name of at most 40 characters', () => {
    expect(profileSchema.safeParse({ ...valid, name: ' ' }).error.issues[0].message).toBe(
      'profile.nameRequired',
    );
    expect(
      profileSchema.safeParse({ ...valid, name: 'x'.repeat(41) }).error.issues[0].message,
    ).toBe('profile.nameTooLong');
  });

  it('only allows supported currencies', () => {
    expect(profileSchema.safeParse({ ...valid, defaultCurrency: 'JPY' }).success).toBe(false);
  });
});
