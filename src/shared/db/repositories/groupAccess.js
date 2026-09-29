import { and, eq, isNull } from 'drizzle-orm';

import { now } from '../ids';
import { groups } from '../schema';

// Group lookups shared by the other repositories. Kept apart from groupRepository, which itself
// depends on the expense and member repositories, so imports never go in a circle.
export function getGroup(db, id) {
  return (
    db
      .select()
      .from(groups)
      .where(and(eq(groups.id, id), isNull(groups.deletedAt)))
      .get() ?? null
  );
}

export function touchGroup(executor, id, at = now()) {
  executor.update(groups).set({ updatedAt: at }).where(eq(groups.id, id)).run();
}
