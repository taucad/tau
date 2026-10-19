# geospec — Types (2)

2 top-level symbols. Signatures are verbatim typescript.

// Options accepted by {@link import ('./load-model.js').loadModel}
LoadModelOptions: LoadModelSourceOptions | LoadModelCodeOptions<Code> | LoadModelFileOptions

  // Project-relative folder `file` resolves in, for a suite that loads from somewhere other than the project root
  rootDir?: string

  // Geometry format to export
  format?: GeoSpecModelFormat

  // Explicit parameters passed to the runtime
  parameters?: Record<string, unknown>

  // STEP reader strategy used for STEP exports
  stepStreaming?: StepStreamingMode

  // Whether STEP loading should also produce mesh evidence
  mesh?: boolean

  // Linear tolerance used while meshing exact BRep evidence
  meshLinearTolerance?: number

  // Angular tolerance in degrees used while meshing exact BRep evidence
  meshAngularToleranceDegrees?: number

  // Default work-unit budget for every claim on this subject
  workUnitLimit?: number

// Direct geometry-source model load options
LoadModelSourceOptions: {
    /** Geometry bytes, path, browser file/blob, or in-memory mesh buffer. */
    source: MeshSource | StepSource;
    /** Named external resources consumed alongside the direct geometry bytes. */
    resources?: ReadonlyArray<{
        readonly name: string;
        readonly source: MeshSource | StepSource;
    }>;
    /**
     * Project-relative folder a path `source` and each resource path resolve in. Omitted, they resolve against the
     * project root. Recorded in the load evidence.
     */
    rootDir?: string;
    /** Source geometry format. Defaults to `glb`. */
    format?: GeoSpecModelFormat;
    /** Source path recorded in provenance. */
    path?: string;
    /** Human-readable source name recorded in provenance. */
    name?: string;
    /** Coordinate unit of raw GLB/glTF or mesh-buffer data before canonical millimetre normalization. */
    sourceUnit?: GeoSpecUnit;
    /** Explicit parameters recorded in provenance. */
    parameters?: Record<string, unknown>;
    /** STEP reader strategy used for STEP sources. */
    stepStreaming?: StepStreamingMode;
    /** Whether STEP loading should also produce mesh evidence. Defaults to true. */
    mesh?: boolean;
    /** Linear tolerance used while meshing exact BRep evidence. */
    meshLinearTolerance?: number;
    /** Angular tolerance in degrees used while meshing exact BRep evidence. */
    meshAngularToleranceDegrees?: number;
    /**
     * Default work-unit budget for every claim on this subject: a positive integer no greater than
     * the host's maximum (default `geoSpecMaximumWorkUnitLimit`, 512 000 000). `expectGeo(subject, { workUnitLimit })` overrides
     * it per chain. Recorded in the load evidence; it never changes the exported or admitted bytes.
     */
    workUnitLimit?: number;
}

  // Geometry bytes, path, browser file/blob, or in-memory mesh buffer
  source: MeshSource | StepSource

  // Named external resources consumed alongside the direct geometry bytes
  resources?: ReadonlyArray<{
          readonly name: string;
          readonly source: MeshSource | StepSource;
      }>

  // Project-relative folder a path `source` and each resource path resolve in
  rootDir?: string

  // Source geometry format
  format?: GeoSpecModelFormat

  // Source path recorded in provenance
  path?: string

  // Human-readable source name recorded in provenance
  name?: string

  // Coordinate unit of raw GLB/glTF or mesh-buffer data before canonical millimetre normalization
  sourceUnit?: GeoSpecUnit

  // Explicit parameters recorded in provenance
  parameters?: Record<string, unknown>

  // STEP reader strategy used for STEP sources
  stepStreaming?: StepStreamingMode

  // Whether STEP loading should also produce mesh evidence
  mesh?: boolean

  // Linear tolerance used while meshing exact BRep evidence
  meshLinearTolerance?: number

  // Angular tolerance in degrees used while meshing exact BRep evidence
  meshAngularToleranceDegrees?: number

  // Default work-unit budget for every claim on this subject
  workUnitLimit?: number
