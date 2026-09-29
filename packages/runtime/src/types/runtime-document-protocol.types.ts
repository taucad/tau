import type { RpcProtocol } from '@taucad/rpc';
import type { CadUnits } from '@taucad/types';
import type {
  BinaryContentDelivery,
  RuntimeExportResultTransport,
  RuntimeProtocol,
} from '#types/runtime-protocol.types.js';
import type { Description, Evaluation, ExportResult, Rendering } from '#client/runtime-document.types.js';
import type { RuntimeContentInput } from '#types/runtime-content.types.js';

type Current = RuntimeProtocol;
type Values = Readonly<Record<string, unknown>>;
type DocumentId = Readonly<{ documentId: string }>;
type Intent = Readonly<{ intent: number }>;
type EvaluationId = Readonly<{ evaluationId: string }>;
type SubscriptionId = Readonly<{ subscriptionId: string }>;
type RequestId = Readonly<{ requestId: string }>;

/** A public artifact encoded for transport-owned binary delivery. @public */
export type WireArtifact = Readonly<{
  mimeType: string;
  content: BinaryContentDelivery | string;
  units?: Readonly<CadUnits>;
}>;

/** A rendering whose binary content has not yet been materialized. @public */
export type WireRendering =
  | (Omit<Extract<Rendering, { success: true }>, 'artifact'> & { readonly artifact: WireArtifact })
  | Extract<Rendering, { success: false }>;

/** A successful export file whose bytes have not yet been materialized. @public */
export type WireExportFile = Readonly<{ name: string; mimeType: string; bytes: BinaryContentDelivery }>;
/** Export result over the transport, retaining the nonempty file invariant. @public */
export type WireExportResult =
  | (Omit<Extract<ExportResult, { success: true }>, 'files'> & {
      readonly files: readonly [WireExportFile, ...WireExportFile[]];
    })
  | Extract<ExportResult, { success: false }>;

/** The document/view wire. RPC envelopes correlate calls; these tokens own autonomous updates. @public */
export type RuntimeDocumentProtocol = {
  readonly hello: Current['hello'];
  readonly calls: {
    readonly initialize: Current['calls']['initialize'];
    readonly describe: {
      readonly args: Current['calls']['resolveParameters']['args'];
      readonly result: Description;
    };
    readonly export: {
      readonly args: DocumentId &
        Readonly<{
          operationId: string;
          target: string;
          options?: Values;
          content?: RuntimeContentInput;
        }>;
      readonly result: WireExportResult;
    };
    readonly snapshotSource: Current['calls']['snapshotSource'];
    readonly transcode: {
      readonly args: Current['calls']['transcode']['args'];
      readonly result: RuntimeExportResultTransport;
    };
    readonly dispose: Current['calls']['cleanup'];
  };
  readonly notifies: {
    readonly open: {
      readonly args: DocumentId &
        Intent &
        Readonly<{
          file: Current['notifies']['openFile']['args']['file'];
          parameters: Values;
          evaluateOptions?: Values;
          stage?: Readonly<Record<string, Uint8Array<ArrayBuffer>>>;
          watch: boolean;
        }>;
    };
    readonly update: {
      readonly args: DocumentId &
        Intent &
        Readonly<{
          parameters?: Values;
          evaluateOptions?: Values;
          transient?: boolean;
          stage?: Readonly<Record<string, Uint8Array<ArrayBuffer>>>;
        }>;
    };
    readonly close: {
      readonly args: DocumentId;
    };
    readonly openView: {
      readonly args: DocumentId &
        SubscriptionId &
        RequestId &
        Readonly<{
          view?: string;
          // oxlint-disable-next-line typescript/no-restricted-types -- null explicitly clears the selected view instance on the wire.
          instance?: string | null;
          options?: Values;
          content?: RuntimeContentInput;
        }>;
    };
    readonly updateView: {
      readonly args: SubscriptionId &
        RequestId &
        Readonly<{
          // oxlint-disable-next-line typescript/no-restricted-types -- null explicitly clears the selected view instance on the wire.
          instance?: string | null;
          options?: Values;
          content?: RuntimeContentInput;
        }>;
    };
    readonly closeView: {
      readonly args: SubscriptionId;
    };
    readonly abort: {
      readonly args: Readonly<{
        operationId: string;
        reason: number;
      }>;
    };
    readonly binaryMaterialised: Current['notifies']['binaryMaterialised'];
    readonly described: {
      readonly args: DocumentId & Intent & EvaluationId & Description;
    };
    readonly evaluating: {
      readonly args: DocumentId &
        Intent &
        EvaluationId &
        Readonly<{
          transient: boolean;
        }>;
    };
    readonly evaluated: {
      readonly args: DocumentId & Intent & Evaluation;
    };
    readonly rendering: {
      readonly args: SubscriptionId & RequestId & EvaluationId & Intent;
    };
    readonly rendered: {
      readonly args: SubscriptionId & Intent & WireRendering;
    };
    readonly progress: {
      readonly args: DocumentId &
        Intent &
        EvaluationId &
        Readonly<{
          operationId: string;
          requestId?: string;
          phase: string;
          detail?: Values;
        }>;
    };
    readonly errorEvent: {
      readonly args:
        | Readonly<{
            scope: 'connection';
            error: Current['notifies']['errorEvent']['args'];
          }>
        | (DocumentId &
            Intent &
            Readonly<{
              scope: 'operation';
              operationId: string;
              evaluationId?: string;
              subscriptionId?: string;
              requestId?: string;
              code: 'OPERATION_TIMEOUT' | 'OPERATION_ABORTED';
              phase: string;
              message: string;
            }>);
    };
    readonly stateChanged: {
      readonly args: Readonly<{
        state: 'idle' | 'busy' | 'error';
        detail?: string;
      }>;
    };
    readonly log: Current['notifies']['log'];
    readonly logBatch: Current['notifies']['logBatch'];
    readonly telemetry: Current['notifies']['telemetry'];
    readonly capabilitiesUpdated: Current['notifies']['capabilitiesUpdated'];
  };
  readonly listens: Current['listens'];
};

/** Six acknowledged calls. @public */
export const documentProtocolCallNames = [
  'initialize',
  'describe',
  'export',
  'snapshotSource',
  'transcode',
  'dispose',
] as const;
/** Eight client commands. @public */
export const documentProtocolClientNotifyNames = [
  'open',
  'update',
  'close',
  'openView',
  'updateView',
  'closeView',
  'abort',
  'binaryMaterialised',
] as const;
/** Twelve host notifications. @public */
export const documentProtocolWorkerNotifyNames = [
  'described',
  'evaluating',
  'evaluated',
  'rendering',
  'rendered',
  'progress',
  'errorEvent',
  'stateChanged',
  'log',
  'logBatch',
  'telemetry',
  'capabilitiesUpdated',
] as const;
/** Every notify in the document protocol. @public */
export const documentProtocolNotifyNames = [
  ...documentProtocolClientNotifyNames,
  ...documentProtocolWorkerNotifyNames,
] as const;

const conformsToRpcProtocol: RuntimeDocumentProtocol extends RpcProtocol ? true : false = true;
void conformsToRpcProtocol;
