# geospec — Types (3)

85 top-level symbols. Signatures are verbatim typescript.

// Body selector over source-backed solid evidence
BodySelector: {
    kind: 'body';
    /** STEP occurrence scope, or the exact retained mesh primitive label including any ordinal suffix. */
    of?: string | RegExp;
    query?: BodyQuery;
    expect?: Cardinality;
}

  kind: 'body'

  // STEP occurrence scope, or the exact retained mesh primitive label including any ordinal suffix
  of: string | RegExp

  query: BodyQuery

  expect: Cardinality

// Ranked candidate reported on ambiguous/unmatched resolutions, with the disambiguating facts and — for near-misses — the excluding predicate
CandidateEntity: ResolvedEntity & {
    /** 1-based deterministic rank. */
    rank: number;
    /** Name of the predicate that excluded this near-miss candidate. */
    excludedBy?: string;
    /** Probe distance in millimetres, when a probe ranked this candidate. */
    distance?: number;
}

  id: string

  entityType: ResolvedEntityType

  occurrencePath: string

  facts: GeometryFacts

  // Snapshot topology ref (`'#o1.2.f7'`) for diagnostics and pinning
  topologyRef: string

  // 1-based deterministic rank
  rank: number

  // Name of the predicate that excluded this near-miss candidate
  excludedBy: string

  // Probe distance in millimetres, when a probe ranked this candidate
  distance: number

// Cardinality expectation for a selector resolution (master catalog G7)
Cardinality: 'one' | 'many' | {
    exactly: number;
} | {
    atLeast: number;
}

// Datum selector
DatumSelector: {
    kind: 'datum';
    /** Full datum name, or part-relative name when `of` scopes an occurrence. */
    name: string;
    of?: string | RegExp;
    expect?: Cardinality;
}

  kind: 'datum'

  // Full datum name, or part-relative name when `of` scopes an occurrence
  name: string

  of: string | RegExp

  expect: Cardinality

// Direction predicate with optional angular tolerance in degrees
DirectionPredicate: {
    direction: Vec3;
    angularToleranceDegrees?: number;
}

  direction: Vec3

  angularToleranceDegrees: number

// Face query predicates (master catalog G1/G2)
FaceQuery: {
    surfaceType?: SelectorSurfaceType;
    /** Face normal parallelism (planar faces). */
    normal?: DirectionPredicate;
    /** Rotation-axis parallelism (cylindrical/conical faces). */
    axis?: DirectionPredicate;
    radius?: NumericRange;
    area?: NumericRange;
    /** Plane offset band: signed distance of the plane from the origin. */
    offset?: NumericRange;
    /** Centroid coordinate bands, per-axis. */
    near?: Partial<Vec3Record> & {
        tolerance?: number;
    };
    /** Probe: point lying on the face surface (bounds + analytic residual). */
    containsPoint?: Vec3;
    /** Probe: face whose centroid is nearest to the point; ties are ambiguous. */
    nearestTo?: Vec3;
    /** Probe: first face hit by the ray (analytic plane/cylinder only in V1). */
    hitByRay?: RayPredicate;
    /** Restrict candidates to entities resolved by another selector. */
    within?: GeometrySelector;
    /** Deterministic ordering; `offsetAlong` projects centroids on `along`. */
    orderBy?: 'area' | 'radius' | 'offsetAlong';
    /** Projection direction for `orderBy: 'offsetAlong'`. */
    along?: Vec3;
    /** Deterministic pick after ordering: `'first' | 'last'` or 0-based index. */
    pick?: 'first' | 'last' | number;
    allOf?: FaceQuery[];
    anyOf?: FaceQuery[];
    not?: FaceQuery;
}

  surfaceType: SelectorSurfaceType

  // Face normal parallelism (planar faces)
  normal: DirectionPredicate

  // Rotation-axis parallelism (cylindrical/conical faces)
  axis: DirectionPredicate

  radius: NumericRange

  area: NumericRange

  // Plane offset band
  offset: NumericRange

  // Centroid coordinate bands, per-axis
  near: Partial<Vec3Record> & {
          tolerance?: number;
      }

  // Probe
  containsPoint: Vec3

  // Probe
  nearestTo: Vec3

  // Probe
  hitByRay: RayPredicate

  // Restrict candidates to entities resolved by another selector
  within: GeometrySelector

  // Deterministic ordering
  orderBy: 'area' | 'radius' | 'offsetAlong'

  // Projection direction for `orderBy
  along: Vec3

  // Deterministic pick after ordering
  pick: 'first' | 'last' | number

  allOf: FaceQuery[]

  anyOf: FaceQuery[]

  not: FaceQuery

// Face selector resolved via query/probe predicates
FaceSelector: {
    kind: 'face';
    of?: string | RegExp;
    query?: FaceQuery;
    expect?: Cardinality;
}

  kind: 'face'

  of: string | RegExp

  query: FaceQuery

  expect: Cardinality

// Typed geometric facts carried by a resolved entity — full `Vec3` normals/axes in the subject frame, never principal-axis projections
GeometryFacts: {
    surfaceType?: SelectorSurfaceType;
    normal?: Vec3;
    offset?: number;
    axisOrigin?: Vec3;
    axisDirection?: Vec3;
    radius?: number;
    area?: number;
    centroid?: Vec3;
    bounds?: {
        min: Vec3;
        max: Vec3;
    };
    /** Datum frame origin (subject frame). */
    origin?: Vec3;
    /** Datum frame x axis (subject frame). */
    xAxis?: Vec3;
    /** Datum frame z axis (subject frame). */
    zAxis?: Vec3;
    /** Occurrence placement transform (4x4 row-major, part-local → subject). */
    transform?: number[];
    productName?: string;
    faceIndex?: number;
    /** Group member count. */
    memberCount?: number;
}

  surfaceType: SelectorSurfaceType

  normal: Vec3

  offset: number

  axisOrigin: Vec3

  axisDirection: Vec3

  radius: number

  area: number

  centroid: Vec3

  bounds: {
          min: Vec3;
          max: Vec3;
      }

  // Datum frame origin (subject frame)
  origin: Vec3

  // Datum frame x axis (subject frame)
  xAxis: Vec3

  // Datum frame z axis (subject frame)
  zAxis: Vec3

  // Occurrence placement transform (4x4 row-major, part-local → subject)
  transform: number[]

  productName: string

  faceIndex: number

  // Group member count
  memberCount: number

