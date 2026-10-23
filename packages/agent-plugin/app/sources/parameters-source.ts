/**
 * The page's Parameters pane source: the shared parameter controller (`@taucad/workbench-panes`) over the server's
 * `get_parameters`, `apply_parameter_operation` and `app_preview_parameters`. An edit is a checked write of the entry's
 * sidecar in the project, so Tau shows the same value; the server's watched document renders the write, and the newer
 * model reaches the page through `app_sync` with the build status. A drag renders its values on that same document as a
 * transient preview and writes nothing until release (PAR-2).
 *
 * The page cannot run a parameter-set actor: the actor reads and writes the sidecar's bytes itself, and the server
 * offers the planned operation, not the file. So each operation is one `propose` against the manifest revision the last
 * read returned, and the controller runs one entry's operations one after another.
 */
import type { ParameterManifest, ParameterSetOutcome } from '@taucad/parameters';
import type { FileParameterEntry } from '@taucad/types';
import { tauViewerToolName } from '@taucad/mcp/viewer-protocol';
import { createParameterController } from '@taucad/workbench-panes/parameters/parameter-controller';
import type { ParameterController, ParameterTransport } from '@taucad/workbench-panes/parameters/parameter-controller';
import type { ParametersSource } from '@taucad/workbench-panes/parameters/parameters-source';
import { ToolCallError } from '#app/host-bridge.js';
import type { HostBridge } from '#app/host-bridge.js';

/** What `get_parameters` answers with `detail: 'full'`, as far as the page reads it. */
type ParametersAnswer = Readonly<{
  status?: 'resolved' | 'unresolved';
  manifest?: ParameterManifest;
  current?: Readonly<{ identity: Readonly<{ manifestRevision: string }>; entry: FileParameterEntry }>;
  diagnostics?: ReadonlyArray<Readonly<{ code?: string; message: string }>>;
}>;

/**
 * The Parameters source the page hands the shared pane, and how the page reads the entries again.
 *
 * @public
 */
export type PageParametersSource = ParametersSource &
  Pick<ParameterController, 'refresh' | 'snapshot' | 'subscribe' | 'dispose'>;

/**
 * What the page sets around the pane's operations.
 *
 * @public
 */
export type ParametersSourceOptions = Readonly<{
  /**
   * The shown model a drag previews on: a render of the watched source. Absent, or answering `undefined`, a dragged row
   * previews its value alone and the model renders on release.
   */
  modelId?: () => string | undefined;
  /** Show an operation's failure. Absent, the pane shows it above its sections. */
  onError?: (message: string) => void;
  /** Minimum gap between two previews, in milliseconds. */
  previewInterval?: number;
}>;

const outcomeOf = (answer: unknown, requestId: string): ParameterSetOutcome => {
  const outcome = (answer as { outcome?: { status?: unknown } } | undefined)?.outcome;
  if (typeof outcome?.status === 'string') {
    return outcome as ParameterSetOutcome;
  }
  return { status: 'rejected', requestId, code: 'NO_OUTCOME', message: 'The edit was not written (no answer).' };
};

/** Failures that mean this model, or this server, cannot preview: the drag ends at its released value. */
const unpreviewable = new Set(['NOT_LIVE', 'UNKNOWN_MODEL', 'UNKNOWN_TOOL', 'NOT_SUPPORTED', 'PREVIEW_UNSUPPORTED']);

/**
 * The server's parameter tools as the controller's transport.
 *
 * @param bridge - The page's host bridge.
 * @param modelId - The shown model a drag previews on.
 * @returns The transport.
 */
const transportOf = (bridge: HostBridge, modelId: (() => string | undefined) | undefined): ParameterTransport => ({
  read: async ({ entryPath }) => {
    const answer = (await bridge.callTool('get_parameters', { targetFile: entryPath, detail: 'full' })) as
      | ParametersAnswer
      | undefined;
    if (answer?.status === 'resolved' && answer.manifest !== undefined && answer.current !== undefined) {
      return { manifest: answer.manifest, current: answer.current };
    }
    const diagnostic = answer?.diagnostics?.[0];
    return {
      failure: {
        code: diagnostic?.code ?? 'RESOLUTION_FAILED',
        message: diagnostic?.message ?? 'This model declares no parameters.',
      },
    };
  },
  propose: async ({ entryPath, request }) =>
    outcomeOf(
      await bridge.callTool('apply_parameter_operation', {
        action: 'propose',
        targetFile: entryPath,
        requestId: request.requestId,
        /* The tool checks the manifest revision; a field's base is the app's own conflict check. */
        expected: { manifestRevision: request.expected.manifestRevision },
        pressure: request.pressure,
        operation: request.operation,
      }),
      request.requestId,
    ),
  ...(modelId === undefined
    ? {}
    : {
        preview: async ({ parameters }) => {
          const shown = modelId();
          if (shown === undefined) {
            return;
          }
          try {
            await bridge.callTool(tauViewerToolName.appPreviewParameters, {
              modelId: shown,
              ...(parameters === undefined ? {} : { parameters }),
            });
          } catch (error) {
            /* A drawn file or an older server previews nothing: the row shows the value, the model renders on release. */
            if (!(error instanceof ToolCallError && error.code !== undefined && unpreviewable.has(error.code))) {
              throw error;
            }
          }
        },
      }),
});

/**
 * Build the page's Parameters source over the server's parameter tools.
 *
 * @param bridge - The page's host bridge.
 * @param options - The shown model drags preview on, and where failures go.
 * @returns The source, plus `refresh` for when the shown source changes.
 * @public
 */
export const createParametersSource = (
  bridge: HostBridge,
  options: ParametersSourceOptions = {},
): PageParametersSource => {
  const controller = createParameterController({
    transport: transportOf(bridge, options.modelId),
    ...(options.previewInterval === undefined ? {} : { previewInterval: options.previewInterval }),
    ...(options.onError === undefined ? {} : { reportError: options.onError }),
  });
  return {
    ...controller,
    target: (entryPath) => ({ authority: 'tau-mcp', root: '', entry: entryPath }),
  };
};
