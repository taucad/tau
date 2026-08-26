// @vitest-environment node

/**
 * Replicad — GeoSpec AP242 STEP export (sub-blueprint SB2).
 *
 * Locks in the Tau-owned runtime export path: annotations resolve while live
 * shapes exist, STEP writes native AP242 names without legacy property stamps,
 * and serialized snapshots preserve resolved interface evidence.
 */

import { describe, expect, it, vi } from 'vitest';
import { replicadKernel } from '#replicad.kernel.js';
import { esbuildBundler } from '@taucad/esbuild';
import { assertSuccess, createTestRuntimeClient } from '@taucad/runtime-testing';
import { defineRuntime } from '@taucad/runtime/worker';

vi.setConfig({ testTimeout: 30_000 });

const interfacesModelSource = `
  import { drawRoundedRectangle, drawCircle } from 'replicad';
  import { face } from '@taucad/replicad/annotations';

  export default function main() {
    return [
      {
        shape: drawRoundedRectangle(50, 30).sketchOnPlane().extrude(10),
        name: 'base',
        interfaces: { mount: face((f) => f.inPlane('XY', 10)) },
      },
      { shape: drawCircle(10).sketchOnPlane().extrude(20).translate([100, 0, 0]), name: 'cylinder' },
    ];
  }
`;

const datumModelSource = `
  import { drawRoundedRectangle } from 'replicad';
  import { datum, face } from '@taucad/replicad/annotations';

  export default function main() {
    return {
      shape: drawRoundedRectangle(50, 30).sketchOnPlane().extrude(10),
      name: 'datumBase',
      interfaces: {
        mount: face((f) => f.inPlane('XY', 10)),
        alignmentDatum: datum({
          origin: [5, 2, 3],
          xAxis: [1, 0, 0],
          zAxis: [0, 1, 0],
        }),
      },
    };
  }
`;

const instancedModelSource = `
  import { drawRoundedRectangle } from 'replicad';
  import { face } from '@taucad/replicad/annotations';

  export default function main() {
    const prototype = drawRoundedRectangle(20, 10).sketchOnPlane().extrude(8);
    return [
      {
        shape: prototype.clone(),
        name: 'boltA',
        interfaces: { mount: face((f) => f.inPlane('XY', 8)) },
      },
      {
        shape: prototype.clone().translate([30, 0, 0]),
        name: 'boltB',
        interfaces: { mount: face((f) => f.inPlane('XY', 8)) },
      },
    ];
  }
`;

const conflictingInterfacesModelSource = `
  import { drawRoundedRectangle } from 'replicad';
  import { face } from '@taucad/replicad/annotations';

  export default function main() {
    const prototype = drawRoundedRectangle(20, 10).sketchOnPlane().extrude(8);
    return [
      {
        shape: prototype.clone(),
        name: 'left',
        interfaces: { mount: face((f) => f.inPlane('XY', 8)) },
      },
      {
        shape: prototype.clone().translate([30, 0, 0]),
        name: 'right',
        interfaces: { otherMount: face((f) => f.inPlane('XY', 8)) },
      },
    ];
  }
`;

const pbrModelSource = `
  import { drawCircle } from 'replicad';

  export default function main() {
    return {
      shape: drawCircle(12).sketchOnPlane().extrude(16),
      name: 'brushedCap',
      color: '#b8c0cc',
      metalness: 0.82,
      roughness: 0.27,
    };
  }
`;

const runtime = defineRuntime({ kernels: [replicadKernel()], bundlers: [esbuildBundler()] });

const exportStep = async (source: string, options?: { coordinateSystem: 'y-up' | 'z-up' }) => {
  const client = createTestRuntimeClient({ runtime, files: { 'main.ts': source } });
  try {
    return await client.export('step', {
      source: { path: 'main.ts' },
      ...(options ? { exportOptions: options } : {}),
    });
  } finally {
    await client.shutdown();
  }
};

const exportStepText = async (source: string, options?: { coordinateSystem: 'y-up' | 'z-up' }): Promise<string> => {
  const exportResult = await exportStep(source, options);
  assertSuccess(exportResult, 'GeoSpec STEP export');
  return new TextDecoder().decode(exportResult.data[0]!.bytes);
};

