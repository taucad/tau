import { expect, it } from 'vitest';
import { EditorDiagnostics } from '#lib/editor-diagnostics.js';

it('retains diagnostics without a view and migrates them with a file', () => {
  const store = new EditorDiagnostics();
  const diagnostic = { from: 0, to: 1, message: 'bad', severity: 'error' } as const;
  store.set('file:///old.ts', 'typescript', [diagnostic]);
  store.rename('old.ts', 'lib/new.ts');
  expect(store.get('file:///old.ts').size).toBe(0);
  expect(store.get('file:///lib/new.ts').get('typescript')).toEqual([diagnostic]);
  store.clearOwner('typescript');
  expect(store.get('file:///lib/new.ts').size).toBe(0);
});
