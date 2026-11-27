import { inject, it } from 'vitest';
// oxlint-disable-next-line import/no-empty-named-blocks -- Type-only ProvidedContext augmentation for `webGpuProfile`.
import type {} from '#test/webgpu-profile.test-utils.js';

/**
 * Whether this run draws on a real GPU: the GPU smoke (`viewer:test:e2e:webgpu`, `e2e-gpu-smoke.yml`) sets the
 * hardware profile on a disposable GPU host; CI's software lane (SwiftShader) sets `software`.
 */
export const hardwareProfile = inject('webGpuProfile') === 'hardware';

/** A row registration, as `it.each(rows)` returns it, for the call shapes this file accepts. */
type Register<Arguments extends readonly unknown[]> = (
  name: string,
  body: (...args: Arguments) => Promise<void> | void,
  rowTimeout?: number,
) => void;

/**
 * Register a parameterized row whose larger cases are hardware claims.
 *
 * A case for which `isHardwareClaim` holds runs on the hardware profile only, where the GPU smoke runs it weekly and by
 * dispatch; on the software lane it is reported as skipped. Every other case runs on both lanes. Use it for pixel
 * claims at 2560 px and 5K: SwiftShader rasterizes one 5K frame of the viewer's composition in 21 to 35 s on CI's four
 * cores (closeout package W12), so those rows would measure the CPU rasterizer, not the viewer. The same contract stays
 * on the software lane through the row's small-resolution cases.
 *
 * @param rows - The cases, as `it.each` takes them.
 * @param isHardwareClaim - Whether a case is a hardware claim.
 * @returns The registration, called like the result of `it.each(rows)`.
 */
export function eachWithHardwareClaims<Row extends readonly unknown[]>(
  rows: readonly Row[],
  isHardwareClaim: (row: Row) => boolean,
): Register<[...Row]>;
export function eachWithHardwareClaims<Row>(
  rows: readonly Row[],
  isHardwareClaim: (row: Row) => boolean,
): Register<[Row]>;
// oxlint-disable-next-line typescript/no-explicit-any -- Vitest's own each overloads take any case shape.
export function eachWithHardwareClaims(rows: readonly any[], isHardwareClaim: (row: any) => boolean): Register<any[]> {
  const everywhere = rows.filter((row) => !isHardwareClaim(row));
  const hardware = rows.filter((row) => isHardwareClaim(row));
  return (name, body, rowTimeout) => {
    if (everywhere.length > 0) {
      it.each(everywhere)(name, body, rowTimeout);
    }
    if (hardware.length > 0) {
      it.runIf(hardwareProfile).each(hardware)(name, body, rowTimeout);
    }
  };
}
