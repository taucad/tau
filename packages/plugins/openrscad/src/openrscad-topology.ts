/**
 * Explorer components for the OpenRSCAD GLB.
 *
 * OpenRSCAD writes each closed solid as one leaf node and one `EXT_mesh_manifold` mesh, and keeps the authored
 * modules as mesh-less nodes above it. A primitive's `extras.openrscad.owner` names the module node that made its
 * triangles. This module maps that ownership into a `TAU_cad_topology` payload, so selecting, hiding or isolating a
 * module in Explorer still acts on exactly the triangles the module made, although they now live in a solid's mesh.
 *
 * @internal
 */

import { formatComponentId, formatNodeSelector } from '@taucad/geometry-core';
import type { TauCadTopologyComponent, TauCadTopologyPayload, TauCadTopologyPrimitiveRef } from '@taucad/geometry-core';
import { isRecordObject } from '@taucad/runtime/kernel';
import { tauCadTopologyExtension } from '@taucad/runtime/types';
import type { JSONObject } from '@taucad/runtime/types';

type GltfNode = {
  name?: string;
  mesh?: number;
  children?: number[];
  extras?: Record<string, unknown>;
};

type GltfJson = {
  scene?: number;
  scenes?: Array<{ nodes?: number[] }>;
  nodes?: GltfNode[];
  meshes?: Array<{ name?: string; primitives?: Array<{ extras?: Record<string, unknown> }> }>;
  extensions?: Record<string, unknown>;
  extensionsUsed?: string[];
};

const glbMagic = 0x46_54_6c_67;
const jsonChunkType = 0x4e_4f_53_4a;

const readGlbJsonChunk = (glb: Uint8Array<ArrayBuffer>): { json: GltfJson; jsonLength: number } | undefined => {
  if (glb.byteLength < 20) {
    return undefined;
  }
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const jsonLength = view.getUint32(12, true);
  if (view.getUint32(0, true) !== glbMagic || view.getUint32(16, true) !== jsonChunkType) {
    return undefined;
  }
  if (20 + jsonLength > glb.byteLength) {
    return undefined;
  }
  const parsed: unknown = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLength)));
  return isRecordObject(parsed) ? { json: parsed as GltfJson, jsonLength } : undefined;
};

/**
 * Replace the JSON chunk of a GLB, keeping the header's version and every byte after the chunk.
 *
 * @param glb - The GLB to copy.
 * @param jsonLength - The byte length of its current JSON chunk.
 * @param json - The new JSON.
 * @returns The GLB with the new JSON chunk.
 */
const writeGlbJsonChunk = (
  glb: Uint8Array<ArrayBuffer>,
  jsonLength: number,
  json: GltfJson,
): Uint8Array<ArrayBuffer> => {
  const encoded = new TextEncoder().encode(JSON.stringify(json));
  // A JSON chunk is padded to four bytes with spaces.
  const paddedLength = Math.ceil(encoded.byteLength / 4) * 4;
  const rest = glb.subarray(20 + jsonLength);
  const output = new Uint8Array(20 + paddedLength + rest.byteLength);
  output.set(glb.subarray(0, 12));
  output.fill(0x20, 20 + encoded.byteLength, 20 + paddedLength);
  output.set(encoded, 20);
  output.set(rest, 20 + paddedLength);
  const view = new DataView(output.buffer);
  view.setUint32(8, output.byteLength, true);
  view.setUint32(12, paddedLength, true);
  view.setUint32(16, jsonChunkType, true);
  return output;
};

const openrscadExtras = (
  value: { extras?: Record<string, unknown> } | undefined,
): Record<string, unknown> | undefined => {
  const extras = value?.extras?.['openrscad'];
  return isRecordObject(extras) ? extras : undefined;
};

/** The authored-module fields a component carries as its source references. */
const moduleSourceFields = ['moduleName', 'callSite', 'definitionSite', 'attribution'] as const;

const sourceReferences = (extras: Record<string, unknown>): JSONObject => {
  const references: Record<string, unknown> = { kernelId: 'openrscad' };
  for (const field of moduleSourceFields) {
    if (extras[field] !== undefined && extras[field] !== null) {
      references[field] = extras[field];
    }
  }
  return references as JSONObject;
};

