import type { HostToolResult } from '@taucad/agent-host';
import type { RpcRevisionsClient } from '@taucad/chat/rpc';
import type {
  MachineArtifactReference,
  MachineClient,
  MachineDirectoryEntry,
  MachineProvider,
  PrintRequest,
  PrintRequestSummary,
} from '@taucad/runtime/machine';
import { bambuPlateMember, readBambuContainer } from '@taucad/slicer/container';
import { parseGcode } from '@taucad/slicer/toolpath';
import { quantityKinds } from '@taucad/units/quantity';
import { sha256Bytes } from '@taucad/utils/hash';
import { z } from 'zod';

import type { MachinePrintPlanner } from '#registry/machine-tool-registry.js';

/** The export target every print goes through (blueprint D3). */
const printFormat = 'gcode.3mf';

/** What {@link createMachinePrintPlanner} borrows from its host. @public */
export type MachinePrintPlannerDependencies = Readonly<{
  /**
   * Names the revision the reference is qualified by. A daemon passes its
   * revisions client; a browser worker, whose page owns the revision, passes
   * the base its admitted turn runs on.
   */
  revisions: Readonly<{
    describe(): Promise<Readonly<Pick<Awaited<ReturnType<RpcRevisionsClient['describe']>>, 'revisionId'>>>;
  }>;
  /** Supplies the provider manifest the expected setup is composed from. */
  machines: Pick<MachineClient, 'listProviders'>;
  /**
   * The registry's own `export_geometry` invocation. Going through it records
   * the slice under `.tau/artifacts` exactly as a person's export is recorded.
   */
  exportGeometry(
    input: Readonly<{ toolCallId: string; targetFile: string; format: typeof printFormat; signal: AbortSignal }>,
  ): Promise<HostToolResult>;
  /** Read the exported bytes back from the project by their recorded path. */
  readArtifact(input: Readonly<{ path: string; signal: AbortSignal }>): Promise<Uint8Array<ArrayBuffer>>;
}>;

const exported = z.object({
  success: z.literal(true),
  files: z.array(z.object({ artifactPath: z.string().min(1), mimeType: z.string().min(1) })).min(1),
});
const failure = z.object({ message: z.string().min(1) });

/**
 * The setup the machine must still show when the print starts: what it
 * observes now, completed from the provider manifest. Preflight compares the
 * two again at approval time, so a plate or spool swapped meanwhile refuses.
 *
 * @param provider - The provider that manufactured the descriptor.
 * @param machine - The machine as the directory currently observes it.
 * @returns The provider's submission configuration.
 * @throws When no material is loaded; there is nothing to expect then.
 */
const expectedSetup = (provider: MachineProvider, machine: MachineDirectoryEntry): PrintRequest['configuration'] => {
  const { setup } = machine.snapshot;
  const loaded = setup.materials.find((material) => material.state === 'loaded' && material.materialId !== undefined);
  if (loaded?.materialId === undefined) {
    throw new Error(`No material is loaded in ${machine.descriptor.name}; load one, then ask again.`);
  }
  const { toolhead, bed } = provider.manifest;
  const diameter = (quantity: Readonly<{ value: number; unit: string }>) => ({
    ...quantity,
    kind: quantityKinds.diameter,
    space: 'linear',
  });
  // ponytail: named keys are the Bambu submission vocabulary; a second provider gets its own mapping here.
  return {
    expectedModel: machine.descriptor.model,
    expectedBedType: setup.bedType ?? bed.plates[0]!.id,
    expectedMaterials: [{ slot: loaded.slot, materialId: loaded.materialId }],
    amsMapping: [loaded.slot],
    expectedNozzleDiameter: diameter(toolhead.nozzles[0]!.diameter),
    expectedFilamentDiameter: diameter(toolhead.filamentDiameter),
  };
};

/**
 * Advisory facts for the approval prompt.
 *
 * @param bytes - The container the slicer produced.
 * @returns Layers, seconds and filament; nothing when the plate cannot be timed,
 *   since preflight refuses a container the machine cannot take anyway.
 */
const summarize = (bytes: Uint8Array<ArrayBuffer>): Omit<PrintRequestSummary, 'fileName'> | undefined => {
  try {
    const program = parseGcode(readBambuContainer(bytes).gcode);
    return {
      layers: program.layerTable.length,
      estimatedDuration: program.duration,
      filamentLength: program.filamentLength,
    };
  } catch {
    return undefined;
  }
};

/**
 * Build the planner `request_print` slices with.
 *
 * Refuses before slicing when the request could never be accepted (no loaded
 * material, no revision to qualify by, no provider), then exports through the
 * host's own route, reads the bytes back for the digest the machine host
 * verifies, and qualifies the reference by the directory cursor's authority.
 *
 * @param deps - The host seams the planner borrows.
 * @returns The planner to pass as `planPrint`.
 * @public
 */
export const createMachinePrintPlanner =
  (deps: MachinePrintPlannerDependencies): MachinePrintPlanner =>
  async (input) => {
    const { machine, signal } = input;
    const { revisionId } = await deps.revisions.describe();
    if (revisionId === undefined) {
      throw new Error('No revision qualifies a print yet; save a revision, then ask again.');
    }
    const providers = await deps.machines.listProviders({ signal });
    const provider = providers.find((candidate) => candidate.id === machine.providerId);
    if (provider === undefined) {
      throw new Error(`No provider ${machine.providerId} backs ${machine.descriptor.name}.`);
    }
    const configuration = expectedSetup(provider, machine);
    const result = await deps.exportGeometry({
      toolCallId: input.toolCallId,
      targetFile: input.targetFile,
      format: printFormat,
      signal,
    });
    const file = result.isError ? undefined : exported.safeParse(result.content).data?.files[0];
    if (file === undefined) {
      const reason = failure.safeParse(result.content).data?.message ?? 'no artifact was produced';
      throw new Error(`Slicing ${input.targetFile} failed: ${reason}`);
    }
    const bytes = await deps.readArtifact({ path: file.artifactPath, signal });
    // SAFETY: sha256Bytes returns the lowercase hex the digest brand describes.
    const digest = `sha256:${await sha256Bytes(bytes)}` as MachineArtifactReference['digest'];
    /* Preflight checks the artifact against the descriptor's list, so choose from it. */
    const accepted =
      machine.descriptor.accepts.find((container) => container.mediaType === file.mimeType) ??
      machine.descriptor.accepts[0];
    if (accepted === undefined) {
      throw new Error(`${machine.descriptor.name} declares no accepted container.`);
    }
    return {
      artifact: {
        revision: {
          authorityId: input.cursor.authorityId,
          workspaceId: input.cursor.workspaceId,
          // SAFETY: the revision graph hands out its own branded ids as plain strings.
          revisionId: revisionId as MachineArtifactReference['revision']['revisionId'],
          // ponytail: `describe` exposes no tree digest; the artifact digest identifies the bytes the host verifies.
          treeDigest: digest,
        },
        path: file.artifactPath,
        digest,
        length: bytes.byteLength,
        mediaType: accepted.mediaType,
        contract: accepted.contract,
        selectedMember: accepted.requiredMembers[0] ?? bambuPlateMember,
      },
      configuration,
      summary: summarize(bytes),
    };
  };
