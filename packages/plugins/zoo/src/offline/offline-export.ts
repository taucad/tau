/* oxlint-disable new-cap -- OpenCascade API uses PascalCase method names */
/* oxlint-disable eslint/max-params -- libcascade helpers take the instance followed by their operands */
/**
 * The engine's `export` command over libcascade writers.
 *
 * kcl-lib sends an `OutputFormat3d` and expects `files: [{ name, contents }]` with base64 contents, exactly like the
 * Zoo engine: glTF/GLB in glTF space (Y-up, metres), STEP/STL/OBJ/PLY in the requested coordinate system and units.
 */
import type { Oc, TopoDS_Shape } from '#offline/offline-occt.js';
import { compound } from '#offline/offline-occt.js';
import type { SolidEntity } from '#offline/offline-scene.js';
import { OfflineEngineError } from '#offline/offline-engine.types.js';

type Axis = { axis: 'x' | 'y' | 'z'; direction: 'positive' | 'negative' };
type Coords = { forward: Axis; up: Axis };

/** `OutputFormat3d` as kcl-lib serialises it. */
export type WireOutputFormat =
  | { type: 'gltf'; storage?: 'binary' | 'standard' | 'embedded'; presentation?: 'compact' | 'pretty' }
  | { type: 'step'; coords?: Coords; created?: string }
  | { type: 'stl'; storage?: 'ascii' | 'binary'; coords?: Coords; units?: string; selection?: unknown }
  | { type: 'obj'; coords?: Coords; units?: string }
  | {
      type: 'ply';
      storage?: 'ascii' | 'binary' | 'binary_little_endian' | 'binary_big_endian';
      coords?: Coords;
      units?: string;
    }
  | { type: 'fbx'; storage?: string };

/** Meshing tolerances for mesh formats: millimetres and radians. */
const linearDeflection = 0.1;
const angularDeflection = 0.3;

const unitPerMm: Record<string, number> = { mm: 1, cm: 0.1, m: 0.001, in: 1 / 25.4, ft: 1 / 304.8, yd: 1 / 914.4 };

const toBase64 = (bytes: Uint8Array<ArrayBuffer>): string => {
  let binary = '';
  const chunk = 0x80_00;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCodePoint(...bytes.subarray(index, index + chunk));
  }

  // oxlint-disable-next-line eslint/no-restricted-globals -- no base64 helper in this package's dependencies
  return btoa(binary);
};

let fileCounter = 0;
const temporaryPath = (extension: string): string => {
  fileCounter += 1;
  return `/tmp/offline_export_${Date.now()}_${fileCounter}.${extension}`;
};

const readAndUnlink = (oc: Oc, path: string): Uint8Array<ArrayBuffer> => {
  const bytes = new Uint8Array(oc.FS.readFile(path, { encoding: 'binary' }));
  oc.FS.unlink(path);
  return bytes;
};

/**
 * Builds an XCAF document with one labelled, coloured shape per solid.
 *
 * @param oc - libcascade instance
 * @param solids - visible solids
 * @param mesh - whether to triangulate each shape (mesh formats)
 * @returns the document
 */
function buildDocument(oc: Oc, solids: readonly SolidEntity[], mesh: boolean): InstanceType<Oc['TDocStd_Document']> {
  const document = new oc.TDocStd_Document(new oc.TCollection_ExtendedString());
  const mainLabel = document.Main();
  const shapeTool = oc.XCAFDoc_DocumentTool.ShapeTool(mainLabel);
  const colorTool = oc.XCAFDoc_DocumentTool.ColorTool(mainLabel);
  for (const solid of solids) {
    if (solid.shape.IsNull()) {
      continue;
    }

    if (mesh) {
      oc.BRepTools.Clean(solid.shape, false);
      new oc.BRepMesh_IncrementalMesh(solid.shape, linearDeflection, false, angularDeflection, false).delete();
    }

    const label = shapeTool.NewShape();
    shapeTool.SetShape(label, solid.shape);
    oc.TDataStd_Name.Set(label, new oc.TCollection_ExtendedString(solid.id));
    if (solid.color) {
      const color = new oc.Quantity_Color(
        solid.color.r,
        solid.color.g,
        solid.color.b,
        oc.Quantity_TypeOfColor.Quantity_TOC_sRGB,
      );
      colorTool.SetColor(label, color, oc.XCAFDoc_ColorType.XCAFDoc_ColorSurf);
    }
  }

  return document;
}

/**
 * Rotation that takes kcl-lib's native frame (Z up, -Y forward) to the requested coordinate system.
 *
 * @param oc - libcascade instance
 * @param coords - requested system
 * @returns transform, or undefined for the native system
 */
