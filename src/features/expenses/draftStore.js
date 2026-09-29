import { useSyncExternalStore } from 'react';

import { computeSplit } from '@/domain/split';
import { parseAmountInput } from '@/shared/lib/money';

let draft = null;
const listeners = new Set();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function startDraft(initial) {
  draft = initial;
  emit();
}

export function updateDraft(patch) {
  if (!draft) return;
  draft = { ...draft, ...(typeof patch === 'function' ? patch(draft) : patch) };
  emit();
}

export function clearDraft() {
  draft = null;
  emit();
}

export function useDraft() {
  return useSyncExternalStore(subscribe, () => draft);
}

export function participantsFromShares(members, splitType, shares) {
  const byMember = new Map(shares.map((s) => [s.memberId, s]));
  return members.map((m) => {
    const share = byMember.get(m.id);
    return {
      memberId: m.id,
      included: shares.length === 0 ? true : Boolean(share),
      weight: share ? (splitType === 'amount' ? share.amount : share.weight) : null,
    };
  });
}

export function draftTotal(state, locale) {
  return parseAmountInput(state.amountInput, { locale });
}

export function draftSplit(state, locale) {
  return computeSplit({
    total: draftTotal(state, locale),
    type: state.splitType,
    participants: state.participants,
  });
}
