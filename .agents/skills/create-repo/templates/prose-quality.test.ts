import { globSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MAX_PROSE_WORDS, countWords } from './tools/eslint-plugin/prose-rules.js';

const ROOT = resolve(import.meta.dirname);
const DOCUMENTS = globSync('**/*.{md,mdx}', {
  cwd: ROOT,
  exclude: ['.nx/**', 'coverage/**', 'dist/**', 'node_modules/**', 'rust/target/**'],
}).sort();

type Block = { readonly line: number; readonly text: string };

const proseBlocks = (markdown: string): Block[] => {
  const blocks: Block[] = [];
  let current: string[] = [];
  let fenced = false;
  let start = 0;
  const flush = (): void => {
    const text = current.join(' ').trim();
    if (text) blocks.push({ line: start + 1, text });
    current = [];
  };

  for (const [index, raw] of markdown.split(/\r?\n/u).entries()) {
    const line = raw.replace(/^\s*>\s?/u, '');
    if (/^\s*(?:`{3,}|~{3,})/u.test(line)) {
      flush();
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    if (/^\s*(?:\||<|#)/u.test(line) || line.trim() === '') {
      flush();
      continue;
    }
    if (/^\s*(?:[-*+]|\d+\.)\s/u.test(line)) flush();
    if (current.length === 0) start = index;
    current.push(line.trim());
  }
  flush();
  return blocks;
};

describe('prose quality', () => {
  it('should inspect repository prose', () => {
    expect(DOCUMENTS).not.toEqual([]);
  });

  it('should ignore both Markdown fence syntaxes', () => {
    expect(proseBlocks('```ts\nconst backtick = true;\n```\n~~~ts\nconst tilde = true;\n~~~')).toEqual([]);
  });

  it.each(DOCUMENTS)('should keep every block in %s within the word ceiling', (document) => {
    const offenders = proseBlocks(readFileSync(resolve(ROOT, document), 'utf8'))
      .map((block) => ({ block, words: countWords(block.text) }))
      .filter(({ words }) => words > MAX_PROSE_WORDS)
      .map(({ block, words }) => `${document}:${block.line} — ${words} words`);
    expect(offenders).toEqual([]);
  });
});
