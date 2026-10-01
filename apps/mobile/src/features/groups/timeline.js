// Expenses and settlements of a group as one list, newest day first, for the group screen.
// FlashList renders one flat list, so each day's header is an item of its own.
//
// Both inputs arrive newest first (the repositories sort them), so they are merged rather than
// sorted again. Dates are ISO strings, which compare correctly as plain text.
const comesFirst = (a, b) => a.date > b.date || (a.date === b.date && a.at >= b.at);

export function buildTimeline(expenses, settlements) {
  const spent = expenses.map((e) => ({
    kind: 'expense',
    id: e.id,
    date: e.spentOn,
    at: e.createdAt,
    e,
  }));
  const paid = settlements.map((s) => ({
    kind: 'settlement',
    id: s.id,
    date: s.paidOn,
    at: s.createdAt,
    s,
  }));

  const rows = [];
  let i = 0;
  let j = 0;
  while (i < spent.length || j < paid.length) {
    const takeExpense = j >= paid.length || (i < spent.length && comesFirst(spent[i], paid[j]));
    const item = takeExpense ? spent[i++] : paid[j++];
    if (rows[rows.length - 1]?.date !== item.date) {
      rows.push({ kind: 'day', id: item.date, date: item.date });
    }
    rows.push(item);
  }
  return rows;
}
