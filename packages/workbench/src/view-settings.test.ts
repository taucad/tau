import { describe, expect, it } from 'vitest';
import {
  readViewField,
  resolveViewSettings,
  tauViewDefaults,
  viewFieldPaths,
  viewFieldValuesOf,
  viewRecordV1Defaults,
  withViewField,
  workbenchRecords,
} from '@taucad/workbench';
import type { PersonViewFieldDefaults, ViewFieldPath, ViewFieldValues } from '@taucad/workbench';

const parse = (input: Record<string, unknown>): ReturnType<typeof workbenchRecords.view.schema.parse> =>
  workbenchRecords.view.schema.parse({
    version: 1,
    entryPath: 'main.ts',
    ...input,
  });

/** A value for each leaf that differs from its format value. */
const away: ViewFieldValues = {
  upDirection: 'y',
  fieldOfView: 0,
  'display.surfaces': false,
  'display.lines': false,
  'display.gizmo': false,
  'display.grid': false,
  'display.axes': false,
  'display.matcap': true,
  'display.postProcessing': true,
  'grid.unit': 'in',
};

/** A person default for each personal leaf, different from both the format value and `away`. */
const personal: Required<PersonViewFieldDefaults> = {
  fieldOfView: 35,
  'display.surfaces': false,
  'display.lines': false,
  'display.gizmo': false,
  'display.grid': false,
  'display.axes': false,
  'display.matcap': true,
  'display.postProcessing': true,
  'grid.unit': 'cm',
};

const atFormat = parse({});

describe('tauViewDefaults', () => {
  it('equals the format values at launch', () => {
    expect(tauViewDefaults).toEqual(viewRecordV1Defaults);
    expect(Object.isFrozen(tauViewDefaults)).toBe(true);
  });
});

describe('resolveViewSettings', () => {
  describe.each(viewFieldPaths)('%s', (leaf: ViewFieldPath) => {
    const viewWith = withViewField(atFormat, leaf, away[leaf]);
    const personHas = leaf !== 'upDirection';

    it('reads the view when the view value differs from the format value', () => {
      const resolved = resolveViewSettings({
        tau: tauViewDefaults,
        person: personal,
        view: viewWith,
      });
      expect(resolved.values[leaf]).toBe(away[leaf]);
      expect(resolved.sources[leaf]).toBe('view');
    });

    it('reads the view when the value equals the format value and is an exception', () => {
      const resolved = resolveViewSettings({
        tau: tauViewDefaults,
        person: personal,
        exceptions: [leaf],
        view: atFormat,
      });
      expect(resolved.values[leaf]).toBe(viewRecordV1Defaults[leaf]);
      expect(resolved.sources[leaf]).toBe('view');
    });

    it('inherits the person when the value equals the format value', () => {
      const resolved = resolveViewSettings({
        tau: tauViewDefaults,
        person: personal,
        view: atFormat,
      });
      if (personHas) {
        expect(resolved.values[leaf]).toBe(personal[leaf]);
        expect(resolved.sources[leaf]).toBe('person');
      } else {
        // The up axis never reads the person.
        expect(resolved.values[leaf]).toBe(tauViewDefaults[leaf]);
        expect(resolved.sources[leaf]).toBe('tau');
      }
    });

    it('inherits Tau with no person', () => {
      const tau = { ...tauViewDefaults, [leaf]: away[leaf] };
      const resolved = resolveViewSettings({ tau, view: atFormat });
      expect(resolved.values[leaf]).toBe(away[leaf]);
      expect(resolved.sources[leaf]).toBe('tau');
    });
  });

  it('ignores a person up axis passed at runtime', () => {
    // A caller outside TypeScript can pass the up axis the type leaves out; the resolver must ignore it.
    const person: PersonViewFieldDefaults & { upDirection: 'y' } = { upDirection: 'y' };
    expect(resolveViewSettings({ tau: tauViewDefaults, person, view: atFormat }).values.upDirection).toBe('z');
  });

  it('resolves an absent view from the person and Tau', () => {
    const resolved = resolveViewSettings({
      tau: tauViewDefaults,
      person: { 'display.grid': false },
      view: undefined,
    });
    expect(resolved.values).toEqual({
      ...viewRecordV1Defaults,
      'display.grid': false,
    });
  });

  it('resolves an old fully written file as set where it differs and inherited where it does not', () => {
    // A build without the feature wrote every leaf, post-processing on (a view created with no active viewer).
    const old = workbenchRecords.view.read(
      new TextEncoder().encode(
        JSON.stringify({
          version: 1,
          entryPath: 'main.ts',
          camera: { kind: 'preset', preset: 'isometric' },
          fieldOfView: 60,
          upDirection: 'z',
          display: {
            surfaces: true,
            lines: true,
            gizmo: true,
            grid: true,
            axes: true,
            matcap: false,
            postProcessing: true,
          },
          grid: { unit: 'mm' },
          section: { active: false, cuts: [] },
          measurements: [],
        }),
      ),
    );
    expect(old.status).toBe('current');
    const view = old.status === 'current' ? old.record : undefined;
    const resolved = resolveViewSettings({
      tau: tauViewDefaults,
      person: personal,
      view,
    });
    expect(resolved.sources['display.postProcessing']).toBe('view');
    expect(resolved.values['display.postProcessing']).toBe(true);
    expect(resolved.sources['display.grid']).toBe('person');
    expect(resolved.sources.upDirection).toBe('tau');
    // With no person, every leaf renders what the file holds.
    expect(resolveViewSettings({ tau: tauViewDefaults, view }).values).toEqual(viewFieldValuesOf(view!));
  });

  it('resolves a short hand-written file with every omitted leaf inherited', () => {
    const short = parse({ display: { grid: false } });
    const resolved = resolveViewSettings({
      tau: tauViewDefaults,
      person: { 'grid.unit': 'in' },
      view: short,
    });
    expect(resolved.sources['display.grid']).toBe('view');
    expect(resolved.values['display.grid']).toBe(false);
    expect(resolved.sources['grid.unit']).toBe('person');
    expect(resolved.values['grid.unit']).toBe('in');
    expect(resolved.sources['display.surfaces']).toBe('tau');
  });
});

describe('view field helpers', () => {
  it('reads and writes each leaf without touching the others', () => {
    for (const leaf of viewFieldPaths) {
      const written = withViewField(atFormat, leaf, away[leaf]);
      expect(readViewField(written, leaf)).toBe(away[leaf]);
      expect(viewFieldValuesOf(written)).toEqual({
        ...viewRecordV1Defaults,
        [leaf]: away[leaf],
      });
      expect(written.camera).toBe(atFormat.camera);
    }
  });
});
