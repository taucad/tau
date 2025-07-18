export type TimestampItem = {
  readonly updatedAt: number;
};

export type TimeHorizonName = 'Today' | 'Yesterday' | 'This Week' | 'This Month' | 'Older';

export type TemporalGroup<T extends TimestampItem> = {
  readonly name: TimeHorizonName;
  readonly items: T[];
};

export function groupItemsByTimeHorizon<T extends TimestampItem>(
  items: T[],
  sortComparator?: (a: T, b: T) => number,
): Array<TemporalGroup<T>> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const oneWeekAgo = new Date(today);
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const oneMonthAgo = new Date(today);
  oneMonthAgo.setDate(oneMonthAgo.getDate() - 30);

  const todayItems: T[] = [];
  const yesterdayItems: T[] = [];
  const thisWeekItems: T[] = [];
  const thisMonthItems: T[] = [];
  const olderItems: T[] = [];

  for (const item of items) {
    const itemDate = new Date(item.updatedAt);
    itemDate.setHours(0, 0, 0, 0);

    if (itemDate.getTime() === today.getTime()) {
      todayItems.push(item);
    } else if (itemDate.getTime() === yesterday.getTime()) {
      yesterdayItems.push(item);
    } else if (itemDate.getTime() > oneWeekAgo.getTime()) {
      thisWeekItems.push(item);
    } else if (itemDate.getTime() > oneMonthAgo.getTime()) {
      thisMonthItems.push(item);
    } else {
      olderItems.push(item);
    }
  }

  // Default sort by most recent first, or use provided comparator
  const defaultSortByMostRecent = (a: T, b: T) => b.updatedAt - a.updatedAt;
  const sortFunction = sortComparator ?? defaultSortByMostRecent;

  todayItems.sort(sortFunction);
  yesterdayItems.sort(sortFunction);
  thisWeekItems.sort(sortFunction);
  thisMonthItems.sort(sortFunction);
  olderItems.sort(sortFunction);

  const groups: Array<TemporalGroup<T>> = [];

  if (todayItems.length > 0) {
    groups.push({ name: 'Today', items: todayItems });
  }

  if (yesterdayItems.length > 0) {
    groups.push({ name: 'Yesterday', items: yesterdayItems });
  }

  if (thisWeekItems.length > 0) {
    groups.push({ name: 'This Week', items: thisWeekItems });
  }

  if (thisMonthItems.length > 0) {
    groups.push({ name: 'This Month', items: thisMonthItems });
  }

  if (olderItems.length > 0) {
    groups.push({ name: 'Older', items: olderItems });
  }

  return groups;
}
