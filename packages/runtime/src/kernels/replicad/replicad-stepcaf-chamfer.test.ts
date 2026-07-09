// @vitest-environment node
/* oxlint-disable new-cap -- OCJS embind exposes OCCT PascalCase methods. */
import { describe, expect, it, vi } from 'vitest';
import type { GeomAbs_SurfaceType, OpenCascadeInstance, TopoDS_Shape } from 'replicad-opencascadejs';
import { initOcct } from '#kernels/occt/oc-init.js';
import { replicad as replicadKernel } from '#kernels/replicad/replicad.kernel.js';
import { loadReplicadSingleWasm } from '#kernels/replicad/replicad-wasm-single-loader.js';
import { assertSuccess, createGeometryFile, createTestWorker } from '#testing/kernel-testing.utils.js';

vi.setConfig({ testTimeout: 120_000 });

type SurfaceCounts = {
  cone: number;
  cylinder: number;
};

type StepReadbackCounts = SurfaceCounts & { shapeLabels: number };

const singleWasmUrl = new URL('wasm/replicad_single.wasm', import.meta.url).href;

const chamferedAssemblySource = `
  import { makeBaseBox, makeCylinder } from 'replicad';

  export default function main() {
    const cube = makeBaseBox(50, 50, 50)
      .chamfer(5, edgeFinder => edgeFinder.inPlane('XY', 50))
      .translateX(-30);
    const cylinder = makeCylinder(25, 50)
      .chamfer(5, edgeFinder => edgeFinder.inPlane('XY', 50))
      .translateX(30);

    return [
      { shape: cube, name: 'Cube', color: '#888888' },
      { shape: cylinder, name: 'Cylinder', color: '#ff0000' },
    ];
  }
`;

const initReadbackOc = async (): Promise<OpenCascadeInstance> =>
  initOcct(singleWasmUrl, await loadReplicadSingleWasm());

const incrementSurfaceCount = (counts: SurfaceCounts, type: GeomAbs_SurfaceType, oc: OpenCascadeInstance): void => {
  if (type === oc.GeomAbs_SurfaceType.GeomAbs_Cone) {
    counts.cone += 1;
    return;
  }

  if (type === oc.GeomAbs_SurfaceType.GeomAbs_Cylinder) {
    counts.cylinder += 1;
  }
};

const countFaceSurfaces = (oc: OpenCascadeInstance, compound: TopoDS_Shape, counts: SurfaceCounts): void => {
  const explorer = new oc.TopExp_Explorer(compound, oc.TopAbs_ShapeEnum.TopAbs_FACE);
  try {
    while (explorer.More()) {
      const current = explorer.Current();
      const face = oc.TopoDS.Face(current);
      current.delete();
      const surface = new oc.BRepAdaptor_Surface(face, true);
      try {
        incrementSurfaceCount(counts, surface.GetType(), oc);
      } finally {
        surface.delete();
        face.delete();
      }
      explorer.Next();
    }
  } finally {
    explorer.delete();
  }
};

const readStepSurfaceCounts = (oc: OpenCascadeInstance, stepBytes: Uint8Array<ArrayBuffer>): StepReadbackCounts => {
  const stepPath = '/tmp/tau-replicad-stepcaf-chamfer.step';
  oc.FS.writeFile(stepPath, stepBytes);

  const documentName = new oc.TCollection_ExtendedString('XmlOcaf', true);
  const document = new oc.TDocStd_Document(documentName);
  const reader = new oc.STEPCAFControl_Reader();
  const progress = new oc.Message_ProgressRange();
  const mainLabel = document.Main();
  const shapeTool = oc.XCAFDoc_DocumentTool.ShapeTool(mainLabel);
  let compound: TopoDS_Shape | undefined;

  try {
    expect(reader.Perform(stepPath, document, progress)).toBe(true);
    const shapesLabel = oc.XCAFDoc_DocumentTool.ShapesLabel(mainLabel);
    const shapeLabels = shapesLabel.NbChildren();
    shapesLabel.delete();
    compound = shapeTool.GetOneShape();

    const counts: StepReadbackCounts = { cone: 0, cylinder: 0, shapeLabels };
    countFaceSurfaces(oc, compound, counts);

    return counts;
  } finally {
    compound?.delete();
    shapeTool.delete();
    mainLabel.delete();
    progress.delete();
    reader.delete();
    document.delete();
    documentName.delete();
    try {
      oc.FS.unlink(stepPath);
    } catch {
      // Cleanup is best effort because a failed write/read may leave no file.
    }
  }
};

describe('Replicad STEPCAF chamfer export', () => {
  it('should preserve the conical cylinder chamfer face when Tau exports STEP through the Replicad kernel', async () => {
    const mainFileName = 'main.ts';
    const files: Record<string, string> = {};
    files[mainFileName] = chamferedAssemblySource;

    const worker = await createTestWorker(replicadKernel, files);
    const createResult = await worker.createGeometry({ file: createGeometryFile(mainFileName), parameters: {} });
    assertSuccess(createResult, 'createGeometry for STEPCAF chamfer export');

    const exportResult = await worker.exportGeometry('step');
    assertSuccess(exportResult, 'STEPCAF chamfer export');

    const oc = await initReadbackOc();
    const counts = readStepSurfaceCounts(oc, exportResult.data[0]!.bytes);

    expect(counts.shapeLabels).toBeGreaterThanOrEqual(2);
    expect(counts.cone).toBe(1);
    expect(counts.cylinder).toBeGreaterThanOrEqual(1);
  });
});