function coordsTrsf(oc: Oc, coords: Coords | undefined): InstanceType<Oc['gp_Trsf']> | undefined {
  if (!coords) {
    return undefined;
  }

  const vector = (axis: Axis): [number, number, number] => {
    const sign = axis.direction === 'negative' ? -1 : 1;
    return [axis.axis === 'x' ? sign : 0, axis.axis === 'y' ? sign : 0, axis.axis === 'z' ? sign : 0];
  };

  const [ux, uy, uz] = vector(coords.up);
  const [fx, fy, fz] = vector(coords.forward);
  // Native: up = +Z, forward = -Y. Already native: nothing to do.
  if (uz === 1 && fy === -1) {
    return undefined;
  }

  // Build the target frame from (forward, up) and map native axes onto it.
  const nativeTarget = new oc.gp_Ax3(
    new oc.gp_Pnt(0, 0, 0),
    new oc.gp_Dir(ux, uy, uz),
    new oc.gp_Dir(-fx, -fy, -fz).Crossed(new oc.gp_Dir(ux, uy, uz)),
  );
  const native = new oc.gp_Ax3(new oc.gp_Pnt(0, 0, 0), new oc.gp_Dir(0, 0, 1), new oc.gp_Dir(1, 0, 0));
  const trsf = new oc.gp_Trsf();
  trsf.SetTransformation(nativeTarget, native);
  return trsf;
}

const fileExists = (oc: Oc, path: string): boolean => {
  try {
    oc.FS.stat(path);
    return true;
  } catch {
    return false;
  }
};

const prepareShapes = (
  oc: Oc,
  solids: readonly SolidEntity[],
  trsf: InstanceType<Oc['gp_Trsf']> | undefined,
  unitScale: number,
): SolidEntity[] => {
  if (!trsf && unitScale === 1) {
    return [...solids];
  }

  return solids.map((solid) => {
    const total = new oc.gp_Trsf();
    if (trsf) {
      total.Multiply(trsf);
    }

    if (unitScale !== 1) {
      const scaling = new oc.gp_Trsf();
      scaling.SetScale(new oc.gp_Pnt(0, 0, 0), unitScale);
      total.PreMultiply(scaling);
    }

    const shape: TopoDS_Shape = new oc.BRepBuilderAPI_Transform(solid.shape, total, true, false).Shape();
    return { ...solid, shape };
  });
};

const exportGltf = (
  oc: Oc,
  solids: readonly SolidEntity[],
  binary: boolean,
): Array<{ name: string; bytes: Uint8Array<ArrayBuffer> }> => {
  const document = buildDocument(oc, solids, true);
  const path = temporaryPath(binary ? 'glb' : 'gltf');
  const writer = new oc.RWGltf_CafWriter(new oc.TCollection_AsciiString(path), binary);
  const converter = new oc.RWMesh_CoordinateSystemConverter();
  converter.SetInputLengthUnit(0.001);
  converter.SetInputCoordinateSystem(oc.RWMesh_CoordinateSystem.RWMesh_CoordinateSystem_Zup);
  converter.SetOutputLengthUnit(1);
  converter.SetOutputCoordinateSystem(oc.RWMesh_CoordinateSystem.RWMesh_CoordinateSystem_glTF);
  writer.SetCoordinateSystemConverter(converter);
  if (!binary) {
    writer.SetTransformationFormat(oc.RWGltf_WriterTrsfFormat.RWGltf_WriterTrsfFormat_Compact);
  }

  if (!writer.Perform(document, new oc.TColStd_IndexedDataMapOfStringString(), new oc.Message_ProgressRange())) {
    throw new OfflineEngineError('glTF export failed', 'internal_engine');
  }

  if (binary) {
    return [{ name: 'output.glb', bytes: readAndUnlink(oc, path) }];
  }

  const binPath = path.replace(/\.gltf$/, '.bin');
  const json = JSON.parse(new TextDecoder().decode(readAndUnlink(oc, path))) as { buffers?: Array<{ uri?: string }> };
  const bin = fileExists(oc, binPath) ? readAndUnlink(oc, binPath) : new Uint8Array();
  for (const buffer of json.buffers ?? []) {
    buffer.uri = `data:application/octet-stream;base64,${toBase64(bin)}`;
  }

  return [{ name: 'output.gltf', bytes: new TextEncoder().encode(JSON.stringify(json)) }];
};

