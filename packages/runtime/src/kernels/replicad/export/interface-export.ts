/* oxlint-disable max-params, new-cap -- OCJS embind exposes C++ PascalCase members and generated Init signatures. */
/* eslint-disable @typescript-eslint/naming-convention -- OCJS embind exposes C++ PascalCase members and stock Replicad uses exportSTEP. */
import type {
  OpenCascadeInstance,
  Quantity_ColorRGBA,
  TCollection_ExtendedString,
  TCollection_HAsciiString,
  TDF_Label,
  TDocStd_Document,
  TopLoc_Location,
  TopoDS_Face,
  XCAFDoc_ShapeTool,
} from 'replicad-opencascadejs';
import type { AnyShape, ShapeConfig, SimplePoint, SupportedUnit } from 'replicad';
import { cast } from 'replicad';
import type { Meshable, ReplicadShapeIdentityInfo } from '#kernels/replicad/utils/tessellation-instancing.js';
import { inspectReplicadShapeIdentity } from '#kernels/replicad/utils/tessellation-instancing.js';

/**
 * Serializable interface evidence resolved while Replicad shapes are still live.
 *
 * @public
 */
export type ResolvedReplicadInterface =
  | { kind: 'face' | 'axis'; name: string; faceIndex: number }
  | { kind: 'datum'; name: string; origin: SimplePoint; xAxis: SimplePoint; zAxis: SimplePoint };

type Deletable = { delete?: () => void };
type TCollectionAsciiStringLike = unknown;
type StandardTransientLike = Deletable & {
  IsKind?: (type: unknown) => boolean;
};
type StepRepresentationItemLike = StandardTransientLike;
type StepRepresentationContextLike = StandardTransientLike;
type StepRepresentationLike = StandardTransientLike & {
  ContextOfItems: () => StepRepresentationContextLike;
};
type StepModelLike = {
  NbEntities: () => number;
  Value: (index: number) => StandardTransientLike;
  AddWithRefs: (entity: StandardTransientLike, level: number, listAll: boolean) => void;
  TypeName?: (entity: StandardTransientLike, complete: boolean) => string;
};
type StepProductRepresentationRow = {
  representation: StepRepresentationLike;
  productName?: string;
};
type EntryDatumPlacements = {
  productName: string;
  datums: Array<Extract<ResolvedReplicadInterface, { kind: 'datum' }>>;
};
type PreparedStepOccurrence = ShapeConfig & {
  resolvedInterfaces?: ResolvedReplicadInterface[];
  index: number;
  occurrenceName: string;
  identity: ReplicadShapeIdentityInfo;
  prototypeInterfaces?: ResolvedReplicadInterface[];
  interfaceSignature: string;
};
type PrototypeStepProduct = {
  prototypeHash: string;
  productName: string;
  prototypeShape: AnyShape;
  firstOccurrence: PreparedStepOccurrence;
  interfaceSignature: string;
  interfaces?: ResolvedReplicadInterface[];
  occurrences: PreparedStepOccurrence[];
};
type StepEntityConstructors = {
  NCollection_HArray1_handle_StepRepr_RepresentationItem?: new (
    lower: number,
    upper: number,
    value: StepRepresentationItemLike,
  ) => unknown;
  StepGeom_Axis2Placement3d?: new () => StandardTransientLike & {
    Init: (
      name: TCollection_HAsciiString,
      location: StandardTransientLike,
      hasAxis: boolean,
      axis: StandardTransientLike,
      hasRefDirection: boolean,
      refDirection: StandardTransientLike,
    ) => void;
  };
  StepGeom_CartesianPoint?: new () => StandardTransientLike & {
    Init3D: (name: TCollection_HAsciiString, x: number, y: number, z: number) => void;
  };
  StepGeom_Direction?: new () => StandardTransientLike & {
    Init3D: (name: TCollection_HAsciiString, x: number, y: number, z: number) => void;
  };
  StepRepr_ConstructiveGeometryRepresentation?: new () => StepRepresentationLike & {
    Init: (name: TCollection_HAsciiString, items: unknown, context: StepRepresentationContextLike) => void;
  };
  StepRepr_ConstructiveGeometryRepresentationRelationship?: new () => StandardTransientLike & {
    Init: (
      name: TCollection_HAsciiString,
      description: TCollection_HAsciiString,
      rep1: StepRepresentationLike,
      rep2: StepRepresentationLike,
    ) => void;
  };
  TCollection_AsciiString?: new (value: string) => TCollectionAsciiStringLike;
};
type StepNamedStringLike = {
  ToCString?: () => string;
  ToExtString?: () => string;
};

