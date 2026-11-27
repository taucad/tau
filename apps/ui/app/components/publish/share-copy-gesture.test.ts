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
  '../../../../libs/publish-ui/src/components/publish/project-share-panel.tsx',
  '../../../../libs/publish-ui/src/components/publish/publication-access-panel.tsx',
  '../share/publication-topbar.tsx',
  '../../routes/w.$workspace.$project/revision-collaborators.tsx',
];

/** The source without its comments, so prose about the clipboard is not read as a call. */
const codeOf = (source: string): string => source.replaceAll(/\/\*[\s\S]*?\*\//gu, '').replaceAll(/^\s*\/\/.*$/gmu, '');

/** Where a function body opens: an arrow function's `=> {` or a `function …(…) {`. */
const functionOpening = /=>\s*\{|\bfunction\b[^{;]*\{/gu;

/**
 * Whether a body that opens with the last character of `from` is still open where `from` ends.
 *
 * @param from - Source from the body's opening brace up to the call.
 * @returns True when the braces after the opening one never close it.
 */
const isStillOpen = (from: string): boolean => {
  let depth = 0;
  for (const character of from) {
    if (character === '{') {
      depth += 1;
    } else if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        return false;
      }
    }
  }
  return depth > 0;
};

/**
 * The `copyText` calls that something awaits before, inside the same function. The function is the innermost one
 * still open at the call, so a callback that closed before the call does not hide an earlier `await`.
 *
 * @param code - Source without comments.
 * @returns One line per offending call.
 */
const awaitedBeforeCopy = (code: string): string[] =>
  [...code.matchAll(/\bcopyText\(/gu)].flatMap((call) => {
    const openings = [...code.slice(0, call.index).matchAll(functionOpening)];
    const opening = openings.findLast((candidate) =>
      isStillOpen(code.slice(candidate.index + candidate[0].length - 1, call.index)),
    );
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
    expect(
      awaitedBeforeCopy(
        'const copy = async () => {\n  await publish();\n  emails.forEach((email) => {\n    log(email);\n  });\n  await copyText(link);\n};',
      ),
    ).toHaveLength(1);
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
