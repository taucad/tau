import type { HostToolResult, JsonObject } from '@taucad/agent-host';
import type { RpcRevisionsClient } from '@taucad/chat/rpc';
import type {
  MachineArtifactReference,
  MachineClient,
  MachineDirectoryEntry,
  MachineManifest,
  MachineProvider,
  PrintRequest,
  PrintRequestSummary,
} from '@taucad/runtime/machine';
import { bambuPlates } from '@taucad/slicer/bambu-studio';
import { bambuPlateMember, readBambuContainer, readBambuContainerProducer } from '@taucad/slicer/container';
import { parseGcode } from '@taucad/slicer/toolpath';
import { quantityKinds } from '@taucad/units/quantity';
import { sha256Bytes } from '@taucad/utils/hash';
import { z } from 'zod';

import type { MachinePrintPlanner } from '#registry/machine-tool-registry.js';
import { bambuHints, defaultBambuStudioEngine, isBambuProvider, loadedMaterial } from '#registry/print-profiles.js';
import type { BambuStudioEngine } from '#registry/print-profiles.js';

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
  /** Decides whether Bambu Studio slices for a Bambu printer; defaults to this host's `@taucad/slicer/bambu-studio`. */
  bambuStudio?: Pick<BambuStudioEngine, 'findBambuStudio'> | undefined;
  /**
   * The registry's own `export_geometry` route, which also carries the slicer
   * options the model-facing tool cannot. Going through it records the slice
   * under `.tau/artifacts` exactly as a person's export is recorded.
   */
  exportGeometry(
    input: Readonly<{
      toolCallId: string;
      targetFile: string;
      format: typeof printFormat;
      /** The slicer options `request_print` admitted; the runtime validates them. */
      exportOptions?: JsonObject | undefined;
      signal: AbortSignal;
    }>,
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
 * Slicer options the machine fixes rather than the print: its plate, nozzle,
 * filament and the manifest's recommended temperatures. Callers spread their
 * own options over these, so a person or agent can still set temperatures.
 *
 * ponytail: temperatures are the manifest's machine-wide recommendation (Bambu:
 * 250 °C / 70 °C, PETG on a smooth plate); per-material recommendations belong
 * in the manifest when a second material family is printed.
 *
 * @param manifest - The machine's manifest; quantities are in mm and °C.
 * @param plate - The manifest plate id installed.
 * @returns Slicer option values.
 * @public
 */
export const machineSliceOptions = (manifest: MachineManifest, plate: string): JsonObject => ({
  plate,
  nozzleDiameter: manifest.toolhead.nozzles[0]!.diameter.value,
  filamentDiameter: manifest.toolhead.filamentDiameter.value,
  nozzleTemperature: manifest.slicing.recommended.nozzleTemperature.value,
  bedTemperature: manifest.slicing.recommended.bedTemperature.value,
});

/**
 * The plate a print is for: what the machine reports, else what the agent
 * was told. A plate the machine does not report is carried as operator
 * confirmed; the person confirms it on the start card before anything is sent.
 *
 * @param manifest - The machine's manifest, whose plate ids are the vocabulary.
 * @param machine - The machine as observed.
 * @param requested - The plate the agent named, if any.
 * @returns The plate id and whether the machine observed it.
 * @throws When neither names a plate, or the named one is not the machine's.
 */
const resolvePlate = (
  manifest: MachineManifest,
  machine: MachineDirectoryEntry,
  requested: string | undefined,
): Readonly<{ id: string; observed: boolean }> => {
  const ids = manifest.bed.plates.map(({ id }) => id);
  const observed = machine.snapshot.setup.bedType;
  if (observed !== undefined) {
    return { id: observed, observed: true };
  }
  if (requested === undefined || !ids.includes(requested)) {
    throw new Error(
      `${machine.descriptor.name} does not report its build plate; ask the person which plate is installed, then pass plate as one of ${ids.join(', ')}.`,
    );
  }
  return { id: requested, observed: false };
};

/**
 * The setup the machine must still show when the print starts: what it
 * observes now, completed from the provider manifest. Preflight compares the
 * two again at approval time, so a plate or spool swapped meanwhile refuses.
 *
 * @param provider - The provider that manufactured the descriptor.
 * @param machine - The machine as the directory currently observes it.
 * @param requestedPlate - The plate the agent named, if any.
 * @returns The provider's submission configuration and the plate it expects.
 * @throws When no material is loaded; there is nothing to expect then. When no plate is known.
 */