const wrapString = (oc: OpenCascadeInstance, value: string): TCollection_ExtendedString =>
  new oc.TCollection_ExtendedString(value, true);

const wrapAscii = (oc: OpenCascadeInstance, value: string): TCollection_HAsciiString =>
  new oc.TCollection_HAsciiString(value);

const wrapInlineAscii = (
  oc: OpenCascadeInstance,
  value: string,
): TCollectionAsciiStringLike | TCollection_HAsciiString => {
  const asciiCtor = (oc as unknown as StepEntityConstructors).TCollection_AsciiString;
  return asciiCtor ? new asciiCtor(value) : wrapAscii(oc, value);
};

const callStepMethod = <T>(value: unknown, methodName: string): T | undefined => {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const method = (value as Record<string, unknown>)[methodName];
  if (typeof method !== 'function') {
    return undefined;
  }
  return method.call(value) as T;
};

const stepString = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }
  const stringLike = value as StepNamedStringLike | undefined;
  return stringLike?.ToCString?.() ?? stringLike?.ToExtString?.() ?? '';
};

const parseHexSlice = (hex: string, index: number): number =>
  Number.parseInt(hex.slice(index * 2, (index + 1) * 2), 16);

const colorFromHex = (hex: string): [number, number, number] => {
  let color = hex.startsWith('#') ? hex.slice(1) : hex;
  if (color.length === 3) {
    color = color.replaceAll(/([\da-f])/gi, '$1$1');
  }
  return [parseHexSlice(color, 0), parseHexSlice(color, 1), parseHexSlice(color, 2)];
};

const wrapColor = (oc: OpenCascadeInstance, hex: string, alpha = 1): Quantity_ColorRGBA => {
  const [r, g, b] = colorFromHex(hex);
  return new oc.Quantity_ColorRGBA(r / 255, g / 255, b / 255, alpha);
};

const r6 = (value: number): number => {
  const rounded = Math.round(value * 1e6) / 1e6;
  return Object.is(rounded, -0) ? 0 : rounded;
};

const transformDatumPointToProductFrame = (
  oc: OpenCascadeInstance,
  location: TopLoc_Location,
  value: SimplePoint,
): SimplePoint => {
  const inverse = location.Inverted();
  const transform = inverse.Transformation();
  const point = new oc.gp_Pnt(value[0], value[1], value[2]);
  point.Transform(transform);
  const result: SimplePoint = [r6(point.X()), r6(point.Y()), r6(point.Z())];
  point.delete();
  transform.delete();
  inverse.delete();
  return result;
};

const transformDatumAxisToProductFrame = (
  oc: OpenCascadeInstance,
  location: TopLoc_Location,
  value: SimplePoint,
): SimplePoint => {
  const inverse = location.Inverted();
  const transform = inverse.Transformation();
  const direction = new oc.gp_Dir(value[0], value[1], value[2]);
  direction.Transform(transform);
  const result: SimplePoint = [r6(direction.X()), r6(direction.Y()), r6(direction.Z())];
  direction.delete();
  transform.delete();
  inverse.delete();
  return result;
};

const transformInterfacesToProductFrame = (
  oc: OpenCascadeInstance,
  shape: AnyShape,
  interfaces: ResolvedReplicadInterface[] | undefined,
): ResolvedReplicadInterface[] | undefined => {
  if (!interfaces || interfaces.length === 0) {
    return interfaces;
  }

  const location = shape.wrapped.Location();
  try {
    if (location.IsIdentity()) {
      return interfaces.map((entry) => ({ ...entry }));
    }

    return interfaces.map((entry) =>
      entry.kind === 'datum'
        ? {
            ...entry,
            origin: transformDatumPointToProductFrame(oc, location, entry.origin),
            xAxis: transformDatumAxisToProductFrame(oc, location, entry.xAxis),
            zAxis: transformDatumAxisToProductFrame(oc, location, entry.zAxis),
          }
        : { ...entry },
    );
  } finally {
    location.delete();
  }
};

