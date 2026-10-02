import '#styles/global.css';
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { CodeEditor } from '#components/code/code-editor.client.js';
import { configureMonaco } from '#lib/monaco.lib.client.js';
import { getMonacoLanguage } from '#lib/monaco.constants.js';

afterEach(async () => {
  cleanup();
  const monaco = await configureMonaco();
  for (const model of monaco?.editor.getModels() ?? []) {
    model.dispose();
  }
});

it.each([
  ['main.tsx', 'export default () => (<box name="example" />);'],
  ['main.py', '"""A Python module."""\ndef polar(radius):\n    return 2.0 # scale'],
])('should render %s in Geist Mono with distinct syntax colors', async (path, source) => {
  await page.viewport(1000, 600);
  const { container } = render(
    <div style={{ position: 'fixed', top: 0, left: 0, width: 800, height: 300 }}>
      <CodeEditor
        className='h-full bg-background'
        path={`file:///${path}`}
        defaultLanguage={getMonacoLanguage(path)}
        defaultValue={source}
        onChange={() => undefined}
      />
    </div>,
  );

  await expect
    .poll(() => container.querySelector('.view-line')?.textContent?.replaceAll('\u00a0', ' '), { timeout: 10_000 })
    .toContain(source.split('\n')[0]);
  await expect.poll(() => container.querySelector('.overflow-guard')?.getBoundingClientRect().height).toBe(300);
  const line = container.querySelector('.view-line')!;
  expect(line.getBoundingClientRect().top).toBeGreaterThanOrEqual(0);
  expect(line.getBoundingClientRect().bottom).toBeLessThanOrEqual(globalThis.innerHeight);
  expect(getComputedStyle(line).getPropertyValue('--font-mono')).toContain('Geist Mono');
  expect(getComputedStyle(line).fontFamily).toContain('Geist Mono');
  const monaco = (await configureMonaco())!;
  expect(monaco.editor.getModel(monaco.Uri.file(`/${path}`))?.getLanguageId()).toBe(getMonacoLanguage(path));
  await expect
    .poll(
      () =>
        new Set([...container.querySelectorAll('.view-line span')].map((span) => getComputedStyle(span).color)).size,
    )
    .toBeGreaterThan(1);
  await page.screenshot();
});
