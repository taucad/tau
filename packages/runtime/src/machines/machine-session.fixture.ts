import { z } from 'zod';

import { defineConfiguration } from '#configuration/configuration.js';
import { machineManifestDefinitionFixture, machineSubmissionFixture } from '#machines/machine-manifest.fixture.js';
import { defineMachine } from '#machines/machine.js';
import type { RuntimePluginDefinitionCarrier } from '#plugins/plugin-runtime-definition.js';
import type {
  MachineCandidate,
  MachineProvider,
  MachineCommandReceipt,
  MachineConnectInput,
  MachineConnectionRuntime,
  MachineDiscoveryInput,
  MachineManifestDefinition,
  MachineProviderDescriptor,
  MachineSession,
} from '#machines/machine.js';
import type { ComponentObservation, MachineObservation, MachineReport } from '#machines/machine-observation.js';

/** The instant every fixture report is observed at. @internal */
export const fixtureObservedAt = '2026-09-14T00:00:00.000Z';

const bindingConfiguration = defineConfiguration({
  id: 'fixture.binding',
  version: '1',
  schema: z.strictObject({}),
  ui: { version: 1, rjsf: {} },
});

/**
 * What the fixture printer reports installed: its manifest's capabilities, without host-derived fields.
 * @internal
 * @param id - The physical id.
 * @returns The provider descriptor.
 */
export const fixtureDescriptor = (id = 'physical-1'): MachineProviderDescriptor => {
  const { manifest } = fixtureProvider();
  return {
    id,
    name: 'Fixture printer',
    vendor: 'fixture',
    model: 'fixture-printer',
    firmware: '01.00.00.00',
    capabilities: {
      connection: manifest.connection,
      axes: manifest.axes,
      components: manifest.components,
      processes: manifest.processes,
      actions: manifest.actions,
      holds: manifest.holds,
      jobs: manifest.jobs,
      stop: manifest.stop,
    },
  };
};

/**
 * One component observation, known.
 * @internal
 * @param componentId - The component it describes.
 * @param group - The observation group it arrives in.
 * @param value - What is known, received at the fixture instant.
 * @returns The observation.
 */
export const fixtureObservation = (
  componentId: string,
  group: string,
  value: Extract<ComponentObservation, { knowledge: 'known' }>['value'],
): ComponentObservation => ({ componentId, group, receivedAt: fixtureObservedAt, knowledge: 'known', value });

/**
 * A ready, homed fixture printer with its light off.
 * @internal
 * @param overrides - The report fields this test changes.
 * @returns The report.
 */
export const fixtureReport = (overrides: Partial<MachineReport> = {}): MachineReport => ({
  connection: 'connected',
  observedAt: fixtureObservedAt,
  state: { status: 'ready' },
  components: [
    fixtureObservation('chamber-light', 'accessories', { kind: 'switch', on: false }),
    fixtureObservation('motion', 'position', {
      kind: 'motion',
      homed: { x: true, y: true, z: true },
      trust: 'homed',
      position: { machine: { x: 0, y: 0, z: 0 }, work: { x: 0, y: 0, z: 0 } },
      workOffset: { id: 'G54', revision: '1', origin: { x: 0, y: 0, z: 0 } },
      mode: 'normal',
      feed: 0,
      limits: [],
    }),
  ],
  activities: [],
  checks: [],
  availability: [],
  alerts: [],
  ...overrides,
});

/** What a fixture session does; every facet defaults to an accepting, quiet printer. @internal */
export type FixtureSessionBehavior = Partial<
  Pick<MachineSession, 'getSnapshot' | 'observe' | 'stop' | 'reconcile' | 'actions' | 'holds' | 'jobs' | 'stillCapture'>
> &
  Readonly<{ descriptor?: MachineProviderDescriptor; close?: () => Promise<void> }>;

const accepted = (): MachineCommandReceipt => ({ status: 'accepted', observedAt: fixtureObservedAt });

/**
 * A provider session (ABI v2) over the fixture printer.
 * @internal
 * @param behavior - The facets a test drives; the rest accept quietly.
 * @returns The session.
 */
export const fixtureSession = (behavior: FixtureSessionBehavior = {}): MachineSession => ({
  async getDescriptor() {
    return behavior.descriptor ?? fixtureDescriptor();
  },
  getSnapshot: behavior.getSnapshot ?? (async () => fixtureReport()),
  observe:
    behavior.observe ??
    async function* ({ signal }): AsyncGenerator<MachineObservation> {
      await new Promise<void>((resolve) => {
        signal.addEventListener(
          'abort',
          () => {
            resolve();
          },
          { once: true },
        );
      });
      yield* [];
    },
  stop: behavior.stop ?? (async () => accepted()),
  reconcile:
    behavior.reconcile ?? (async () => ({ status: 'unknown', reason: 'fixture', observedAt: fixtureObservedAt })),
  actions: behavior.actions ?? {
    type: 'supported',
    apply: async () => accepted(),
    confirm: () => ({ status: 'confirmed' }),
  },
  holds: behavior.holds ?? { type: 'unsupported' },
  jobs: behavior.jobs ?? { type: 'unsupported' },
  stillCapture: behavior.stillCapture ?? { type: 'unsupported' },
  close: behavior.close ?? (async () => undefined),
  dispose: behavior.close ?? (async () => undefined),
});

/**
 * The fixture provider: the shared manifest, no discovery, and `connect` as the test supplies it.
 * @internal
 * @param input - The provider id, a manifest override, the candidates it finds and the connection a test drives.
 * @returns The registration, carrying its executable definition.
 */
export const fixtureProvider = (
  input: Readonly<{
    id?: string;
    manifest?: MachineManifestDefinition;
    connect?: (connection: MachineConnectInput<unknown>, runtime: MachineConnectionRuntime) => Promise<MachineSession>;
    /** The candidates discovery finds, in order. */
    candidates?: readonly MachineCandidate[];
    /** Told each discovery's input as the host passes it. */
    onDiscover?: (input: MachineDiscoveryInput<unknown>) => void;
  }> = {},
): MachineProvider & RuntimePluginDefinitionCarrier<unknown> =>
  defineMachine({
    id: input.id ?? 'fixture-provider',
    name: 'Fixture provider',
    version: '1',
    protocolVersion: 2,
    vendor: 'fixture',
    manifest: input.manifest ?? machineManifestDefinitionFixture,
    bindingConfiguration,
    submissionConfiguration: machineSubmissionFixture,
    async *discover(discoverInput) {
      input.onDiscover?.(discoverInput);
      for (const candidate of input.candidates ?? []) {
        yield { type: 'found', candidate };
      }
    },
    async connect(connection, runtime) {
      if (!input.connect) {
        throw new Error('The fixture provider does not connect.');
      }
      return input.connect(connection, runtime);
    },
  })();
