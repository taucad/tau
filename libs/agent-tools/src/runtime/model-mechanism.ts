import type { ModelMechanism } from '@taucad/chat/schemas/tools/evaluate-model';
import { tauCadTopologyExtension } from '@taucad/runtime/types';
import type { KernelIssue } from '@taucad/runtime/types';

import { glbChunks, isObject, renderedGlb } from '#runtime/glb-chunks.js';
import type { GlbChunks, JsonObject, RenderedArtifact } from '#runtime/glb-chunks.js';

/**
 * What a GLB's `TAU_cad_topology` payload carries of a mechanism.
 * @public
 */
export type GlbMechanism = Readonly<{
  /** The GLB carries a `TAU_cad_topology` payload. */
  topology: boolean;
  /** The payload's mechanism, counted; absent when the payload has none. */
  mechanism?: Readonly<{ links: number; joints: number; couplings: number; animations: readonly string[] }>;
}>;

const keyCount = (value: unknown): number => (isObject(value) ? Object.keys(value).length : 0);

const animationIds = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.flatMap((animation: unknown) =>
        isObject(animation) && typeof animation['id'] === 'string' ? [animation['id']] : [],
      )
    : [];

/**
 * The topology payload of a GLB, decoded from the bufferView its JSON chunk names.
 *
 * @param chunks - The GLB's chunks.
 * @returns The payload, or `undefined` when the GLB carries none that parses.
 */
const topologyPayloadOf = ({ json, bin }: GlbChunks): JsonObject | undefined => {
  const { extensions, bufferViews } = json;
  const extension = isObject(extensions) ? extensions[tauCadTopologyExtension] : undefined;
  const index = isObject(extension) ? extension['topologyBufferView'] : undefined;
  const views: readonly unknown[] = Array.isArray(bufferViews) ? bufferViews : [];
  const bufferView = typeof index === 'number' ? views[index] : undefined;
  if (bin === undefined || !isObject(bufferView)) {
    return undefined;
  }
  const { byteOffset = 0, byteLength } = bufferView;
  if (typeof byteOffset !== 'number' || typeof byteLength !== 'number') {
    return undefined;
  }
  try {
    const payload: unknown = JSON.parse(new TextDecoder().decode(bin.subarray(byteOffset, byteOffset + byteLength)));
    return isObject(payload) ? payload : undefined;
  } catch {
    // A payload that does not parse carries nothing the viewer can load either.
    return undefined;
  }
};

/**
 * What a parsed GLB's topology payload carries of a mechanism.
 *
 * @param chunks - The GLB's chunks.
 * @returns Whether it carries topology and its mechanism counts.
 */
const mechanismOfChunks = (chunks: GlbChunks): GlbMechanism => {
  const payload = topologyPayloadOf(chunks);
  if (payload === undefined) {
    return { topology: false };
  }
  const { mechanism } = payload;
  if (!isObject(mechanism)) {
    return { topology: true };
  }
  return {
    topology: true,
    mechanism: {
      links: keyCount(mechanism['links']),
      joints: keyCount(mechanism['joints']),
      couplings: Array.isArray(mechanism['couplings']) ? mechanism['couplings'].length : 0,
      animations: animationIds(mechanism['animations']),
    },
  };
};

/**
 * Read the mechanism a GLB carries for the viewer's Kinematics pane.
 *
 * Reads the JSON chunk and the topology payload's bytes only. The writer admitted the mechanism
 * against the delivered parts before writing it, so a mechanism present here is one the viewer loads.
 *
 * @param content - GLB bytes.
 * @returns Whether it carries topology and its mechanism counts, or `undefined` for bytes that are not a GLB.
 * @public
 */
export const readGlbMechanism = (content: Uint8Array<ArrayBuffer>): GlbMechanism | undefined => {
  const chunks = glbChunks(content);
  return chunks === undefined ? undefined : mechanismOfChunks(chunks);
};

type MechanismIssue = NonNullable<ModelMechanism['issues']>[number];

const mechanismIssueOf = (issue: KernelIssue): MechanismIssue | undefined => {
  const details = isObject(issue.details) ? issue.details['mechanism'] : undefined;
  if (!isObject(details)) {
    return undefined;
  }
  const { code, path } = details;
  return { code: typeof code === 'string' ? code : issue.code, path: typeof path === 'string' ? path : '' };
};

/** Each mechanism diagnostic once, by code and path; its message stays in `kernelIssues`. */
const mechanismIssuesOf = (issues: readonly KernelIssue[]): MechanismIssue[] => {
  const seen = new Set<string>();
  return issues.flatMap((issue) => {
    const diagnostic = mechanismIssueOf(issue);
    const key = diagnostic === undefined ? undefined : `${diagnostic.code}\0${diagnostic.path}`;
    if (diagnostic === undefined || key === undefined || seen.has(key)) {
      return [];
    }
    seen.add(key);
    return [diagnostic];
  });
};

/** What {@link reportModelMechanism} reads: the default view's artifact, when it rendered, and every issue. */
type ReportModelMechanismInput = Readonly<{
  artifact: RenderedArtifact | undefined;
  issues: readonly KernelIssue[];
}>;

/**
 * Report whether the source declares a mechanism and whether the default view delivered it.
 *
 * Kernels read the `mechanism` export and admit it while writing the view's GLB; an inadmissible
 * one is dropped and reported as kernel issues carrying the mechanism diagnostic.
 *
 * @internal
 * @param input - The default view's artifact and the evaluation's and rendering's issues.
 * @returns The report, or `undefined` when the view carries no topology and no mechanism issue was reported.
 */
export const reportModelMechanism = ({ artifact, issues }: ReportModelMechanismInput): ModelMechanism | undefined => {
  const chunks = renderedGlb(artifact);
  const glb = chunks === undefined ? undefined : mechanismOfChunks(chunks);
  const diagnostics = mechanismIssuesOf(issues);
  if (glb?.topology !== true && diagnostics.length === 0) {
    return undefined;
  }
  const carried = glb?.mechanism;
  return {
    declared: carried !== undefined || diagnostics.length > 0,
    admitted: carried !== undefined,
    links: carried?.links ?? 0,
    joints: carried?.joints ?? 0,
    couplings: carried?.couplings ?? 0,
    animations: [...(carried?.animations ?? [])],
    ...(diagnostics.length === 0 ? {} : { issues: diagnostics }),
  };
};
