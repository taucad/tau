import { analyzeMesh } from 'geospec/mesh';
import type { AnalyzeMeshResult, LoadMeshOptions } from 'geospec/mesh';

/**
 * Parameter file entry shape used by Tau projects at `.tau/parameters/<entry>.json`.
 *
 * @public
 */
export type ParameterFileEntry = {
  activeGroup: string;
  groups: Record<string, { values: Record<string, unknown> }>;
  order?: string[];
};

/**
 * One named parameter case.
 *
 * @public
 */
export type ParameterCase = {
  name: string;
  parameters: Record<string, unknown>;
};

/**
 * Renderer contract used by the Tau adapter helpers. Runtime integrations
 * supply this function and return geometry bytes for GeoSpec to analyze.
 *
 * @public
 */
export type ParameterizedGeometryRenderer = (input: {
  file: string;
  parameters: Record<string, unknown>;
}) => Promise<Uint8Array<ArrayBuffer>>;

/**
 * Options for {@link parameterGroups}.
 *
 * @public
 */
export type ParameterGroupsOptions = {
  file: string | ParameterFileEntry;
  readFile?: (file: string) => Promise<string> | string;
  defaults?: Record<string, unknown>;
};

/**
 * Options for {@link render}.
 *
 * @public
 */
export type RenderParameterizedGeometryOptions = {
  file: string;
  parameters?: Record<string, unknown>;
  renderer: ParameterizedGeometryRenderer;
};

/**
 * Options for {@link analyze}.
 *
 * @public
 */
export type AnalyzeParameterizedGeometryOptions = RenderParameterizedGeometryOptions & {
  mesh?: Omit<LoadMeshOptions, 'source' | 'parameters'>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const mergeParameters = (
  defaults: Record<string, unknown>,
  overrides: Record<string, unknown>,
): Record<string, unknown> => {
  const merged: Record<string, unknown> = { ...defaults };
  for (const [key, value] of Object.entries(overrides)) {
    const current = merged[key];
    merged[key] = isRecord(current) && isRecord(value) ? mergeParameters(current, value) : value;
  }
  return merged;
};

const parseParameterEntry = (value: string | ParameterFileEntry): ParameterFileEntry => {
  if (typeof value !== 'string') {
    return value;
  }
  const parsed: unknown = JSON.parse(value);
  if (!isRecord(parsed) || typeof parsed['activeGroup'] !== 'string' || !isRecord(parsed['groups'])) {
    throw new Error('Invalid parameter entry: missing activeGroup or groups.');
  }
  return parsed as ParameterFileEntry;
};

/**
 * Build parameter cases by merging defaults with explicit case overrides.
 *
 * @param defaults - Default parameters from the model.
 * @param cases - Named override cases.
 * @returns Merged parameter cases.
 * @public
 */
export function parameterCases(
  defaults: Record<string, unknown>,
  cases: Record<string, Record<string, unknown>>,
): ParameterCase[] {
  return Object.entries(cases).map(([name, values]) => ({
    name,
    parameters: mergeParameters(defaults, values),
  }));
}

/**
 * Read Tau parameter groups and return merged parameter cases.
 *
 * @param options - Parameter file content or path plus optional reader.
 * @returns Named parameter cases in stored order when available.
 * @public
 */
export async function parameterGroups(options: ParameterGroupsOptions): Promise<ParameterCase[]> {
  const content =
    typeof options.file === 'string' && options.readFile !== undefined
      ? await options.readFile(options.file)
      : options.file;
  const entry = parseParameterEntry(content);
  const defaults = options.defaults ?? {};
  const names = entry.order ?? [
    entry.activeGroup,
    ...Object.keys(entry.groups).filter((name) => name !== entry.activeGroup),
  ];
  return names
    .filter((name) => entry.groups[name] !== undefined)
    .map((name) => ({
      name,
      parameters: mergeParameters(defaults, entry.groups[name]!.values),
    }));
}

/**
 * Render parameterized geometry bytes through a caller-supplied runtime adapter.
 *
 * @param options - File, parameters, and renderer.
 * @returns Geometry bytes.
 * @public
 */
export async function render(options: RenderParameterizedGeometryOptions): Promise<Uint8Array<ArrayBuffer>> {
  return options.renderer({
    file: options.file,
    parameters: options.parameters ?? {},
  });
}

/**
 * Render parameterized geometry and analyze the resulting mesh with GeoSpec.
 *
 * @param options - File, parameters, renderer, and optional mesh loader metadata.
 * @returns GeoSpec mesh analysis result.
 * @public
 */
export async function analyze(options: AnalyzeParameterizedGeometryOptions): Promise<AnalyzeMeshResult> {
  const parameters = options.parameters ?? {};
  const bytes = await render({ file: options.file, parameters, renderer: options.renderer });
  return analyzeMesh({
    source: bytes,
    path: options.file,
    parameters,
    ...options.mesh,
  });
}