const interfaceSignature = (interfaces: ResolvedReplicadInterface[] | undefined): string =>
  JSON.stringify(
    (interfaces ?? [])
      .map((entry) =>
        entry.kind === 'datum'
          ? {
              kind: entry.kind,
              name: entry.name,
              origin: entry.origin.map(r6),
              xAxis: entry.xAxis.map(r6),
              zAxis: entry.zAxis.map(r6),
            }
          : { kind: entry.kind, name: entry.name, faceIndex: entry.faceIndex },
      )
      .sort((left, right) => `${left.kind}:${left.name}`.localeCompare(`${right.kind}:${right.name}`)),
  );

const shapeWithoutTopLocation = (oc: OpenCascadeInstance, shape: AnyShape): AnyShape => {
  const location = shape.wrapped.Location();
  if (location.IsIdentity()) {
    location.delete();
    return shape;
  }

  const identity = new oc.TopLoc_Location();
  const prototype = cast(shape.wrapped.Located(identity, false));
  identity.delete();
  location.delete();
  return prototype;
};

const findProductFaceByIndex = (
  oc: OpenCascadeInstance,
  productLabel: TDF_Label,
  faceIndex: number,
): TopoDS_Face | undefined => {
  const productShape = oc.XCAFDoc_ShapeTool.GetShape(productLabel);
  const explorer = new oc.TopExp_Explorer(productShape, oc.TopAbs_ShapeEnum.TopAbs_FACE);
  let index = 0;

  while (explorer.More()) {
    if (index === faceIndex) {
      return oc.TopoDS.Face(explorer.Value());
    }
    explorer.Next();
    index += 1;
  }

  return undefined;
};

const addNamedFace = (options: {
  oc: OpenCascadeInstance;
  shapeTool: XCAFDoc_ShapeTool;
  productLabel: TDF_Label;
  entryName: string;
  shape: AnyShape;
  name: string;
  faceIndex: number;
}): void => {
  const face = findProductFaceByIndex(options.oc, options.productLabel, options.faceIndex);
  if (!face) {
    throw new Error(
      `GeoSpec interface '${options.name}' on entry '${options.entryName}' references missing faceIndex ${options.faceIndex}`,
    );
  }

  const subLabel = new options.oc.TDF_Label();
  const added = options.shapeTool.AddSubShape(options.productLabel, face, subLabel);
  const found =
    added ||
    options.shapeTool.FindSubShape(options.productLabel, face, subLabel) ||
    options.shapeTool.SearchUsingMap(face, subLabel, true, true);
  if (!found || subLabel.IsNull()) {
    throw new Error(
      `GeoSpec interface '${options.name}' on entry '${options.entryName}': resolved face is not a product subshape`,
    );
  }
  if (!added) {
    throw new Error(
      `GeoSpec interface '${options.name}' on entry '${options.entryName}': two interfaces cannot share one face`,
    );
  }
  options.oc.TDataStd_Name.Set(subLabel, wrapString(options.oc, options.name));
};

const attachInterfaces = (options: {
  oc: OpenCascadeInstance;
  shapeTool: XCAFDoc_ShapeTool;
  productLabel: TDF_Label;
  entryName: string;
  shape: AnyShape;
  interfaces: ResolvedReplicadInterface[] | undefined;
}): void => {
  for (const entry of options.interfaces ?? []) {
    if (entry.kind === 'datum') {
      continue;
    }
    addNamedFace({ ...options, name: entry.name, faceIndex: entry.faceIndex });
  }
};

const attachVisualMaterial = (options: {
  oc: OpenCascadeInstance;
  productLabel: TDF_Label;
  name: string;
  color?: string;
  alpha?: number;
  metalness?: number;
  roughness?: number;
}): void => {
  const { oc, productLabel, color, alpha } = options;
  oc.XCAFDoc_DocumentTool.ColorTool(productLabel).SetColor(
    productLabel,
    wrapColor(oc, color ?? '#f00', alpha ?? 1),
    oc.XCAFDoc_ColorType.XCAFDoc_ColorSurf,
  );

  let tool:
    | undefined
    | {
        AddMaterial?: (material: unknown, name: TCollectionAsciiStringLike | TCollection_HAsciiString) => TDF_Label;
        SetShapeMaterial?: (label: TDF_Label, material: TDF_Label) => void;
      };
  try {
    tool = oc.XCAFDoc_DocumentTool.VisMaterialTool(productLabel) as typeof tool;
  } catch {
    tool = undefined;
  }
  const materialCtor = (oc as unknown as { XCAFDoc_VisMaterial?: new () => unknown }).XCAFDoc_VisMaterial;
  const pbrCtor = (oc as unknown as { XCAFDoc_VisMaterialPBR?: new () => Record<string, unknown> })
    .XCAFDoc_VisMaterialPBR;
  if (!tool?.AddMaterial || !tool.SetShapeMaterial || !materialCtor || !pbrCtor) {
    return;
  }

  const material = new materialCtor() as { SetPbrMaterial?: (pbr: unknown) => void };
  const pbr = new pbrCtor();
  if (color) {
    pbr['BaseColor'] = wrapColor(oc, color, alpha ?? 1);
  }
  pbr['Metallic'] = options.metalness ?? 0;
  pbr['Roughness'] = options.roughness ?? 1;
  pbr['IsDefined'] = true;
  material.SetPbrMaterial?.(pbr);
  const materialLabel = tool.AddMaterial(material, wrapInlineAscii(oc, options.name));
  tool.SetShapeMaterial(productLabel, materialLabel);
};

