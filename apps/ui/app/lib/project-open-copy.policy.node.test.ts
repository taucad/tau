// @vitest-environment node
/*
 * One source for the words a project open says (cloud open loading states; Progressive Loading Policy rules 18 and 19):
 * the viewer's pill and caption, the project status control, the route's busy markers and its announcement all read
 * them from `app/lib/project-open-copy.ts`. Each surface once spelled them itself and they drifted ("Downloading project
 * files" beside "Downloading files…"). This gate reads every source in `apps/ui/app` and fails on a string literal or
 * JSX text that spells the open's words anywhere but that module, and on the retired words anywhere at all, the copy
 * module included: an open says one label for the whole wait and never names a step, the device or the transport.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const appRoot = fileURLToPath(new URL('..', import.meta.url));
const copyModule = 'lib/project-open-copy.ts';

/** The open's words, which only the copy module spells. Matched whole, with or without a trailing ellipsis. */
const canonical: ReadonlySet<string> = new Set([
  'Opening project',
  'Still opening project',
  'Check your connection, then try again.',
]);

/**
 * Words the open no longer says, matched anywhere in a literal: the step labels and the device sentences one label
 * replaced (2026-11-25), and the lane sentences the seamless review withdrew before they shipped.
 */
const retired: readonly string[] = [
  'Downloading project files',
  'Your model will open when its files are ready',
  'Your files will appear when they are ready',
  'Downloading files',
  'Preparing files',
  'Still downloading files',
  'Opening this project on this device.',
  'Bringing this project to this device.',
  'Getting your files ready to open.',
  'Your chats open once this project is on this device.',
  'Parameters appear when the model opens.',
  'Send once the project is open',
];

const isSource = (name: string): boolean =>
  /\.tsx?$/u.test(name) && !/\.(?:test|spec)\.tsx?$/u.test(name) && !name.endsWith('.test-d.ts');

function listSources(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'test-utils' && entry.name !== 'testing') {
        files.push(...listSources(path));
      }
    } else if (isSource(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

/** Every literal's text in a source: strings, plain templates, template parts and JSX text. */
function literalsOf(path: string): Array<{ text: string; line: number }> {
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
  const found: Array<{ text: string; line: number }> = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node) ||
      ts.isJsxText(node)
    ) {
      const text = node.text.replaceAll(/\s+/gu, ' ').trim();
      if (text !== '') {
        found.push({ text, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/**
 * The open-copy problems in a set of sources.
 *
 * @param root - The directory the files are reported relative to.
 * @param files - The sources to read.
 * @returns One line per literal that spells the open's words outside the copy module.
 */
function findProblems(root: string, files: readonly string[]): string[] {
  const problems: string[] = [];
  for (const file of files) {
    const name = relative(root, file).replaceAll('\\', '/');
    const isCopyModule = name === copyModule;
    for (const { text, line } of literalsOf(file)) {
      const whole = text.replace(/(?:…|\.\.\.)$/u, '');
      const retiredHit = retired.find((words) => text.includes(words));
      if (retiredHit !== undefined) {
        problems.push(
          `${name}:${line} says the retired "${retiredHit}"; use projectOpenCopy from #lib/project-open-copy.js`,
        );
      } else if (!isCopyModule && canonical.has(whole)) {
        problems.push(`${name}:${line} spells "${text}"; import it from #lib/project-open-copy.js instead`);
      }
    }
  }
  return problems;
}

describe('project open copy', () => {
  it('should spell every open step only in app/lib/project-open-copy.ts', () => {
    const problems = findProblems(appRoot, listSources(appRoot));
    expect(problems, problems.join('\n')).toEqual([]);
  }, 60_000);
});
