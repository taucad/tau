// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Every share copy starts inside the press. Safari ends a click's permission to write the clipboard at the first
 * `await`, and Chrome a few seconds later, so a copy that waits for a publish, a rebuild or a mutation first is refused
 * (the operator's "Couldn't copy the link" on iOS). `copyText` from `@taucad/ui/utils/clipboard` starts the write at
 * once and takes a promise of the link; this scan holds the share surfaces to it: no direct `navigator.clipboard`, and
 * no `await` between the start of the handler and its `copyText` call. Each surface's own tests press the button and
 * check the write already ran.
 */
const shareCopyModules = [
  '../../../../../packages/workbench-panes/src/share/share-link-body.tsx',
  '../../../../../packages/ui/src/components/copy-button.tsx',
  './project-share-panel.tsx',
  '../share/publication-topbar.tsx',
  '../../routes/w.$workspace.$project/revision-collaborators.tsx',
];

/** The source without its comments, so prose about the clipboard is not read as a call. */
const codeOf = (source: string): string => source.replaceAll(/\/\*[\s\S]*?\*\//gu, '').replaceAll(/^\s*\/\/.*$/gmu, '');

/** Where a function body opens: an arrow function's `=> {` or a `function …(…) {`. */
const functionOpening = /=>\s*\{|\bfunction\b[^{;]*\{/gu;

/**
 * The `copyText` calls that something awaits before, inside the same function.
 *
 * @param code - Source without comments.
 * @returns One line per offending call.
 */
const awaitedBeforeCopy = (code: string): string[] =>
  [...code.matchAll(/\bcopyText\(/gu)].flatMap((call) => {
    const openings = [...code.slice(0, call.index).matchAll(functionOpening)];
    const opening = openings.at(-1);
    const start = opening === undefined ? 0 : opening.index + opening[0].length;
    const before = code.slice(start, call.index).replace(/await\s*$/u, '');
    return /\bawait\b/u.test(before) ? [code.slice(start, call.index + 'copyText('.length).trim()] : [];
  });

describe('Share copy gesture', () => {
  it('should catch an await before the copy', () => {
    expect(
      awaitedBeforeCopy('const copy = async () => {\n  await publish();\n  await copyText(link);\n};'),
    ).toHaveLength(1);
    expect(awaitedBeforeCopy('const copy = async () => {\n  const { isCopied } = await copyText(link());\n};')).toEqual(
      [],
    );
  });

  it.each(shareCopyModules)('should copy through copyText inside the press in %s', (path) => {
    const code = codeOf(readFileSync(new URL(path, import.meta.url), 'utf8'));

    expect(code).not.toMatch(/navigator\.clipboard/u);
    expect(awaitedBeforeCopy(code)).toEqual([]);
  });

  it('should leave each copying surface with a copy to check', () => {
    const copying = shareCopyModules.filter((path) =>
      /\bcopyText\(|<CopyButton\b/u.test(codeOf(readFileSync(new URL(path, import.meta.url), 'utf8'))),
    );

    expect(copying).toEqual(shareCopyModules);
  });
});