const prepareStepProducts = (
  oc: OpenCascadeInstance,
  shapes: Array<ShapeConfig & { resolvedInterfaces?: ResolvedReplicadInterface[] }>,
): PrototypeStepProduct[] => {
  const products: PrototypeStepProduct[] = [];
  const productsByHash = new Map<string, PrototypeStepProduct>();

  for (const [index, shapeConfig] of shapes.entries()) {
    const { shape, name, resolvedInterfaces } = shapeConfig;
    if (resolvedInterfaces && !name) {
      throw new Error(`GeoSpec: entry ${index} declares interfaces but has no name`);
    }

    const identity = inspectReplicadShapeIdentity({ openCascade: oc, shape: shape as Meshable });
    const { prototypeHash = `entry-${index}` } = identity;
    const prototypeInterfaces = transformInterfacesToProductFrame(oc, shape, resolvedInterfaces);
    const signature = interfaceSignature(prototypeInterfaces);
    const occurrence: PreparedStepOccurrence = {
      ...shapeConfig,
      index,
      occurrenceName: name ?? `shape-${index + 1}`,
      identity,
      prototypeInterfaces,
      interfaceSignature: signature,
    };

    const existing = productsByHash.get(prototypeHash);
    if (existing) {
      if (existing.interfaceSignature !== signature) {
        throw new Error(
          `GeoSpec: prototypeHash ${prototypeHash} is shared by occurrences '${existing.firstOccurrence.occurrenceName}' and '${occurrence.occurrenceName}' but their resolved interface sets differ`,
        );
      }
      existing.occurrences.push(occurrence);
      continue;
    }

    const product: PrototypeStepProduct = {
      prototypeHash,
      productName: occurrence.occurrenceName,
      prototypeShape: shapeWithoutTopLocation(oc, shape),
      firstOccurrence: occurrence,
      interfaceSignature: signature,
      interfaces: prototypeInterfaces,
      occurrences: [occurrence],
    };
    products.push(product);
    productsByHash.set(prototypeHash, product);
  }

  return products;
};

const buildDocument = (
  oc: OpenCascadeInstance,
  shapes: Array<ShapeConfig & { resolvedInterfaces?: ResolvedReplicadInterface[] }>,
): { document: TDocStd_Document; entryDatums: EntryDatumPlacements[] } => {
  const document = new oc.TDocStd_Document(wrapString(oc, 'XmlOcaf'));
  oc.XCAFDoc_ShapeTool.SetAutoNaming(false);

  const mainLabel = document.Main();
  const shapeTool = oc.XCAFDoc_DocumentTool.ShapeTool(mainLabel);
  const materialTool = oc.XCAFDoc_DocumentTool.MaterialTool(mainLabel);
  const rootLabel = shapeTool.NewShape();
  const entryDatums: EntryDatumPlacements[] = [];
  const products = prepareStepProducts(oc, shapes);
  oc.TDataStd_Name.Set(rootLabel, wrapString(oc, 'assembly'));

  for (const { productName, prototypeShape, firstOccurrence, interfaces, occurrences } of products) {
    entryDatums.push({
      productName,
      datums: (interfaces ?? []).filter((entry) => entry.kind === 'datum'),
    });
    const productLabel = shapeTool.AddShape(prototypeShape.wrapped, false);
    oc.TDataStd_Name.Set(productLabel, wrapString(oc, productName));

    attachVisualMaterial({
      oc,
      productLabel,
      name: productName,
      color: firstOccurrence.color,
      alpha: firstOccurrence.alpha,
      metalness: firstOccurrence.metalness,
      roughness: firstOccurrence.roughness,
    });

    if (firstOccurrence.density !== undefined) {
      materialTool.SetMaterial(
        productLabel,
        wrapAscii(oc, productName),
        wrapAscii(oc, ''),
        firstOccurrence.density,
        wrapAscii(oc, 'g/cm3'),
        wrapAscii(oc, 'POSITIVE_RATIO_MEASURE'),
      );
    }

    attachInterfaces({
      oc,
      shapeTool,
      productLabel,
      entryName: productName,
      shape: prototypeShape,
      interfaces,
    });

    for (const occurrence of occurrences) {
      const location = occurrence.shape.wrapped.Location();
      const instanceLabel = shapeTool.AddComponent(rootLabel, productLabel, location);
      location.delete();
      oc.TDataStd_Name.Set(instanceLabel, wrapString(oc, occurrence.occurrenceName));
      attachVisualMaterial({
        oc,
        productLabel: instanceLabel,
        name: occurrence.occurrenceName,
        color: occurrence.color,
        alpha: occurrence.alpha,
        metalness: occurrence.metalness,
        roughness: occurrence.roughness,
      });
    }
  }

  shapeTool.UpdateAssemblies();
  return { document, entryDatums };
};

