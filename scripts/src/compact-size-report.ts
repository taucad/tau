/** Format the size-limit-action comment for reviewing bundle size increases. */
export const compactSizeReport = (body: string): string => {
  if (body.includes('<summary>Full comparison (')) {
    return body;
  }

  const lines = body.replaceAll('\r\n', '\n').split('\n');
  const heading = lines[0];
  const table = lines.filter((line) => line.startsWith('|'));
  const header = table[0]?.split('|').map((cell) => cell.trim());
  if (
    !heading?.startsWith('## size-limit report 📦 ') ||
    header?.[1] !== 'Path' ||
    header[2] !== 'Size' ||
    table.length < 3
  ) {
    throw new Error('Unrecognized size-limit report');
  }

  const entries = table.slice(2).map((line) => {
    const cells = line.split('|').map((cell) => cell.trim());
    const name = cells[1];
    const change = cells[2]?.match(/^(.*?) \(([+-]?\d+(?:\.\d+)?)%(?: [^)]*)?\)$/u);
    if (!name || !change) {
      throw new Error('Unrecognized size-limit report row');
    }

    return { name, size: change[1], percentage: Number(change[2]) };
  });
  const increases = entries.filter((entry) => entry.percentage > 0).sort((a, b) => b.percentage - a.percentage);
  const formatIncreases = (rows: typeof increases): string =>
    [
      '| Package / entry | Size | Increase |',
      '| --- | --- | --- |',
      ...rows.map((entry) => `| ${entry.name.split(' — ')[0]} | ${entry.size} | +${entry.percentage}% |`),
    ].join('\n');
  const sections = [heading];

  if (increases.length === 0) {
    sections.push('No bundle size increases.');
  } else {
    sections.push(`**${increases.length} bundle size increase${increases.length === 1 ? '' : 's'}.**`);
    if (increases.length > 10) {
      sections.push('Showing the 10 largest percentage increases.');
    }

    sections.push(formatIncreases(increases.slice(0, 10)));
    if (increases.length > 10) {
      sections.push(
        `<details>\n<summary>${increases.length - 10} more size increases</summary>\n\n${formatIncreases(increases.slice(10))}\n\n</details>`,
      );
    }
  }

  sections.push(
    `<details>\n<summary>Full comparison (${entries.length} entries)</summary>\n\n${table.join('\n')}\n\n</details>`,
  );
  return sections.join('\n\n');
};
