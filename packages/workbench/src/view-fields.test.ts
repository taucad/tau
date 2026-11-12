import { describe, expect, it } from 'vitest';
import { viewFieldPaths, viewFieldsSchema, viewRecordV1Defaults, workbenchRecords } from '@taucad/workbench';
import type { ViewFieldPath, ViewFieldValues } from '@taucad/workbench';

type ParsedFields = ReturnType<typeof viewFieldsSchema.parse>;

/** Read one inheritable leaf out of a parsed view by its path. */
const leafOf = (fields: ParsedFields, path: ViewFieldPath): ViewFieldValues[ViewFieldPath] => {
  if (path === 'upDirection' || path === 'fieldOfView') {
    return fields[path];
  }
  if (path === 'grid.unit') {
    return fields.grid.unit;
  }
  const key = path.slice('display.'.length) as keyof ParsedFields['display'];
  return fields.display[key];
};

describe('viewRecordV1Defaults', () => {
  it('freezes the version 1 format values', () => {
    expect(viewRecordV1Defaults).toMatchInlineSnapshot(`
      {
        "display.axes": true,
        "display.gizmo": true,
        "display.grid": true,
        "display.lines": true,
        "display.matcap": false,
        "display.postProcessing": false,
        "display.surfaces": true,
        "fieldOfView": 60,
        "grid.unit": "mm",
        "upDirection": "z",
      }
    `);
    expect(Object.isFrozen(viewRecordV1Defaults)).toBe(true);
  });

  it('lists every leaf path once', () => {
    expect(viewFieldPaths).toEqual([
      'upDirection',
      'fieldOfView',
      'display.surfaces',
      'display.lines',
      'display.gizmo',
      'display.grid',
      'display.axes',
      'display.matcap',
      'display.postProcessing',
      'grid.unit',
    ]);
  });

  it('is what a view with no inheritable field parses to, leaf for leaf', () => {
    const parsed = viewFieldsSchema.parse({ entryPath: null });
    for (const path of viewFieldPaths) {
      expect(leafOf(parsed, path), path).toBe(viewRecordV1Defaults[path]);
    }
  });

  it('is what a short hand-written view file reads as, leaf for leaf', () => {
    const read = workbenchRecords.view.read(new TextEncoder().encode('{"version":1,"entryPath":"main.ts"}'));
    expect(read.status).toBe('current');
    if (read.status !== 'current') {
      return;
    }
    for (const path of viewFieldPaths) {
      expect(leafOf(read.record, path), path).toBe(viewRecordV1Defaults[path]);
    }
  });

  it('fills each omitted display leaf from its format value when the display object is partial', () => {
    const parsed = viewFieldsSchema.parse({
      entryPath: null,
      display: { grid: false },
    });
    for (const path of viewFieldPaths.filter((leaf) => leaf !== 'display.grid')) {
      expect(leafOf(parsed, path), path).toBe(viewRecordV1Defaults[path]);
    }
    expect(parsed.display.grid).toBe(false);
  });
});
