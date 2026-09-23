import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  handbookSchema,
  incidentSchema,
  listHandbookPages,
  listIncidentRecords,
  validateFile,
} from '#validate-frontmatter.js';

const fixtures: string[] = [];
const fixture = (): string => {
  const root = mkdtempSync(resolve(tmpdir(), 'tau-frontmatter-'));
  fixtures.push(root);
  return root;
};
const write = (root: string, path: string, text: string): string => {
  const target = resolve(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text);
  return target;
};
const daysAgo = (days: number): string => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
const today = daysAgo(0);
/** Diagnostics as `<level> <field>`, so assertions do not depend on Zod's message wording. */
const fields = (diagnostics: Array<{ level: string; message: string }>): string[] =>
  diagnostics.map((d) => `${d.level} ${d.message.split(':')[0]}`);

const handbookPage = (fields: string): string =>
  `---\ntitle: 'API'\ndescription: 'The API service.'\nstatus: active\ncreated: '${today}'\nupdated: '${today}'\nkind: service\nenvironments: [prod-us]\nlast_verified: '${today}'\nsources:\n  - apps/api/fly.prod.toml\n${fields}---\n\n# API\n`;

const incidentRecord = (fields: string): string =>
  `---\ntitle: 'API returns 503 after deploy'\ndescription: 'Production API requests failed for 14 minutes.'\nstate: open\nseverity: SEV2\ncreated: '${today}'\nupdated: '${today}'\nenvironments: [prod-us]\nstarted_at: '2026-10-03T21:04Z'\ndetected_at: '2026-10-03T21:09Z'\nmitigated_at: ''\nresolved_at: ''\nservices: []\nplaybooks: []\n${fields}---\n\n# API returns 503 after deploy\n`;

afterEach(() => {
  for (const root of fixtures.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('handbook frontmatter', () => {
  it('should accept a page that meets the page contract', () => {
    const root = fixture();
    const page = write(root, 'cloud/system/services/api.md', handbookPage(''));
    expect(validateFile(page, handbookSchema).diagnostics).toEqual([]);
  });

  it('should reject an unquoted date that YAML parses as a timestamp', () => {
    const root = fixture();
    const page = write(
      root,
      'cloud/system/services/api.md',
      handbookPage('').replace(`created: '${today}'`, `created: ${today}`),
    );
    expect(fields(validateFile(page, handbookSchema).diagnostics)).toEqual(['ERROR created']);
  });

  it('should reject a page without a kind', () => {
    const root = fixture();
    const page = write(root, 'cloud/system/services/api.md', handbookPage('').replace('kind: service\n', ''));
    expect(fields(validateFile(page, handbookSchema).diagnostics)).toEqual(['ERROR kind']);
  });

  it('should warn when last_verified is older than the 90-day default', () => {
    const root = fixture();
    const page = write(
      root,
      'cloud/system/services/api.md',
      handbookPage('').replace(`last_verified: '${today}'`, `last_verified: '${daysAgo(91)}'`),
    );
    expect(validateFile(page, handbookSchema).diagnostics).toEqual([
      { level: 'WARN', message: 'last_verified 91 days ago (>90 day threshold)' },
    ]);
  });

  it('should warn earlier when review_days narrows the verification window', () => {
    const root = fixture();
    const verified = handbookPage('review_days: 14\n').replace(
      `last_verified: '${today}'`,
      `last_verified: '${daysAgo(20)}'`,
    );
    const page = write(root, 'cloud/readiness/go-live-checklist.md', verified);
    expect(validateFile(page, handbookSchema).diagnostics).toEqual([
      { level: 'WARN', message: 'last_verified 20 days ago (>14 day threshold)' },
    ]);
    const lenient = write(root, 'cloud/readiness/known-gaps.md', verified.replace('review_days: 14\n', ''));
    expect(validateFile(lenient, handbookSchema).diagnostics).toEqual([]);
  });

  it('should list handbook pages recursively', () => {
    const root = fixture();
    write(root, 'cloud/index.md', handbookPage(''));
    write(root, 'cloud/system/services/api.md', handbookPage(''));
    write(root, 'cloud/system/services/diagram.svg', '<svg />');
    expect(listHandbookPages(root).sort()).toEqual([
      resolve(root, 'cloud/index.md'),
      resolve(root, 'cloud/system/services/api.md'),
    ]);
  });
});

describe('incident frontmatter', () => {
  it('should accept a record with unreached timestamps left empty', () => {
    const root = fixture();
    const record = write(root, '2026-10-03-api-503/incident.md', incidentRecord(''));
    expect(validateFile(record, incidentSchema).diagnostics).toEqual([]);
  });

  it('should reject a missing severity, an unknown state and a timestamp without Z', () => {
    const root = fixture();
    const record = write(
      root,
      '2026-10-03-api-503/incident.md',
      incidentRecord('')
        .replace('severity: SEV2\n', '')
        .replace('state: open', 'state: investigating')
        .replace("started_at: '2026-10-03T21:04Z'", "started_at: '2026-10-03 21:04'"),
    );
    const { diagnostics } = validateFile(record, incidentSchema);
    expect(fields(diagnostics).sort()).toEqual(['ERROR severity', 'ERROR started_at', 'ERROR state']);
    expect(diagnostics.map((d) => d.message)).toContain(
      'started_at: Must be a quoted UTC timestamp (YYYY-MM-DDTHH:MMZ)',
    );
  });

  it('should validate one record per incident directory and ignore evidence and comms', () => {
    const root = fixture();
    write(root, 'index.md', handbookPage(''));
    write(root, '2026-10-03-api-503/incident.md', incidentRecord(''));
    write(root, '2026-10-03-api-503/evidence/fly-logs.md', 'not frontmatter');
    write(root, '2026-10-03-api-503/comms/status-update.md', 'draft');
    expect(listIncidentRecords(root)).toEqual([resolve(root, '2026-10-03-api-503/incident.md')]);
  });
});
