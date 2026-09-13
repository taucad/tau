/**
 * One byte formatter for the surfaces that show storage.
 *
 * Binary steps with decimal names, which is what every file manager shows and
 * what a storage plan is quoted in.
 *
 * @param bytes - A non-negative byte count.
 * @returns The size with its unit, e.g. `2.1 GB`.
 * @public
 */
export const formatBytes = (bytes: number): string => {
  if (bytes <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const step = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** step;
  return `${step === 0 ? String(value) : value.toFixed(1)} ${units[step]}`;
};
