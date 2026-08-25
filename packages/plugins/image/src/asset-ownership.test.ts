import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('svg.transcoder.ts', import.meta.url), 'utf8');
const copyConfig = readFileSync(new URL('../copy-files-from-to.cjson', import.meta.url), 'utf8');
const digest = (url: URL): string => createHash('sha256').update(readFileSync(url)).digest('hex');

describe('image renderer asset ownership', () => {
  it('loads resvg through its export and keeps the copied Geist font verified', () => {
    expect(source).toContain("new URL(import.meta.resolve('@resvg/resvg-wasm/index_bg.wasm'))");
    expect(source).toContain("new URL('./fonts/Geist-Regular.ttf', import.meta.url)");
    expect(copyConfig).not.toContain('@resvg/resvg-wasm');
    expect(copyConfig).toContain('src/fonts/Geist-Regular.ttf');
    expect(digest(new URL('fonts/Geist-Regular.ttf', import.meta.url))).toBe(
      '5c8968eafb98a4c4f47033daf29e38e284a6f2a82eb017d171ab040fe7c4b615',
    );
  });
});
