/**
 * Formats a date relatively (e.g., "just now", "2 minutes ago", "3 years ago")
 * @param date Date to format
 * @returns Formatted relative time string
 */
export const formatRelativeTime = (date: Date | number): string => {
  const targetDate = date instanceof Date ? date : new Date(date);
  const now = new Date();
  const diffInMs = now.getTime() - targetDate.getTime();

  // Convert to seconds
  const diffInSecs = Math.floor(diffInMs / 1000);

  if (diffInSecs < 5) {
    return 'just now';
  }

  if (diffInSecs < 60) {
    return `${diffInSecs} seconds ago`;
  }

  // Convert to minutes
  const diffInMins = Math.floor(diffInSecs / 60);
  if (diffInMins === 1) {
    return 'a minute ago';
  }

  if (diffInMins < 60) {
    return `${diffInMins} minutes ago`;
  }

  // Convert to hours
  const diffInHours = Math.floor(diffInMins / 60);
  if (diffInHours === 1) {
    return 'an hour ago';
  }

  if (diffInHours < 24) {
    return `${diffInHours} hours ago`;
  }

  // Convert to days
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays === 1) {
    return 'yesterday';
  }

  if (diffInDays < 7) {
    return `${diffInDays} days ago`;
  }

  // For dates older than a week, return formatted date
  return targetDate.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};