const collectProductRepresentations = (model: StepModelLike): StepProductRepresentationRow[] => {
  const rows: StepProductRepresentationRow[] = [];
  for (let index = 1; index <= model.NbEntities(); index++) {
    const entity = model.Value(index);
    const typeName = model.TypeName?.(entity, false).toUpperCase();
    if (typeName !== undefined && typeName !== 'SHAPE_DEFINITION_REPRESENTATION') {
      continue;
    }
    const representation = (entity as { UsedRepresentation?: () => StepRepresentationLike }).UsedRepresentation?.();
    if (representation) {
      const representedDefinition = callStepMethod<unknown>(entity, 'Definition');
      const propertyDefinition = callStepMethod<unknown>(representedDefinition, 'PropertyDefinition');
      const characterizedDefinition = callStepMethod<unknown>(propertyDefinition, 'Definition');
      const productDefinition = callStepMethod<unknown>(characterizedDefinition, 'ProductDefinition');
      const formation = callStepMethod<unknown>(productDefinition, 'Formation');
      const product = callStepMethod<unknown>(formation, 'OfProduct');
      const productName = stepString(callStepMethod<unknown>(product, 'Name'));
      rows.push({ representation, ...(productName ? { productName } : {}) });
    }
  }
  return rows;
};

const requireDatumConstructors = (oc: OpenCascadeInstance): Required<StepEntityConstructors> => {
  const step = oc as unknown as StepEntityConstructors;
  const required = [
    'NCollection_HArray1_handle_StepRepr_RepresentationItem',
    'StepGeom_Axis2Placement3d',
    'StepGeom_CartesianPoint',
    'StepGeom_Direction',
    'StepRepr_ConstructiveGeometryRepresentation',
    'StepRepr_ConstructiveGeometryRepresentationRelationship',
  ] as const;
  const missing = required.filter((key) => !step[key]);
  if (missing.length > 0) {
    throw new Error(`GeoSpec datum export requires OCCT binding symbols: ${missing.join(', ')}`);
  }
  return step as Required<StepEntityConstructors>;
};

const makeDatumPlacement = (
  oc: OpenCascadeInstance,
  step: Required<StepEntityConstructors>,
  datum: Extract<ResolvedReplicadInterface, { kind: 'datum' }>,
): StepRepresentationItemLike => {
  const point = new step.StepGeom_CartesianPoint();
  point.Init3D(wrapAscii(oc, ''), datum.origin[0], datum.origin[1], datum.origin[2]);

  const xAxis = new step.StepGeom_Direction();
  xAxis.Init3D(wrapAscii(oc, ''), datum.xAxis[0], datum.xAxis[1], datum.xAxis[2]);

  const zAxis = new step.StepGeom_Direction();
  zAxis.Init3D(wrapAscii(oc, ''), datum.zAxis[0], datum.zAxis[1], datum.zAxis[2]);

  const placement = new step.StepGeom_Axis2Placement3d();
  placement.Init(wrapAscii(oc, datum.name), point, true, zAxis, true, xAxis);
  return placement;
};

