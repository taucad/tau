import { describe, expect, it } from 'vitest';
import { machineActionInputSchema, requestJobInputSchema } from '#schemas/tools/machine.tool.schema.js';

describe('machineActionInputSchema', () => {
  /* Presence is a person's statement in Tau; an agent never makes it. */
  it('should refuse an attended claim from the agent', () => {
    expect(
      machineActionInputSchema.safeParse({ componentId: 'controller', action: 'run.resume', attended: true }).success,
    ).toBe(false);
    expect(machineActionInputSchema.safeParse({ componentId: 'controller', action: 'run.resume' }).success).toBe(true);
  });
});

describe('requestJobInputSchema', () => {
  it.each([
    [{ targetFile: 'main.ts' }, true],
    [{ artifact: 'cam/part.nc' }, true],
    [{ artifact: 'cam/part.gcode.3mf', plate: 'cool' }, true],
    [{}, false],
    [{ targetFile: 'main.ts', artifact: 'cam/part.nc' }, false],
    [{ artifact: 'cam/part.nc', preset: 'fine' }, false],
    [{ artifact: 'cam/part.nc', options: { walls: 3 } }, false],
    [{ artifact: 'cam/part.nc', bambuStudio: { settings: { layer: 3 } } }, false],
    /* A saved slicing profile applies to a slice only, never silently to a finished program. */
    [{ artifact: 'cam/part.nc', profileId: 'fine-pla' }, false],
    [{ targetFile: 'main.ts', profiles: { printer: 'X1C' } }, false],
  ])('should take exactly one source, and slicing choices only for a CAD source: %o', (input, accepted) => {
    expect(requestJobInputSchema.safeParse(input).success).toBe(accepted);
  });
});