// Structured result of resolving one selector against a selector index
GeometrySelection: {
    selector: GeometrySelector;
    status: GeometrySelectionStatus;
    /** Set-valued result (E4). */
    entities: ResolvedEntity[];
    expected: Cardinality;
    source: GeometrySelectionSource;
    stability: GeometrySelectionStability;
    /** Ranked candidates with facts — ambiguous/unmatched repair data. */
    candidates?: CandidateEntity[];
    diagnostics: GeometryDiagnostic[];
}

  selector: GeometrySelector

  status: GeometrySelectionStatus

  // Set-valued result (E4)
  entities: ResolvedEntity[]

  expected: Cardinality

  source: GeometrySelectionSource

  stability: GeometrySelectionStability

  // Ranked candidates with facts — ambiguous/unmatched repair data
  candidates: CandidateEntity[]

  diagnostics: GeometryDiagnostic[]

// Evidence source a selection resolved against
GeometrySelectionSource: 'step-xde' | 'brep' | 'mesh' | 'explicit'

// Durability-ladder stability class of a resolution
GeometrySelectionStability: 'authored' | 'derived-query' | 'derived-probe' | 'derived-ordinal' | 'explicit'

// Resolution status
GeometrySelectionStatus: 'resolved' | 'unmatched' | 'ambiguous' | 'unsupported'

// The V1 geometry selector union (D4 scope)
GeometrySelector: string | OccurrenceSelector | BodySelector | FaceSelector | AxisSelector | PlaneSelector | DatumSelector | InterfaceSelector | GroupSelector

// Group selector
GroupSelector: {
    kind: 'group';
    /** Full group prefix, or part-relative prefix when `of` scopes an occurrence. */
    name: string;
    of?: string | RegExp;
    expect?: Cardinality;
}

  kind: 'group'

  // Full group prefix, or part-relative prefix when `of` scopes an occurrence
  name: string

  of: string | RegExp

  expect: Cardinality

// Interface selector
InterfaceSelector: {
    kind: 'interface';
    /** Full interface name, or part-relative name when `of` scopes an occurrence. */
    name: string;
    of?: string | RegExp;
    expect?: Cardinality;
}

  kind: 'interface'

  // Full interface name, or part-relative name when `of` scopes an occurrence
  name: string

  of: string | RegExp

  expect: Cardinality

// Inclusive numeric band
NumericRange: number | {
    min?: number;
    max?: number;
}

// Occurrence selector
OccurrenceSelector: {
    kind: 'occurrence';
    /** Product or instance name to match. */
    name?: string | RegExp;
    /** Occurrence path (dot-joined instance segments, root omitted) to match. */
    path?: string | RegExp;
    expect?: Cardinality;
}

  kind: 'occurrence'

  // Product or instance name to match
  name: string | RegExp

  // Occurrence path (dot-joined instance segments, root omitted) to match
  path: string | RegExp

  expect: Cardinality

// Plane query predicates over planar face facts
PlaneQuery: {
    normal?: DirectionPredicate;
    offset?: NumericRange;
    area?: NumericRange;
    near?: Partial<Vec3Record> & {
        tolerance?: number;
    };
    containsPoint?: Vec3;
    nearestTo?: Vec3;
    within?: GeometrySelector;
    orderBy?: 'area' | 'offsetAlong';
    along?: Vec3;
    pick?: 'first' | 'last' | number;
    allOf?: PlaneQuery[];
    anyOf?: PlaneQuery[];
    not?: PlaneQuery;
}

  normal: DirectionPredicate

  offset: NumericRange

  area: NumericRange

  near: Partial<Vec3Record> & {
          tolerance?: number;
      }

  containsPoint: Vec3

  nearestTo: Vec3

  within: GeometrySelector

  orderBy: 'area' | 'offsetAlong'

  along: Vec3

  pick: 'first' | 'last' | number

  allOf: PlaneQuery[]

  anyOf: PlaneQuery[]

  not: PlaneQuery

// Plane selector resolved from planar face facts
PlaneSelector: {
    kind: 'plane';
    of?: string | RegExp;
    query?: PlaneQuery;
    expect?: Cardinality;
}

  kind: 'plane'

  of: string | RegExp

  query: PlaneQuery

  expect: Cardinality

// Ray probe predicate (world-space origin and direction, millimetres)
RayPredicate: {
    origin: Vec3;
    direction: Vec3;
}

  origin: Vec3

  direction: Vec3

// One resolved geometry entity (index-local, snapshot-scoped identity)
ResolvedEntity: {
    id: string;
    entityType: ResolvedEntityType;
    occurrencePath?: string;
    facts: GeometryFacts;
    /** Snapshot topology ref (`'#o1.2.f7'`) for diagnostics and pinning. */
    topologyRef?: string;
}

  id: string

  entityType: ResolvedEntityType

  occurrencePath: string

  facts: GeometryFacts

  // Snapshot topology ref (`'#o1.2.f7'`) for diagnostics and pinning
  topologyRef: string