const expectedSetup = (
  provider: MachineProvider,
  machine: MachineDirectoryEntry,
  requestedPlate: string | undefined,
): Readonly<{ configuration: PrintRequest['configuration']; plate: string }> => {
  const loaded = loadedMaterial(machine);
  if (loaded?.materialId === undefined) {
    throw new Error(`No material is loaded in ${machine.descriptor.name}; load one, then ask again.`);
  }
  const plate = resolvePlate(provider.manifest, machine, requestedPlate);
  const { toolhead } = provider.manifest;
  const diameter = (quantity: Readonly<{ value: number; unit: string }>) => ({
    ...quantity,
    kind: quantityKinds.diameter,
    space: 'linear',
  });
  // ponytail: named keys are the Bambu submission vocabulary; a second provider gets its own mapping here.
  const configuration = {
    expectedModel: machine.descriptor.model,
    expectedBedType: plate.id,
    ...(plate.observed ? {} : { operatorConfirmedBedType: plate.id }),
    expectedMaterials: [{ slot: loaded.slot, materialId: loaded.materialId }],
    amsMapping: [loaded.slot],
    expectedNozzleDiameter: diameter(toolhead.nozzles[0]!.diameter),
    expectedFilamentDiameter: diameter(toolhead.filamentDiameter),
  };
  return { configuration, plate: plate.id };
};

/**
 * Advisory facts for the approval prompt.
 *
 * @param bytes - The container the slicer produced.
 * @returns Its producer, layers, seconds (the slicer's own estimate when its
 *   header carries one) and filament; no toolpath facts when the plate cannot
 *   be timed, since preflight refuses a container the machine cannot take anyway.
 */
const summarize = (bytes: Uint8Array<ArrayBuffer>): Omit<PrintRequestSummary, 'fileName'> | undefined => {
  const producer = readBambuContainerProducer(bytes);
  const made = producer === undefined ? undefined : { producer };
  try {
    const program = parseGcode(readBambuContainer(bytes).gcode);
    return {
      ...made,
      layers: program.layerTable.length,
      estimatedDuration: program.headerEstimate?.seconds ?? program.duration,
      filamentLength: program.filamentLength,
    };
  } catch {
    return made;
  }
};

/**
 * The export options for one print. A Bambu printer slices through Bambu
 * Studio when this host has it: its presets own temperatures and the rest, so
 * the machine's reference options stay out and the call's `options` refuse.
 * Anything else, or no Bambu Studio, slices with the reference engine exactly
 * as before; a real Bambu printer then refuses the file at preflight.
 *
 * @param deps - The planner's dependencies.
 * @param provider - The machine's provider.
 * @param input - The planner call, with the plate resolved.
 * @returns Slicer options for the export route.
 * @throws When the call's slicer fields do not fit the engine that slices.
 */
const sliceOptions = async (
  deps: MachinePrintPlannerDependencies,
  provider: MachineProvider,
  input: Parameters<MachinePrintPlanner>[0] & Readonly<{ plate: string }>,
): Promise<JsonObject> => {
  const bambuStudio =
    isBambuProvider(provider) && (await (deps.bambuStudio ?? defaultBambuStudioEngine).findBambuStudio()) !== undefined;
  const { machine, options, profiles, settings, preset, plate } = input;
  if (!bambuStudio) {
    if (profiles !== undefined || settings !== undefined) {
      throw new Error(
        `Bambu Studio does not slice for ${machine.descriptor.name} on this host, so profiles and settings do not apply; use options instead (get_print_profiles says why).`,
      );
    }
    /* The machine's own options first, then the call's keys, the preset from
     * its own field (the registry refuses one inside `options`). */
    return {
      ...machineSliceOptions(provider.manifest, plate),
      ...options,
      ...(preset === undefined ? {} : { preset }),
    };
  }
  if (options !== undefined && Object.keys(options).length > 0) {
    throw new Error(
      `Bambu Studio slices for ${machine.descriptor.name}, so options do not apply; set Bambu Studio settings instead, with keys from get_print_profiles.`,
    );
  }
  const bambuPlate = bambuPlates.find(({ id }) => id === plate)?.id;
  if (bambuPlate === undefined) {
    throw new Error(
      `Bambu Studio has no build plate "${plate}"; ask the person which plate is installed, then pass plate as one of ${bambuPlates.map(({ id }) => id).join(', ')}.`,
    );
  }
  return {
    engine: 'bambu-studio',
    bambuStudio: {
      ...profiles,
      plate: bambuPlate,
      ...(settings === undefined ? {} : { settings }),
      hints: bambuHints(provider, machine, { preset, plate }),
    },
  };
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
    const { configuration, plate } = expectedSetup(provider, machine, input.plate);
    const exportOptions = await sliceOptions(deps, provider, { ...input, plate });
    const result = await deps.exportGeometry({
      toolCallId: input.toolCallId,
      targetFile: input.targetFile,
      format: printFormat,
      exportOptions,
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