const appendDatumRepresentation = (options: {
  oc: OpenCascadeInstance;
  step: Required<StepEntityConstructors>;
  model: StepModelLike;
  productName: string;
  subjectRepresentation: StepRepresentationLike;
  datums: Array<Extract<ResolvedReplicadInterface, { kind: 'datum' }>>;
}): void => {
  const { oc, step, model, productName, subjectRepresentation, datums } = options;
  for (const datum of datums) {
    const placement = makeDatumPlacement(oc, step, datum);
    const items = new step.NCollection_HArray1_handle_StepRepr_RepresentationItem(1, 1, placement);
    const representation = new step.StepRepr_ConstructiveGeometryRepresentation();
    representation.Init(wrapAscii(oc, datum.name), items, subjectRepresentation.ContextOfItems());

    const relationship = new step.StepRepr_ConstructiveGeometryRepresentationRelationship();
    relationship.Init(
      wrapAscii(oc, 'geospec:datum'),
      wrapAscii(oc, productName),
      representation,
      subjectRepresentation,
    );
    model.AddWithRefs(relationship, 0, true);
  }
};

const appendDatumPlacements = (
  oc: OpenCascadeInstance,
  model: StepModelLike,
  entryDatums: EntryDatumPlacements[],
): void => {
  if (!entryDatums.some((entry) => entry.datums.length > 0)) {
    return;
  }

  const step = requireDatumConstructors(oc);
  const allRepresentations = collectProductRepresentations(model);
  const representationsByProductName = new Map(
    allRepresentations
      .filter((entry): entry is StepProductRepresentationRow & { productName: string } => Boolean(entry.productName))
      .map((entry) => [entry.productName, entry.representation]),
  );

  for (const entry of entryDatums) {
    if (entry.datums.length === 0) {
      continue;
    }
    const representation = representationsByProductName.get(entry.productName);
    if (!representation) {
      throw new Error(`GeoSpec datum export could not find STEP product representation '${entry.productName}'`);
    }
    appendDatumRepresentation({
      oc,
      step,
      model,
      productName: entry.productName,
      subjectRepresentation: representation,
      datums: entry.datums,
    });
  }
};

export const exportSTEP = (
  oc: OpenCascadeInstance,
  shapes: Array<ShapeConfig & { resolvedInterfaces?: ResolvedReplicadInterface[] }>,
  { unit, modelUnit }: { unit?: SupportedUnit; modelUnit?: SupportedUnit } = {},
): Blob => {
  const { document, entryDatums } = buildDocument(oc, shapes);

  if (unit ?? modelUnit) {
    oc.Interface_Static.SetCVal('xstep.cascade.unit', (modelUnit ?? unit ?? 'MM').toUpperCase());
    oc.Interface_Static.SetCVal('write.step.unit', (unit ?? modelUnit ?? 'MM').toUpperCase());
  }

  const session = new oc.XSControl_WorkSession();
  const writer = new oc.STEPCAFControl_Writer(session, false);
  writer.SetColorMode(true);
  writer.SetLayerMode(true);
  writer.SetNameMode(true);
  writer.SetMaterialMode(true);
  writer.SetVisualMaterialMode(true);
  writer.SetPropsMode(false);
  oc.Interface_Static.SetIVal('write.surfacecurve.mode', 1);
  oc.Interface_Static.SetIVal('write.precision.mode', 0);
  oc.Interface_Static.SetIVal('write.step.assembly', 2);
  oc.Interface_Static.SetIVal('write.step.schema', 5);
  oc.Interface_Static.SetIVal('write.stepcaf.subshapes.name', 1);

  const filename = 'export.step';
  const progress = new oc.Message_ProgressRange();
  const success = writer.Perform(document, filename, progress);
  if (!success) {
    throw new Error('WRITE STEP FILE FAILED.');
  }

  if (entryDatums.some((entry) => entry.datums.length > 0)) {
    appendDatumPlacements(oc, writer.Writer().Model(false) as unknown as StepModelLike, entryDatums);
    const status = writer.Write(filename);
    if (status !== oc.IFSelect_ReturnStatus.IFSelect_RetDone) {
      throw new Error(`WRITE STEP FILE FAILED (${status}).`);
    }
  }

  const file = oc.FS.readFile(`/${filename}`);
  oc.FS.unlink(`/${filename}`);
  return new Blob([file as BlobPart], { type: 'application/STEP' });
};