// Entity kind a resolved entity denotes
ResolvedEntityType: 'occurrence' | 'body' | 'face' | 'axis' | 'plane' | 'datum' | 'interface' | 'group'

// Per-face analytic facts in the subject frame, matching the verification kernel's `faceFacts(occurrence)` JSON payload (SB1)
SelectorFaceFacts: {
    faceIndex: number;
    surfaceType: SelectorSurfaceType;
    normal?: Vec3;
    offset?: number;
    axisOrigin?: Vec3;
    axisDirection?: Vec3;
    radius?: number;
    area: number;
    centroid: Vec3;
    bounds: {
        min: Vec3;
        max: Vec3;
    };
}

  faceIndex: number

  surfaceType: SelectorSurfaceType

  normal: Vec3

  offset: number

  axisOrigin: Vec3

  axisDirection: Vec3

  radius: number

  area: number

  centroid: Vec3

  bounds: {
          min: Vec3;
          max: Vec3;
      }

// Surface classification carried by selector face facts, matching the verification kernel's `faceFacts` payload vocabulary
SelectorSurfaceType: 'plane' | 'cylinder' | 'cone' | 'sphere' | 'torus' | 'bspline' | 'other'

// JSON-serialized RegExp representation used by selector serialization
SerializedRegExp: {
    __isRegExp: true;
    pattern: string;
    flags: string;
}

  pattern: string

  flags: string

// Cartesian coordinate record used by coordinate-band (`near`) predicates
Vec3Record: {
    x: number;
    y: number;
    z: number;
}

  x: number

  y: number

  z: number

// Inputs for {@link buildSelectorIndex}
BuildSelectorIndexOptions: {
    xde: XdeReadResult;
    faceFactsByOccurrence: SelectorFaceFactsTable;
}

  xde: XdeReadResult

  faceFactsByOccurrence: SelectorFaceFactsTable

// One per-occurrence solid aggregate row backing body selectors
SelectorBodyRow: {
    id: string;
    occurrencePath: string;
    /** Total face area (mm²). */
    area: number;
    /** Area-weighted centroid of the occurrence's faces. */
    centroid?: Vec3;
    bounds?: {
        min: Vec3;
        max: Vec3;
    };
}

  id: string

  occurrencePath: string

  // Total face area (mm²)
  area: number

  // Area-weighted centroid of the occurrence's faces
  centroid: Vec3

  bounds: {
          min: Vec3;
          max: Vec3;
      }

// One materialized datum row (subject frame)
SelectorDatumRow: {
    id: string;
    fullName: string;
    occurrencePath: string;
    name: string;
    origin: Vec3;
    xAxis: Vec3;
    zAxis: Vec3;
}

  id: string

  fullName: string

  occurrencePath: string

  name: string

  origin: Vec3

  xAxis: Vec3

  zAxis: Vec3

// Per-occurrence face facts keyed by occurrence path, matching the verification kernel's `faceFacts(occurrence)` payload
SelectorFaceFactsTable: Record<string, {
    faces: SelectorFaceFacts[];
} | undefined>

// One BRep face row with subject-frame analytic facts
SelectorFaceRow: {
    id: string;
    occurrencePath: string;
    faceIndex: number;
    facts: SelectorFaceFacts;
    /** Snapshot topology ref, e.g. `#o1.f7`. */
    topologyRef: string;
}

  id: string

  occurrencePath: string

  faceIndex: number

  facts: SelectorFaceFacts

  // Snapshot topology ref, e.g
  topologyRef: string

// One reconstructed group row (shared `prefix[i]` family per occurrence)
SelectorGroupRow: {
    id: string;
    fullName: string;
    occurrencePath: string;
    /** Part-relative group prefix. */
    name: string;
    /** Members ordered by 1-based index. */
    members: SelectorInterfaceRow[];
    /** The members' 1-based indices, ascending. */
    memberIndices: number[];
}

  id: string

  fullName: string

  occurrencePath: string

  // Part-relative group prefix
  name: string

  // Members ordered by 1-based index
  members: SelectorInterfaceRow[]

  // The members' 1-based indices, ascending
  memberIndices: number[]

// The per-subject selector index consumed by the L3 resolution engine
SelectorIndex: {
    occurrences: SelectorOccurrenceRow[];
    faces: SelectorFaceRow[];
    bodies: SelectorBodyRow[];
    interfaces: SelectorInterfaceRow[];
    datums: SelectorDatumRow[];
    groups: SelectorGroupRow[];
    diagnostics: GeometryDiagnostic[];
}

  occurrences: SelectorOccurrenceRow[]

  faces: SelectorFaceRow[]

  bodies: SelectorBodyRow[]

  interfaces: SelectorInterfaceRow[]

  datums: SelectorDatumRow[]

  groups: SelectorGroupRow[]

  diagnostics: GeometryDiagnostic[]

// One authored interface record joining a subshape name to its face row
SelectorInterfaceRow: {
    id: string;
    /** Composed full name: `${occurrencePath}.${name}`. */
    fullName: string;
    occurrencePath: string;
    /** Part-relative authored name. */
    name: string;
    faceIndex: number;
    /** Entity kinds derived from the carrier face's geometry (profile rule). */
    entityKinds: ResolvedEntityType[];
    /** True when the named `faceIndex` no longer exists in the geometry. */
    dangling: boolean;
    face?: SelectorFaceRow;
}

  id: string

  // Composed full name
  fullName: string

  occurrencePath: string

  // Part-relative authored name
  name: string

  faceIndex: number

  // Entity kinds derived from the carrier face's geometry (profile rule)
  entityKinds: ResolvedEntityType[]

  // True when the named `faceIndex` no longer exists in the geometry
  dangling: boolean

  face: SelectorFaceRow