type Draft = {
  nodeIndex: number;
  solid: boolean;
  extras: Record<string, unknown>;
  parentNodeIndex: number | undefined;
  childNodeIndices: number[];
  primitiveRefs: TauCadTopologyPrimitiveRef[];
};

/** One draft per node with `extras.openrscad`, in scene order, and the nearest such node at or above every node. */
type Drafts = { drafts: Map<number, Draft>; owningComponent: Map<number, number> };

const collectDrafts = (json: GltfJson): Drafts => {
  const nodes = json.nodes ?? [];
  const drafts = new Map<number, Draft>();
  const owningComponent = new Map<number, number>();
  const visited = new Set<number>();
  const visit = (nodeIndex: number, componentAbove: number | undefined): void => {
    const node = nodes[nodeIndex];
    if (!node || visited.has(nodeIndex)) {
      return;
    }
    visited.add(nodeIndex);
    const extras = openrscadExtras(node);
    let component = componentAbove;
    if (extras) {
      drafts.set(nodeIndex, {
        nodeIndex,
        solid: extras['solid'] === true,
        extras,
        parentNodeIndex: componentAbove,
        childNodeIndices: [],
        primitiveRefs: [],
      });
      if (componentAbove !== undefined) {
        drafts.get(componentAbove)?.childNodeIndices.push(nodeIndex);
      }
      component = nodeIndex;
    }
    if (component !== undefined) {
      owningComponent.set(nodeIndex, component);
    }
    for (const child of node.children ?? []) {
      visit(child, component);
    }
  };
  const children = new Set(nodes.flatMap((node) => node.children ?? []));
  const scene = json.scenes?.[json.scene ?? 0];
  for (const root of scene?.nodes ?? [...nodes.keys()].filter((index) => !children.has(index))) {
    visit(root, undefined);
  }
  return { drafts, owningComponent };
};

/**
 * Give every primitive of every mesh node below a component to exactly one component.
 *
 * @param json - The GLB's JSON chunk.
 * @param drafts - The components and the nearest component of each node.
 */
const assignPrimitives = (json: GltfJson, { drafts, owningComponent }: Drafts): void => {
  // The component tree comes from one walk, so it has no cycle.
  const isAtOrAbove = (ancestor: number, nodeIndex: number): boolean => {
    for (
      let current: number | undefined = nodeIndex;
      current !== undefined;
      current = drafts.get(current)?.parentNodeIndex
    ) {
      if (current === ancestor) {
        return true;
      }
    }
    return false;
  };
  for (const [nodeIndex, component] of owningComponent) {
    const meshIndex = json.nodes?.[nodeIndex]?.mesh;
    const primitives = meshIndex === undefined ? [] : (json.meshes?.[meshIndex]?.primitives ?? []);
    const nodeIsSolid = drafts.get(nodeIndex)?.solid === true;
    for (const [primitiveIndex, primitive] of primitives.entries()) {
      const owner = openrscadExtras(primitive)?.['owner'];
      const ownerModule =
        nodeIsSolid && typeof owner === 'number' && drafts.get(owner)?.solid === false ? owner : undefined;
      const target = ownerModule === undefined || isAtOrAbove(ownerModule, nodeIndex) ? component : ownerModule;
      drafts.get(target)?.primitiveRefs.push({ nodeIndex, meshIndex: meshIndex!, primitiveIndex });
    }
  }
};

/**
 * A module whose only component is one solid is that solid: the module row takes the solid's primitives, so Explorer
 * shows one row where the author wrote one module.
 *
 * @param drafts - The components, with their primitives assigned.
 */
const absorbSoleSolids = (drafts: Map<number, Draft>): void => {
  for (const draft of drafts.values()) {
    const parent = draft.parentNodeIndex === undefined ? undefined : drafts.get(draft.parentNodeIndex);
    if (draft.solid && parent && !parent.solid && parent.childNodeIndices.length === 1) {
      parent.primitiveRefs = [...draft.primitiveRefs, ...parent.primitiveRefs];
      draft.primitiveRefs = [];
    }
  }
};

/**
 * Whether a component is listed: a solid left with no primitive of its own would be an empty row.
 *
 * @param draft - The component.
 * @returns Whether Explorer lists it.
 */
