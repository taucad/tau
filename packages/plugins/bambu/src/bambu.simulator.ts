import { createQuantity, quantityKinds } from "@taucad/units/quantity";
import type {
  MachineCommandReceipt,
  MachineDescriptor,
  MachineSession,
  MachineSnapshot,
  MachineSubmissionReceipt,
} from "@taucad/runtime/machine";

// eslint-disable-next-line import-x/no-extraneous-dependencies -- package-import self-reference resolves this package's source alias.
import { bambuRemoteName, parseBambuStill } from "#bambu.protocol.js";

/** Deterministic fault switches accepted by the simulator. @internal */
export type BambuSimulatorFault =
  | "camera-unavailable"
  | "certificate-changed"
  | "partial-transfer"
  | "protected-mode"
  | "reply-lost-after-accept"
  | "storage-full"
  | "timeout"
  | "wrong-credential";

/** Socket-free simulator handle used by protocol, host, UI, and tool conformance. @internal */
export type BambuSimulator = Readonly<{
  session: MachineSession<
    Readonly<{
      amsMapping: readonly number[];
      bedLeveling: boolean;
      expectedBedType: string;
      expectedFilamentDiameter: Readonly<{
        value: number;
        unit: string;
        kind: string;
        space: "linear";
      }>;
      expectedMaterials: ReadonlyArray<
        Readonly<{ slot: number; materialId: string }>
      >;
      expectedModel: "X1C";
      expectedNozzleDiameter: Readonly<{
        value: number;
        unit: string;
        kind: string;
        space: "linear";
      }>;
      flowCalibration: boolean;
      timelapse: boolean;
    }>
  >;
  reconnect(): void;
  uploadedNames(): readonly string[];
  writes(): readonly string[];
}>;

const simulatedQuantity = (
  input: Readonly<{
    value: number;
    unit: string;
    kind: string;
    space: "linear" | "point";
  }>,
) => {
  const result = createQuantity({
    ...input,
    semanticMode: "declared-only",
  });
  if (result.status !== "success") {
    throw new Error("BAMBU_SIMULATOR_UNITS");
  }
  return result.value;
};

const nozzle = simulatedQuantity({
  value: 0.4,
  unit: "mm",
  kind: quantityKinds.diameter,
  space: "linear",
});
const nozzleTemperature = simulatedQuantity({
  value: 215,
  unit: "Cel",
  kind: quantityKinds.temperature,
  space: "point",
});
const bedTemperature = simulatedQuantity({
  value: 60,
  unit: "Cel",
  kind: quantityKinds.temperature,
  space: "point",
});

const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);

/** Create one deterministic, socket-free X1C simulator for conformance and UI fixtures.
 * @param input - Optional closed fault selection.
 * @returns Deterministic simulator and its machine session.
 */