// One placed occurrence row in the selector index
SelectorOccurrenceRow: {
    path: string;
    productName: string;
    instanceName?: string;
    /** 4x4 row-major placement transform (part-local frame → subject frame). */
    transform: number[];
    shapeIndex: number;
    /** 1-based ordinal path in the occurrence tree (snapshot refs `#o1.2`). */
    ordinalPath: number[];
    /** Union of the occurrence's face bounds (subject frame), when faces exist. */
    bounds?: {
        min: Vec3;
        max: Vec3;
    };
}

  path: string

  productName: string

  instanceName: string

  // 4x4 row-major placement transform (part-local frame → subject frame)
  transform: number[]

  shapeIndex: number

  // 1-based ordinal path in the occurrence tree (snapshot refs `#o1.2`)
  ordinalPath: number[]

  // Union of the occurrence's face bounds (subject frame), when faces exist
  bounds: {
          min: Vec3;
          max: Vec3;
      }

// Payload accepted by the selector diagnostic builders
SelectorDiagnosticOptions: {
    selector: GeometrySelector;
    stability: GeometrySelectionStability;
    message: string;
    suggestion: string;
    /** Ranked candidates or near-misses with disambiguating facts. */
    candidates?: CandidateEntity[];
    /** Extra structured payload merged into `details`. */
    details?: Record<string, unknown>;
}

  selector: GeometrySelector

  stability: GeometrySelectionStability

  message: string

  suggestion: string

  // Ranked candidates or near-misses with disambiguating facts
  candidates: CandidateEntity[]

  // Extra structured payload merged into `details`
  details: Record<string, unknown>

// A configured STEP loader
GeoSpecStepLoader: (options: LoadStepOptions) => Promise<GeometrySubject>

// The five lazily materialized BRep evidence facets
BrepFacetName: 'summary' | 'massProperties' | 'validity' | 'faceFeatures' | 'wallThickness'

// Defaults accepted by {@link import ('./load-step.js').createStepLoader}
CreateStepLoaderOptions: Omit<LoadStepOptions, 'source'>

  mesh: boolean

  path: string

  name: string

  unit: GeoSpecUnit

  parameters: Record<string, unknown>

  streaming: StepStreamingMode

  meshLinearTolerance: number

  meshAngularToleranceDegrees: number

  maxBytes: number

  signal: AbortSignal

  onProgress: (event: StepLoadProgressEvent) => void

// Options for loading STEP/XDE/BRep evidence
LoadStepOptions: {
    source: StepSource;
    unit?: GeoSpecUnit;
    streaming?: StepStreamingMode;
    mesh?: boolean;
    meshLinearTolerance?: number;
    meshAngularToleranceDegrees?: number;
    maxBytes?: number;
    signal?: AbortSignal;
    onProgress?: (event: StepLoadProgressEvent) => void;
    parameters?: Record<string, unknown>;
    path?: string;
    name?: string;
}

  source: StepSource

  unit: GeoSpecUnit

  streaming: StepStreamingMode

  mesh: boolean

  meshLinearTolerance: number

  meshAngularToleranceDegrees: number

  maxBytes: number

  signal: AbortSignal

  onProgress: (event: StepLoadProgressEvent) => void

  parameters: Record<string, unknown>

  path: string

  name: string

// Progress event emitted while GeoSpec normalizes a STEP source
StepLoadProgressEvent: {
    phase: 'read-source' | 'parse-step' | 'mesh-brep';
    bytesRead?: number;
}

  phase: 'read-source' | 'parse-step' | 'mesh-brep'

  bytesRead: number

// STEP source forms accepted by {@link import ('./load-step.js').loadStep}
StepSource: string | URL | Uint8Array<ArrayBuffer> | ArrayBuffer | Blob | File | ReadableStream<Uint8Array<ArrayBuffer>> | AsyncIterable<Uint8Array<ArrayBuffer>>

// STEP reader strategy used by GeoSpec
StepStreamingMode: 'auto' | 'native-stream' | 'filesystem'

// One native AP242 datum placement row (a coordinate *frame* from the supplemental-geometry channel), expanded per occurrence like subshape names and expressed in subject-frame coordinates
XdeDatumPlacement: {
    occurrencePath: string;
    name: string;
    origin: [number, number, number];
    xAxis: [number, number, number];
    zAxis: [number, number, number];
}

  occurrencePath: string

  name: string

  origin: [number, number, number]

  xAxis: [number, number, number]

  zAxis: [number, number, number]

// One GD&T datum reference frame (`DATUM_SYSTEM`) with its precedence compartments, expanded per occurrence of the owning product
XdeDatumSystem: {
    occurrencePath: string;
    name: string;
    /** Compartments in precedence order; each holds one or more datum labels (common datums). */
    references: string[][];
}

  occurrencePath: string

  name: string

  // Compartments in precedence order
  references: string[][]

// One placed occurrence recovered from an AP242 STEP structure read
XdeOccurrence: {
    path: string;
    productName: string;
    instanceName?: string;
    /** 4x4 row-major placement transform (part-local frame -> subject frame). */
    transform: number[];
    /** Index into the native result's retained shape table (proof calls use it). */
    shapeIndex: number;
    /** Analytic axis-aligned bounds of the placed occurrence in subject space. */
    bounds?: {
        min: [number, number, number];
        max: [number, number, number];
    };
}

  path: string

  productName: string

  instanceName: string

  // 4x4 row-major placement transform (part-local frame -> subject frame)
  transform: number[]

  // Index into the native result's retained shape table (proof calls use it)
  shapeIndex: number

  // Analytic axis-aligned bounds of the placed occurrence in subject space
  bounds: {
          min: [number, number, number];
          max: [number, number, number];
      }

