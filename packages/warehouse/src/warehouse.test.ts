/* oxlint-disable eslint/no-await-in-loop -- Process one project at a time to bound native memory and preserve deterministic corpus ordering. */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { warehouseParts, findWarehousePart } from '@taucad/warehouse/builtin';
import { readDefinitions, packageRoot } from '#scripts/definitions.js';
import { validateParameters } from '#validation.js';

const definitions = await readDefinitions();

describe('editable warehouse projects', () => {
  it('should accept natural decimal endpoints without admitting dimensions outside the continuous domain', () => {
    const eye = definitions.find(({ part }) => part.id === 'eye-bolt')?.part;
    if (!eye) {
      throw new Error('Expected the eye-bolt definition');
    }
    for (const diameter of [4.8, 7.2]) {
      validateParameters({ ...eye.parameters, diameter }, eye.domains);
    }
    for (const diameter of [4.799999, 7.200001]) {
      expect(() => {
        validateParameters({ ...eye.parameters, diameter }, eye.domains);
      }).toThrow("Parameter 'diameter'");
    }
    const metric = definitions.find(({ part }) => part.id === 'socket-head-cap-screw')?.part;
    const gear = definitions.find(({ part }) => part.id === 'spur-gear')?.part;
    const sleeve = definitions.find(({ part }) => part.id === 'sleeve-bushing')?.part;
    if (!metric || !gear || !sleeve) {
      throw new Error('Expected metric and integer parameter definitions');
    }
    for (const bore of [10.8, 13.2]) {
      validateParameters({ ...sleeve.parameters, bore }, sleeve.domains);
    }
    expect(() => {
      validateParameters({ ...metric.parameters, diameter: 3 + Number.EPSILON * 3 }, metric.domains);
    }).toThrow("Parameter 'diameter'");
    expect(() => {
      validateParameters({ ...gear.parameters, teeth: 24 + Number.EPSILON * 24 }, gear.domains);
    }).toThrow("Parameter 'teeth'");
  });

  it('should expose stable unique locators and preserve source bytes for standalone acquisition', async () => {
    expect(warehouseParts.length).toBe(definitions.length);
    expect(new Set(warehouseParts.map(({ locator }) => locator)).size).toBe(warehouseParts.length);
    expect(findWarehousePart('warehouse.missing')).toBeUndefined();
    for (const part of warehouseParts) {
      expect(findWarehousePart(part.locator)).toBe(part);
      const id = part.locator.replace('warehouse.', '');
      const paths = new Set(part.assets.map(({ path }) => path));
      expect(paths.has(part.manifest.assets.main.entryPath)).toBe(true);
      for (const asset of part.assets) {
        const bytes = await asset.load();
        const expected = await readFile(join(packageRoot, 'parts', id, asset.path));
        expect(Buffer.from(bytes).equals(expected)).toBe(true);
        if (asset.path.endsWith('.ts')) {
          const source = new TextDecoder().decode(bytes);
          for (const [, dependency] of source.matchAll(/from ["']([^"']+)["']/g)) {
            if (!dependency?.startsWith('.')) {
              continue;
            }
            expect(dependency.startsWith('./')).toBe(true);
            expect(paths.has(dependency.slice(2).replace(/\.js$/, '.ts'))).toBe(true);
          }
        }
      }
    }
  }, 60_000);

  it('should reject nonfinite, out-of-domain, missing, and unknown parameters before native geometry', () => {
    expect(() => {
      validateParameters({ size: 3 }, { size: { min: 2, max: 4, values: [2, 4] } });
    }).toThrow(RangeError);
    expect(() => {
      validateParameters({ count: 2.5 }, { count: { min: 2, max: 4, integer: true } });
    }).toThrow(RangeError);
    for (const { part } of definitions) {
      validateParameters(part.parameters, part.domains);
      for (const [key, domain] of Object.entries(part.domains)) {
        for (const value of [Number.NaN, Number.POSITIVE_INFINITY, domain.min - 1, domain.max + 1, 'bad']) {
          const run = () => {
            validateParameters({ ...part.parameters, [key]: value }, part.domains);
          };
          expect(run).toThrow(RangeError);
          expect(run).toThrow(`Parameter '${key}'`);
        }
      }
      expect(() => {
        validateParameters({}, part.domains);
      }).toThrow(RangeError);
      expect(() => {
        validateParameters({ ...part.parameters, unsupported: 1 }, part.domains);
      }).toThrow("Unknown parameter 'unsupported'");
    }
  });
});

/* oxlint-enable eslint/no-await-in-loop */