const isListed = (draft: Draft | undefined): draft is Draft =>
  draft !== undefined && (!draft.solid || draft.primitiveRefs.length > 0);

const toComponent = (json: GltfJson, draft: Draft, drafts: Map<number, Draft>): TauCadTopologyComponent => {
  const node = json.nodes?.[draft.nodeIndex];
  // Solids never have component children and a component's parent is always a module, so an unlisted solid
  // changes no other row.
  const childIds = draft.childNodeIndices
    .filter((child) => isListed(drafts.get(child)))
    .map((child) => formatComponentId(child));
  return {
    id: formatComponentId(draft.nodeIndex),
    name: node?.name ?? `Component ${draft.nodeIndex + 1}`,
    kind: !draft.solid && childIds.length > 0 ? 'assembly' : 'part',
    selector: formatNodeSelector(draft.nodeIndex),
    nodeIndex: draft.nodeIndex,
    ...(draft.solid && node?.mesh !== undefined ? { meshIndex: node.mesh } : {}),
    ...(draft.parentNodeIndex === undefined ? {} : { parentId: formatComponentId(draft.parentNodeIndex) }),
    childIds,
    primitiveRefs: draft.primitiveRefs,
    sourceRefs: sourceReferences(draft.extras),
    capabilities: { hasPreciseTopology: false },
  };
};

/**
 * Derive the `TAU_cad_topology` payload of an OpenRSCAD GLB (`asset.extras.openrscad.schemaVersion` 2).
 *
 * Every node with `extras.openrscad` becomes a component, in scene order: a module node is an `assembly` when other
 * components hang from it, else a `part`; a solid node (`extras.openrscad.solid`) is a `part`. Each primitive belongs
 * to exactly one component, because the viewer resolves a picked, hidden or isolated primitive to one owner and
 * highlights the ancestors and descendants of a selection:
 *
 * - a primitive whose owner module is not above its solid belongs to that module, so selecting the module highlights
 *   exactly its triangles and selecting a module above it highlights them with the rest of its subtree;
 * - a primitive with no owner, or whose owner is the solid's own anchor or above it, belongs to the solid's `part`,
 *   so no module above the solid owns triangles that would light up with every sibling selection;
 * - primitives of nodes without `extras.openrscad` (feature lines) belong to their nearest component.
 *
 * A module whose only component is one solid takes that solid's primitives, and a solid left with no primitive of its
 * own is not listed: its triangles are all reachable through their modules.
 *
 * @internal
 * @param json - The GLB's JSON chunk.
 * @returns The payload, or `undefined` when no node carries OpenRSCAD extras.
 */
export const deriveOpenrscadTopology = (json: GltfJson): TauCadTopologyPayload | undefined => {
  const collected = collectDrafts(json);
  if (collected.drafts.size === 0) {
    return undefined;
  }
  assignPrimitives(json, collected);
  absorbSoleSolids(collected.drafts);
  const components = [...collected.drafts.values()]
    .filter((draft) => isListed(draft))
    .map((draft) => toComponent(json, draft, collected.drafts));
  return { schemaVersion: 1, components };
};

/**
 * Add Explorer components to an OpenRSCAD GLB by editing only its JSON chunk: the derived `TAU_cad_topology` payload
 * goes inline in the root `extensions` and every `extras` stays as the engine wrote it. A GLB without OpenRSCAD node
 * extras, or one that already declares a topology, comes back as given.
 *
 * @internal
 * @param glb - The GLB the engine wrote.
 * @returns The GLB with its `TAU_cad_topology` payload.
 */
export const addOpenrscadTopology = (glb: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> => {
  const chunk = readGlbJsonChunk(glb);
  if (!chunk || chunk.json.extensions?.[tauCadTopologyExtension] !== undefined) {
    return glb;
  }
  const payload = deriveOpenrscadTopology(chunk.json);
  if (!payload) {
    return glb;
  }
  const { json } = chunk;
  json.extensions = { ...json.extensions, [tauCadTopologyExtension]: payload };
  json.extensionsUsed = [...new Set([...(json.extensionsUsed ?? []), tauCadTopologyExtension])];
  return writeGlbJsonChunk(glb, chunk.jsonLength, json);
};