// Structured AP242 read result produced by the GeoSpec verification kernel's XDE reader (SB1)
XdeReadResult: {
    occurrences: XdeOccurrence[];
    subshapeNames: XdeSubshapeName[];
    datumPlacements: XdeDatumPlacement[];
    /** Semantic GD&T datums (the `DATUM` family) — empty for graphical-only files. */
    semanticDatums: XdeSemanticDatum[];
    /** GD&T datum reference frames (`DATUM_SYSTEM`). */
    datumSystems: XdeDatumSystem[];
    /** Supplemental-geometry `PLANE` items. */
    supplementalPlanes: XdeSupplementalPlane[];
    /** Free (non-assembly) top-level shapes — the flat-export degenerate case. */
    freeShapeCount: number;
}

  occurrences: XdeOccurrence[]

  subshapeNames: XdeSubshapeName[]

  datumPlacements: XdeDatumPlacement[]

  // Semantic GD&T datums (the `DATUM` family) — empty for graphical-only files
  semanticDatums: XdeSemanticDatum[]

  // GD&T datum reference frames (`DATUM_SYSTEM`)
  datumSystems: XdeDatumSystem[]

  // Supplemental-geometry `PLANE` items
  supplementalPlanes: XdeSupplementalPlane[]

  // Free (non-assembly) top-level shapes — the flat-export degenerate case
  freeShapeCount: number

// One semantic GD&T datum (`DATUM` + `DATUM_FEATURE` family) recovered from an AP242 file, attached to product faces via GEOMETRIC_ITEM_SPECIFIC_USAGE and expanded per occurrence of the owning product
XdeSemanticDatum: {
    occurrencePath: string;
    /** The GD&T datum identification letter(s): 'A', 'B', … */
    label: string;
    /** DATUM_FEATURE name when the file authored one. */
    featureName?: string;
    /** Attached faces in the owning product's deterministic face traversal order. */
    faceIndexes: number[];
}

  occurrencePath: string

  // The GD&T datum identification letter(s)
  label: string

  // DATUM_FEATURE name when the file authored one
  featureName: string

  // Attached faces in the owning product's deterministic face traversal order
  faceIndexes: number[]

// One part-relative authored subshape name, expanded per occurrence of the owning product (full selector name = `${occurrencePath}.${name}`)
XdeSubshapeName: {
    occurrencePath: string;
    name: string;
    shapeType: 'face' | 'edge' | 'vertex' | 'solid';
    /** Index within the owning product shape's deterministic face traversal order. */
    faceIndex: number;
}

  occurrencePath: string

  name: string

  shapeType: 'face' | 'edge' | 'vertex' | 'solid'

  // Index within the owning product shape's deterministic face traversal order
  faceIndex: number

// One supplemental-geometry `PLANE` item (e.g
XdeSupplementalPlane: {
    occurrencePath: string;
    name: string;
    origin: [number, number, number];
    normal: [number, number, number];
}

  occurrencePath: string

  name: string

  origin: [number, number, number]

  normal: [number, number, number]

// Runner-independent native assertion client
GeoSpecAssertionClient: {
    expectGeo(subject: GeoSpecNativeSubject | GeoSpecSubject): GeoSpecAssertionMatchers;
    query(options: MinimumDistanceQuery): Promise<MinimumDistanceResult>;
    query(options: GeoSpecQueryOptions): Promise<GeoSpecCanonicalClaimReport>;
}

  // GeoSpecAssertionClient.expectGeo (method)
  expectGeo(subject: GeoSpecNativeSubject | GeoSpecSubject): GeoSpecAssertionMatchers;

  // GeoSpecAssertionClient.query (method)
  query(options: MinimumDistanceQuery): Promise<MinimumDistanceResult>;
  query(options: GeoSpecQueryOptions): Promise<GeoSpecCanonicalClaimReport>;

// Flat construction options for a runner-independent native assertion client
GeoSpecAssertionClientOptions: {
    readonly claimId?: (matcher: GeoSpecMatcherName, sequence: number) => string;
    readonly engine: GeoSpecNativeEngine;
    /** Success-evidence profile of every claim and query; omitted means `complete`. */
    readonly evidenceProfile?: GeoSpecNativeEvidenceProfile;
    readonly subjectSlot?: string;
    readonly workUnitLimit?: number;
}

  claimId: (matcher: GeoSpecMatcherName, sequence: number) => string

  engine: GeoSpecNativeEngine

  // Success-evidence profile of every claim and query
  evidenceProfile: GeoSpecNativeEvidenceProfile

  subjectSlot: string

  workUnitLimit: number

// Standalone native matcher chain, including core-owned negation
GeoSpecAssertionMatchers: GeoSpecMatcherMethods<GeoSpecCanonicalClaimReport> & {
    readonly not: GeoSpecMatcherMethods<GeoSpecCanonicalClaimReport>;
}

  not: GeoSpecMatcherMethods<GeoSpecCanonicalClaimReport>

// One authored call shared by the collector and native assertion client
GeoSpecAuthoringInvocation: {
    readonly arguments: readonly unknown[];
    readonly expected: unknown;
    readonly kind: GeoSpecAssertion['kind'];
    readonly matcher: GeoSpecMatcherName;
    readonly polarity: GeoSpecClaimPolarity;
    readonly subject: unknown;
}

  arguments: readonly unknown[]

  expected: unknown

  kind: GeoSpecAssertion['kind']

  matcher: GeoSpecMatcherName

  polarity: GeoSpecClaimPolarity

  subject: unknown

// Matcher methods derived mechanically from the existing GeoSpec registry
GeoSpecMatcherMethods: {
    [Name in GeoSpecMatcherName]: (...arguments_: Parameters<GeoSpecMatcher[Name]>) => Result;
}

