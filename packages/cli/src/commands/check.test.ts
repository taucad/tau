import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { checkStatus, projectRootOf } from '#commands/check.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

type Issue = Parameters<typeof checkStatus>[1][number];

const issue = (code: string, severity: 'error' | 'warning' = 'error'): Issue =>
  ({ code, severity, type: 'kernel', message: code }) as unknown as Issue;

describe('projectRootOf', () => {
  it('should root a model at the nearest folder holding a tau.json', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tau-check-root-'));
    roots.push(root);
    await mkdir(join(root, 'parts', 'gear'), { recursive: true });
    await writeFile(join(root, 'tau.json'), '{}');

    expect(projectRootOf(join(root, 'parts', 'gear', 'main.ts'))).toBe(root);
  });

  it("should fall back to the model's own folder outside every project", async () => {
    const root = await mkdtemp(join(tmpdir(), 'tau-check-loose-'));
    roots.push(root);

    expect(projectRootOf(join(root, 'main.ts'))).toBe(root);
  });
});

describe('checkStatus', () => {
  it('should be ok for a successful evaluation with only warnings', () => {
    expect(checkStatus(true, [issue('SLOW', 'warning')])).toBe('ok');
  });

  it.each(['KERNEL_NOT_PREPARED', 'KERNEL_CAPABILITY_MISSING', 'TRANSCODER_CAPABILITY_MISSING'])(
    'should be refused for %s',
    (code) => {
      expect(checkStatus(false, [issue(code)])).toBe('refused');
    },
  );

  it('should be an error for a model failure, or an error issue on a successful evaluation', () => {
    expect(checkStatus(false, [issue('RUNTIME')])).toBe('error');
    expect(checkStatus(true, [issue('RUNTIME')])).toBe('error');
    expect(checkStatus(false, [])).toBe('error');
  });
});
