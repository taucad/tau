import type { RpcProtocol } from '@taucad/rpc';
import type { z } from 'zod';
import type { runtimeDocumentProtocolSchemas } from '#types/runtime-document-protocol.schemas.js';
import type { CadUnits } from '@taucad/types';
import type { BinaryContentDelivery } from '#types/runtime-wire.types.js';
import type { ExportResult, Rendering } from '#client/runtime-document.types.js';

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

type Schemas = typeof runtimeDocumentProtocolSchemas;

/** The document/view wire, inferred from its checked validator authority. @public */
export type RuntimeDocumentProtocol = {
  readonly hello: z.output<Schemas['hello']>;
  readonly calls: {
    readonly [Name in keyof Schemas['calls']]: {
      readonly args: z.output<Schemas['calls'][Name]['args']>;
      readonly result: z.output<Schemas['calls'][Name]['result']>;
    };
  };
  readonly notifies: {
    readonly [Name in keyof Schemas['notifies']]: {
      readonly args: z.output<Schemas['notifies'][Name]>;
    };
  };
  readonly listens: {
    readonly [Name in keyof Schemas['listens']]: {
      readonly args: z.output<Schemas['listens'][Name]['args']>;
      readonly event: z.output<Schemas['listens'][Name]['event']>;
    };
  };
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
