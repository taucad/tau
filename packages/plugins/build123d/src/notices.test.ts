import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// `tau prepare --audit` (D26) copies every file of `notices/<payload>/` into a closure's audit unit.
const noticeDirectory = resolve(import.meta.dirname, '../notices/cadquery-ocp-novtk');

/** Files NOTICE itself introduces, rather than listing under the bundled libraries. */
const headFiles = new Set(['LICENSE', 'NOTICE', 'OCCT-LGPL-2.1.txt', 'OCCT-LGPL-exception.txt']);

describe('cadquery-ocp-novtk bundled-library notices', () => {
  it('lists every notice file in NOTICE and holds no library back', async () => {
    const files = await readdir(noticeDirectory);
    const notice = await readFile(resolve(noticeDirectory, 'NOTICE'), 'utf8');
    const listed = [...notice.matchAll(/^- .+: (?<file>\S+\.txt)$/gmu)].map((match) => match.groups?.['file'] ?? '');

    const byName = (left: string, right: string): number => left.localeCompare(right);

    expect(listed.toSorted(byName)).toEqual(files.filter((file) => !headFiles.has(file)).toSorted(byName));
    expect(files).toHaveLength(26);
    expect(notice).not.toContain('while their licences are reviewed');
  });

  it('carries the GPL-2.0 text, the exact corresponding source and a written offer for JBIG-KIT', async () => {
    const jbig = await readFile(resolve(noticeDirectory, 'JBIG-KIT-GPL-2.0-or-later.txt'), 'utf8');

    expect(jbig).toContain('linux-x64-glibc: cadquery_ocp_novtk.libs/libjbig-0f1087b4.so.0');
    expect(jbig).toContain('linux-arm64-glibc: cadquery_ocp_novtk.libs/libjbig-9afaf6ad.so.0');
    expect(jbig).toContain('Copyright: 1995-2008 Dr. Marcus Kuhn');
    expect(jbig).toContain('GNU GENERAL PUBLIC LICENSE');
    expect(jbig).toContain('END OF TERMS AND CONDITIONS');
    for (const hash of [
      '474419dda13c2c65752e8c373920d518190ced250360c361830654044e3eb239',
      'de7106b6bfaf495d6865c7dd7ac6ca1381bd12e0d81405ea81e7f2167263d932',
      'eca6a335d3bddd57e7f915ad34f2f6a33e84cc699d01c217c5f906c2e9db5670',
    ]) {
      expect(jbig).toContain(`SHA-256 ${hash}`);
    }
    expect(jbig).toContain('For at least three years');
    expect(jbig).toContain('legal@tau.new');
  });
});
