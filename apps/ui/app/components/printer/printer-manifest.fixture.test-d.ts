import { describe, expectTypeOf, it } from 'vitest';
import type { MachineManifest } from '@taucad/runtime/machine';
import type { PrinterManifest } from '#components/printer/printer-manifest.fixture.js';
import { resolvePrinterManifest } from '#components/printer/printer-manifest.fixture.js';

describe('PrinterManifest', () => {
  it('should accept a full machine manifest, so a provider manifest replaces the reference without adaptation', () => {
    expectTypeOf<MachineManifest>().toExtend<PrinterManifest>();
    expectTypeOf(resolvePrinterManifest).parameter(0).toEqualTypeOf<PrinterManifest | undefined>();
  });

  it('should not accept a manifest without geometry', () => {
    expectTypeOf<Omit<MachineManifest, 'geometry'>>().not.toExtend<PrinterManifest>();
  });
});
