export type TimestampItem = {
  readonly updatedAt: number;
};

export type TimeHorizonName = string;

export type TemporalGroup<T extends TimestampItem> = {
  readonly name: TimeHorizonName;
  readonly items: T[];
};

function getGranularGroupName(itemDate: Date, today: Date): string {
  const daysDiff = Math.floor((today.getTime() - itemDate.getTime()) / (1000 * 60 * 60 * 24));

  if (daysDiff === 0) {
    return 'Today';
  }

  if (daysDiff === 1) {
    return 'Yesterday';
  }

  if (daysDiff <= 6) {
    return `${daysDiff} days ago`;
  }

  if (daysDiff <= 13) {
    return 'Last week';
  }

  if (daysDiff <= 20) {
    return '2 weeks ago';
  }

  if (daysDiff <= 27) {
    return '3 weeks ago';
  }

  // For months and years, calculate more precisely
  const itemYear = itemDate.getFullYear();
  const itemMonth = itemDate.getMonth();
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth();

  const monthsDiff = (todayYear - itemYear) * 12 + (todayMonth - itemMonth);

  if (monthsDiff === 1) {
    return 'Last month';
  }

  if (monthsDiff <= 11) {
    return `${monthsDiff} months ago`;
  }

  const yearsDiff = todayYear - itemYear;
  if (yearsDiff === 1) {
    return 'Last year';
  }

  return `${yearsDiff} years ago`;
}

function getGroupOrder(name: string): number {
  // Special cases
  if (name === 'Today') {
    return 0;
  }

  if (name === 'Yesterday') {
    return 1;
  }

  // Parse pattern: "X unit(s) ago" or "Last unit"
  const lastRegex = /^last\s+(week|month|year)$/;
  const lastMatch = lastRegex.exec(name.toLowerCase());
  if (lastMatch) {
    const unit = lastMatch[1];
    if (unit === 'week') {
      return 9;
    }

    if (unit === 'month') {
      return 14;
    }

    return 1000; // Last year
  }

  const regex = /^(\d+)\s+(day|week|month|year)s?\s*ago$/;
  const match = regex.exec(name.toLowerCase());
  if (!match) {
    return 9999;
  }

  const number = Number.parseInt(match[1] ?? '0', 10);
  const unit = match[2];

  const baseOffsets: Record<string, number> = {
    day: 2,
    week: 10,
    month: 15,
    year: 1000,
  };

  return (baseOffsets[unit ?? ''] ?? 9999) + number;
}

export function groupItemsByTimeHorizon<T extends TimestampItem>(
  items: T[],
  sortComparator?: (a: T, b: T) => number,
): Array<TemporalGroup<T>> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const groupsMap = new Map<string, T[]>();

  // Default sort by most recent first, or use provided comparator
  const defaultSortByMostRecent = (a: T, b: T) => b.updatedAt - a.updatedAt;
  const sortFunction = sortComparator ?? defaultSortByMostRecent;

  for (const item of items) {
    const itemDate = new Date(item.updatedAt);
    itemDate.setHours(0, 0, 0, 0);

    const groupName = getGranularGroupName(itemDate, today);

    if (!groupsMap.has(groupName)) {
      groupsMap.set(groupName, []);
    }

    groupsMap.get(groupName)!.push(item);
  }

  // Sort items within each group
  for (const items of groupsMap.values()) {
    items.sort(sortFunction);
  }

  // Build ordered groups array
  const groups: Array<TemporalGroup<T>> = [];

  // Convert map to array and sort by order
  const sortedGroups = [...groupsMap.entries()].sort(([nameA], [nameB]) => {
    return getGroupOrder(nameA) - getGroupOrder(nameB);
  });

  for (const [name, groupItems] of sortedGroups) {
    if (groupItems.length > 0) {
      groups.push({ name, items: groupItems });
    }
  }

  return groups;
}
