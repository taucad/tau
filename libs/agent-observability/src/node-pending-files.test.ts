import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ownerOnlyFiles } from '#node-pending-files.js';

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'tau-evidence-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

/** A mode's permission bits, as `ls -l` reads them in octal. */
const permissions = (mode: number): string => mode.toString(8).slice(-3);

describe('ownerOnlyFiles', () => {
  it('should read a missing queue as nothing and write it owner-only, leaving no staged file', async () => {
    const path = join(directory, 'queue', 'project.json');

    expect(await ownerOnlyFiles.readFile(path)).toBeUndefined();
    await ownerOnlyFiles.replaceFile(path, '{"items":[]}');

    expect(await ownerOnlyFiles.readFile(path)).toBe('{"items":[]}');
    const [file, folder] = await Promise.all([stat(path), stat(join(directory, 'queue'))]);
    expect(permissions(file.mode)).toBe('600');
    expect(permissions(folder.mode)).toBe('700');
    expect(await readdir(join(directory, 'queue'))).toEqual(['project.json']);
  });
});
