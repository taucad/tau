import { createHash } from "node:crypto";
import type { Duplex } from "node:stream";

import type {
  MachineArtifactReference,
  MachineConnectionRuntime,
  MachineNetworkStream,
} from "@taucad/runtime/machine";
import { zipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";

const report =
  '{"print":{"sequence_id":"8","printer_type":"BL-P001","nozzle_diameter":"0.4","nozzle_temper":215,"nozzle_target_temper":220,"bed_temper":60,"bed_target_temper":65,"gcode_state":"RUNNING","mc_percent":42,"mc_remaining_time":3,"subtask_id":"run-1","subtask_name":"Cube","layer_num":12,"total_layer_num":120,"spd_lvl":2,"spd_mag":100,"cooling_fan_speed":"15","wifi_signal":"-47dBm","sdcard":true,"lights_report":[{"node":"chamber_light","mode":"on"}],"ams":{"tray_exist_bits":"1","tray_now":"0","tray_tar":"0","ams":[{"humidity":"3","temp":"22","tray":[{"tray_type":"PLA"},{},{},{}]}]}}}';
const published = vi.hoisted((): string[] => []);
const versionReply = vi.hoisted(() => ({ serial: "00M00A391800004" }));

vi.mock("mqtt", async () => {
  type Listener = (...values: unknown[]) => void;
  class MockMqttClient {
    public connected = false;
    readonly #listeners = new Map<string, Set<Listener>>();

    public constructor(streamBuilder: () => Duplex) {
      streamBuilder().resume();
      queueMicrotask(() => {
        this.connected = true;
        this.#emit("connect");
      });
    }

    public on(name: string, listener: Listener): this {
      const listeners = this.#listeners.get(name) ?? new Set();
      listeners.add(listener);
      this.#listeners.set(name, listeners);
      return this;
    }

    public once(name: string, listener: Listener): this {
      const wrapped: Listener = (...values) => {
        this.off(name, wrapped);
        listener(...values);
      };
      return this.on(name, wrapped);
    }

    public off(name: string, listener: Listener): this {
      this.#listeners.get(name)?.delete(listener);
      return this;
    }

    public async subscribeAsync(): Promise<void> {
      await Promise.resolve();
    }

    public async publishAsync(topic: string, payload: string): Promise<void> {
      published.push(payload);
      const parsed = JSON.parse(payload) as {
        info?: { command?: string };
        print?: { command?: string; sequence_id?: string };
      };
      if (parsed.print?.command) {
        /* eslint-disable @typescript-eslint/naming-convention -- Mocked Bambu wire field names are fixed. */
        this.#emit(
          "message",
          topic.replace("/request", "/report"),
          Buffer.from(
            JSON.stringify({
              print: {
                command: parsed.print.command,
                sequence_id: parsed.print.sequence_id,
                result: "success",
                subtask_id: "run-2",
              },
            }),
          ),
        );
        if (parsed.print.command === "project_file") {
          this.#emit(
            "message",
            topic.replace("/request", "/report"),
            Buffer.from(
              '{"print":{"sequence_id":"9","gcode_state":"FINISH","mc_percent":100,"subtask_id":"run-2"}}',
            ),
          );
        }
        /* eslint-enable @typescript-eslint/naming-convention -- Mocked Bambu wire field section ends. */
      } else if (parsed.info?.command === "get_version") {
        this.#emit(
          "message",
          topic.replace("/request", "/report"),
          Buffer.from(
            `{"info":{"command":"get_version","sequence_id":"0","module":[{"name":"ota","sw_ver":"01.08.02.00","hw_ver":"OTA","sn":"${versionReply.serial}"}],"result":"success"}}`,
          ),
        );
      } else {
        this.#emit(
          "message",
          topic.replace("/request", "/report"),
          Buffer.from(report),
        );
      }
      await Promise.resolve();
    }

    public async endAsync(): Promise<void> {
      this.connected = false;
      this.#emit("close");
      await Promise.resolve();
    }

    #emit(name: string, ...values: unknown[]): void {
      for (const listener of this.#listeners.get(name) ?? []) {
        listener(...values);
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/naming-convention -- mocked upstream export name.
  return { MqttClient: MockMqttClient };
});

