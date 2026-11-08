export type DiffStatsSummary = {
  linesAdded: number;
  linesRemoved: number;
};

/**
 * Parse a unified diff string to extract line counts.
 * Counts lines starting with + (added) and - (removed), excluding header lines.
 */
export function parseDiffStats(udiff: string): DiffStatsSummary {
  const lines = udiff.split('\n');
  let linesAdded = 0;
  let linesRemoved = 0;

  for (const line of lines) {
    // Skip diff headers (---, +++, @@)
    if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('@@')) {
      continue;
    }

    if (line.startsWith('+')) {
      linesAdded++;
    } else if (line.startsWith('-')) {
      linesRemoved++;
    }
  }

  return { linesAdded, linesRemoved };
}