const expectResolvedInterfaceStep = (stepText: string): void => {
  expect([...stepText.matchAll(/NEXT_ASSEMBLY_USAGE_OCCURRENCE/g)]).toHaveLength(2);
  expect(stepText).toContain("PRODUCT('base'");
  expect(stepText).toContain("PRODUCT('cylinder'");
  expect(stepText).toMatch(/ADVANCED_FACE\('mount'/);
  expect(stepText).not.toContain('geospec:facts');
};

describe('Replicad — GeoSpec STEP export', () => {
  it('should export a root assembly with one NAUO per component and a native face() interface name', async () => {
    const stepText = await exportStepText(interfacesModelSource);

    expectResolvedInterfaceStep(stepText);
  });

  it('should export y-up STEP after rotating resolved interface datum vectors and geometry together', async () => {
    const stepText = await exportStepText(datumModelSource, { coordinateSystem: 'y-up' });

    expect(stepText).toContain("PRODUCT('datumBase'");
    expect(stepText).toMatch(/ADVANCED_FACE\('mount'/);
    expect(stepText).toMatch(/AXIS2_PLACEMENT_3D\('alignmentDatum'/);
    // Rec-practice supplemental geometry (F6): identity on items, CGR named
    // 'supplemental geometry', unnamed relationship — no custom dialect tags.
    expect(stepText).toMatch(/CONSTRUCTIVE_GEOMETRY_REPRESENTATION\('supplemental geometry'/);
    expect(stepText).not.toMatch(/geospec:datum/i);
  });

  it('should trace the complete model-to-STEP phase set', async () => {
    const client = createTestRuntimeClient({ runtime, files: { 'main.ts': datumModelSource } });
    const labels: string[] = [];
    const unsubscribe = client.on('telemetry', (entries) => labels.push(...entries.map(({ name }) => name)));
    try {
      const result = await client.export('step', { source: { path: 'main.ts' } });
      assertSuccess(result, 'GeoSpec STEP export');
    } finally {
      unsubscribe();
      await client.shutdown();
    }

    expect(labels).toEqual(
      expect.arrayContaining([
        'create.runOcMain',
        'create.resolveInterfaces',
        'create.serializeNativeHandle',
        'export.exportSTEP',
        'step.product.prepare',
        'step.document.build',
        'step.writer.perform',
        'step.writer.finalize',
        'step.file.transfer',
      ]),
    );
  });

  it('should preserve resolved interfaces across independent public-client renders', async () => {
    const first = await exportStepText(interfacesModelSource);
    const second = await exportStepText(interfacesModelSource);
    expectResolvedInterfaceStep(first);
    expectResolvedInterfaceStep(second);
  });

  it('should write repeated placed shapes as one shared AP242 product with two named occurrences', async () => {
    const stepText = await exportStepText(instancedModelSource);

    expect([...stepText.matchAll(/NEXT_ASSEMBLY_USAGE_OCCURRENCE/g)]).toHaveLength(2);
    expect(stepText).toContain("PRODUCT('assembly'");
    expect(stepText).toContain("PRODUCT('boltA'");
    expect(stepText).not.toContain("PRODUCT('boltB'");
    expect(stepText).toContain("'boltA'");
    expect(stepText).toContain("'boltB'");
  });

  it('should reject shared prototypes with conflicting resolved interface sets', async () => {
    const exportResult = await exportStep(conflictingInterfacesModelSource);

    expect(exportResult.success).toBe(false);
    if (!exportResult.success) {
      expect(exportResult.issues.map((issue) => issue.message).join('\n')).toContain(
        "shared by occurrences 'left' and 'right'",
      );
    }
  });

  it('should emit AP242 visual-material entities for PBR appearance and omit validation properties', async () => {
    const stepText = await exportStepText(pbrModelSource);

    expect(stepText).toContain("PRODUCT('brushedCap'");
    expect(stepText).toMatch(/SURFACE_STYLE|PRESENTATION_STYLE|DRAUGHTING_MODEL/);
    expect(stepText).not.toContain("PROPERTY_DEFINITION('volume'");
    expect(stepText).not.toContain("PROPERTY_DEFINITION('area'");
    expect(stepText).not.toContain("PROPERTY_DEFINITION('centroid'");
    expect(stepText).not.toContain('geospec:facts');
  });
});
