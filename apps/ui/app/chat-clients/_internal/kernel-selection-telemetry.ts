/**
 * Kernel-selection telemetry (automatic kernel selection blueprint D10): Auto resolved, override after Auto and first
 * outcome. Categorical only: no request text, path or project. The kernel is the runtime's binding of the project's
 * main entry (its owner), so a turn any agent ran is observed the same way.
 */
import { IngestEntryName, kernelIds, kernelSelectionModelSchema } from '@taucad/telemetry';
import type { ClientMetricEntry } from '@taucad/telemetry';
import { kernelRoutingRubricVersion } from '@taucad/types/constants';
import type { KernelId } from '@taucad/types/constants';
import type { CadAgentExecution } from '@taucad/chat';
import { isDesktopTarget } from '#lib/build-target.js';
import { reportToApi } from '#runtime/observability/report-to-api.js';
import { requireClientEnvironmentUrl } from '#environment.config.js';

type KernelLabel = (typeof kernelIds)[number];

/** Report one ingest entry. @public */
export type KernelSelectionReport = (entry: ClientMetricEntry) => void;

/** What a turn Auto runs needs to report how it resolved. @public */
export type AutoKernelTurn = Readonly<{
  /** The kernel the project's main bound when the turn was admitted. */
  ownerAtAdmission: KernelId | undefined;
  /** The kernel the project's main binds now, read when the turn settles. */
  readOwner: () => KernelId | undefined;
  /** The turn's execution: Tau's own names its model. */
  execution: CadAgentExecution;
}>;

/** What the turn tracker saw when the turn settled. @public */
export type SettledTurnFacts = Readonly<{
  agentId: string;
  /** The chat's runs, this one included. */
  turns: number;
  /** The turn evaluated a model at least once. */
  evaluated: boolean;
}>;

const knownKernels: ReadonlySet<string> = new Set(kernelIds);

/**
 * Post one entry to `/v1/telemetry/ingest`; a lost event never fails what reported it.
 *
 * @param entry - The entry.
 * @public
 */
export const defaultKernelSelectionReport: KernelSelectionReport = (entry) => {
  try {
    reportToApi({
      reportUrl: `${requireClientEnvironmentUrl('TAU_API_URL')}/v1/telemetry/ingest`,
      name: entry.name,
      duration: entry.duration,
      detail: entry.detail ?? {},
    });
  } catch (error) {
    console.warn('[kernelSelectionTelemetry] dropped', error);
  }
};

const kernelLabelOf = (kernel: KernelId | undefined): KernelLabel | undefined =>
  kernel !== undefined && knownKernels.has(kernel) ? kernel : undefined;

const hostProfileOf = (): 'web' | 'desktop' => (isDesktopTarget() ? 'desktop' : 'web');

const modelOf = (execution: CadAgentExecution): string | undefined => {
  if (execution.kind !== 'tau') {
    return undefined;
  }
  const parsed = kernelSelectionModelSchema.safeParse(execution.model);
  return parsed.success ? parsed.data : undefined;
};

/**
 * Report a settled turn that Auto ran: how it resolved, and, for an entry-less project, how the chat first came out.
 *
 * A chat whose project was entry-less at admission reports `ready` on the turn that leaves its main binding a kernel,
 * and on its first turn `failed` (it evaluated) or `none` (it wrote no model) when no main binds yet.
 *
 * @param turn - The Auto turn.
 * @param settled - What the turn tracker saw.
 * @param report - Where to report.
 * @public
 */
export const reportAutoKernelTurn = (
  turn: AutoKernelTurn,
  settled: SettledTurnFacts,
  report: KernelSelectionReport,
): void => {
  const hostProfile = hostProfileOf();
  const kernel = kernelLabelOf(turn.readOwner());
  const model = modelOf(turn.execution);
  report({
    name: IngestEntryName.KERNEL_AUTO_RESOLVED,
    duration: 0,
    detail: {
      hostProfile,
      agentId: settled.agentId,
      ...(kernel === undefined ? {} : { kernel }),
      hadOwner: turn.ownerAtAdmission !== undefined,
      ...(model === undefined ? {} : { model }),
      rubricVersion: kernelRoutingRubricVersion,
    },
  });
  if (turn.ownerAtAdmission !== undefined) {
    return;
  }
  if (kernel !== undefined) {
    report({
      name: IngestEntryName.KERNEL_FIRST_OUTCOME,
      duration: 0,
      detail: {
        hostProfile,
        kernel,
        outcome: 'ready',
        turnsToFirstRender: settled.turns,
        rubricVersion: kernelRoutingRubricVersion,
      },
    });
  } else if (settled.turns === 1) {
    report({
      name: IngestEntryName.KERNEL_FIRST_OUTCOME,
      duration: 0,
      detail: {
        hostProfile,
        outcome: settled.evaluated ? 'failed' : 'none',
        turnsToFirstRender: 1,
        rubricVersion: kernelRoutingRubricVersion,
      },
    });
  }
};

/**
 * Report a manual kernel pick in a chat that was on Auto.
 *
 * @param pick - The kernel Auto had bound (absent when none), the kernel picked, and the chat's turns so far.
 * @param report - Where to report.
 * @public
 */
export const reportKernelOverride = (
  pick: Readonly<{ resolved: KernelId | undefined; manual: KernelId; turnsSince: number }>,
  report: KernelSelectionReport = defaultKernelSelectionReport,
): void => {
  const manual = kernelLabelOf(pick.manual);
  if (manual === undefined) {
    return;
  }
  const resolved = kernelLabelOf(pick.resolved);
  report({
    name: IngestEntryName.KERNEL_OVERRIDE,
    duration: 0,
    detail: {
      hostProfile: hostProfileOf(),
      ...(resolved === undefined ? {} : { resolved }),
      manual,
      turnsSince: pick.turnsSince,
      rubricVersion: kernelRoutingRubricVersion,
    },
  });
};
