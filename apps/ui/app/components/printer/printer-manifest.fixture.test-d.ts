import { describe, expectTypeOf, it } from 'vitest';
import type { MachineManifest } from '@taucad/runtime/machine';
import type { PrinterManifest } from '#components/printer/printer-manifest.fixture.js';
import { printerManifestOf, resolvePrinterManifest } from '#components/printer/printer-manifest.fixture.js';

describe('PrinterManifest', () => {
  it('should derive the scene facts from a full v3 machine manifest, so a provider manifest replaces the reference', () => {
    expectTypeOf(printerManifestOf).parameter(0).toEqualTypeOf<MachineManifest>();
    expectTypeOf(printerManifestOf).returns.toEqualTypeOf<PrinterManifest | undefined>();
    expectTypeOf(resolvePrinterManifest).parameter(0).toEqualTypeOf<MachineManifest | undefined>();
    expectTypeOf(resolvePrinterManifest).returns.toEqualTypeOf<PrinterManifest>();
  });
});