// One positive-only ancillary query
GeoSpecQueryOptions: {
    readonly capability: GeoSpecQueryCapability;
    readonly claimId?: string;
    readonly payload?: unknown;
    readonly subject: GeoSpecNativeSubject;
}

  capability: GeoSpecQueryCapability

  claimId: string

  payload: unknown

  subject: GeoSpecNativeSubject

// Complete native minimum and ordered finite witnesses in canonical millimetres/Z-up
MinimumDistanceFact: {
    readonly source: 'ap242';
    readonly assurance: 'exact-brep';
    readonly unit: 'mm';
    readonly coordinateSystem: 'z-up';
    readonly subjectHash: string;
    readonly algorithmProfile: 'geospec-minimum-distance-v1';
    readonly occurrences: readonly [string, string];
    readonly distance: number;
    readonly points: readonly [readonly [number, number, number], readonly [number, number, number]];
}

  source: 'ap242'

  assurance: 'exact-brep'

  unit: 'mm'

  coordinateSystem: 'z-up'

  subjectHash: string

  algorithmProfile: 'geospec-minimum-distance-v1'

  occurrences: readonly [string, string]

  distance: number

  points: readonly [readonly [number, number, number], readonly [number, number, number]]

// Complete AP242 minimum over two subject-bound occurrence paths
MinimumDistanceQuery: {
    readonly capability: 'minimumDistance';
    readonly subject: GeoSpecNativeSubject;
    readonly payload: {
        readonly pair: readonly [{
            readonly occurrencePath: string;
        }, {
            readonly occurrencePath: string;
        }];
    };
}

  capability: 'minimumDistance'

  subject: GeoSpecNativeSubject

  payload: {
          readonly pair: readonly [{
              readonly occurrencePath: string;
          }, {
              readonly occurrencePath: string;
          }];
      }

// Geometry refusal and infrastructure interruption never masquerade as facts
MinimumDistanceResult: {
    readonly status: 'complete';
    readonly fact: MinimumDistanceFact;
} | {
    readonly status: 'refused';
    readonly code: 'unsupported-evidence' | 'invalid-selection' | 'work-limit';
    readonly message: string;
} | {
    readonly status: 'interrupted';
    readonly code: 'cancelled' | 'executor-exited' | 'deadline' | 'engine-error';
    readonly message: string;
}

  status: 'complete'

// Flat native query transport options
GeoSpecNativeQueryOptions: Omit<GeoSpecNativeClaimOptions, 'arguments' | 'capability' | 'kind' | 'polarity'> & {
    readonly capability: GeoSpecQueryCapability | 'minimumDistance';
    readonly payload?: unknown;
}

  subject: GeoSpecNativeSubject

  engine: GeoSpecNativeEngine

  claimId: string

  evidenceProfile: GeoSpecNativeEvidenceProfile

  subjectSlot: string

  workUnitLimit: number

  capability: GeoSpecQueryCapability | 'minimumDistance'

  payload: unknown

// Existing positive-only ancillary operations owned by the native core
GeoSpecQueryCapability: Exclude<(typeof geoSpecQueryCapabilities)[number], 'minimumDistance'>

// Explicit support state for one source-attributed inventory field
GeoSpecPmiField: {
    readonly status: 'supported' | 'missing' | 'invalid' | 'ambiguous' | 'unsupported';
    readonly value: Value | null;
    readonly reason: string | null;
}

  status: 'supported' | 'missing' | 'invalid' | 'ambiguous' | 'unsupported'

  value: Value | null

  reason: string | null

// Original Part21 entity ID and exact source argument tokens
GeoSpecPmiRawEntity: {
    readonly sourceId: number;
    readonly kind: string;
    readonly arguments: readonly string[];
}

  sourceId: number

  kind: string

  arguments: readonly string[]

// Source-authored scalar and Rust-normalized reduced rational millimetres
GeoSpecPmiNumber: {
    readonly sourceId: number;
    readonly authoredText: string;
    readonly unitId: number;
    readonly unitRecords: readonly GeoSpecPmiRawEntity[];
    readonly millimetres: string;
    readonly name: string;
}

  sourceId: number

  authoredText: string

  unitId: number

  unitRecords: readonly GeoSpecPmiRawEntity[]

  millimetres: string

  name: string

// A uniquely forward-transferred face
GeoSpecPmiFaceAssociation: {
    readonly sourceFaceId: number;
    readonly occurrenceRoute: readonly number[];
    readonly occurrence: number | null;
    readonly publicFaceOrdinal: number;
}

  sourceFaceId: number

  occurrenceRoute: readonly number[]

  occurrence: number | null

  publicFaceOrdinal: number

// One ordered role reference, including incomplete source/transfer evidence
GeoSpecPmiShapeReference: {
    readonly sourceAspectId: number | null;
    readonly sourceUsageIds: readonly number[];
    readonly sourceItemIds: readonly number[];
    readonly requestedRoute: GeoSpecPmiField<readonly number[]>;
    readonly associations: GeoSpecPmiField<readonly GeoSpecPmiFaceAssociation[]>;
}

  sourceAspectId: number | null

  sourceUsageIds: readonly number[]

  sourceItemIds: readonly number[]

  requestedRoute: GeoSpecPmiField<readonly number[]>

  associations: GeoSpecPmiField<readonly GeoSpecPmiFaceAssociation[]>

// Normalized authored limits
GeoSpecPmiLimits: {
    readonly lowerMillimetres: string;
    readonly upperMillimetres: string;
    readonly basis: 'authored-limits' | 'nominal-plus-minus';
}

  lowerMillimetres: string

  upperMillimetres: string

  basis: 'authored-limits' | 'nominal-plus-minus'

