import { createActor } from 'xstate';
import type { GeometryComponentAppearance, GeometryComponentManifest, GeometryComponentNode } from '@taucad/types';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import {
  createSourceModelInteractionUnitId,
  modelInteractionMachine,
} from '@taucad/viewer/machines/model-interaction.machine';
import type { GraphicsRef, WorkbenchPanesHost, WorkbenchUnit } from '#host/workbench-host.jsx';
import { WorkbenchPanesHostProvider } from '#host/workbench-host.jsx';
import type { ModelSource } from '#model/model-source.js';

const noop = (): void => undefined;

/** Capabilities every fixture component has. */
export const capabilities: GeometryComponentManifest['capabilities'] = {
  canHide: true,
  canIsolate: true,
  canFocus: true,
  canAdjustOpacity: true,
  hasDrawings: false,
  hasPreciseTopology: false,
  exports: [{ fidelity: 'mesh', formats: ['glb'], available: true }],
};

/**
 * A top-level part.
 *
 * @param id - The component id.
 * @param name - The component name.
 * @param appearance - Its appearance.
 * @returns A depth-1 part under the fixture root.
 */
export function createNode(id: string, name: string, appearance?: GeometryComponentAppearance): GeometryComponentNode {
  return {
    id,
    name,
    kind: 'part',
    selector: `node/${id}`,
    parentId: 'root',
    childIds: [],
    depth: 1,
    path: ['Model', name],
    meshNodeIndices: [0],
    primitiveIndices: [0],
    materialIndices: [0],
    appearance,
    capabilities,
  };
}

/**
 * A manifest whose root holds `nodes`.
 *
 * @param nodes - The root's children.
 * @param sourceFile - The entry path the manifest names.
 * @returns A manifest of one root and its children.
 */
export function createManifest(nodes: GeometryComponentNode[], sourceFile = 'src/main.ts'): GeometryComponentManifest {
  return {
    schemaVersion: 1,
    sourceFile,
    rootId: 'root',
    nodeOrder: ['root', ...nodes.map((node) => node.id)],
    nodesById: {
      root: {
        id: 'root',
        name: 'Model',
        kind: 'model',
        selector: 'root',
        childIds: nodes.map((node) => node.id),
        depth: 0,
        path: ['Model'],
        meshNodeIndices: [],
        primitiveIndices: [],
        materialIndices: [],
        capabilities,
      },
      ...Object.fromEntries(nodes.map((node) => [node.id, node])),
    },
    capabilities,
  };
}

/** A graphics actor stand-in that records every event sent to it. */
export type StaticGraphicsRef = GraphicsRef & { readonly sent: unknown[] };

/**
 * A graphics actor stand-in whose `sent` lists the events sent to it.
 *
 * @param context - The snapshot context.
 * @returns The actor.
 */
export function createStaticGraphicsRef(context: Record<string, unknown> = {}): StaticGraphicsRef {
  const sent: unknown[] = [];
  return {
    getSnapshot: () => ({ context }),
    subscribe: () => ({ unsubscribe: noop }),
    on: () => ({ unsubscribe: noop }),
    sent,
    send(event: unknown) {
      sent.push(event);
    },
  } as unknown as StaticGraphicsRef;
}

/**
 * A graphics actor stand-in owning a live model-interaction actor loaded with `nodes`.
 *
 * @param entryPath - The entry the unit renders.
 * @param nodes - The unit's top-level parts.
 * @param options - Initial hidden and selected parts, and the presented unit and manifest source.
 * @returns The actor and its model-interaction actor.
 */
export function createGraphicsRefForUnit(
  entryPath: string,
  nodes: GeometryComponentNode[],
  {
    hiddenComponentIds = [],
    selectedComponentIds = [],
    presentedUnitId,
    manifestSourceFile = entryPath,
  }: {
    readonly hiddenComponentIds?: readonly string[];
    readonly selectedComponentIds?: readonly string[];
    readonly presentedUnitId?: string;
    readonly manifestSourceFile?: string;
  } = {},
): StaticGraphicsRef & { readonly modelRef: ReturnType<typeof createActor<typeof modelInteractionMachine>> } {
  const modelRef = createActor(modelInteractionMachine, { input: {} });
  modelRef.start();
  const modelUnitId = presentedUnitId ?? createSourceModelInteractionUnitId(entryPath);
  modelRef.send({ type: 'loadManifest', unitId: modelUnitId, manifest: createManifest(nodes, manifestSourceFile) });
  for (const componentId of hiddenComponentIds) {
    modelRef.send({ type: 'hideComponent', unitId: modelUnitId, componentId });
  }
  for (const componentId of selectedComponentIds) {
    modelRef.send({ type: 'selectComponent', unitId: modelUnitId, componentId });
  }
  return Object.assign(
    createStaticGraphicsRef({
      modelInteractionRef: modelRef,
      modelInteractionUnitId: presentedUnitId,
      gltfPresentation: {},
    }),
    { modelRef },
  );
}

/**
 * Renders `children` under a host with the given units and Model source.
 *
 * @param props - The units, the source and the children.
 * @returns The provider tree.
 */
export function ModelHost({
  units = [],
  source = {},
  children,
}: {
  readonly units?: readonly WorkbenchUnit[];
  readonly source?: ModelSource;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const host: WorkbenchPanesHost = { useUnits: () => units, model: source };
  return (
    <WorkbenchPanesHostProvider value={host}>
      <TooltipProvider>{children}</TooltipProvider>
    </WorkbenchPanesHostProvider>
  );
}
