import { useMemo } from 'react';

import { computeBalances } from '@ortak-kasa/core/balances';

export function selfMember(members) {
  return members.find((m) => m.isLocalUser) ?? null;
}

export function summarizeGroup(snapshot) {
  const { members, expenses, settlements } = snapshot;
  const balances = computeBalances({ members, expenses, settlements });
  const self = selfMember(members);
  return {
    ...snapshot,
    balances,
    self,
    selfBalance: self ? (balances.get(self.id) ?? 0) : 0,
  };
}

export function useGroupSummary(snapshot) {
  return useMemo(() => (snapshot ? summarizeGroup(snapshot) : null), [snapshot]);
}

export function memberLabel(member, t) {
  return member?.isSelf ? t('common.you') : (member?.name ?? '?');
}
