/* oxlint-disable no-await-in-loop -- Each surface is visited in turn: the oracle reads what that navigation transferred. */
import { describe, expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';

type Language = 'csharp' | 'kcl' | 'openscad' | 'typescript';

/**
 * The downloads that only a language service needs: its CodeMirror adapter chunk, its worker and its staged server
 * assets. Syntax highlighting and the CAD kernels are separate owners and may load without a code pane. The C# and
 * OpenSCAD servers stage their manifest and WebAssembly under `<language>-language` directory or file names.
 */
const languageResources: Readonly<Record<Language, readonly RegExp[]>> = {
  csharp: [/\/csharp-codemirror-[\w-]+\.js$/u, /\/csharp[-_]language[-/]/u],
  kcl: [/\/kcl-codemirror-[\w-]+\.js$/u, /\/kcl-lsp-worker-[\w-]+\.js$/u],
  openscad: [/\/openscad-codemirror-[\w-]+\.js$/u, /\/(?:tau_)?openscad[-_]language[-/]/u],
  typescript: [/\/typescript-codemirror-[\w-]+\.js$/u, /\/worker\.entry-[\w-]+\.js$/u],
};
/** The dispatcher every language service is imported through. */
const languageRuntime = /\/editor-language-runtime-[\w-]+\.js$/u;

/** Surfaces a person reaches before opening any source file, each with the landmark that shows it. */
const sourceFreeSurfaces = [
  ['/', 'main'],
  ['/projects', 'main'],
  ['/projects/new', 'main'],
  ['/community', 'main'],
  ['/?settings=general', 'dialog'],
] as const;

const editorLines = selectors.getByCss('.cm-editor .cm-content').first();

/** The language services whose resources appear among the paths. */
const loadedLanguages = (paths: readonly string[]): Language[] =>
  (Object.keys(languageResources) as Language[]).filter((language) =>
    paths.some((path) => languageResources[language].some((pattern) => pattern.test(path))),
  );

/** Drain the paths transferred so far. */
const readPaths = async (settle?: boolean): Promise<string[]> => [...(await target.readObservedRequests(settle))];

/** Wait until the open project's workbench shows its launcher, so the project itself has loaded. */
const expectProjectOpen = async (): Promise<void> => {
  await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 60_000);
  await target.expectVisible(selectors.getByText('Files', { exact: true }), 60_000);
  /* Give a project-open path that started a language service the time to reach the network. */
  await target.delay(5000);
};

/** Open a source file from the file tree and return what it transferred once its language service started. */
const openSource = async (file: string, language: Language): Promise<string[]> => {
  await target.click(selectors.getByRole('treeitem', { name: file, exact: true }).first());
  await target.expectVisible(editorLines, 60_000);
  const transferred: string[] = [];
  await expect
    .poll(
      async () => {
        transferred.push(...(await readPaths(false)));
        return loadedLanguages(transferred).includes(language);
      },
      { timeout: 90_000, interval: 1000 },
    )
    .toBe(true);
  return transferred;
};

/*
 * A language service's chunks, worker and WebAssembly reach the browser only once a code pane opens a file of that
 * language. Viewing a project, its model or a file of another language starts nothing else.
 */
describe('Language service laziness', () => {
  test('should load no language service before a source file opens, then only that file language', async () => {
    await target.setViewport({ width: 1600, height: 1000 });
    await target.startObservedRequests();

    for (const [path, landmark] of sourceFreeSurfaces) {
      await target.navigate(path);
      await target.expectVisible(selectors.getByRole(landmark), 30_000);
      const paths = await readPaths();
      expect(loadedLanguages(paths), path).toEqual([]);
      expect(
        paths.filter((candidate) => languageRuntime.test(candidate)),
        path,
      ).toEqual([]);
    }

    await target.navigate('/__e2e/example-fixture?locator=openscad.fluted-vase');
    await expectProjectOpen();
    const projectPaths = await readPaths(false);
    expect(loadedLanguages(projectPaths), 'OpenSCAD project without a code pane').toEqual([]);
    expect(projectPaths.filter((candidate) => languageRuntime.test(candidate))).toEqual([]);

    await target.click(selectors.getByText('Files', { exact: true }));
    expect(loadedLanguages(await openSource('main.scad', 'openscad')), 'main.scad').toEqual(['openscad']);
    expect(loadedLanguages(await openSource('main.geospec.ts', 'typescript')), 'main.geospec.ts').toEqual([
      'typescript',
    ]);

    await target.navigate('/projects/new');
    await target.fill(selectors.getByCss('input#project-name'), 'Language laziness');
    await target.click(selectors.getByRole('radiogroup').getByText('Zoo (KCL)', { exact: true }));
    await target.click(selectors.getByRole('button', { name: /Create Project/u }));
    await expectProjectOpen();
    expect(loadedLanguages(await readPaths(false)), 'KCL project without a code pane').toEqual([]);

    await target.click(selectors.getByText('Files', { exact: true }));
    expect(loadedLanguages(await openSource('main.kcl', 'kcl')), 'main.kcl').toEqual(['kcl']);
  });
});
