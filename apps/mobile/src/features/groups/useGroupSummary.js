export function selfMember(members) {
  return members.find((m) => m.isLocalUser) ?? null;
}

export function memberLabel(member, t) {
  return member?.isSelf ? t('common.you') : (member?.name ?? '?');
}
