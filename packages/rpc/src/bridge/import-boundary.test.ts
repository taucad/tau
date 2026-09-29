import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    const stat = statSync(path);
    return stat.isDirectory() ? sourceFiles(path) : path.endsWith('.ts') ? [path] : [];
  });

describe('@taucad/rpc/bridge import boundary', () => {
  it('should not import filesystem, runtime, or app packages', () => {
    const files = sourceFiles(new URL('.', import.meta.url).pathname);
    const forbidden = /from ['"](?:@taucad\/filesystem|@taucad\/runtime|apps\/)/u;

    const offenders = files.filter((file) => forbidden.test(readFileSync(file, 'utf8')));

    expect(offenders).toEqual([]);
  });
});
