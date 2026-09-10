/**
 * The React Compiler is off under vitest, so no rendering test can catch the
 * one defect this file has to prevent: TanStack keeps its state on a `table`
 * object whose identity never changes, so a compiled component caches
 * `table.getState()` on first render and freezes (page size stuck at its
 * initial value, search box stuck at its initial text).
 */
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';

const sourcePath = 'app/components/ui/data-table.tsx';

it('opts every table component out of React Compiler memoization', async () => {
  const source = await readFile(sourcePath, 'utf8');
  const components = source.split('export function ').slice(1);

  expect(components.length).toBeGreaterThan(0);
  for (const component of components) {
    const [name] = component.split(/[<(]/u);
    expect(component.slice(0, component.indexOf('\n\n')), `${name ?? ''} must declare 'use no memo'`).toContain(
      "'use no memo'",
    );
  }
});
