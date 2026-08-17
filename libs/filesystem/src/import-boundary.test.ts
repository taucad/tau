import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    const stat = statSync(path);
    return stat.isDirectory() ? sourceFiles(path) : path.endsWith('.ts') ? [path] : [];
  });

describe('@taucad/filesystem import boundary', () => {
  it('should not import rpc, runtime, fs-bridge, or app code', () => {
    const files = sourceFiles(new URL('.', import.meta.url).pathname);
    const forbidden = /from ['"](?:@taucad\/rpc|@taucad\/runtime|@taucad\/fs-bridge|apps\/)/u;

    const offenders = files.filter((file) => forbidden.test(readFileSync(file, 'utf8')));

    expect(offenders).toEqual([]);
  });
});