// Source record preserving semantic/presentation separation and ordered roles
GeoSpecPmiRecord: {
    readonly sourceId: number;
    readonly family: 'dimension' | 'datum' | 'tolerance' | 'presentation';
    readonly channel: 'semantic' | 'presentation';
    readonly kind: string;
    readonly name: GeoSpecPmiField<string>;
    readonly first: readonly GeoSpecPmiShapeReference[];
    readonly second: readonly GeoSpecPmiShapeReference[];
    readonly numbers: GeoSpecPmiField<readonly GeoSpecPmiNumber[]>;
    readonly limits: GeoSpecPmiField<GeoSpecPmiLimits>;
    readonly interpretation: GeoSpecPmiField<string>;
    readonly raw: readonly GeoSpecPmiRawEntity[];
}

  sourceId: number

  family: 'dimension' | 'datum' | 'tolerance' | 'presentation'

  channel: 'semantic' | 'presentation'

  kind: string

  name: GeoSpecPmiField<string>

  first: readonly GeoSpecPmiShapeReference[]

  second: readonly GeoSpecPmiShapeReference[]

  numbers: GeoSpecPmiField<readonly GeoSpecPmiNumber[]>

  limits: GeoSpecPmiField<GeoSpecPmiLimits>

  interpretation: GeoSpecPmiField<string>

  raw: readonly GeoSpecPmiRawEntity[]

// Positive-only inventory value inside the ordinary canonical query report
GeoSpecPmiInventory: {
    readonly contract: 'geospec.pmi.inventory/v1';
    readonly status: 'semantic' | 'graphical-only' | 'empty';
    readonly fileSchema: string;
    readonly editionValidation: 'not-validated';
    readonly records: readonly GeoSpecPmiRecord[];
}

  contract: 'geospec.pmi.inventory/v1'

  status: 'semantic' | 'graphical-only' | 'empty'

  fileSchema: string

  editionValidation: 'not-validated'

  records: readonly GeoSpecPmiRecord[]

// Strict inventory output limits
GeoSpecPmiQueryPayload: {
    readonly maxRecords?: number;
    readonly maxOutputBytes?: number;
}

  maxRecords: number

  maxOutputBytes: number

// Complete inventory value
GeoSpecPmiQueryValue: {
    readonly inventory: GeoSpecPmiInventory;
    readonly subjectHash: string;
    readonly provenance: Readonly<Record<string, unknown>>;
}

  inventory: GeoSpecPmiInventory

  subjectHash: string

  provenance: Readonly<Record<string, unknown>>

// Full native assertion result with the exact core-owned bytes retained
GeoSpecCanonicalClaimReport: {
    readonly canonicalClaim: Uint8Array<ArrayBuffer>;
    readonly canonicalPlan: Uint8Array<ArrayBuffer>;
    readonly canonicalResult: Uint8Array<ArrayBuffer>;
    readonly claim: Readonly<Record<string, JSONValue>>;
    readonly claimId: string;
    readonly diagnostics: readonly JSONValue[];
    readonly evidence?: JSONValue;
    readonly polarity: GeoSpecClaimPolarity;
    readonly result: Readonly<Record<string, JSONValue>>;
    readonly status: GeoSpecCanonicalClaimStatus;
}

  canonicalClaim: Uint8Array<ArrayBuffer>

  canonicalPlan: Uint8Array<ArrayBuffer>

  canonicalResult: Uint8Array<ArrayBuffer>

  claim: Readonly<Record<string, JSONValue>>

  claimId: string

  diagnostics: readonly JSONValue[]

  evidence: JSONValue

  polarity: GeoSpecClaimPolarity

  result: Readonly<Record<string, JSONValue>>

  status: GeoSpecCanonicalClaimStatus

// Exact core bytes of one claim evaluated in one engine call
GeoSpecNativeClaimEvaluation: {
    readonly canonicalClaim: Uint8Array<ArrayBuffer>;
    readonly canonicalPlan: Uint8Array<ArrayBuffer>;
    readonly canonicalResult: Uint8Array<ArrayBuffer>;
}

  canonicalClaim: Uint8Array<ArrayBuffer>

  canonicalPlan: Uint8Array<ArrayBuffer>

  canonicalResult: Uint8Array<ArrayBuffer>