const exportStep = (
  oc: Oc,
  solids: readonly SolidEntity[],
): Array<{ name: string; bytes: Uint8Array<ArrayBuffer> }> => {
  const writer = new oc.STEPControl_Writer();
  oc.Interface_Static.SetIVal('write.surfacecurve.mode', 1);
  oc.Interface_Static.SetCVal('write.step.unit', 'MM');
  for (const solid of solids) {
    writer.Transfer(solid.shape, oc.STEPControl_StepModelType.STEPControl_AsIs, true, new oc.Message_ProgressRange());
  }

  const path = temporaryPath('step');
  const status = writer.Write(path);
  if (status !== oc.IFSelect_ReturnStatus.IFSelect_RetDone) {
    throw new OfflineEngineError('STEP export failed', 'internal_engine');
  }

  return [{ name: 'output.step', bytes: readAndUnlink(oc, path) }];
};

const exportStl = (
  oc: Oc,
  solids: readonly SolidEntity[],
  ascii: boolean,
): Array<{ name: string; bytes: Uint8Array<ArrayBuffer> }> => {
  const shape = compound(
    oc,
    solids.map((solid) => solid.shape),
  );
  oc.BRepTools.Clean(shape, false);
  new oc.BRepMesh_IncrementalMesh(shape, linearDeflection, false, angularDeflection, false).delete();
  // `StlAPI_Writer.ASCIIMode` returns a reference the binding cannot assign through, so use the static writer.
  const path = temporaryPath('stl');
  if (!oc.StlAPI.Write(shape, path, ascii)) {
    throw new OfflineEngineError('STL export failed', 'internal_engine');
  }

  return [{ name: 'output.stl', bytes: readAndUnlink(oc, path) }];
};

const exportMeshDocument = (
  oc: Oc,
  solids: readonly SolidEntity[],
  kind: 'obj' | 'ply',
): Array<{ name: string; bytes: Uint8Array<ArrayBuffer> }> => {
  const document = buildDocument(oc, solids, true);
  const path = temporaryPath(kind);
  const writer =
    kind === 'obj'
      ? new oc.RWObj_CafWriter(new oc.TCollection_AsciiString(path))
      : new oc.RWPly_CafWriter(new oc.TCollection_AsciiString(path));
  if (!writer.Perform(document, new oc.TColStd_IndexedDataMapOfStringString(), new oc.Message_ProgressRange())) {
    throw new OfflineEngineError(`${kind.toUpperCase()} export failed`, 'internal_engine');
  }

  const files = [{ name: `output.${kind}`, bytes: readAndUnlink(oc, path) }];
  const materialPath = path.replace(/\.obj$/, '.mtl');
  if (kind === 'obj' && fileExists(oc, materialPath)) {
    files.push({ name: 'output.mtl', bytes: readAndUnlink(oc, materialPath) });
  }

  return files;
};

/**
 * Exports solids in a kcl-lib output format.
 *
 * @param oc - libcascade instance
 * @param solids - visible solids
 * @param format - output format
 * @returns files with their raw contents
 */
export function exportScene(
  oc: Oc,
  solids: readonly SolidEntity[],
  format: WireOutputFormat,
): Array<{ name: string; contents: Uint8Array<ArrayBuffer> }> {
  if (solids.length === 0) {
    throw new OfflineEngineError('Nothing to export', 'bad_request');
  }

  let files: Array<{ name: string; bytes: Uint8Array<ArrayBuffer> }>;
  switch (format.type) {
    case 'gltf': {
      files = exportGltf(oc, solids, format.storage === 'binary');
      break;
    }

    case 'step': {
      files = exportStep(oc, prepareShapes(oc, solids, coordsTrsf(oc, format.coords), 1));
      break;
    }

    case 'stl': {
      const unit = unitPerMm[format.units ?? 'mm'] ?? 1;
      files = exportStl(
        oc,
        prepareShapes(oc, solids, coordsTrsf(oc, format.coords), unit),
        format.storage !== 'binary',
      );
      break;
    }

    case 'obj': {
      const unit = unitPerMm[format.units ?? 'mm'] ?? 1;
      files = exportMeshDocument(oc, prepareShapes(oc, solids, coordsTrsf(oc, format.coords), unit), 'obj');
      break;
    }

    case 'ply': {
      const unit = unitPerMm[format.units ?? 'mm'] ?? 1;
      files = exportMeshDocument(oc, prepareShapes(oc, solids, coordsTrsf(oc, format.coords), unit), 'ply');
      break;
    }

    default: {
      throw new OfflineEngineError(`Offline export does not support ${format.type}`, 'bad_request');
    }
  }

  // The engine sends msgpack, where file contents travel as raw bytes (JSON would carry base64).
  return files.map((file) => ({ name: file.name, contents: file.bytes }));
}
