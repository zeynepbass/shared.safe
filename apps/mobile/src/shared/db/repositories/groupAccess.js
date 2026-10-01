import { and, eq, isNull } from 'drizzle-orm';

import { groups } from '../schema';

// Group lookup shared by the other repositories. Kept apart from groupRepository, which itself
// depends on the expense repository, so imports never go in a circle.
export function getGroup(db, id) {
  return (
    db
      .select()
      .from(groups)
      .where(and(eq(groups.id, id), isNull(groups.deletedAt)))
      .get() ?? null
  );
}