// Byte-only engine surface consumed by the runner-independent assertion client
GeoSpecNativeEngine: {
    evaluateClaim(request: Uint8Array<ArrayBuffer>): GeoSpecNativeClaimEvaluation;
    processRequest(request: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer>;
}

  // GeoSpecNativeEngine.evaluateClaim (method)
  evaluateClaim(request: Uint8Array<ArrayBuffer>): GeoSpecNativeClaimEvaluation;

  // GeoSpecNativeEngine.processRequest (method)
  processRequest(request: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer>;

// Success-evidence profile a product selects for its plans (PERF-OUTPUT-01)
GeoSpecNativeEvidenceProfile: 'bounded' | 'complete'

// Content-addressed subject accepted by a protocol-3 assertion plan
GeoSpecNativeSubject: {
    readonly contentHash?: string;
    readonly subjectHash?: string;
}

  contentHash: string

  subjectHash: string

// A canonical fixed-contract matcher
GeoSpecFixedMatcherDescriptor: {
    readonly contract: 'geospec.plate-two-windows/v1' | 'geospec.pmi.parallel-plane-distance/v1';
    readonly expected: 'true';
    readonly mode: 'sync';
}

  contract: 'geospec.plate-two-windows/v1' | 'geospec.pmi.parallel-plane-distance/v1'

  expected: 'true'

  mode: 'sync'

// Installed Vitest matcher map and lifecycle settlement hook
GeoSpecVitestAdapter: {
    readonly matchers: GeoSpecVitestMatcherMap;
    flush(): Promise<void>;
}

  matchers: GeoSpecVitestMatcherMap

  // GeoSpecVitestAdapter.flush (method)
  flush(): Promise<void>;

// Input for exporting one validated Tau project descriptor
ExportTauProjectArtifactOptions: {
    readonly descriptor: GeoSpecTauProjectDescriptor;
    /** Called twice so source discovery and export use separate runtime lifetimes. */
    readonly createRuntime: () => GeoSpecTauProjectRuntime | Promise<GeoSpecTauProjectRuntime>;
    readonly signal?: AbortSignal;
}

  descriptor: GeoSpecTauProjectDescriptor

  // Called twice so source discovery and export use separate runtime lifetimes
  createRuntime: () => GeoSpecTauProjectRuntime | Promise<GeoSpecTauProjectRuntime>

  signal: AbortSignal

// Finalized geometry bytes and the exact source/export metadata that produced them
GeoSpecTauProjectArtifact: {
    readonly format: 'step' | 'glb';
    readonly name: string;
    readonly mimeType: string;
    readonly bytes: Uint8Array<ArrayBuffer>;
    readonly frame: {
        readonly coordinateSystem: 'z-up';
        readonly lengthUnit: 'millimeter';
        readonly sourceUnit: 'mm';
    };
    readonly source: {
        readonly manifestPath: string;
        readonly manifestBytes: Uint8Array<ArrayBuffer>;
        readonly manifest: ProjectManifest;
        readonly projectEntryPath: string;
        readonly entryPath: string;
        readonly kernelId: string;
        readonly files: readonly RuntimeSourceSnapshotFile[];
    };
    readonly export: {
        readonly options: Readonly<Record<string, unknown>>;
        readonly route: NonNullable<GeometryExportIntent['route']>;
    };
}

  format: 'step' | 'glb'

  name: string

  mimeType: string

  bytes: Uint8Array<ArrayBuffer>

  frame: {
          readonly coordinateSystem: 'z-up';
          readonly lengthUnit: 'millimeter';
          readonly sourceUnit: 'mm';
      }

  source: {
          readonly manifestPath: string;
          readonly manifestBytes: Uint8Array<ArrayBuffer>;
          readonly manifest: ProjectManifest;
          readonly projectEntryPath: string;
          readonly entryPath: string;
          readonly kernelId: string;
          readonly files: readonly RuntimeSourceSnapshotFile[];
      }

  export: {
          readonly options: Readonly<Record<string, unknown>>;
          readonly route: NonNullable<GeometryExportIntent['route']>;
      }

// Runtime surface required to snapshot and export one Tau project
GeoSpecTauProjectRuntime: RuntimeClientWithRoutes & Pick<RuntimeClient, 'shutdown' | 'snapshotSource'>

  open: (input: Pick<Parameters<RuntimeClient['open']>[0], 'source' | 'parameters' | 'stage' | 'watch' | 'signal'>) => Pick<ReturnType<RuntimeClient['open']>, 'export' | 'close'>

  // GeoSpecTauProjectRuntime.on (method)
  on?(event: 'telemetry', handler: (batch: {
          readonly entries: ReadonlyArray<{
              name: string;
              duration: number;
              startTime: number;
              workerTimeOrigin: number;
          }>;
      }) => void): () => void;

  // GeoSpecTauProjectRuntime.bestRouteFor (method)
  bestRouteFor(format: string, options?: {
          readonly kernelId?: string;
      }): GeoSpecExportRoute | undefined;

// Trusted project configuration using existing discovery and runner options
GeoSpecConfig: {
    include?: readonly string[];
    exclude?: readonly string[];
    testNamePattern?: string;
    /** Positive finite milliseconds; the runner owns its default. */
    testTimeout?: number;
    /** Positive finite milliseconds; does not define a geometry verdict. */
    matcherWallBackstop?: number;
    bail?: boolean;
    forensic?: boolean;
    cache?: boolean;
    /** Requested cache location only; loading configuration creates no store. */
    cacheDirectory?: string;
    subjects?: Readonly<Record<string, GeoSpecTauProjectDescriptor>>;
}

  include: readonly string[]

  exclude: readonly string[]

  testNamePattern: string

  // Positive finite milliseconds
  testTimeout: number

  // Positive finite milliseconds
  matcherWallBackstop: number

  bail: boolean

  forensic: boolean

  cache: boolean

  // Requested cache location only
  cacheDirectory: string

  subjects: Readonly<Record<string, GeoSpecTauProjectDescriptor>>

// Imported Tau project data for later host resolution
GeoSpecTauProjectDescriptor: {
    readonly kind: 'tau-project';
    /** Normalized project-relative POSIX path identifying the imported manifest. */
    readonly manifestPath: string;
    readonly manifest: Readonly<Record<string, JSONValue>>;
    readonly format: 'step' | 'glb';
    readonly parameters?: Readonly<Record<string, JSONValue>>;
}

  kind: 'tau-project'

  // Normalized project-relative POSIX path identifying the imported manifest
  manifestPath: string

  manifest: Readonly<Record<string, JSONValue>>

  format: 'step' | 'glb'

  parameters: Readonly<Record<string, JSONValue>>

// Resolved file identity and validated configuration data
LoadedGeoSpecConfig: {
    readonly configPath?: string;
    readonly options: GeoSpecConfig;
}

  configPath: string

  options: GeoSpecConfig

// Options for one trusted Node configuration load
LoadGeoSpecConfigOptions: {
    readonly projectPath: string;
    /** Explicit file, resolved relative to the project unless absolute. */
    readonly configPath?: string;
    /** Own defined fields override configuration without deep merging. */
    readonly overrides?: GeoSpecConfig;
}

  projectPath: string

  // Explicit file, resolved relative to the project unless absolute
  configPath: string

  // Own defined fields override configuration without deep merging
  overrides: GeoSpecConfig