export const createBambuSimulator = (
  input: Readonly<{ faults?: readonly BambuSimulatorFault[] }> = {},
): BambuSimulator => {
  const faults = new Set(input.faults ?? []);
  const uploaded = new Set<string>();
  const writeLog: string[] = [];
  const observations: MachineSnapshot[] = [];
  const commandResults = new Map<
    string,
    Readonly<{ command: string; receipt: MachineSubmissionReceipt }>
  >();
  let generation = 1;
  let closed = false;
  let runId: string | undefined;

  const now = (): string => `2026-09-14T00:00:0${Math.min(generation, 9)}.000Z`;
  const snapshot = (): MachineSnapshot =>
    Object.freeze({
      connection: closed ? "disconnected" : "connected",
      readiness: runId ? "busy" : "idle",
      ...(runId ? { activeRunId: runId } : {}),
      observedAt: now(),
      setup: Object.freeze({
        toolId: "nozzle-0.4",
        bedType: "textured-pei",
        materials: Object.freeze([
          { slot: 0, state: "loaded", materialId: "pla" },
        ] satisfies MachineSnapshot["setup"]["materials"]),
      }),
      run: Object.freeze({
        state: runId ? "printing" : "idle",
        ...(runId ? { progress: 42, remainingSeconds: 180 } : {}),
      }),
      temperatures: Object.freeze({
        nozzle: nozzleTemperature,
        bed: bedTemperature,
      }),
    });
  const receipt = (
    operation: string,
    command: string,
  ): MachineSubmissionReceipt => {
    const accepted: MachineSubmissionReceipt = Object.freeze({
      status: "accepted",
      providerRunId: operation,
      observedAt: now(),
    });
    commandResults.set(
      operation,
      Object.freeze({ command, receipt: accepted }),
    );
    if (faults.has("reply-lost-after-accept")) {
      return Object.freeze({
        status: "unknown",
        reason: "reply-lost-after-possible-acceptance",
        observedAt: now(),
      });
    }
    return accepted;
  };
  const descriptor: MachineDescriptor = Object.freeze({
    id: "simulated-x1c",
    name: "Simulated X1C",
    vendor: "Bambu Lab",
    model: "X1 Carbon",
    technology: "additive.fff",
    firmware: "simulator-1",
    accepts: Object.freeze([
      Object.freeze({
        contract: Object.freeze({
          id: "manufacturing.toolpath.bambu-gcode-3mf",
          version: 1,
        }),
        mediaType: "application/vnd.bambulab.gcode-3mf",
        requiredMembers: Object.freeze(["Metadata/plate_1.gcode"]),
        payloadSelection: "plate",
        technology: "additive.fff",
      }),
    ]),
    operations: Object.freeze([
      "prepare",
      "submit",
      "pause",
      "resume",
      "cancel",
      "urgent-stop",
      "still",
    ]),
    ratedEnvelope: Object.freeze({
      width: 0.256,
      depth: 0.256,
      height: 0.256,
      unit: "m",
    }),
    printableEnvelope: Object.freeze({
      width: 0.256,
      depth: 0.256,
      height: 0.256,
      unit: "m",
    }),
    tools: Object.freeze([
      Object.freeze({
        id: "nozzle-0.4",
        kind: "extruder",
        nozzleDiameter: nozzle,
      }),
    ]),
    materialSystem: Object.freeze({ kind: "ams", slotCount: 4 }),
    bedTypes: Object.freeze([
      "cool",
      "engineering",
      "high-temperature",
      "textured-pei",
    ]),
  });

  const session: BambuSimulator["session"] = Object.freeze({
    async getDescriptor() {
      if (faults.has("certificate-changed")) {
        throw new Error("BAMBU_CERTIFICATE_CHANGED");
      }
      if (faults.has("wrong-credential")) {
        throw new Error("BAMBU_AUTHENTICATION");
      }
      if (faults.has("protected-mode")) {
        throw new Error("BAMBU_PROTECTED_MODE");
      }
      if (faults.has("timeout")) {
        throw new Error("BAMBU_TIMEOUT");
      }
      return descriptor;
    },
    async getSnapshot() {
      return snapshot();
    },
    async *observe(input_) {
      while (!input_.signal.aborted && observations.length > 0) {
        const next = observations.shift();
        if (next) {
          yield Object.freeze({ type: "snapshot", snapshot: next });
        }
      }
    },
    async preparePrint(input_) {
      const remoteName = bambuRemoteName(input_.operationId);
      writeLog.push(`upload:${remoteName}`);
      if (faults.has("storage-full")) {
        return Object.freeze({
          status: "rejected",
          code: "STORAGE_FULL",
          message: "Printer storage is full.",
          observedAt: now(),
        });
      }
      if (faults.has("partial-transfer")) {
        return Object.freeze({
          status: "rejected",
          code: "TRANSFER_PARTIAL",
          message:
            "Artifact transfer was incomplete and the temporary object was removed.",
          observedAt: now(),
        });
      }
      uploaded.add(remoteName);
      return Object.freeze({
        status: "transferred",
        remoteName,
        digest: input_.artifact.digest,
        length: input_.artifact.length,
        parser: Object.freeze({ id: "tau.bambu.gcode-3mf", version: "1" }),
        providerData: Object.freeze({
          memberMd5: "00000000000000000000000000000000",
        }),
        observedAt: now(),
      });
    },
    async submit(input_) {
      if (!uploaded.has(input_.remoteName)) {
        return Object.freeze({
          status: "rejected",
          code: "PREPARATION_MISSING",
          message: "The prepared artifact is not present.",
          observedAt: now(),
        });
      }
      writeLog.push(`start:${input_.operationId}`);
      runId = input_.operationId;
      observations.push(snapshot());
      return receipt(input_.operationId, "project_file");
    },
    async control(input_): Promise<MachineCommandReceipt> {
      if (
        input_.command !== "urgent-stop" &&
        input_.expectedProviderRunId !== runId
      ) {
        return Object.freeze({
          status: "rejected",
          code: "STALE_RUN",
          message: "Observed run changed.",
          observedAt: now(),
        });
      }
      writeLog.push(`${input_.command}:${input_.operationId}`);
      if (input_.command === "cancel" || input_.command === "urgent-stop") {
        runId = undefined;
      }
      observations.push(snapshot());
      const command =
        input_.command === "cancel" || input_.command === "urgent-stop"
          ? "stop"
          : input_.command;
      return receipt(input_.operationId, command);
    },
    async reconcile(input_) {
      const stored = commandResults.get(input_.operationId);
      if (!stored || stored.command !== input_.command) {
        return Object.freeze({
          status: "unknown",
          reason: "no-correlated-provider-reply",
          observedAt: now(),
        });
      }
      return stored.receipt;
    },
    stillCapture: faults.has("camera-unavailable")
      ? Object.freeze({
          type: "supported",
          async capture() {
            throw new Error("BAMBU_CAMERA_UNAVAILABLE");
          },
        })
      : Object.freeze({
          type: "supported",
          async capture() {
            return parseBambuStill(jpeg, now());
          },
        }),
    async close() {
      closed = true;
    },
    async dispose() {
      closed = true;
    },
  });

  return Object.freeze({
    session,
    reconnect() {
      generation += 1;
      closed = false;
      observations.push(snapshot());
    },
    uploadedNames: () => Object.freeze([...uploaded]),
    writes: () => Object.freeze([...writeLog]),
  });
};