const { connectBambuMachine, discoverBambuMachines } =
  await import("#bambu.host.js");

type PinnedTrust = Extract<
  NonNullable<
    Parameters<
      typeof connectBambuMachine
    >[0]["connection"]["serviceTrust"][string]
  >,
  { type: "pinned" }
>;
const pinnedDigest = `sha256:${"1".repeat(64)}` as PinnedTrust["digest"];
const candidate = {
  id: "bambu:00M00A391800004",
  name: "Workshop X1C",
  endpoint: { address: "192.0.2.10", interface: "test0" },
  claimedIdentity: { serial: "00M00A391800004", model: "X1C" },
  observedAt: "2026-09-14T00:00:00.000Z",
  expiresAt: "2026-09-14T00:00:30.000Z",
};

describe("Bambu read-only controller", () => {
  it("should keep secret and trust host-local while normalizing X1C status and AMS setup", async () => {
    published.length = 0;
    versionReply.serial = "00M00A391800004";
    const bytes = zipSync({
      "Metadata/plate_1.gcode": new TextEncoder().encode("G28\n"),
    });
    const artifactDigest =
      `sha256:${createHash("sha256").update(bytes).digest("hex")}` as MachineArtifactReference["digest"];
    const artifact: MachineArtifactReference = {
      revision: {
        authorityId: "authority",
        workspaceId: "workspace",
        revisionId:
          "revision" as MachineArtifactReference["revision"]["revisionId"],
        treeDigest:
          `sha256:${"2".repeat(64)}` as MachineArtifactReference["digest"],
      },
      path: "part.gcode.3mf",
      digest: artifactDigest,
      length: bytes.byteLength,
      mediaType: "application/vnd.bambulab.gcode-3mf",
      contract: { id: "manufacturing.toolpath.bambu-gcode-3mf", version: 1 },
      selectedMember: "Metadata/plate_1.gcode",
    };
    const configuration = {
      amsMapping: [0],
      bedLeveling: true,
      expectedBedType: "textured-pei",
      expectedFilamentDiameter: {
        value: 1.75,
        unit: "mm",
        kind: "http://qudt.org/vocab/quantitykind/Diameter",
        space: "linear",
      },
      expectedMaterials: [{ slot: 0, materialId: "PLA" }],
      expectedModel: "X1C",
      expectedNozzleDiameter: {
        value: 0.4,
        unit: "mm",
        kind: "http://qudt.org/vocab/quantitykind/Diameter",
        space: "linear",
      },
      operatorConfirmedBedType: "textured-pei",
      flowCalibration: true,
      timelapse: false,
    } as const;
    const uploadFile = vi.fn(async () => ({ bytesWritten: bytes.byteLength }));
    const close = vi.fn(async () => undefined);
    const network: MachineNetworkStream = {
      readable: (async function* () {
        yield* [];
      })(),
      write: vi.fn(async () => undefined),
      close,
    };
    const resolveSecret = vi.fn(async () => "access-code-must-not-escape");
    const connectStream = vi.fn(async () => network);
    const captureNetworkStill: NonNullable<
      MachineConnectionRuntime["captureNetworkStill"]
    > = vi.fn(async () =>
      Object.freeze({
        bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]),
        mediaType: "image/jpeg",
        capturedAt: "2026-09-14T00:00:01.000Z",
        expiresAt: "2026-09-14T00:00:31.000Z",
      }),
    );
    const runtime: MachineConnectionRuntime = {
      clock: { now: () => "2026-09-14T00:00:01.000Z" },
      log: vi.fn(async () => undefined),
      connectStream,
      async *readArtifact() {
        yield Uint8Array.from(bytes);
      },
      resolveSecret,
      uploadFile,
      captureNetworkStill,
    };
    const session = await connectBambuMachine(
      {
        candidate,
        configuration: { logicalId: "workshop" },
        connection: {
          secretRef: "vault:bambu-x1c",
          serviceTrust: {
            mqtt: { type: "pinned", digest: pinnedDigest },
            camera: { type: "pinned", digest: pinnedDigest },
          },
        },
        signal: new AbortController().signal,
      },
      runtime,
    );

    const descriptor = await session.getDescriptor({
      signal: new AbortController().signal,
    });
    const snapshot = await session.getSnapshot({
      signal: new AbortController().signal,
    });
    expect(() =>
      JSON.stringify(snapshot, (_key, value: unknown) => {
        if (value === undefined) {
          throw new Error("Snapshot contains undefined");
        }
        return value;
      }),
    ).not.toThrow();
    expect(resolveSecret).toHaveBeenCalledWith(
      expect.objectContaining({ reference: "vault:bambu-x1c" }),
    );
    expect(connectStream).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: { address: "192.0.2.10", port: 8883 },
        transport: "tls",
        trust: { type: "pinned", digest: pinnedDigest },
      }),
    );
    expect(descriptor).toMatchObject({
      id: "00M00A391800004",
      model: "X1C",
      firmware: "01.08.02.00",
    });
    expect(snapshot).toMatchObject({
      activeRunId: "run-1",
      run: {
        state: "printing",
        progress: 42,
        remainingSeconds: 180,
        name: "Cube",
        currentLayer: 12,
        totalLayers: 120,
        speedProfile: "standard",
        speedPercent: 100,
      },
      setup: {
        materials: [
          { slot: 0, state: "loaded", materialId: "PLA" },
          { slot: 1, state: "empty" },
          { slot: 2, state: "empty" },
          { slot: 3, state: "empty" },
        ],
      },
      temperatures: { nozzleTarget: { value: 220 }, bedTarget: { value: 65 } },
      fans: { part: 100 },
      materialSystem: {
        currentSlot: 0,
        targetSlot: 0,
        units: [{ unit: 0, humidityIndex: 3 }],
      },
      network: { wifiSignalDbm: -47 },
      lights: { chamber: "on" },
      removableStorage: "present",
    });
    if (session.stillCapture.type !== "supported") {
      throw new Error("Expected X1C RTSPS still capability");
    }
    await expect(
      session.stillCapture.capture({ signal: new AbortController().signal }),
    ).resolves.toMatchObject({
      mediaType: "image/jpeg",
    });
    expect(captureNetworkStill).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: { address: "192.0.2.10", port: 322 },
        connectTimeout: 60_000,
        path: "/streaming/live/1",
        secretRef: "vault:bambu-x1c",
        username: "bblp",
        trust: { type: "pinned", digest: pinnedDigest },
      }),
    );
    expect(JSON.stringify({ descriptor, snapshot })).not.toMatch(
      /access-code|192\.0\.2\.10|sha256:/u,
    );
    expect(published).toEqual(
      expect.arrayContaining([
        expect.stringContaining('"command":"get_version"'),
      ]),
    );
    if (!session.preparePrint) {
      throw new Error("Expected prepared-print capability");
    }
    const prepared = await session.preparePrint({
      operationId: "prepared-1",
      expectedMachineId: "00M00A391800004",
      artifact,
      configuration,
      signal: new AbortController().signal,
    });
    expect(prepared).toMatchObject({
      status: "transferred",
      remoteName: "tau-prepared-1.gcode.3mf",
      digest: artifactDigest,
      length: bytes.byteLength,
    });
    await expect(
      session.preparePrint({
        operationId: "prepared-2",
        expectedMachineId: "00M00A391800004",
        artifact,
        configuration: {
          ...configuration,
          operatorConfirmedBedType: "cool_plate",
        },
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({ status: "rejected", code: "SETUP_UNQUALIFIED" });
    expect(uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: { address: "192.0.2.10", port: 990 },
        secretRef: "vault:bambu-x1c",
        remoteName: "tau-prepared-1.gcode.3mf",
        bytes,
      }),
    );
    expect(uploadFile).toHaveBeenCalledOnce();
    expect(published).not.toEqual(
      expect.arrayContaining([expect.stringContaining("project_file")]),
    );
    if (prepared.status !== "transferred") {
      throw new Error("Expected transferred preparation");
    }
    await expect(
      session.submit({
        operationId: "start-1",
        expectedMachineId: "00M00A391800004",
        artifact,
        remoteName: prepared.remoteName,
        providerData: prepared.providerData,
        configuration,
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({ status: "accepted", providerRunId: "run-2" });
    const completed = await session.getSnapshot({
      signal: new AbortController().signal,
    });
    expect(completed).toMatchObject({ readiness: "idle" });
    expect(completed).not.toHaveProperty("activeRunId");
    expect(published).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          `"command":"project_file","param":"Metadata/plate_1.gcode","url":"ftp://tau-prepared-1.gcode.3mf","file":"tau-prepared-1.gcode.3mf"`,
        ),
      ]),
    );
    const project = published
      .map((payload) => JSON.parse(payload) as { print?: Record<string, unknown> })
      .find((payload) => payload.print?.["command"] === "project_file")?.print;
    expect(project?.["sequence_id"]).toMatch(/^\d{5}$/u);
    expect(project?.["project_id"]).toMatch(/^[1-9]\d*$/u);
    expect(project?.["subtask_id"]).toBe(project?.["project_id"]);
    expect(project?.["task_id"]).toBe(project?.["project_id"]);
    expect(project?.["bed_type"]).toBe("auto");
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Bambu wire field names are fixed.
    expect(project?.["ams_mapping2"]).toEqual([{ ams_id: 0, slot_id: 0 }]);
    await session.close();
  });

  it("should emit a bounded manual candidate without opening a datagram listener", async () => {
    const listenDatagrams = vi.fn(async function* () {
      yield* [];
    });
    const events = discoverBambuMachines(
      {
        configuration: {
          logicalId: "Workshop",
          address: "x1c.local",
          serial: "00M00A391800004",
        },
        signal: new AbortController().signal,
      },
      { clock: { now: () => "2026-09-14T00:00:00.000Z" }, listenDatagrams },
    );

    const discovered = [];
    for await (const event of events) {
      discovered.push(event);
    }
    expect(discovered).toMatchObject([
      {
        type: "found",
        candidate: { endpoint: { address: "x1c.local", interface: "manual" } },
      },
    ]);
    expect(listenDatagrams).not.toHaveBeenCalled();
  });

  it("should redact host failures and require pinned MQTT trust", async () => {
    const runtime: MachineConnectionRuntime = {
      clock: { now: () => "2026-09-14T00:00:00.000Z" },
      log: vi.fn(async () => undefined),
      connectStream: vi.fn(async () => {
        throw new Error("access-code-must-not-escape");
      }),
      async *readArtifact() {
        yield* [];
      },
      resolveSecret: vi.fn(async () => "access-code-must-not-escape"),
    };
    const connect = async (
      serviceTrust: Parameters<
        typeof connectBambuMachine
      >[0]["connection"]["serviceTrust"],
    ) => {
      return connectBambuMachine(
        {
          candidate,
          configuration: { logicalId: "workshop" },
          connection: { secretRef: "vault:bambu-x1c", serviceTrust },
          signal: new AbortController().signal,
        },
        runtime,
      );
    };

    await expect(connect({ mqtt: { type: "system" } })).rejects.toThrow(
      "BAMBU_MQTT_PIN_REQUIRED",
    );
    await expect(
      connect({ mqtt: { type: "pinned", digest: pinnedDigest } }),
    ).rejects.toThrow("BAMBU_MQTT_TRANSPORT_FAILED");
  });

  it("should refuse a firmware reply from a different physical serial", async () => {
    versionReply.serial = "OTHER-X1C";
    const network: MachineNetworkStream = {
      readable: (async function* () {
        yield* [];
      })(),
      write: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
    };
    const runtime: MachineConnectionRuntime = {
      clock: { now: () => "2026-09-14T00:00:00.000Z" },
      log: vi.fn(async () => undefined),
      connectStream: vi.fn(async () => network),
      async *readArtifact() {
        yield* [];
      },
      resolveSecret: vi.fn(async () => "access-code-must-not-escape"),
    };
    await expect(
      connectBambuMachine(
        {
          candidate,
          configuration: { logicalId: "workshop" },
          connection: {
            secretRef: "vault:bambu-x1c",
            serviceTrust: { mqtt: { type: "pinned", digest: pinnedDigest } },
          },
          signal: new AbortController().signal,
        },
        runtime,
      ),
    ).rejects.toThrow("BAMBU_MQTT_CONNECT_FAILED");
    versionReply.serial = "00M00A391800004";
  });
});
